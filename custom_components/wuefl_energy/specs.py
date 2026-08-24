"""specs.py – welche Helfer-Entitäten es geben soll.

Diese Helfer erfindet ausschließlich diese Integration: Lademodus, Ladestrom
und Ladeziel je Wallbox gibt es bei keiner Wallbox-Hardware als echten
Sensor, und die vier anlagenweiten Laderegler (Hausakku-Freigabe,
Batteriereserve, Priorität, Preisgrenze) sind ebenso unsere Erfindung.

Weil es dafür keine echte Quelle gibt, die der Nutzer zuordnen könnte, legt
die Integration sie selbst an — und entfernt sie auch wieder, sobald sie
nicht mehr gebraucht werden (keine Wallbox mehr vorhanden).

Diese Datei berechnet nur die Soll-Liste, ohne etwas zu verändern. Erzeugung
und Abgleich passieren in __init__.py; das Frontend fragt dieselbe Liste
über den WebSocket-Befehl "get" ab, damit die Regel, wie eine Entitäts-ID
zustande kommt, nur an einer Stelle steht.
"""
from __future__ import annotations

import re
import unicodedata

GLOBAL_SWITCH = {
    "unique_id": "wuefl_energy_battery_use",
    "entity_id": "switch.wuefl_hausakku_freigabe",
    "name": "wuefl Hausakku-Freigabe",
    "icon": "mdi:home-battery",
    "default": False,
}

GLOBAL_NUMBERS = [
    {
        "unique_id": "wuefl_energy_battery_reserve",
        "entity_id": "number.wuefl_Batteriereserve",
        "name": "wuefl Batteriereserve",
        "icon": "mdi:battery-lock",
        "min": 0, "max": 100, "step": 5, "unit": "%", "default": 20,
        "rules_field": "battery_reserve_entity",
    },
    {
        "unique_id": "wuefl_energy_price_limit",
        "entity_id": "number.wuefl_preisgrenze_laden",
        "name": "wuefl Preisgrenze Laden",
        "icon": "mdi:cash-clock",
        "min": 0, "max": 60, "step": 1, "unit": "ct", "default": 20,
        "rules_field": "price_limit_entity",
    },
]

GLOBAL_SELECT = {
    "unique_id": "wuefl_energy_priority",
    "entity_id": "select.wuefl_prioritaet",
    "name": "wuefl Priorität bei Überschuss",
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
    """Welche Entitäten es geben soll, abgeleitet aus der Zuordnung.

    Leer, solange keine Wallbox existiert — dann gibt es auch nichts zu
    regeln.
    """
    wallboxes = list(config.get("wallboxes") or [])
    switches: list[dict] = []
    numbers: list[dict] = []
    selects: list[dict] = []

    if wallboxes:
        switches.append({**GLOBAL_SWITCH, "rules_field": "battery_use_entity"})
        numbers.extend(GLOBAL_NUMBERS)
        selects.append({**GLOBAL_SELECT, "rules_field": "priority_entity"})

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

        selects.append({
            "unique_id": f"wuefl_energy_wallbox_{wallbox_id}_modus",
            "entity_id": f"select.wuefl_wallbox_{slug}_modus",
            "name": f"{display} Lademodus",
            "icon": "mdi:ev-station",
            "options": WALLBOX_MODE_OPTIONS,
            "default": "Solar",
            "wallbox_id": wallbox_id,
            "wallbox_field": "mode_entity",
        })
        numbers.append({
            "unique_id": f"wuefl_energy_wallbox_{wallbox_id}_ladestrom",
            "entity_id": f"number.wuefl_wallbox_{slug}_ladestrom",
            "name": f"{display} Maximaler Ladestrom",
            "icon": "mdi:current-ac",
            "min": 6, "max": 16, "step": 1, "unit": "A", "default": 16,
            "wallbox_id": wallbox_id,
            "wallbox_field": "current_entity",
        })
        numbers.append({
            "unique_id": f"wuefl_energy_wallbox_{wallbox_id}_ladeziel",
            "entity_id": f"number.wuefl_wallbox_{slug}_ladeziel",
            "name": f"{display} Ladeziel",
            "icon": "mdi:battery-charging-80",
            "min": 20, "max": 100, "step": 5, "unit": "%", "default": 80,
            "wallbox_id": wallbox_id,
            "wallbox_field": "target_entity",
        })

    return {"switch": switches, "number": numbers, "select": selects}


def compute_internal(config: dict) -> dict:
    """IDs der verwalteten Helfer, im Format das die Karten erwarten.

    Dieselbe Berechnung wie beim Anlegen, aber ohne Seiteneffekt — Frontend
    und Erzeugung greifen beide hierauf zurück, damit die Regel für eine
    Entitäts-ID nur an einer Stelle steht.
    """
    specs = required_specs(config)
    rules: dict[str, str] = {}
    wallboxes: dict[str, dict] = {}

    for group in specs.values():
        for spec in group:
            if "rules_field" in spec:
                rules[spec["rules_field"]] = spec["entity_id"]
            elif "wallbox_id" in spec:
                wallboxes.setdefault(spec["wallbox_id"], {})[spec["wallbox_field"]] = spec["entity_id"]

    return {"rules": rules, "wallboxes": wallboxes}
