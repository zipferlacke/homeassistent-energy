"""number.py – von der Integration selbst verwaltete Zahlen-Helfer.

Batteriereserve und Preisgrenze anlagenweit, Ladestrom und Ladeziel je
Wallbox. Angelegt und entfernt über async_sync_entities in __init__.py.
"""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

DOMAIN = "we"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    hass.data[DOMAIN]["add_entities"]["number"] = async_add_entities


class WueflNumber(NumberEntity, RestoreEntity):
    """Schieberegler ohne echtes Gerät dahinter – der Zustand lebt nur hier."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_mode = NumberMode.SLIDER
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, spec: dict) -> None:
        self._attr_unique_id = spec["unique_id"]
        self.entity_id = spec["entity_id"]
        self._attr_name = spec["name"]
        self._attr_icon = spec.get("icon")
        self._attr_native_min_value = spec["min"]
        self._attr_native_max_value = spec["max"]
        self._attr_native_step = spec["step"]
        self._attr_native_unit_of_measurement = spec.get("unit")
        self._attr_native_value = spec.get("default", spec["min"])

    def update_spec(self, spec: dict) -> None:
        """Grenzen und Name aus der Zuordnung nachziehen (z. B. neue
        Maximalleistung der Wallbox) – sonst gälte die alte Obergrenze bis zum
        Neustart und höhere Vorgaben der Automation schlügen fehl."""
        new = (spec["name"], spec["min"], spec["max"], spec["step"])
        old = (self._attr_name, self._attr_native_min_value, self._attr_native_max_value, self._attr_native_step)
        if new == old:
            return
        self._attr_name, self._attr_native_min_value, self._attr_native_max_value, self._attr_native_step = new
        if self._attr_native_value is not None:
            self._attr_native_value = min(max(self._attr_native_value, spec["min"]), spec["max"])
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None and last.state not in (None, "unknown", "unavailable"):
            try:
                self._attr_native_value = float(last.state)
            except ValueError:
                pass

    async def async_set_native_value(self, value: float) -> None:
        self._attr_native_value = value
        self.async_write_ha_state()
