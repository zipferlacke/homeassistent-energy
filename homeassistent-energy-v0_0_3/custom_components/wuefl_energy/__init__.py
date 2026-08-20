"""wuefl Energie – zentrale Zuordnung der Entitäten für alle drei Ansichten.

Die Integration selbst steuert nichts. Sie hält nur die Zuordnung fest,
zeigt dafür eine eigene Seite in der Seitenleiste und stellt sie den
Karten über zwei WebSocket-Befehle bereit.
"""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "wuefl_energy"
STORAGE_KEY = "wuefl_energy.config"
STORAGE_VERSION = 1

URL_BASE = "/wuefl_energy_panel"
PANEL_FILE = "wuefl-energy-panel.js"
PANEL_URL_PATH = "wuefl-energie"

EVENT_UPDATED = "wuefl_energy_updated"

# Die Integration wird mit einer leeren Zeile in configuration.yaml aktiviert.
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Any(dict, None)}, extra=vol.ALLOW_EXTRA)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Speicher laden, Seite registrieren, WebSocket-Befehle anmelden."""
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}

    hass.data[DOMAIN] = {"store": store, "config": data}

    await _register_static_path(hass)

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="wuefl-energy-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{URL_BASE}/{PANEL_FILE}",
        sidebar_title="wuefl Energie",
        sidebar_icon="mdi:home-lightning-bolt",
        require_admin=True,
        config={},
    )

    websocket_api.async_register_command(hass, websocket_get_config)
    websocket_api.async_register_command(hass, websocket_save_config)

    return True


async def _register_static_path(hass: HomeAssistant) -> None:
    """Panel-Datei ausliefern – die API dafür hat sich in HA 2024.7 geändert."""
    path = str(Path(__file__).parent / "panel")
    _LOGGER.debug("wuefl Energie: Panel wird aus %s ausgeliefert", path)

    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(URL_BASE, path, False)]
        )
    except (ImportError, AttributeError):
        hass.http.register_static_path(URL_BASE, path, False)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@callback
def websocket_get_config(hass: HomeAssistant, connection, msg: dict) -> None:
    """Aktuelle Zuordnung an die Karten liefern."""
    connection.send_result(msg["id"], hass.data[DOMAIN]["config"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Required("config"): dict,
    }
)
@websocket_api.async_response
async def websocket_save_config(hass: HomeAssistant, connection, msg: dict) -> None:
    """Zuordnung sichern und die offenen Karten benachrichtigen."""
    config = msg["config"]
    hass.data[DOMAIN]["config"] = config
    await hass.data[DOMAIN]["store"].async_save(config)

    # Die Karten hören auf dieses Ereignis und laden neu, ohne Seitenwechsel.
    hass.bus.async_fire(EVENT_UPDATED)

    connection.send_result(msg["id"], {"saved": True})
