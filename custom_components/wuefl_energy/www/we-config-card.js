/* ------------------------------------------------------------------ *
 * Helper-Funktionen & Selector-Generatoren
 * ------------------------------------------------------------------ */

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const esc = (str) => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (name, extra = '') => `<ha-icon icon="${name}" ${extra}></ha-icon>`;

const text = () => ({ text: {} });
const watt = (multiple = false) => ({ entity: { multiple, filter: { device_class: 'power' } } });
const kwh = (multiple = false) => ({ entity: { multiple, filter: { device_class: 'energy' } } });
const temp = (multiple = false) => ({ entity: { multiple, filter: { device_class: 'temperature' } } });
const percent = () => ({ entity: { filter: { device_class: 'battery' } } });
const money = () => ({ entity: { filter: { device_class: 'monetary' } } });
const bool = () => ({ boolean: {} });
const number = (min, max, step) => ({ number: { min, max, step, mode: 'box' } });

function findEntity(states, pattern) {
  if (!states) return null;
  if (states[pattern]) return pattern;
  const reg = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
  return Object.keys(states).find((id) => reg.test(id)) || null;
}

function normalizeConfig(cfg) {
  const c = { ...(cfg || {}) };
  c.solar = asList(c.solar);
  c.battery = asList(c.battery);
  c.heatpump = asList(c.heatpump);
  c.wallboxes = asList(c.wallboxes);
  c.water = asList(c.water);
  c.grid = c.grid || {};
  c.consumers = c.consumers || {};
  c.systemdata = c.systemdata || {};
  return c;
}

/* ------------------------------------------------------------------ *
 * PRESETS (Vorlagen)
 * ------------------------------------------------------------------ */

