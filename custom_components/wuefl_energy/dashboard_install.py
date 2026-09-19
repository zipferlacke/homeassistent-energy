"""dashboard_install.py – legt beim ersten Einrichten das Dashboard an.

Name "Energie", Symbol Rakete, Inhalt ist die Strategy der Integration.
Beides lässt sich danach wie bei jedem Dashboard unter Einstellungen →
Dashboards ändern. Das passiert nur ein einziges Mal (Merker im Config
Entry): wer das Dashboard löscht, bekommt es nicht ungefragt zurück.

HA hat keine öffentliche Schnittstelle zum Anlegen von Dashboards. Genutzt
wird deshalb dieselbe Sammlung, hinter der auch "Dashboard hinzufügen" in der
Oberfläche steht. Klappt das nach einer HA-Änderung nicht mehr, bleibt alles
wie vorher – das Dashboard lässt sich dann von Hand anlegen.
"""
from __future__ import annotations

import inspect
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

TITLE = "Energie"
ICON = "mdi:rocket-launch"
URL_PATH = "w-energie"  # HA verlangt einen Bindestrich
STRATEGY = {"type": "custom:we"}
DONE_KEY = "dashboard_created"

_LOGGER = logging.getLogger(__name__)


def _dashboards(hass: HomeAssistant) -> dict | None:
    data = hass.data.get("lovelace")
    if data is None:
        return None
    # Ab 2025 eine Dataclass, davor ein dict
    return getattr(data, "dashboards", None) or (data.get("dashboards") if isinstance(data, dict) else None)


def _collection(hass: HomeAssistant):
    """Die Dashboard-Sammlung hinter dem Websocket-Befehl der Oberfläche."""
    handler = (hass.data.get("websocket_api") or {}).get("lovelace/dashboards/create")
    if not handler:
        return None
    ws = getattr(inspect.unwrap(handler[0]), "__self__", None)
    return getattr(ws, "storage_collection", None)


async def _has_ours(dashboards: dict) -> bool:
    """Gibt es schon ein Dashboard mit unserer Strategy (ältere Installation)?"""
    for dash in list(dashboards.values()):
        try:
            cfg = await dash.async_load(False)
        except Exception:  # leer oder YAML-Datei fehlt
            continue
        if isinstance(cfg, dict) and (cfg.get("strategy") or {}).get("type") == STRATEGY["type"]:
            return True
    return False


async def async_create_dashboard(hass: HomeAssistant, entry: ConfigEntry) -> None:
    if entry.data.get(DONE_KEY):
        return
    try:
        dashboards = _dashboards(hass)
        coll = _collection(hass)
        if dashboards is None or coll is None:
            _LOGGER.info("Dashboard nicht automatisch angelegt: Lovelace nicht erreichbar")
            return

        if not await _has_ours(dashboards):
            used = {i.get("url_path") for i in coll.async_items()} | set(dashboards)
            url_path = next(
                p for p in (URL_PATH, *(f"{URL_PATH}-{n}" for n in range(2, 100))) if p not in used
            )
            await coll.async_create_item({
                "url_path": url_path,
                "title": TITLE,
                "icon": ICON,
                "show_in_sidebar": True,
                "require_admin": False,
            })
            await dashboards[url_path].async_save({"strategy": dict(STRATEGY)})
            _LOGGER.info("Dashboard %s (/%s) angelegt", TITLE, url_path)
    except Exception as err:
        _LOGGER.warning("Dashboard konnte nicht automatisch angelegt werden: %s", err)
        return

    hass.config_entries.async_update_entry(entry, data={**entry.data, DONE_KEY: True})
