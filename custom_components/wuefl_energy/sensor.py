"""sensor.py – von der Integration selbst berechnete Sensoren.

Aktuell nur die Grundlast: durchschnittlicher Hausverbrauch der letzten
sieben vollen Tage, geteilt durch die Anzahl der Tage mit Daten. Ergibt,
was das Haus etwa pro Tag bzw. pro Stunde braucht – die Wallbox zählt
nicht mit, sie ist ja genau das, wofür geplant wird.

Angelegt und entfernt über async_sync_entities in __init__.py.
"""
from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

DOMAIN = "we"
EVENT_UPDATED = "we_updated"
DAYS = 7

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    hass.data[DOMAIN]["add_entities"]["sensor"] = async_add_entities


def _ids(value) -> list[str]:
    """Entitäten aus einem Feld der Zuordnung – String, Liste oder {entity: …}."""
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return _ids(value.get("entity"))
    if isinstance(value, list):
        return [i for v in value for i in _ids(v)]
    return []


def _consumption_terms(config: dict) -> list[tuple[str, int]]:
    """Welche Zähler mit welchem Vorzeichen den Hausverbrauch ergeben.

    Mit einem Hausverbrauchszähler direkt dieser, sonst berechnet aus
    Netzbezug + PV + Akku-Entladung − Einspeisung − Akku-Ladung. Die
    Wallbox wird in beiden Fällen abgezogen.
    """
    rows = lambda key: [r for r in config.get(key) or [] if isinstance(r, dict)]  # noqa: E731
    grid = config.get("grid") or {}
    consumers = config.get("consumers") or {}

    terms = [(i, 1) for i in _ids(consumers.get("total"))]
    if not terms:
        terms = (
            [(i, 1) for i in _ids(grid.get("import_total"))]
            + [(i, -1) for i in _ids(grid.get("export_total"))]
            + [(i, 1) for s in rows("solar") for i in _ids(s.get("total"))]
            + [(i, 1) for b in rows("battery") for i in _ids(b.get("out_total"))]
            + [(i, -1) for b in rows("battery") for i in _ids(b.get("in_total"))]
        )
        # Ohne Netzbezug lässt sich nichts Sinnvolles berechnen
        if not _ids(grid.get("import_total")):
            return []
    terms += [(i, -1) for w in rows("wallboxes") for i in _ids(w.get("total"))]
    return terms


class WueflBaseLoadSensor(SensorEntity):
    """Durchschnittlicher Hausverbrauch der letzten 7 Tage als Leistung in W."""

    _attr_should_poll = False
    _attr_has_entity_name = False
    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_suggested_display_precision = 0

    def __init__(self, spec: dict) -> None:
        self._attr_unique_id = spec["unique_id"]
        self.entity_id = spec["entity_id"]
        self._attr_name = spec["name"]
        self._attr_icon = spec.get("icon")
        self._attr_native_value = None
        self._attr_extra_state_attributes = {}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_track_time_interval(self.hass, self._async_refresh, timedelta(hours=1))
        )
        self.async_on_remove(self.hass.bus.async_listen(EVENT_UPDATED, self._async_refresh))
        await self._async_refresh()

    async def _async_refresh(self, *_) -> None:
        config = self.hass.data.get(DOMAIN, {}).get("config", {})
        terms = _consumption_terms(config)
        result = await self._async_compute(terms) if terms else None

        if result is None:
            self._attr_native_value = None
            self._attr_extra_state_attributes = {"days": 0, "sources": [i for i, _ in terms]}
        else:
            kwh, days = result
            per_day = kwh / days
            self._attr_native_value = round(per_day / 24 * 1000)
            self._attr_extra_state_attributes = {
                "kwh_per_day": round(per_day, 2),
                "kwh_per_hour": round(per_day / 24, 3),
                "kwh_total": round(kwh, 2),
                "days": days,
                "sources": [i for i, _ in terms],
            }
        self.async_write_ha_state()

    async def _async_compute(self, terms: list[tuple[str, int]]) -> tuple[float, int] | None:
        """Summe der Verbräuche und Anzahl Tage mit Daten (volle Tage, max. 7)."""
        try:
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder.statistics import statistics_during_period
        except ImportError:
            return None

        end = dt_util.start_of_local_day()
        start = end - timedelta(days=DAYS)
        ids = {i for i, _ in terms}
        try:
            stats = await get_instance(self.hass).async_add_executor_job(
                statistics_during_period,
                self.hass, start, end, ids, "day", {"energy": "kWh"}, {"change"},
            )
        except Exception:  # Recorder nicht bereit o. ä. – beim nächsten Lauf erneut
            _LOGGER.debug("Grundlast: Statistik nicht verfügbar", exc_info=True)
            return None

        total = 0.0
        days: set[float] = set()
        for entity_id, sign in terms:
            for row in stats.get(entity_id, []):
                change = row.get("change")
                if change is None:
                    continue
                total += sign * float(change)
                days.add(row.get("start"))
        if not days:
            return None
        return max(total, 0.0), len(days)