const PRESETS = {
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

/* ------------------------------------------------------------------ *
 * BLOCKS Configuration
 * ------------------------------------------------------------------ */

const BLOCKS = [
  {
    key: 'grid',
    kind: 'single',
    title: 'Stromnetz',
    icon: 'mdi:transmission-tower',
    intro: 'Netzanschluss, Zählerstände sowie Strom- und Einspeisepreise.',
    empty: 'Netzanschluss einrichten',
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'live', selector: () => watt() },
      { name: 'import_total', selector: () => kwh(true) },
      { name: 'export_total', selector: () => kwh(true) },
      { name: 'price_import', selector: () => money() },
      { name: 'price_export', selector: () => money() },
      { name: 'price_import_forecast', selector: () => money() },
      { name: 'price_export_forecast', selector: () => money() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'solar',
    kind: 'list',
    title: 'Photovoltaik',
    icon: 'mdi:solar-power-variant',
    intro: 'Deine PV-Anlagen. Bei mehreren Wechselrichtern/Dachflächen einfach weitere hinzufügen.',
    add: 'PV-Anlage hinzufügen',
    label: (e, i) => e.name || `PV-Anlage ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'total', selector: () => kwh() },
      { name: 'forecast', selector: () => kwh(true) },
      { name: 'temperatur', selector: () => temp() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'strings',
    kind: 'list',
    nestedIn: 'solar',
    title: 'Strings / Dachflächen',
    icon: 'mdi:solar-panel',
    intro: 'Einzelne Dachflächen oder MPPTs mit eigenem Namen, Sensor und Farbe.',
    add: 'String hinzufügen',
    label: (e, i) => e.name || `String ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'battery',
    kind: 'list',
    title: 'Hausbatterie',
    icon: 'mdi:home-battery',
    intro: 'Batteriespeicher für aktuelle Leistung, Ladestand und Temperaturen.',
    add: 'Batterie hinzufügen',
    label: (e, i) => e.name || `Batterie ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'percent', selector: () => percent() },
      { name: 'in_total', selector: () => kwh() },
      { name: 'out_total', selector: () => kwh() },
      { name: 'temperatur', selector: () => temp() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'consumers',
    kind: 'single',
    title: 'Haushalt',
    icon: 'mdi:home',
    intro: 'Gesamtverbrauch im Haus. Bleibt "Live" leer, wird er automatisch berechnet.',
    empty: 'Haushalt einrichten',
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'live', selector: () => watt() },
      { name: 'total', selector: () => kwh() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'heatpump',
    kind: 'list',
    title: 'Wärmepumpen',
    icon: 'mdi:heat-pump',
    intro: 'Elektrische Leistungsaufnahme und Verbrauch deiner Wärmepumpe.',
    add: 'Wärmepumpe hinzufügen',
    label: (e, i) => e.name || `Wärmepumpe ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'total', selector: () => kwh() },
      { name: 'temperatur', selector: () => temp() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'wallboxes',
    kind: 'list',
    title: 'Wallboxen',
    icon: 'mdi:ev-station',
    intro: 'Ladepunkte für Elektrofahrzeuge samt Steuerungsparametern.',
    add: 'Wallbox hinzufügen',
    label: (e, i) => e.name || `Wallbox ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'total', selector: () => kwh() },
      { name: 'total_session', selector: () => kwh() },
      { name: 'status', selector: () => ({ entity: { filter: { domain: 'sensor' } } }) },
      { name: 'ready_for_charge', selector: () => bool() },
      { name: 'car_percent', selector: () => percent() },
      { name: 'color', selector: () => text() },
      {
        type: 'expandable',
        name: 'more',
        title: 'Hardware & Grenzen',
        fields: [
          { name: 'phases_value', selector: () => number(1, 3, 1) },
          { name: 'max_power_value', selector: () => number(1000, 30000, 100) },
        ],
      },
    ],
  },
  {
    key: 'water',
    kind: 'list',
    title: 'Wasser & Warmwasser',
    icon: 'mdi:water-boiler',
    intro: 'Erfassung von Warmwasser- und Wasserverbrauchssystemen.',
    add: 'Wassersystem hinzufügen',
    label: (e, i) => e.name || `Wassersystem ${i + 1}`,
    summary: (e) => e.live?.entity || e.live,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'live', selector: () => watt() },
      { name: 'total', selector: () => kwh() },
      { name: 'color', selector: () => text() },
    ],
  },
  {
    key: 'systemdata',
    kind: 'single',
    title: 'Systemdaten & Wetter',
    icon: 'mdi:home-lightning-bolt-outline',
    intro: 'Allgemeine Anlagendaten, Kosten, Wetter und zusätzliche Sensoren.',
    empty: 'Systemdaten einrichten',
    summary: (e) => e.weather_entity?.entity || e.weather_entity,
    schema: [
      { name: 'system_cost_value', selector: () => number(0, 500000, 100) },
      { name: 'commissioned_value', selector: () => text() },
      { name: 'house_base_load', selector: () => watt() },
      { name: 'weather_entity', selector: () => ({ entity: { filter: { domain: 'weather' } } }) },
      { name: 'temperatures', selector: () => temp(true) },
      { name: 'extra_entities', selector: () => ({ entity: { multiple: true } }) },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * LABELS Configuration
 * ------------------------------------------------------------------ */

const LABELS = {
  grid: {
    live: 'Netzleistung',
    import_total: 'Bezug gesamt',
    export_total: 'Einspeisung gesamt',
    price_import: 'Strompreis Bezug',
    price_export: 'Einspeisevergütung',
    price_import_forecast: 'Preisprognose Bezug',
    price_export_forecast: 'Preisprognose Einspeisung',
    color: 'Farbe (HEX-Code / Name)',
  },
  solar: {
    name: 'Bezeichnung',
    live: 'PV-Leistung',
    total: 'PV-Ertrag gesamt',
    forecast: 'Ertragsprognose',
    temperatur: 'Wechselrichter-Temperatur',
    color: 'Farbe (HEX-Code / Name)',
  },
  strings: {
    name: 'Bezeichnung',
    live: 'Leistungs-Sensor (Watt)',
    color: 'Farbe (HEX-Code / Name)',
  },
  battery: {
    name: 'Bezeichnung',
    live: 'Batterieleistung',
    percent: 'Ladestand (SoC)',
    in_total: 'Geladen gesamt',
    out_total: 'Entladen gesamt',
    temperatur: 'Batterietemperatur',
    color: 'Farbe (HEX-Code / Name)',
  },
  consumers: {
    live: 'Hausverbrauch (Live)',
    total: 'Hausverbrauch gesamt',
    color: 'Farbe (HEX-Code / Name)',
  },
  heatpump: {
    name: 'Bezeichnung',
    live: 'Elektrische Leistung',
    total: 'Gesamtverbrauch',
    temperatur: 'Temperatur Sensor',
    color: 'Farbe (HEX-Code / Name)',
  },
  wallboxes: {
    name: 'Bezeichnung',
    live: 'Aktuelle Ladeleistung',
    total: 'Gesamtenergie',
    total_session: 'Energie des Ladevorgangs',
    status: 'Status der Wallbox',
    ready_for_charge: 'Bereit zum Laden',
    car_percent: 'Fahrzeug Akku %',
    color: 'Farbe (HEX-Code / Name)',
    phases_value: 'Anzahl Phasen',
    max_power_value: 'Maximale Ladeleistung',
  },
  water: {
    name: 'Bezeichnung',
    live: 'Aktuelle Leistung / Durchfluss',
    total: 'Gesamtverbrauch',
    color: 'Farbe (HEX-Code / Name)',
  },
  systemdata: {
    system_cost_value: 'Anschaffungskosten (€)',
    commissioned_value: 'In Betrieb seit (YYYY-MM-DD)',
    house_base_load: 'Durchschnittliche Grundlast',
    weather_entity: 'Wetterdienst',
    temperatures: 'Zusätzliche Temperaturen',
    extra_entities: 'Weitere Sensoren',
  },
};

/* ------------------------------------------------------------------ *
 * HELPERS Configuration
 * ------------------------------------------------------------------ */

const HELPERS = {
  grid: {
    live: 'Live-Wert in Watt (W). Positiv = Bezug, negativ = Einspeisung.',
    import_total: 'Gesamtzähler Netzbezug in kWh.',
    export_total: 'Gesamtzähler Einspeisung in kWh.',
    price_import: 'Sensor für aktuellen Bezugsstrompreis.',
    price_export: 'Sensor für aktuelle Einspeisevergütung.',
    price_import_forecast: 'Sensor/Attribut für vorhergesagte Bezugspreise.',
    price_export_forecast: 'Sensor/Attribut für vorhergesagte Einspeisepreise.',
    color: 'Farbe für Netzbezug/Einspeisung im Chart (z. B. #e74c3c oder red).',
  },
  solar: {
    name: 'Name der Anlage oder des Dachs (z. B. "Dach Süd").',
    live: 'Aktuelle PV-Leistung in Watt (W).',
    total: 'Gesamter ertragener Strom in kWh.',
    forecast: 'Prognose-Sensor (z. B. Solcast oder Forecast.Solar).',
    temperatur: 'Temperatursensor des Wechselrichters.',
    color: 'Hauptfarbe der PV-Anlage im Chart (z. B. #f1c40f oder yellow).',
  },
  strings: {
    name: 'Name des Strings (z. B. "Dach Süd" oder "MPPT 1").',
    entity: 'Live-Wert dieser einzelnen Fläche in Watt (W).',
    color: 'Farbcode für Charts/Graphen (z. B. #ff9f43 oder orange).',
  },
  battery: {
    name: 'Name des Speichers.',
    live: 'Live-Leistung in Watt (W). Positiv = entladen, negativ = laden.',
    percent: 'Ladestand in Prozent (%).',
    in_total: 'Gesamte geladene Energie in kWh.',
    out_total: 'Gesamte entladene Energie in kWh.',
    temperatur: 'Temperatursensor des Akkus.',
    color: 'Farbe der Batterie im Chart (z. B. #2ecc71 oder green).',
  },
  consumers: {
    live: 'Live-Verbrauch in Watt (W). Leer lassen für automatische Errechnung.',
    total: 'Gesamtverbrauchszähler im Haushalt in kWh.',
    color: 'Farbe für den Hausverbrauch im Chart (z. B. #3498db oder blue).',
  },
  heatpump: {
    name: 'Name der Wärmepumpe.',
    live: 'Elektrische Leistungsaufnahme in Watt (W).',
    total: 'Gesamte verbrauchte Energie in kWh.',
    temperatur: 'Temperatursensor (z. B. Vorlauf oder Raum).',
    color: 'Farbe der Wärmepumpe im Chart (z. B. #e67e22 oder orange).',
  },
  wallboxes: {
    name: 'Name der Wallbox.',
    live: 'Aktuelle Ladeleistung in Watt (W).',
    total: 'Gesamter Stromverbrauch der Wallbox in kWh.',
    total_session: 'Verbrauch der aktuellen Ladesession in kWh.',
    status: 'Sensor für Text-Status (z. B. "Fahrzeug verbunden").',
    ready_for_charge: 'Schalter/Sensor, ob Wallbox freigegeben ist.',
    car_percent: 'Batterie-Ladestand des verbundenen Autos in %.',
    phases_value: 'Anzahl aktiv genutzter Phasen (1–3).',
    max_power_value: 'Maximal erreichbare Ladeleistung in Watt (W).',
    color: 'Farbe der Wallbox im Chart (z. B. #9b59b6 oder purple).',
  },
  water: {
    name: 'Name des Systems (z. B. "Frischstation").',
    live: 'Live-Durchfluss oder Wärmeleistung.',
    total: 'Gesamter Verbrauchszähler.',
    color: 'Farbe des Wassersystems im Chart (z. B. #1abc9c oder teal).',
  },
  systemdata: {
    system_cost_value: 'Gesamte Anschaffungskosten der Anlage in Euro (€).',
    commissioned_value: 'Inbetriebnahmedatum im Format YYYY-MM-DD.',
    house_base_load: 'Durchschnittliche Haus-Grundlast in Watt (W).',
    weather_entity: 'Wetter-Entität für Außentemperatur und Vorhersage.',
    temperatures: 'Liste weiterer Temperatursensoren.',
    extra_entities: 'Weitere Sensoren für das Dashboard.',
  },
};

/* ------------------------------------------------------------------ *
 * Custom Card Implementation
 * ------------------------------------------------------------------ */

class WueflEnergyConfigCard extends HTMLElement {
  #hass = null;
  #config = null;
  #built = false;
  #editing = null; // { block, index, parentId }
  #draft = {};
  #els = {};

  set hass(hass) {
    this.#hass = hass;
    if (this.#els.form) {
      this.#els.form.hass = hass;
    }
  }

  setConfig(config) {
    this.#config = normalizeConfig(config);
    if (this.#built) this.#render();
  }

  connectedCallback() {
    if (!this.#built) {
      this.#build();
      this.#render();
    }
  }

  #build() {
    this.#built = true;
    this.attachShadow({ mode: 'open' });

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          color: var(--primary-text-color);
        }
        .container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Kompakte Presets-Leiste */
        .preset-bar-wrapper {
          background: var(--secondary-background-color, #f5f5f5);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preset-bar {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .preset-select {
          flex: 1;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 0.85rem;
          outline: none;
        }
        .preset-report {
          font-size: 0.78rem;
          color: var(--secondary-text-color);
        }

        .block {
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 12px;
          padding: 16px;
        }
        .block h3 {
          margin: 0 0 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.1rem;
        }
        .intro-text {
          margin: 0 0 12px 0;
          font-size: 0.85rem;
          color: var(--secondary-text-color);
        }
        .entry-card {
          border: 1px solid var(--divider-color, #eee);
          border-radius: 8px;
          margin-bottom: 8px;
          background: var(--secondary-background-color, #f9f9f9);
          overflow: hidden;
        }
        .entry {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          gap: 8px;
        }
        .entry.sub-entry {
          background: var(--card-background-color, #fff);
          margin: 4px 0;
          border-radius: 6px;
          border: 1px solid var(--divider-color, #eee);
        }
        .entry .txt {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .entry .txt b {
          font-size: 0.95rem;
        }
        .entry .txt span {
          font-size: 0.8rem;
          color: var(--secondary-text-color);
        }
        .act {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          color: var(--secondary-text-color);
          border-radius: 50%;
        }
        .act:hover {
          background: rgba(0,0,0,0.05);
          color: var(--primary-text-color);
        }
        .act.del:hover {
          color: var(--error-color, #e74c3c);
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 6px;
          border: none;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          font-weight: 500;
          cursor: pointer;
        }
        .btn.small {
          padding: 6px 12px;
          font-size: 0.82rem;
          white-space: nowrap;
        }
        .btn.add {
          background: var(--primary-color, #03a9f4);
          margin-top: 8px;
        }
        details.sub {
          padding: 0 12px 12px 12px;
          border-top: 1px solid var(--divider-color, #eee);
        }
        details.sub summary {
          cursor: pointer;
          padding: 8px 0;
          font-weight: 500;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--secondary-text-color);
        }
        details.sub summary .count {
          background: var(--divider-color, #ccc);
          color: var(--primary-text-color);
          border-radius: 10px;
          padding: 1px 6px;
          font-size: 0.75rem;
        }
        .sub-body {
          padding-left: 12px;
        }
        
        /* Modal Dialog */
        .dialog-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .dialog-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        .dialog {
          background: var(--card-background-color, #fff);
          border-radius: 12px;
          width: 90%;
          max-width: 550px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .dialog-header {
          padding: 16px;
          border-bottom: 1px solid var(--divider-color, #eee);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dialog-header h3 { margin: 0; }
        .dialog-body {
          padding: 16px;
          overflow-y: auto;
          flex: 1;
        }
        .dialog-footer {
          padding: 12px 16px;
          border-top: 1px solid var(--divider-color, #eee);
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .btn.secondary {
          background: transparent;
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color, #ccc);
        }
      </style>

      <div class="container">
        <!-- Schlanke Preset-Leiste oben -->
        <div class="preset-bar-wrapper">
          <div class="preset-bar">
            <select id="preset" class="preset-select">
              <option value="">-- Vorlage / Schnelleinrichtung wählen --</option>
              ${Object.entries(PRESETS)
                .map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`)
                .join('')}
            </select>
            <button type="button" class="btn small" id="btn-apply-preset">
              ${icon('mdi:magic-staff')} Anwenden
            </button>
          </div>
          <div id="report" class="preset-report"></div>
        </div>

        <div id="blocks"></div>
      </div>

      <div class="dialog-overlay" id="overlay">
        <div class="dialog">
          <div class="dialog-header">
            <h3 id="dialog-title">Bearbeiten</h3>
            <button class="act" id="dialog-close">${icon('mdi:close')}</button>
          </div>
          <div class="dialog-body">
            <ha-form id="form"></ha-form>
          </div>
          <div class="dialog-footer">
            <button class="btn secondary" id="btn-cancel">Abbrechen</button>
            <button class="btn" id="btn-save">Speichern</button>
          </div>
        </div>
      </div>
    `;

    this.#els.preset = this.shadowRoot.querySelector('#preset');
    this.#els.report = this.shadowRoot.querySelector('#report');
    this.#els.btnApplyPreset = this.shadowRoot.querySelector('#btn-apply-preset');

    this.#els.blocks = this.shadowRoot.querySelector('#blocks');
    this.#els.overlay = this.shadowRoot.querySelector('#overlay');
    this.#els.dialogTitle = this.shadowRoot.querySelector('#dialog-title');
    this.#els.form = this.shadowRoot.querySelector('#form');
    this.#els.btnClose = this.shadowRoot.querySelector('#dialog-close');
    this.#els.btnCancel = this.shadowRoot.querySelector('#btn-cancel');
    this.#els.btnSave = this.shadowRoot.querySelector('#btn-save');

    this.#els.btnApplyPreset.addEventListener('click', () => this.#applyPreset());
    this.#els.btnClose.addEventListener('click', () => this.#closeDialog());
    this.#els.btnCancel.addEventListener('click', () => this.#closeDialog());
    this.#els.btnSave.addEventListener('click', () => this.#commit());
    this.#els.form.addEventListener('value-changed', (ev) => {
      this.#draft = ev.detail.value;
    });
  }

  /* ------------------------------------------------------------------ *
   * Vorlage anwenden (Preset-Logik)
   * ------------------------------------------------------------------ */

  async #applyPreset() {
    const preset = PRESETS[this.#els.preset.value];
    if (!preset) {
      this.#els.report.textContent = 'Bitte zuerst eine Vorlage auswählen.';
      return;
    }

    const states = this.#hass?.states;
    const next = normalizeConfig(this.#config);
    let filled = 0;
    const missing = [];

    const resolve = (parts) => asList(parts).map((p) => findEntity(states, p)).filter(Boolean);

    for (const [key, spec] of Object.entries(preset)) {
      if (key === 'label' || key === 'hint') continue;

      if (Array.isArray(spec)) {
        if (asList(next[key]).length) continue;
        const rows = [];
        for (const template of spec) {
          const row = { id: `${key}_${Date.now().toString(36)}` };
          for (const [field, parts] of Object.entries(template)) {
            if (field === 'name') {
              row.name = parts;
              continue;
            }
            const found = resolve(parts);
            if (found.length) {
              row[field] = found[0];
              filled += 1;
            } else missing.push(`${key}.${field}`);
          }
          if (Object.keys(row).length > 2) rows.push(row);
        }
        if (rows.length) next[key] = rows;
        continue;
      }

      const target = { ...(next[key] ?? {}) };
      for (const [field, parts] of Object.entries(spec)) {
        const current = target[field];
        if (Array.isArray(current) ? current.length : current) continue;
        const found = resolve(parts);
        if (!found.length) {
          missing.push(`${key}.${field}`);
          continue;
        }
        const multi = ['import_total', 'export_total', 'energy_total', 'forecast', 'temperatures', 'extra_entities'];
        target[field] = multi.includes(field) ? found : found[0];
        filled += 1;
      }
      next[key] = target;
    }

    this.#config = next;
    this.#render();
    await this.#persist(next);

    this.#els.report.innerHTML = filled
      ? `<strong>${filled} Felder gefüllt.</strong>` +
        (missing.length ? ` Nicht gefunden: ${esc(missing.join(', '))}.` : '') +
        (preset.hint ? `<br>${preset.hint}` : '')
      : 'Keine passenden Sensoren gefunden. Läuft die Integration?';
  }

  /* ------------------------------------------------------------------ *
   * UI Render-Schleife
   * ------------------------------------------------------------------ */

  #render() {
    if (!this.#built || !this.#config) return;

    const stringBlock = BLOCKS.find((b) => b.key === 'strings');

    this.#els.blocks.innerHTML = BLOCKS.filter((b) => !b.nestedIn).map((b) => {
      const entries = b.kind === 'list' ? asList(this.#config[b.key]) : [this.#config[b.key] ?? {}];

      const html = entries.map((e, i) => {
        const label = b.kind === 'list' ? b.label(e, i) : b.title;
        const sub = b.summary(e);

        let stringsHtml = '';
        if (b.key === 'solar' && e.id) {
          const stringsList = asList(e.strings);
          const stringRows = stringsList.map((st, stIdx) => `
            <div class="entry sub-entry">
              <div class="txt">
                <b>${esc(st.name || `String ${stIdx + 1}`)}</b>
                <span>${esc(st.entity?.entity || st.entity || 'kein Sensor')}</span>
              </div>
              <button type="button" class="act edit" data-block="strings" data-parent-id="${e.id}" data-index="${stIdx}">
                ${icon('mdi:pencil')}
              </button>
              <button type="button" class="act del" data-block="strings" data-parent-id="${e.id}" data-index="${stIdx}">
                ${icon('mdi:delete')}
              </button>
            </div>
          `).join('');

          stringsHtml = `
            <details class="sub">
              <summary>
                ${icon(stringBlock.icon)}<span>Strings / Dachflächen</span>
                <span class="count">${stringsList.length}</span>
              </summary>
              <div class="sub-body">
                ${stringRows}
                <button type="button" class="btn add" data-block="strings" data-parent-id="${e.id}" data-index="-1">
                  ${icon('mdi:plus')}${stringBlock.add}
                </button>
              </div>
            </details>
          `;
        }

        return `
          <div class="entry-card">
            <div class="entry">
              <div class="txt"><b>${esc(label)}</b><span>${esc(sub ?? 'noch nichts zugeordnet')}</span></div>
              <button type="button" class="act edit" data-block="${b.key}" data-index="${i}">${icon('mdi:pencil')}</button>
              ${b.kind === 'list' ? `<button type="button" class="act del" data-block="${b.key}" data-index="${i}">${icon('mdi:delete')}</button>` : ''}
            </div>
            ${stringsHtml}
          </div>
        `;
      }).join('');

      return `
        <div class="block">
          <h3>${icon(b.icon)}${b.title}</h3>
          <p class="intro-text">${b.intro}</p>
          ${html}
          ${b.kind === 'list' ? `<button type="button" class="btn add" data-block="${b.key}" data-index="-1">${icon('mdi:plus')}${b.add}</button>` : ''}
        </div>
      `;
    }).join('');

    for (const btn of this.#els.blocks.querySelectorAll('[data-block]')) {
      const block = BLOCKS.find((b) => b.key === btn.dataset.block);
      const index = Number(btn.dataset.index);
      const parentId = btn.dataset.parentId || null;

      if (btn.classList.contains('del')) {
        btn.addEventListener('click', () => this.#remove(block, index, parentId));
      } else {
        btn.addEventListener('click', () => this.#openDialog(block, index, parentId));
      }
    }
  }

  #openDialog(block, index, parentId = null) {
    this.#editing = { block, index, parentId };
    const isNew = index < 0;

    if (block.key === 'strings') {
      const parentSolar = asList(this.#config.solar).find((s) => s.id === parentId);
      const stringsList = asList(parentSolar?.strings);
      this.#draft = isNew ? {} : { ...stringsList[index] };
    } else {
      this.#draft = isNew ? {} : { ...(block.kind === 'list' ? asList(this.#config[block.key])[index] : this.#config[block.key]) };
    }

    this.#els.dialogTitle.textContent = parentId ? `String bearbeiten` : block.title;
    this.#els.form.schema = block.schema;
    this.#els.form.computeLabel = (s) => LABELS[block.key]?.[s.name] || s.name;
    this.#els.form.computeHelper = (s) => HELPERS[block.key]?.[s.name] || '';
    this.#els.form.data = this.#draft;
    this.#els.form.hass = this.#hass;

    this.#els.overlay.classList.add('open');
  }

  #closeDialog() {
    this.#els.overlay.classList.remove('open');
    this.#editing = null;
    this.#draft = {};
  }

  async #commit() {
    const { block, index, parentId } = this.#editing ?? {};
    if (!block) return;
    const next = normalizeConfig(this.#config);

    if (block.key === 'strings') {
      next.solar = asList(next.solar).map((solarPlant) => {
        if (solarPlant.id !== parentId) return solarPlant;

        const stringList = [...asList(solarPlant.strings)];
        const entry = { ...this.#draft };
        if (!entry.id) entry.id = `str_${Date.now().toString(36)}`;

        if (index < 0) stringList.push(entry);
        else stringList[index] = entry;

        return { ...solarPlant, strings: stringList };
      });
    } else if (block.kind === 'list') {
      const rows = [...asList(next[block.key])];
      const entry = { ...this.#draft };
      if (!entry.id) entry.id = `${block.key}_${Date.now().toString(36)}`;

      if (index < 0) rows.push(entry);
      else rows[index] = entry;
      next[block.key] = rows;
    } else {
      next[block.key] = { ...this.#draft };
    }

    this.#config = next;
    this.#closeDialog();
    this.#render();
    await this.#persist(next);
  }

  async #remove(block, index, parentId = null) {
    const next = normalizeConfig(this.#config);

    if (block.key === 'strings') {
      next.solar = asList(next.solar).map((solarPlant) => {
        if (solarPlant.id !== parentId) return solarPlant;
        const stringList = [...asList(solarPlant.strings)];
        stringList.splice(index, 1);
        return { ...solarPlant, strings: stringList };
      });
    } else if (block.kind === 'list') {
      const rows = [...asList(next[block.key])];
      rows.splice(index, 1);
      next[block.key] = rows;
    }

    this.#config = next;
    this.#render();
    await this.#persist(next);
  }

  async #persist(config) {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

/* ------------------------------------------------------------------ *
 * Editor & Registration
 * ------------------------------------------------------------------ */

class WueflFormEditor extends HTMLElement {
  setConfig() {}
}

class WueflEnergyConfigCardEditor extends WueflFormEditor {
  schema = [{ name: 'note', selector: { text: {} } }];
  labels = { note: 'Diese Karte hat keine Einstellungen.' };
}

customElements.define('we-config-card', WueflEnergyConfigCard);
customElements.define('we-config-card-editor', WueflEnergyConfigCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'we-config-card',
  name: 'wuefl Zuordnung',
  description: 'Welche Entität wofür steht — Netz, Solar, Batterie, Wallboxen, Fahrzeuge.',
});