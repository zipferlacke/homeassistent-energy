"""switch.py – von der Integration selbst verwaltete Ein/Aus-Helfer.

Aktuell gibt es davon nur einen: die Hausakku-Freigabe. Angelegt und
entfernt wird er über async_sync_entities in __init__.py, nicht hier.
"""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

DOMAIN = "wuefl_energy"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Meldet nur die Add-Funktion an – Entitäten kommen über async_sync_entities,
    aufgerufen direkt im Anschluss an async_forward_entry_setups."""
    hass.data[DOMAIN]["add_entities"]["switch"] = async_add_entities


class WueflSwitch(SwitchEntity, RestoreEntity):
    """Schalter ohne echtes Gerät dahinter – der Zustand lebt nur hier.

    Als "config" eingestuft: taucht nicht ungefragt in automatisch gebauten
    Dashboards auf, ist aber eine ganz normale Entität und lässt sich überall
    verwenden, wo man sie haben möchte.
    """

    _attr_entity_category = EntityCategory.CONFIG
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, spec: dict) -> None:
        self._attr_unique_id = spec["unique_id"]
        self.entity_id = spec["entity_id"]
        self._attr_name = spec["name"]
        self._attr_icon = spec.get("icon")
        self._attr_is_on = bool(spec.get("default", False))

    async def async_added_to_hass(self) -> None:
        """Letzten Zustand übernehmen, damit ein Neustart nichts zurücksetzt."""
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None and last.state in ("on", "off"):
            self._attr_is_on = last.state == "on"

    async def async_turn_on(self, **kwargs) -> None:
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        self._attr_is_on = False
        self.async_write_ha_state()
