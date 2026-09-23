"""W-Energie Dashboard – zentrale Zuordnung der Entitäten."""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .automation_install import async_install_automation
from .dashboard_install import async_create_dashboard
from .specs import enrich_config, required_specs, strip_generated


DOMAIN = "we"
STORAGE_KEY = "we.config"
STORAGE_VERSION = 1
EVENT_UPDATED = "we_updated"
PLATFORMS = ("switch", "number", "select", "sensor")

_LOGGER = logging.getLogger(__name__)

# Einmal beim Start ermittelt; überlebt das Neuladen des Eintrags, bei dem
# hass.data[DOMAIN] verworfen wird
_VERSION = "?"

# Zentraler Lese-Sensor für Jinja-Templates & Automatisierungen
CONFIG_SENSOR_ENTITY_ID = "sensor.we_config"

URL_BASE = "/we_files"
STRATEGY_FILE = "we-strategy.js"

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Any(dict, None)}, extra=vol.ALLOW_EXTRA)


async def _integration_version(hass: HomeAssistant) -> str:
    """Versionskennung für den Cache der Frontend-Dateien.

    Nur die Manifest-Version reicht nicht: sie wird nicht bei jeder Änderung
    hochgezählt, und die Karten importieren sich gegenseitig ohne ?v=. Ein
    Browser (vor allem die Companion-App) mischt dann alte und neue Module,
    der Import scheitert und die Strategy wird nie registriert. Deshalb fließt
    zusätzlich ein Fingerabdruck aller Dateien der Integration mit ein – auch
    der Python-Dateien, damit die Kennung wirklich den laufenden Stand
    beschreibt und sich mit dem Repository vergleichen lässt. Er kommt aus
    dem Inhalt, nicht aus dem Datum – gleicher Stand ergibt also überall
    dieselbe Kennung, und sie steht als Attribut "version" an sensor.we_config.
    """
    def _read() -> str:
        base = Path(__file__).parent
        try:
            version = json.loads((base / "manifest.json").read_text(encoding="utf-8")).get("version", "0")
        except Exception:
            version = "0"
        digest = hashlib.sha1()
        stale: list[str] = []
        for file in sorted(base.rglob("*")):
            if not file.is_file() or "__pycache__" in file.parts:
                continue
            # Vorkomprimierte Kopien zählen nicht zum Stand – sie werden
            # nebenher erzeugt und wären sonst in der Kennung sichtbar
            if file.suffix in (".gz", ".br"):
                source = file.with_suffix("")
                # Veraltete Kopie entfernen: aiohttp liefert sie bevorzugt aus
                # und überdeckt damit das Update. Sie ist reiner Zwischenstand
                # und wird bei Bedarf neu erzeugt.
                if source.is_file() and source.stat().st_mtime > file.stat().st_mtime:
                    try:
                        file.unlink()
                        stale.append(file.name)
                    except OSError as err:
                        _LOGGER.warning("W-Energie: %s ist veraltet, ließ sich aber nicht löschen: %s", file, err)
                continue
            digest.update(str(file.relative_to(base)).encode())
            digest.update(file.read_bytes())
        if stale:
            _LOGGER.warning(
                "W-Energie: %s veraltete komprimierte Kopien gelöscht (%s) – sie hätten "
                "den alten Stand ausgeliefert",
                len(stale), ", ".join(stale),
            )
        return f"{version}-{digest.hexdigest()[:8]}"

    return await hass.async_add_executor_job(_read)

@callback
def _log_wallboxes(hass: HomeAssistant, enriched: dict) -> None:
    """Kurzer Überblick im Protokoll: Was die Automation je Wallbox vorfindet.

    Damit lässt sich ohne Template-Editor sehen, warum die Regelung eine
    Wallbox nicht steuert (has_wallbox). Suchbegriff im Protokoll: W-Energie.
    """
    wallboxes = enriched.get("wallboxes") or []
    if not wallboxes:
        _LOGGER.info("W-Energie: keine Wallbox in der Zuordnung")
        return
    for i, wb in enumerate(wallboxes, 1):
        if not isinstance(wb, dict):
            continue
        felder = {
            "Lademodus": wb.get("charge_type"),
            "Soll-Leistung": wb.get("send_power"),
            "Freigabe": wb.get("activate_station"),
        }
        teile = [
            f"{label}={value or 'nicht zugeordnet'}"
            + ("" if not value else " (Entität fehlt)" if hass.states.get(value) is None else "")
            for label, value in felder.items()
        ]
        steuert = all(v and hass.states.get(v) is not None for v in felder.values())
        _LOGGER.info(
            "W-Energie: Wallbox %s %r – Automation steuert: %s – %s",
            i, wb.get("name") or "ohne Namen", "ja" if steuert else "nein", ", ".join(teile),
        )


