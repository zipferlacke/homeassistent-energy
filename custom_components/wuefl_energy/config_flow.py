"""config_flow.py – nichts einzustellen, dieser Ablauf legt nur den einen
Eintrag an, den die Plattformen (switch/number/select) zum Laden brauchen.

Warum überhaupt ein Config Entry, wenn es nichts zu konfigurieren gibt: nur
darüber garantiert Home Assistant zuverlässig, dass alle drei Plattformen
fertig eingerichtet sind, bevor der Rest weiterläuft. Die ältere
Discovery-Methode (async_load_platform) hat diese Garantie nicht und lief
in der Praxis in ein Timeout, ganz gleich wie lange gewartet wurde.
"""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

DOMAIN = "we"


class WueflEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Ein einziger Eintrag reicht — mehrere ergäben keinen Sinn."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        self._async_abort_entries_match()
        if user_input is not None:
            return self.async_create_entry(title="wuefl Energie", data={})
        return self.async_show_form(step_id="user")

    async def async_step_import(self, import_config: dict | None) -> FlowResult:
        """Wird automatisch ausgelöst, wenn "we:" in der
        configuration.yaml steht — kein Klicken in der Oberfläche nötig."""
        self._async_abort_entries_match()
        return self.async_create_entry(title="wuefl Energie", data={})
