/* ------------------------------------------------------------------ *
 * PRESETS (Vorlagen)
 * ------------------------------------------------------------------ *
 * label   Gerät, wie es im Auswahlmenü steht
 * source  woher die Sensoren kommen (Integration/Paket) – steht dahinter
 * group   Reiter in der Zuordnung: Wechselrichter, Batterie, Ladesäule, Allgemein
 * links   Downloads (Paket liegt unter www/packages/) und Seiten zum Gerät
 * Entitäten sind feste IDs oder Muster: "*" = beliebig, "#" = ein
 * Namensteil ohne "_" (z. B. die Seriennummer). Listen = erster Treffer.
 */

// Öffnet die Seite direkt in der eigenen HA-Instanz (My Home Assistant)
const hacs = (owner, repository) =>
    `https://my.home-assistant.io/redirect/hacs_repository/?owner=${owner}&repository=${repository}&category=integration`;
const setup = (domain) => `https://my.home-assistant.io/redirect/config_flow_start/?domain=${domain}`;

export const PRESETS = {
    // Passend zu packages/modbus_sungrow.yaml (mkaiser, Sungrow SHx)
    sungrow: {
        label: 'Sungrow Wechselrichter SHx',
        group: 'Wechselrichter',
        source: 'Modbus-Paket von mkaiser',
        hint: 'Paket nach config/packages/ kopieren, Zugangsdaten in secrets.yaml eintragen, HA neu starten. Netzleistung braucht den direkt angeschlossenen Smart Meter.',
        links: [
            { label: 'Paket herunterladen', download: 'modbus_sungrow.yaml' },
            { label: 'Anleitung & neueste Version (mkaiser)', url: 'https://github.com/mkaiser/Sungrow-SHx-Inverter-Modbus-Home-Assistant' },
        ],
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
    // Akku am Sungrow-Hybrid (SBR u. a.), kommt aus demselben Modbus-Paket
    sungrow_battery: {
        label: 'Sungrow Batterie (SBR am SHx)',
        group: 'Batterie',
        source: 'Modbus-Paket von mkaiser',
        hint: 'Kommt aus demselben Paket wie der Sungrow-Wechselrichter. Die Szenen zum Sperren und Netzladen legt das Paket mit an.',
        links: [
            { label: 'Paket herunterladen', download: 'modbus_sungrow.yaml' },
            { label: 'Anleitung & neueste Version (mkaiser)', url: 'https://github.com/mkaiser/Sungrow-SHx-Inverter-Modbus-Home-Assistant' },
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
    },
    // Passend zu packages/modbus_mennekes.yaml
    mennekes_amtron_charge_control: {
        label: 'MENNEKES AMTRON Charge Control',
        group: 'Ladesäule',
        source: 'Modbus-Paket',
        hint: 'Paket nach config/packages/ kopieren, Zugangsdaten in secrets.yaml eintragen, HA neu starten. In der Wallbox Modbus TCP/HEMS freischalten. Den Fahrzeug-Ladestand liefert die Wallbox nicht – bitte aus der Auto-Integration zuordnen.',
        links: [
            { label: 'Paket herunterladen', download: 'modbus_mennekes.yaml' },
            { label: 'Modbus-Spezifikation (Mennekes)', url: 'https://www.mennekes.de/fileadmin/MEN-Deutschland/emobility/01_documents/04_installer/ECU_modbus_tcp_server_spec_rev_1.07.pdf' },
        ],
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
                    min_current_value: 6,
                },
                // Pause über 0 A – die HEMS-Vorgabe erlaubt 0
                control: {
                    current_set: 'number.mennekes_hems_stromvorgabe',
                },
            },
        ],
    },
    // HACS-Integration "go-eCharger API v2" von marq24 (goecharger_api2).
    // Entitäten: <domain>.goe_<seriennummer>_<api-key>, im Cloud-Modus goe_wan_…
    goe_charger: {
        label: 'go-e Charger (Gemini, Gemini flex, HOMEfix …)',
        group: 'Ladesäule',
        source: 'HACS: go-eCharger API v2 (marq24)',
        links: [
            { label: 'In HACS öffnen', url: hacs('marq24', 'ha-goecharger-api2') },
            { label: 'GitHub', url: 'https://github.com/marq24/ha-goecharger-api2' },
        ],
        hint: 'Braucht die HACS-Integration „go-eCharger API v2“ von marq24 (lokal; in der go-e App „HTTP API v2“ aktivieren). ' +
            'Maximale Ladeleistung unter „Hardware & Grenzen“ an deine Wallbox anpassen (11 oder 22 kW). ' +
            'Den Fahrzeug-Ladestand liefert die Wallbox nicht – bitte aus der Auto-Integration zuordnen.',
        wallboxes: [
            {
                name: 'go-e',
                live: ['sensor.goe_#_nrg_11', 'sensor.goe_wan_#_nrg_11'],
                total: ['sensor.goe_#_eto', 'sensor.goe_wan_#_eto'],
                total_session: ['sensor.goe_#_wh', 'sensor.goe_wan_#_wh'],
                status: ['sensor.goe_#_car_value', 'sensor.goe_wan_#_car_value'],
                more: {
                    phases_value: 3,
                    max_power_value: 11000,
                    min_current_value: 6,
                },
                control: {
                    // "Angeforderter Strom" 6–32 A
                    current_set: ['number.goe_#_amp', 'number.goe_wan_#_amp'],
                    // "Manueller Lademodus": 0 = neutral, 1 = nicht laden, 2 = laden
                    charge_stop: ['select.goe_#_frc', 'select.goe_wan_#_frc'],
                    stop_option: '1',
                    start_option: '0',
                    // "Phasen Wechselmodus": 0 = auto, 1 = 1-phasig, 2 = 3-phasig
                    phase_switch: ['select.goe_#_psm', 'select.goe_wan_#_psm'],
                    phase1_option: '1',
                    phase3_option: '2',
                },
            },
        ],
    },
    ha_default: {
        label: 'Standard Home Assistant',
        group: 'Allgemein',
        source: 'übliche Sensornamen',
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
        label: 'Fronius Symo / Gen24',
        group: 'Wechselrichter',
        source: 'Fronius-Integration von HA',
        links: [
            { label: 'Integration einrichten', url: setup('fronius') },
        ],
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
    },
    fronius_battery: {
        label: 'Fronius Speicher (BYD u. a. am Gen24)',
        group: 'Batterie',
        source: 'Fronius-Integration von HA',
        links: [
            { label: 'Integration einrichten', url: setup('fronius') },
        ],
        hint: 'Sucht nach typischen Fronius-Speicher-Sensoren.',
        battery: [
            {
                name: 'Fronius Speicher',
                live: ['sensor.solarnet_power_battery'],
                percent: ['sensor.inverter_state_of_charge'],
            },
        ],
    },
};