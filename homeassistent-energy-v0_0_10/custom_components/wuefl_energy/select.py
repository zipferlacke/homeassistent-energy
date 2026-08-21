"""select.py – von der Integration selbst verwaltete Auswahl-Helfer.

Priorität bei Überschuss anlagenweit, Lademodus je Wallbox. Angelegt und
entfernt über async_sync_entities in __init__.py.
"""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

DOMAIN = "wuefl_energy"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    hass.data[DOMAIN]["add_entities"]["select"] = async_add_entities


class WueflSelect(SelectEntity, RestoreEntity):
    """Auswahlliste ohne echtes Gerät dahinter – der Zustand lebt nur hier."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, spec: dict) -> None:
        self._attr_unique_id = spec["unique_id"]
        self.entity_id = spec["entity_id"]
        self._attr_name = spec["name"]
        self._attr_icon = spec.get("icon")
        self._attr_options = spec["options"]
        self._attr_current_option = spec.get("default", spec["options"][0])

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None and last.state in self._attr_options:
            self._attr_current_option = last.state

    async def async_select_option(self, option: str) -> None:
        self._attr_current_option = option
        self.async_write_ha_state()
