/* ------------------------------------------------------------------ *
 * PRESETS (Vorlagen)
 * ------------------------------------------------------------------ */

export const PRESETS = {
    // Passend zu docs/modbus_sungrow.yaml (mkaiser, Sungrow SHx)
    sungrow: {
        label: 'Sungrow Wechselrichter (SHx, mkaiser)',
        hint: 'Entitäten aus docs/modbus_sungrow.yaml. Netzleistung braucht den direkt angeschlossenen Smart Meter.',
        // Fehlzuordnungen älterer Vorlagen, die überschrieben werden dürfen
        replaces: {
            'grid.live': ['sensor.load_power'],
            'consumers.live': ['sensor.total_active_power'],
        },
        solar: [
            {
                name: 'PV-Anlage',
                live: 'sensor.total_dc_power',
                total: 'sensor.total_pv_generation',
                temperatur: 'sensor.inverter_temperature',
                strings: [
                    { name: 'MPPT 1', live: 'sensor.mppt1_power' },
                    { name: 'MPPT 2', live: 'sensor.mppt2_power' },
                    { name: 'MPPT 3', live: 'sensor.mppt3_power' },
                    { name: 'MPPT 4', live: 'sensor.mppt4_power' },
                ],
            },
        ],
        battery: [
            {
                name: 'Hausspeicher',
                live: 'sensor.battery_power',           // + entladen, − laden
                percent: 'sensor.battery_level',
                in_total: 'sensor.total_battery_charge',
                out_total: 'sensor.total_battery_discharge',
                temperatur: 'sensor.battery_temperature',
                control: {
                    normal_mode: 'scene.self_consumption_mode_max_battery_discharge',
                    mode_stop_discharging: 'scene.self_consumption_mode_no_battery_discharge',
                    mode_start_charging: 'scene.battery_forced_charge',
                },
            },
        ],
        grid: {
            live: 'sensor.meter_active_power',          // + Bezug, − Einspeisung
            import_total: ['sensor.total_imported_energy'],
            export_total: ['sensor.total_exported_energy'],
        },
        consumers: {
            live: 'sensor.load_power',
            total: 'sensor.total_consumed_energy',
        },
    },
    // Passend zu docs/modbus_mennekes.yaml
    mennekes_amtron_charge_control: {
        label: 'MENNEKES AMTRON CHARGE CONTROL',
        hint: 'Entitäten aus docs/modbus_mennekes.yaml. Den Fahrzeug-Ladestand liefert die Wallbox nicht – bitte aus der Auto-Integration zuordnen.',
        replaces: {
            'wallboxes.total': ['sensor.mennekes_wallbox_gesamtzahlerstand'],
        },
        wallboxes: [
            {
                name: 'Mennekes',
                live: 'sensor.mennekes_aktuelle_ladeleistung',
                total: 'sensor.mennekes_gesamtenergie',
                total_session: 'sensor.mennekes_energie_aktueller_ladevorgang',
                status: 'sensor.mennekes_status',
                ready_for_charge: 'binary_sensor.mennekes_ready_for_charge',
                more: {
                    phases_value: 3,
                    max_power_value: 11000,
                },
            },
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