@callback
def _log_battery(hass: HomeAssistant, enriched: dict) -> None:
    """Kann die Automation den Hausakku steuern? Suchbegriff: W-Energie."""
    for i, batt in enumerate(enriched.get("battery") or [], 1):
        if not isinstance(batt, dict):
            continue
        ctrl = batt.get("control") or {}
        felder = {
            "Normalbetrieb": ctrl.get("normal_mode"),
            "Entladen sperren": ctrl.get("mode_stop_discharging"),
            "Netzladen": ctrl.get("mode_start_charging"),
        }
        teile = [
            f"{label}={value or 'nicht zugeordnet'}"
            + ("" if not value else " (Entität fehlt)" if hass.states.get(value) is None else "")
            for label, value in felder.items()
        ]
        steuerbar = bool(felder["Normalbetrieb"]) and hass.states.get(felder["Normalbetrieb"]) is not None
        _LOGGER.info(
            "W-Energie: Batterie %s %r – Automation steuert: %s – %s",
            i, batt.get("name") or "ohne Namen", "ja" if steuerbar else "nein", ", ".join(teile),
        )


@callback
def _update_config_sensor(hass: HomeAssistant, config: dict) -> None:
    """Schreibt die vollständige Konfiguration inkl. Helfer-Entitäten in den Lese-Sensor.

    Alles steht unter dem Attribut "config", in Templates also:
    state_attr('sensor.we_config', 'config').grid.live

    Das Attribut "version" zeigt, welcher Stand der Integration gerade läuft –
    Manifest-Version plus Fingerabdruck der ausgelieferten Dateien.
    """
    enriched = enrich_config(config)
    hass.states.async_set(
        CONFIG_SENSOR_ENTITY_ID,
        "configured",
        attributes={
            "friendly_name": "W-Energie Zuordnung",
            "icon": "mdi:format-list-checks",
            "version": _VERSION,
            "config": enriched,
        },
    )
    _log_wallboxes(hass, enriched)
    _log_battery(hass, enriched)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data={}
            )
        )

    web_path = str(Path(__file__).parent / "www")
    version = await _integration_version(hass)
    global _VERSION
    _VERSION = version
    # Versionierter Pfad: relative Imports zwischen den Modulen erben die
    # Version automatisch, alte Dateien können so nicht mehr aus dem Cache
    # nachrutschen. Der unversionierte Pfad bleibt für eigene Verweise.
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(URL_BASE, web_path, cache_headers=False),
            StaticPathConfig(f"{URL_BASE}/{version}", web_path, cache_headers=True),
        ]
    )

    add_extra_js_url(hass, f"{URL_BASE}/{version}/{STRATEGY_FILE}")

    websocket_api.async_register_command(hass, websocket_get_config)
    websocket_api.async_register_command(hass, websocket_save_config)
    websocket_api.async_register_command(hass, websocket_reload_dashboard)
    websocket_api.async_register_command(hass, websocket_automation_status)
    websocket_api.async_register_command(hass, websocket_automation_install)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    # Ältere Versionen haben teils die angereicherte Config gespeichert.
    data = strip_generated(await store.async_load() or {})

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].update({
        "store": store,
        "config": data,
        "add_entities": {},
        "entities": {p: {} for p in PLATFORMS},
    })

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_sync_entities(hass)

    # Lese-Sensor initial mit gespeicherten Daten befüllen
    _update_config_sensor(hass, data)

    # Die Automation gehört zur Integration – nach dem Start von HA eintragen
    # bzw. aktualisieren (erst dann ist die Automations-Integration geladen)
    # Beim ersten Einrichten auch das Dashboard "Energie" anlegen (nur einmal)
    async def _install_automation(_=None) -> None:
        if DOMAIN in hass.data:
            hass.data[DOMAIN]["automation"] = await async_install_automation(hass)
            await async_create_dashboard(hass, entry)

    if hass.is_running:
        hass.async_create_task(_install_automation())
    else:
        entry.async_on_unload(
            hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _install_automation)
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        hass.data.pop(DOMAIN, None)
    return ok


