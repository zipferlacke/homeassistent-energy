"""W-Energie Dashboard – zentrale Zuordnung der Entitäten."""
from __future__ import annotations

import hashlib
import json
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

from .specs import enrich_config, required_specs


DOMAIN = "we"
STORAGE_KEY = "we.config"
STORAGE_VERSION = 1
EVENT_UPDATED = "we_updated"
PLATFORMS = ("switch", "number", "select")

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
    zusätzlich ein Fingerabdruck aller Dateien in www/ mit ein.
    """
    def _read() -> str:
        base = Path(__file__).parent
        try:
            version = json.loads((base / "manifest.json").read_text(encoding="utf-8")).get("version", "0")
        except Exception:
            version = "0"
        digest = hashlib.sha1()
        for file in sorted((base / "www").rglob("*")):
            if file.is_file():
                stat = file.stat()
                digest.update(f"{file.name}:{stat.st_size}:{stat.st_mtime_ns}".encode())
        return f"{version}-{digest.hexdigest()[:8]}"

    return await hass.async_add_executor_job(_read)

@callback
def _update_config_sensor(hass: HomeAssistant, config: dict) -> None:
    """Schreibt die vollständige Konfiguration inkl. angereicherter Entitäten in den Lese-Sensor."""
    hass.states.async_set(
        CONFIG_SENSOR_ENTITY_ID,
        "configured",
        attributes=enrich_config(config),
    )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data={}
            )
        )

    web_path = str(Path(__file__).parent / "www")
    version = await _integration_version(hass)
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
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}

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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@callback
def websocket_get_config(hass: HomeAssistant, connection, msg: dict) -> None:
    config = hass.data.get(DOMAIN, {}).get("config", {})
    connection.send_result(msg["id"], enrich_config(config))


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

    config = msg["config"]
    hass.data[DOMAIN]["config"] = config
    await hass.data[DOMAIN]["store"].async_save(config)

    await async_sync_entities(hass)

    # Lese-Sensor nach jeder Änderung aktualisieren
    _update_config_sensor(hass, config)

    hass.bus.async_fire(EVENT_UPDATED)
    connection.send_result(msg["id"], {"saved": True})