"""wuefl Energie – zentrale Zuordnung der Entitäten.

Für Sensoren von echter Hardware hält die Integration nur die Zuordnung
fest. Für die vier anlagenweiten Laderegler und die drei Regler je Wallbox
gibt es dagegen keine echte Hardware, die sie liefern könnte — die legt die
Integration deshalb selbst an, als ganz normale switch-/number-/select-
Entitäten mit entity_category "config". Automatisch, sobald mindestens eine
Wallbox existiert; automatisch wieder weg, sobald keine mehr existiert.

Geladen werden diese drei Plattformen über einen Config Entry, nicht über
die ältere Discovery-Methode (async_load_platform). Der Unterschied ist
kein Stilbruch, sondern eine Zuverlässigkeitsfrage: async_forward_entry_setups
wartet garantiert, bis alle Plattformen fertig eingerichtet sind, bevor die
Funktion zurückkehrt — die Discovery-Methode hatte diese Garantie nicht und
lief in der Praxis in ein Timeout, unabhängig davon, wie lange gewartet
wurde. Ein Config Entry entsteht automatisch beim ersten Start, sobald
"wuefl_energy:" in der configuration.yaml steht — dafür ist nichts in der
Oberfläche zu klicken.

Die Karten liegen im eigenen www/-Unterordner dieser Integration und werden
von ihr selbst ausgeliefert (register_static_path) und als Lovelace-
Ressource angemeldet (add_extra_js_url) — es gibt keinen separaten
config/www/-Ordner mehr zu kopieren und keinen manuellen Ressourcen-Eintrag.
Wer die Integration installiert, hat automatisch auch die Karten.

Alles andere hält die Integration nur als Zuordnung fest und stellt sie den
Karten über zwei WebSocket-Befehle bereit. Gepflegt wird sie in der Ansicht
"Zuordnung" im Dashboard.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .specs import compute_internal, required_specs

_LOGGER = logging.getLogger(__name__)

DOMAIN = "wuefl_energy"
STORAGE_KEY = "wuefl_energy.config"
STORAGE_VERSION = 1
EVENT_UPDATED = "wuefl_energy_updated"
PLATFORMS = ("switch", "number", "select")

# Eigener Pfad statt "/local/…" — dafür muss niemand etwas nach config/www/
# kopieren, die Dateien liegen direkt in dieser Integration.
URL_BASE = "/wuefl_energy_files"
STRATEGY_FILE = "wuefl-energy-strategy.js"

# Die Integration wird mit einer leeren Zeile in configuration.yaml aktiviert.
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Any(dict, None)}, extra=vol.ALLOW_EXTRA)


async def _integration_version(hass: HomeAssistant) -> str:
    """Version aus manifest.json, nur für das Cache-Busting der Ressourcen-URL.

    Läuft über den Executor, weil Dateizugriff sonst den Event-Loop blockiert.
    Schlägt das Lesen fehl, wird die aktuelle Uhrzeit als Ersatzwert
    verwendet — dann funktioniert das Cache-Busting weiterhin, auch wenn
    kein sauberer Versionsstring ermittelt werden konnte.
    """
    def _read() -> str:
        try:
            path = Path(__file__).parent / "manifest.json"
            return json.loads(path.read_text(encoding="utf-8")).get("version", "0")
        except Exception:  # noqa: BLE001 - Cache-Busting darf nie den Start verhindern
            return "0"

    return await hass.async_add_executor_job(_read)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Nur für die klassische YAML-Zeile zuständig: legt beim ersten Start
    automatisch einen Config Entry an, falls noch keiner existiert. Die
    eigentliche Einrichtung passiert danach in async_setup_entry.
    """
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data={}
            )
        )

    # Die Karten liegen unter custom_components/wuefl_energy/www/ und werden
    # von der Integration selbst ausgeliefert — kein config/www/ zu kopieren.
    web_path = str(Path(__file__).parent / "www")
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, web_path, cache_headers=False)]
    )
    # Meldet die Ressource automatisch bei Lovelace an. Die Strategy-Datei
    # importiert die übrigen Karten selbst dynamisch (siehe dort), ein
    # Eintrag genügt also.
    #
    # Der Anhang "?v=<Version>" ist eigenes Cache-Busting: Browser cachen
    # eine einmal geladene JS-Datei gern hartnäckig, auch mit
    # cache_headers=False am Server. HACS' eigener "hacstag"-Mechanismus
    # greift hier nicht — der gilt nur, wenn HACS selbst die
    # Lovelace-Ressource verwaltet (Kategorie "plugin"), nicht bei uns, wo
    # die Integration die Ressource anmeldet. Ändert sich die Manifest-
    # Version bei einem Update, ändert sich die URL, der Browser lädt neu —
    # ohne dass jemand manuell den Cache leeren muss.
    version = await _integration_version(hass)
    add_extra_js_url(hass, f"{URL_BASE}/{STRATEGY_FILE}?v={version}")

    websocket_api.async_register_command(hass, websocket_get_config)
    websocket_api.async_register_command(hass, websocket_save_config)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Batterie laden, Grundgerüst anlegen, alle drei Helfer-Plattformen
    laden und erst danach abgleichen — async_forward_entry_setups kehrt
    garantiert erst zurück, wenn switch/number/select fertig sind.
    """
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].update({
        "store": store,
        "config": data,
        "add_entities": {},  # Plattform -> async_add_entities-Funktion
        "entities": {p: {} for p in PLATFORMS},  # Plattform -> unique_id -> Entität
    })

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_sync_entities(hass)

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
    return None


async def async_sync_entities(hass: HomeAssistant) -> None:
    """Legt fehlende Helfer an und entfernt nicht mehr benötigte.

    Läuft einmal beim Start und danach nach jedem Batterien der Zuordnung:
    eine neue Wallbox bekommt ihre drei Regler sofort, eine gelöschte
    verliert sie genauso sofort — inklusive Eintrag in der Entitäts-
    Registry, damit nichts als "nicht verfügbar" liegen bleibt.
    """
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
        elif new_entities:
            _LOGGER.warning(
                "wuefl Energie: Plattform %s noch nicht bereit, %d Helfer warten",
                platform, len(new_entities),
            )

        for unique_id in list(current):
            if unique_id in wanted:
                continue
            entity = current.pop(unique_id)
            entity_id = entity.entity_id
            hass.async_create_task(entity.async_remove(force_remove=True))
            if entity_id and registry.async_get(entity_id):
                registry.async_remove(entity_id)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@callback
def websocket_get_config(hass: HomeAssistant, connection, msg: dict) -> None:
    """Aktuelle Zuordnung an die Karten liefern, samt der von der Integration
    selbst verwalteten Entitäts-IDs (Feld "internal")."""
    config = hass.data.get(DOMAIN, {}).get("config", {})
    connection.send_result(msg["id"], {**config, "internal": compute_internal(config)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Required("config"): dict,
    }
)
@websocket_api.async_response
async def websocket_save_config(hass: HomeAssistant, connection, msg: dict) -> None:
    """Zuordnung sichern, Helfer abgleichen, offene Karten benachrichtigen."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], "not_ready", "Integration noch nicht eingerichtet")
        return

    config = msg["config"]
    hass.data[DOMAIN]["config"] = config
    await hass.data[DOMAIN]["store"].async_save(config)

    await async_sync_entities(hass)

    # Die Karten hören auf dieses Ereignis und laden neu, ohne Seitenwechsel.
    hass.bus.async_fire(EVENT_UPDATED)

    connection.send_result(msg["id"], {"saved": True})
