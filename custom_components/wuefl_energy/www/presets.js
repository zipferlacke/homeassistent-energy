/* ------------------------------------------------------------------ *
 * PRESETS (Vorlagen)
 * ------------------------------------------------------------------ */

export const PRESETS = {
    sungrow: {
        label: 'Sungrow Wechselrichter',
        hint: 'Sucht die Standard Sensoren von wsungrow.yaml nach mkaiser`s sungrow modbus Bibliothek',
        "solar": [
            {
                "live": "sensor.total_dc_power",
                "total": "sensor.total_pv_generation",
                "temperatur": "sensor.inverter_temperature",
            }
        ],
        "battery": [
            {
                "name": "Hausspeicher",
                "live": "sensor.battery_power",
                "percent": "sensor.battery_level",
                "in_total": "sensor.total_battery_charge",
                "out_total": "sensor.total_battery_discharge",
                "temperatur": "sensor.battery_temperature",
            }
        ],
        "grid": {
            "live": "sensor.load_power",
            "import_total": [
                "sensor.total_imported_energy"
            ],
            "export_total": [
                "sensor.total_exported_energy"
            ],
            "price_export": "number.we_price_export_energy",
            "price_import": "number.we_price_import_energy"
        },
        "consumers": {
            "total": "sensor.total_consumed_energy",
            "live": "sensor.total_active_power"
        },

    },
    mennekes_amtron_charge_control: {
        label: 'MENNEKES AMTRON CHARGE CONTROL',
        hint: 'Sucht die Standard Sensoren von wmennekes_amtron_charge_control.yaml',
        "wallboxes": [
            {
                "name": "Mennekes",
                "live": "sensor.mennekes_aktuelle_ladeleistung",
                "total": "sensor.mennekes_wallbox_gesamtzahlerstand",
                "total_session": "sensor.mennekes_energie_aktueller_ladevorgang",
                "ready_for_charge": "binary_sensor.mennekes_ready_for_charge",
                "status": "sensor.mennekes_status",
                "more": {
                    "phases_value": 3,
                    "max_power_value": 11000
                },
            }
        ],
    },
    ha_default: {
        label: 'Standard Home Assistant',
        hint: 'Sucht nach Standard-Entitäten mit üblichen Namen.',
        grid: {
            live: ['sensor.grid_power', 'sensor.netzleistung'],
            import_total: ['sensor.grid_import_energy', 'sensor.netzbezug_gesamt'],
            export_total: ['sensor.grid_export_energy', 'sensor.stromeinspeisung_gesamt'],
        },
        solar: [
            {
                name: 'PV-Anlage Hauptdach',
                live: ['sensor.pv_power', 'sensor.solar_power', 'sensor.photovoltaik_leistung'],
                total: ['sensor.pv_energy', 'sensor.solar_energy_total'],
            },
        ],
        battery: [
            {
                name: 'Hausspeicher',
                live: ['sensor.battery_power', 'sensor.batterie_leistung'],
                percent: ['sensor.battery_state_of_charge', 'sensor.batterie_ladestand'],
            },
        ],
        consumers: {
            live: ['sensor.house_power', 'sensor.hausverbrauch_live'],
        },
    },
    fronius: {
        label: 'Fronius Inverter',
        hint: 'Sucht nach typischen Fronius Symo / Gen24 Sensoren.',
        grid: {
            live: ['sensor.solarnet_power_grid'],
            import_total: ['sensor.smart_meter_energy_ac_consumed'],
            export_total: ['sensor.smart_meter_energy_ac_produced'],
        },
        solar: [
            {
                name: 'Fronius PV',
                live: ['sensor.solarnet_power_photovoltaics'],
                total: ['sensor.inverter_energy_total'],
            },
        ],
        battery: [
            {
                name: 'Fronius Speicher',
                live: ['sensor.solarnet_power_battery'],
                percent: ['sensor.inverter_state_of_charge'],
            },
        ],
    },
};