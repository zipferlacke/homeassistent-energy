"""specs.py – welche Helfer-Entitäten es geben soll."""
from __future__ import annotations

import copy
import re
import unicodedata

GLOBAL_SWITCH = {
    "unique_id": "we_battery_ussage_charging",
    "entity_id": "switch.we_battery_ussage_charging",
    "name": "Hausakku-Freigabe Laden",
    "icon": "mdi:home-battery",
    "default": False,
}

GLOBAL_NUMBERS = [
    {
        "unique_id": "we_battery_ussage_limit_charging",
        "entity_id": "number.we_battery_ussage_limit_charging",
        "name": "Hausakku-Nutzungsgrenze Laden",
        "icon": "mdi:battery-lock",
        "min": 0, "max": 100, "step": 5, "unit": "%", "default": 20,
        "rules_field": "battery_reserve_entity",
    },
    {
        "unique_id": "we_price_limit_charging",
        "entity_id": "number.we_price_limit_charging",
        "name": "Preisgrenze Laden",
        "icon": "mdi:cash-clock",
        "min": 0, "max": 500, "step": 1, "unit": "ct", "default": 20,
        "rules_field": "price_limit_entity",
    },
]

GLOBAL_SELECT = {
    "unique_id": "we_priority_charging",
    "entity_id": "select.we_priority_charging",
    "name": "Priorität bei Überschuss",
    "icon": "mdi:priority-high",
    "options": ["Hausakku zuerst", "Auto zuerst"],
    "default": "Hausakku zuerst",
}

WALLBOX_MODE_OPTIONS = ["Aus", "Solar", "Solar + günstig", "Schnell"]


def _slug(text: str | None, fallback: str) -> str:
    """Entitäts-ID-tauglicher Namensteil, z. B. aus dem Wallbox-Namen."""
    text = (text or "").strip()
    if not text:
        return fallback
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return text or fallback


def required_specs(config: dict) -> dict[str, list[dict]]:
    """Welche Entitäten es geben soll, abgeleitet aus der Zuordnung."""
    wallboxes = list(config.get("wallboxes") or [])
    
    # Globale Regler immer anlegen (unabhängig von der Anzahl der Wallboxen)
    switches: list[dict] = [{**GLOBAL_SWITCH, "rules_field": "battery_use_entity"}]
    numbers: list[dict] = list(GLOBAL_NUMBERS)
    selects: list[dict] = [{**GLOBAL_SELECT, "rules_field": "priority_entity"}]

    used_slugs: set[str] = set()
    for i, wallbox in enumerate(wallboxes):
        wallbox_id = wallbox.get("id") or f"wallbox_{i}"
        display = wallbox.get("name") or f"Wallbox {i + 1}"

        base_slug = _slug(wallbox.get("name"), f"wallbox_{i + 1}")
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}_{n}"
            n += 1
        used_slugs.add(slug)

        # 1. Freigabe Zahl
        numbers.append({
            "unique_id": f"we_activate_station_{slug}",
            "entity_id": f"number.we_activate_station_{slug}",
            "name": f"{display} Laden Freischalten",
            "icon": "mdi:power",
            "min": 0, "max": 1000, "step": 1, "default": 1,
            "wallbox_id": wallbox_id,
            "wallbox_field": "activate_station",
        })

        # 2. Soll-Sendeleistung (Number: 0 bis max_power)
        max_p = wallbox.get("max_power") or 11000
        numbers.append({
            "unique_id": f"we_send_power_{slug}",
            "entity_id": f"number.we_send_power_{slug}",
            "name": f"{display} Soll-Ladeleistung",
            "icon": "mdi:lightning-bolt-outline",
            "min": 0, "max": max_p, "step": 100, "unit": "W", "default": 0,
            "wallbox_id": wallbox_id,
            "wallbox_field": "send_power",
        })

        # 3. Lademodus (Select)
        selects.append({
            "unique_id": f"we_charge_type_{slug}",
            "entity_id": f"select.we_charge_type_{slug}",
            "name": f"{display} Lademodus",
            "icon": "mdi:ev-station",
            "options": WALLBOX_MODE_OPTIONS,
            "default": "Solar",
            "wallbox_id": wallbox_id,
            "wallbox_field": "charge_type",
        })

        # 4. Batterie-Ladeziel (Number: 0.0 bis 1.0)
        numbers.append({
            "unique_id": f"we_charge_percent_limit_{slug}",
            "entity_id": f"number.we_charge_percent_limit_{slug}",
            "name": f"{display} Batterie-Ladeziel",
            "icon": "mdi:battery-charging-80",
            "min": 0, "max": 1, "step": 0.05, "default": 0.8,
            "wallbox_id": wallbox_id,
            "wallbox_field": "charge_percent_limit",
        })

        # 5. Limit ignorieren (Switch: Bool)
        switches.append({
            "unique_id": f"we_ignore_percent_limit_{slug}",
            "entity_id": f"switch.we_ignore_percent_limit_{slug}",
            "name": f"{display} Batterie-Limit ignorieren",
            "icon": "mdi:battery-off-outline",
            "default": False,
            "wallbox_id": wallbox_id,
            "wallbox_field": "ignore_percent_limit",
        })

    return {"switch": switches, "number": numbers, "select": selects}


def enrich_config(config: dict) -> dict:
    """Reichert das Config-Objekt direkt mit allen generierten Entitäts-IDs an."""
    enriched = copy.deepcopy(config)
    specs = required_specs(enriched)

    # 1. Map für Wallboxen aufbauen
    wb_map: dict[str, dict] = {}
    for group in specs.values():
        for spec in group:
            if "wallbox_id" in spec:
                wb_map.setdefault(spec["wallbox_id"], {})[spec["wallbox_field"]] = spec["entity_id"]

    # Injektion in einzelne Wallboxen
    if "wallboxes" in enriched and isinstance(enriched["wallboxes"], list):
        for wb in enriched["wallboxes"]:
            wb_id = wb.get("id")
            if wb_id and wb_id in wb_map:
                wb.update(wb_map[wb_id])

    # 2. wallboxes_config IMMER auf Root-Ebene garantieren
    enriched["wallboxes_config"] = {
        "battery_ussage_charging": "switch.we_battery_ussage_charging",
        "battery_ussage_limit_charging": "number.we_battery_ussage_limit_charging",
        "price_limit_charging": "number.we_price_limit_charging",
    }

    # 3. systemdata.priority_charging IMMER setzen
    enriched.setdefault("systemdata", {})["priority_charging"] = "select.we_priority_charging"

    return enriched