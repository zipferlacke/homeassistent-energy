"""automation_install.py – die W-Energie Automation gehört zur Integration.

Sie wird in automations.yaml eingetragen (dort, wo auch der Automations-
Editor von HA speichert) und bei jedem Start auf den Stand der Integration
gebracht. Erkannt wird sie an ihrer id; alle anderen Automationen bleiben
unverändert.

Liegt noch das alte Paket config/packages/wuefl_automation.yaml, wird
nichts installiert – sonst liefe die Regelung doppelt.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

AUTOMATION_ID = "wuefl_wallbox_und_speicher_regelung"
SOURCE = Path(__file__).parent / "www" / "packages" / "wuefl_automation.yaml"
NOTE = (
    "Gehört zur Integration W-Energie und wird bei jedem Update ersetzt – "
    "eigene Änderungen hier gehen dabei verloren. Einstellungen im Dashboard "
    "unter Einstellungen bzw. Zuordnung."
)

_LOGGER = logging.getLogger(__name__)


def _install(automations_path: str, package_path: str) -> dict:
    from homeassistant.util.file import write_utf8_file_atomic
    from homeassistant.util.yaml import dump, load_yaml

    if Path(package_path).exists():
        return {"mode": "package", "changed": False}

    ours = load_yaml(str(SOURCE))["automation"][0]
    ours = {**ours, "description": NOTE}

    path = Path(automations_path)
    data = []
    if path.exists():
        try:
            data = load_yaml(str(path))
        except Exception as err:  # kaputte Datei: lieber nichts anfassen
            return {"mode": "error", "changed": False, "error": str(err)}
    if data is None:
        data = []
    if not isinstance(data, list):
        return {"mode": "unsupported", "changed": False}

    index = next(
        (i for i, a in enumerate(data) if isinstance(a, dict) and str(a.get("id")) == AUTOMATION_ID),
        None,
    )
    if index is not None and data[index] == ours:
        return {"mode": "automations", "changed": False}
    if index is None:
        data.append(ours)
    else:
        data[index] = ours
    write_utf8_file_atomic(str(path), dump(data))
    return {"mode": "automations", "changed": True}


async def async_install_automation(hass: HomeAssistant) -> dict:
    """Eintragen/aktualisieren, neu laden und prüfen, ob sie läuft."""
    try:
        status = await hass.async_add_executor_job(
            _install,
            hass.config.path("automations.yaml"),
            hass.config.path("packages", "wuefl_automation.yaml"),
        )
    except Exception as err:
        _LOGGER.warning("W-Energie Automation konnte nicht installiert werden: %s", err)
        status = {"mode": "error", "changed": False, "error": str(err)}

    if status.get("changed") and hass.services.has_service("automation", "reload"):
        await hass.services.async_call("automation", "reload", blocking=True)

    entity_id = er.async_get(hass).async_get_entity_id("automation", "automation", AUTOMATION_ID)
    status["entity_id"] = entity_id
    status["active"] = bool(entity_id and hass.states.get(entity_id))
    # In automations.yaml eingetragen, aber nicht geladen: automations.yaml
    # ist nicht in configuration.yaml eingebunden
    if status["mode"] == "automations" and not status["active"]:
        status["mode"] = "not_loaded"
    return status