def _build_entity(platform: str, spec: dict):
    if platform == "switch":
        from .switch import WueflSwitch
        return WueflSwitch(spec)
    if platform == "number":
        from .number import WueflNumber
        return WueflNumber(spec)
    if platform == "select":
        from .select import WueflSelect
        return WueflSelect(spec)
    if platform == "sensor":
        from .sensor import WueflBaseLoadSensor
        return WueflBaseLoadSensor(spec)
    return None


async def async_sync_entities(hass: HomeAssistant) -> None:
    if DOMAIN not in hass.data:
        return

    specs = required_specs(hass.data[DOMAIN]["config"])
    registry = er.async_get(hass)

    for platform, wanted_list in specs.items():
        current = hass.data[DOMAIN]["entities"][platform]
        add_entities = hass.data[DOMAIN]["add_entities"].get(platform)
        wanted = {item["unique_id"]: item for item in wanted_list}

        new_entities = []
        for unique_id, spec in wanted.items():
            if unique_id in current:
                continue
            entity = _build_entity(platform, spec)
            if entity is None:
                continue
            current[unique_id] = entity
            new_entities.append(entity)
        if new_entities and add_entities:
            add_entities(new_entities)

        for unique_id in list(current):
            if unique_id in wanted:
                continue
            entity = current.pop(unique_id)
            entity_id = entity.entity_id
            hass.async_create_task(entity.async_remove(force_remove=True))
            if entity_id and registry.async_get(entity_id):
                registry.async_remove(entity_id)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/get",
        # raw: nur die Zuordnung des Nutzers, ohne Helfer – für den Editor.
        vol.Optional("raw", default=False): bool,
    }
)
@callback
def websocket_get_config(hass: HomeAssistant, connection, msg: dict) -> None:
    config = hass.data.get(DOMAIN, {}).get("config", {})
    connection.send_result(msg["id"], config if msg["raw"] else enrich_config(config))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/reload_dashboard",
        vol.Optional("url_path"): vol.Any(str, None),
    }
)
@callback
def websocket_reload_dashboard(hass: HomeAssistant, connection, msg: dict) -> None:
    """Dashboard im Browser neu erzeugen lassen.

    Kam die Strategy zu spät (HA wartet nur 5 s), bleibt das Dashboard sonst
    bis zum manuellen Neuladen auf dem Fehler stehen. Das Frontend lädt bei
    "lovelace_updated" für seinen url_path die Konfiguration neu.
    """
    hass.bus.async_fire("lovelace_updated", {"url_path": msg.get("url_path")})
    connection.send_result(msg["id"], {"fired": True})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/automation"})
@callback
def websocket_automation_status(hass: HomeAssistant, connection, msg: dict) -> None:
    """Stand der mitgelieferten Automation (für die Zuordnung)."""
    connection.send_result(msg["id"], hass.data.get(DOMAIN, {}).get("automation") or {"mode": "pending"})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/automation_install"})
@websocket_api.async_response
async def websocket_automation_install(hass: HomeAssistant, connection, msg: dict) -> None:
    """Automation erneut eintragen und prüfen – z. B. nach Löschen des alten Pakets."""
    status = await async_install_automation(hass)
    if DOMAIN in hass.data:
        hass.data[DOMAIN]["automation"] = status
    connection.send_result(msg["id"], status)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Required("config"): dict,
    }
)
@websocket_api.async_response
async def websocket_save_config(hass: HomeAssistant, connection, msg: dict) -> None:
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], "not_ready", "Integration noch nicht eingerichtet")
        return

    config = strip_generated(msg["config"])
    hass.data[DOMAIN]["config"] = config
    await hass.data[DOMAIN]["store"].async_save(config)

    await async_sync_entities(hass)

    # Lese-Sensor nach jeder Änderung aktualisieren
    _update_config_sensor(hass, config)

    hass.bus.async_fire(EVENT_UPDATED)
    connection.send_result(msg["id"], {"saved": True})