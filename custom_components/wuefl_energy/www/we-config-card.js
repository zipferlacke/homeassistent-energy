import { saveConfig, rawConfig, colorOf } from './we-shared.js';
import { PRESETS } from './presets.js';

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
const color = () => ({ color_rgb: {} });

/**
 * Früher waren Farben Freitext ("#ff9800", "orange"). Der Farbwähler
 * erwartet [r, g, b] – alte Werte werden beim Öffnen umgerechnet.
 */
function toRgbArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return value;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#010203';
  ctx.fillStyle = value.trim();
  const hex = ctx.fillStyle;
  if (!/^#[0-9a-f]{6}$/i.test(hex) || (hex === '#010203' && value.trim() !== '#010203')) return undefined;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const COLOR_FIELDS = ['color', 'color_in', 'color_export'];

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
      { name: 'live', selector: watt() },
      { name: 'import_total', selector: kwh(true) },
      { name: 'export_total', selector: kwh(true) },
      { name: 'price_import', selector: { entity: { filter: [{ domain: 'sensor' }, { entity_id: 'number.we_price_import_energy' } ]} }},
      { name: 'price_export', selector: { entity: { filter: [{ domain: 'sensor' }, { entity_id: 'number.we_price_export_energy' } ]} }},
      { name: 'price_import_forecast', selector: money() },
      { name: 'price_export_forecast', selector: money() },
      { name: 'color', selector: color() },
      { name: 'color_export', selector: color() },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'total', selector: kwh() },
      { name: 'forecast', selector: kwh(true) },
      { name: 'temperatur', selector: temp() },
      { name: 'color', selector: color() },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'color', selector: color() },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'percent', selector: percent() },
      { name: 'in_total', selector: kwh() },
      { name: 'out_total', selector: kwh() },
      { name: 'temperatur', selector: temp() },
      { name: 'color', selector: color() },
      { name: 'color_in', selector: color() },
      {
        type: 'expandable',
        name: 'control',
        title: 'Hausakku Lade-/Entladesperre',
        schema: [
          { name: 'mode_stop_discharging', selector: { entity: { filter: [{ domain: 'scene' }, { domain: 'script' }, { domain: 'switch' }] } } },
          { name: 'mode_start_charging', selector: { entity: { filter: [{ domain: 'scene' }, { domain: 'script' }, { domain: 'switch' }] } } },
          { name: 'normal_mode', selector: { entity: { filter: [{ domain: 'scene' }, { domain: 'script' }, { domain: 'switch' }] } } },
        ],
      },
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
      { name: 'live', selector: watt() },
      { name: 'total', selector: kwh() },
      { name: 'color', selector: color() },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'total', selector: kwh() },
      { name: 'temperatur', selector: temp() },
      { name: 'color', selector: color() },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'total', selector: kwh() },
      { name: 'total_session', selector: kwh() },
      { name: 'status', selector: ({ entity: { filter: { domain: 'sensor' } } }) },
      { name: 'ready_for_charge', selector: ({ entity: { filter: { domain: ['binary_sensor','sensor'] } } }) },
      { name: 'car_percent', selector: percent() },
      { name: 'color', selector: color() },
      {
        type: 'expandable',
        name: 'more',
        title: 'Hardware & Grenzen',
        schema: [
          { name: 'phases_value', selector: number(1, 3, 1) },
          { name: 'max_power_value', selector: number(1000, 30000, 100) },
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
      { name: 'name', selector: text() },
      { name: 'live', selector: watt() },
      { name: 'total', selector: kwh() },
      { name: 'color', selector: color() },
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
      { name: 'system_cost_value', selector: number(0, 500000, 100) },
      { name: 'commissioned_value', selector: text() },
      { name: 'house_base_load', selector: watt() },
      { name: 'weather_entity', selector: ({ entity: { filter: { domain: 'weather' } } }) },
      { name: 'temperatures', selector: temp(true) },
      { name: 'extra_entities', selector: ({ entity: { multiple: true } }) },
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
    color: 'Farbe Bezug',
    color_export: 'Farbe Einspeisung',
  },
  solar: {
    name: 'Bezeichnung',
    live: 'PV-Leistung',
    total: 'PV-Ertrag gesamt',
    forecast: 'Ertragsprognose',
    temperatur: 'Wechselrichter-Temperatur',
    color: 'Farbe',
  },
  strings: {
    name: 'Bezeichnung',
    live: 'Leistungs-Sensor (Watt)',
    color: 'Farbe',
  },
  battery: {
    name: 'Bezeichnung',
    live: 'Batterieleistung',
    percent: 'Ladestand (SoC)',
    in_total: 'Geladen gesamt',
    out_total: 'Entladen gesamt',
    temperatur: 'Batterietemperatur',
    color: 'Farbe Entladen',
    color_in: 'Farbe Laden',
    mode_stop_discharging: 'Aktion: Entladen stoppen (Einfrieren)',
    mode_start_charging: 'Aktion: Zwangsladen (Aus dem Netz laden)',
    normal_mode: 'Aktion: Normalbetrieb (Standard)',
  },
  consumers: {
    live: 'Hausverbrauch (Live)',
    total: 'Hausverbrauch gesamt',
    color: 'Farbe',
  },
  heatpump: {
    name: 'Bezeichnung',
    live: 'Elektrische Leistung',
    total: 'Gesamtverbrauch',
    temperatur: 'Temperatur Sensor',
    color: 'Farbe',
  },
  wallboxes: {
    name: 'Bezeichnung',
    live: 'Aktuelle Ladeleistung',
    total: 'Gesamtenergie',
    total_session: 'Gesamtenergie des Ladevorgangs',
    status: 'Status der Wallbox',
    ready_for_charge: 'Bereit zum Laden',
    car_percent: 'Fahrzeug Akku %',
    color: 'Farbe',
    phases_value: 'Anzahl Phasen',
    max_power_value: 'Maximale Ladeleistung',
  },
  water: {
    name: 'Bezeichnung',
    live: 'Aktuelle Leistung / Durchfluss',
    total: 'Gesamtverbrauch',
    color: 'Farbe',
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
    price_import: 'Sensor für aktuellen Bezugsstrompreis, bei Festpreis "Fix Strompreis" auswählen. In den Einstellung Wert hinterlegen.',
    price_export: 'Sensor für aktuelle Einspeisevergütung, bei festpreis "Fix Einspeisevergütung" auswählen und in den Einstellung Wert hinterlegen.',
    price_import_forecast: 'Sensor/Attribut für vorhergesagte Bezugspreise.',
    price_export_forecast: 'Sensor/Attribut für vorhergesagte Einspeisepreise.',
    color: 'Farbe für den Netzbezug in Grafik und Diagrammen. Leer = Farbe aus dem Theme.',
    color_export: 'Farbe für die Einspeisung. Leer = Farbe aus dem Theme.',
  },
  solar: {
    name: 'Name der Anlage',
    live: 'Aktuelle PV-Leistung in Watt (W).',
    total: 'Gesamter ertragener Strom in kWh.',
    forecast: 'Prognose-Sensor (z. B. Solcast oder Forecast.Solar).',
    temperatur: 'Temperatursensor des Wechselrichters.',
    color: 'Farbe der PV-Anlage in Grafik und Diagrammen. Leer = Vorgabe.',
  },
  strings: {
    name: 'Name des Strings (z. B. "Dach Süd" oder "MPPT 1").',
    live: 'Live-Wert dieser einzelnen Fläche in Watt (W).',
    color: 'Farbe des Strings im Solar-Diagramm. Leer = Vorgabe.',
  },
  battery: {
    name: 'Name des Speichers.',
    live: 'Live-Leistung in Watt (W). Positiv = entladen, negativ = laden.',
    percent: 'Ladestand in Prozent (%).',
    in_total: 'Gesamte geladene Energie in kWh.',
    out_total: 'Gesamte entladene Energie in kWh.',
    temperatur: 'Temperatursensor des Akkus.',
    color: 'Farbe fürs Entladen in Grafik und Diagrammen. Leer = Farbe aus dem Theme.',
    color_in: 'Farbe fürs Laden. Leer = Farbe aus dem Theme.',
    mode_stop_discharging: 'Sperrt die Akku-Entladung (z. B. beim Auto-Schnellladen). Für Sungrow (mkaiser): "scene.self_consumption_mode_no_battery_discharge".',
    mode_start_charging: 'Erzwingt das Laden aus dem Netz (z. B. bei extrem billigem Strom). Für Sungrow (mkaiser): "scene.battery_forced_charge".',
    normal_mode: 'Versetzt den Wechselrichter wieder in den normalen Eigenverbrauchsmodus. Für Sungrow (mkaiser): "scene.self_consumption_mode_max_battery_discharge".',
  },
  consumers: {
    live: 'Live-Verbrauch in Watt (W). Leer lassen für automatische Errechnung.',
    total: 'Gesamtverbrauchszähler im Haushalt in kWh.',
    color: 'Farbe des Hausverbrauchs in Grafik und Diagrammen. Leer = Vorgabe.',
  },
  heatpump: {
    name: 'Name der Wärmepumpe.',
    live: 'Elektrische Leistungsaufnahme in Watt (W).',
    total: 'Gesamte verbrauchte Energie in kWh.',
    temperatur: 'Temperatursensor (z. B. Vorlauf oder Raum).',
    color: 'Farbe der Wärmepumpe in Grafik und Diagrammen. Leer = Vorgabe.',
  },
  wallboxes: {
    name: 'Name der Wallbox.',
    live: 'Aktuelle Ladeleistung in Watt (W).',
    total: 'Gesamter Stromverbrauch der Wallbox in kWh.',
    total_session: 'Verbrauch der aktuellen Ladesession in kWh.',
    status: 'Sensor für Text-Status (z. B. "Fahrzeug verbunden").',
    ready_for_charge: 'Schalter/Sensor, ob Wallbox bereit zum laden ist.',
    car_percent: 'Batterie-Ladestand des verbundenen Autos in %.',
    phases_value: 'Anzahl aktiv genutzter Phasen (1–3).',
    max_power_value: 'Maximal erreichbare Ladeleistung in Watt (W).',
    color: 'Farbe der Wallbox in Grafik und Diagrammen. Leer = Vorgabe.',
  },
  water: {
    name: 'Name des Systems (z. B. "Frischstation").',
    live: 'Live-Durchfluss oder Wärmeleistung.',
    total: 'Gesamter Verbrauchszähler.',
    color: 'Farbe des Wassersystems in den Diagrammen. Leer = Vorgabe.',
  },
  systemdata: {
    system_cost_value: 'Gesamte Anschaffungskosten der Anlage in Euro (€).',
    commissioned_value: 'Inbetriebnahmedatum im Format YYYY-MM-DD.',
    house_base_load: 'Leer = automatisch: Hausverbrauch (ohne Wallbox) der letzten 7 Tage ÷ Tage (sensor.we_house_base_load). Nur füllen, wenn du einen eigenen Sensor in Watt hast.',
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
  #onChanged = null;

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (this.#els.form) {
      this.#els.form.hass = hass;
    }
    if (first) this.#load();
  }

  /** Kartenoptionen enthalten keine Zuordnung – die kommt aus der Integration. */
  setConfig() {
    if (!this.#config) this.#config = normalizeConfig({});
    if (this.#built) this.#render();
  }

  async #load() {
    this.#config = normalizeConfig(await rawConfig(this.#hass));
    this.toggleAttribute('read-only', !!this.#config.settings?.read_only);
    if (this.#built) this.#render();
  }

  connectedCallback() {
    if (!this.#built) {
      this.#build();
      this.#render();
    }
    // Nur-Lesen-Modus oder Zuordnung woanders geändert → neu laden
    if (!this.#onChanged) {
      this.#onChanged = () => { if (!this.#editing) this.#load(); };
      window.addEventListener('we-config-changed', this.#onChanged);
    }
  }

  disconnectedCallback() {
    window.removeEventListener('we-config-changed', this.#onChanged);
    this.#onChanged = null;
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
        .swatch {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
          border: 1px solid var(--divider-color, #ccc);
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
        /* Nur-Lesen-Modus: Bearbeiten ausblenden */
        :host([read-only]) :is(.preset-bar-wrapper, .act, .btn.add) { display: none !important; }
        .ro-banner {
          align-items: center;
          background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent);
          border-radius: 12px;
          display: none;
          font-size: 0.85rem;
          gap: 10px;
          padding: 10px 14px;
        }
        .ro-banner ha-icon { color: var(--primary-color, #03a9f4); --mdc-icon-size: 18px; }
        :host([read-only]) .ro-banner { display: flex; }
        .btn.secondary {
          background: transparent;
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color, #ccc);
        }
      </style>

      <div class="container">
        <div class="ro-banner">${icon('mdi:lock-outline')}<span>Nur-Lese-Modus: Die Zuordnung kann nicht bearbeitet werden. Ausschalten unter Einstellungen → Zugriff.</span></div>
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
    this.#els.form.schema = []; 
    this.#els.form.data = {};
    this.#els.btnClose = this.shadowRoot.querySelector('#dialog-close');
    this.#els.btnCancel = this.shadowRoot.querySelector('#btn-cancel');
    this.#els.btnSave = this.shadowRoot.querySelector('#btn-save');

    this.#els.btnApplyPreset.addEventListener('click', () => this.#applyPreset());
    this.#els.btnClose.addEventListener('click', () => this.#closeDialog());
    this.#els.btnCancel.addEventListener('click', () => this.#closeDialog());
    this.#els.btnSave.addEventListener('click', () => this.#commit());
    this.#els.form.addEventListener('value-changed', (ev) => {
      this.#draft = ev.detail.value;
      this.#els.form.data = this.#draft;
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

    const MULTI = ['import_total', 'export_total', 'forecast', 'temperatures', 'extra_entities'];
    const isPattern = (v) => typeof v === 'string' && /^[a-z_]+\./.test(v);
    const resolve = (parts) => asList(parts).map((p) => findEntity(states, p)).filter(Boolean);

    /**
     * Füllt ein Objekt der Vorlage: Entitätsmuster werden gesucht, feste
     * Werte (Name, Phasen, max. Leistung) übernommen, Unterobjekte
     * (control, more) und Listen von Objekten (strings) rekursiv befüllt.
     * `current` sind vorhandene Werte – die werden nie überschrieben.
     */
    const replaces = preset.replaces ?? {};
    /**
     * Ist der vorhandene Wert brauchbar? Leer, eine Entität, die es in HA
     * nicht gibt, oder eine bekannte Fehlzuordnung älterer Vorlagen zählen
     * als "nicht brauchbar" und werden von der Vorlage ersetzt.
     */
    const usable = (value, fieldPath) => {
      const list = asList(value);
      if (!list.length || value === '') return false;
      if (list.some((v) => (replaces[fieldPath] ?? []).includes(v))) return false;
      return !list.every((v) => isPattern(v) && !states?.[v]);
    };

    const fill = (template, current, path) => {
      const out = { ...(current ?? {}) };
      for (const [field, spec] of Object.entries(template)) {
        const have = out[field];
        if (have && typeof have === 'object' && !Array.isArray(have) && spec && typeof spec === 'object' && !Array.isArray(spec)) {
          // Unterobjekt (control, more): Feld für Feld ergänzen
          out[field] = fill(spec, have, `${path}.${field}`);
          continue;
        }
        if (usable(have, `${path}.${field}`)) continue;

        if (Array.isArray(spec) && spec.some((x) => x && typeof x === 'object')) {
          const rows = spec
            .map((t, i) => ({ id: `${field}_${Date.now().toString(36)}_${i}`, ...fill(t, {}, `${path}.${field}`) }))
            .filter((r) => Object.keys(r).some((k) => isPattern(r[k])));
          if (rows.length) out[field] = rows;
        } else if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
          const sub = fill(spec, {}, `${path}.${field}`);
          if (Object.keys(sub).length) out[field] = sub;
        } else if (isPattern(spec) || (Array.isArray(spec) && spec.every(isPattern))) {
          const found = resolve(spec);
          if (!found.length) {
            missing.push(`${path}.${field}`);
            continue;
          }
          out[field] = MULTI.includes(field) ? found : found[0];
          filled += 1;
        } else {
          out[field] = spec;
        }
      }
      return out;
    };

    for (const [key, spec] of Object.entries(preset)) {
      if (key === 'label' || key === 'hint') continue;

      if (key === 'replaces') continue;
      if (Array.isArray(spec)) {
        // Vorhandene Einträge ergänzen (Vorlage 1 → Eintrag 1 …), fehlende anlegen
        const existing = asList(next[key]);
        const rows = spec
          .map((t, i) => (existing[i]
            ? fill(t, existing[i], key)
            : { id: `${key}_${Date.now().toString(36)}_${i}`, ...fill(t, {}, key) }))
          .filter((r) => Object.keys(r).some((k) => isPattern(r[k])));
        if (rows.length) next[key] = [...rows, ...existing.slice(spec.length)];
        continue;
      }
      next[key] = fill(spec, next[key], key);
    }

    this.#config = next;
    this.#render();
    await this.#persist(next);

    this.#els.report.innerHTML = filled
      ? `<strong>${filled} Felder gefüllt oder korrigiert.</strong> Eigene, gültige Zuordnungen bleiben unverändert.` +
        (missing.length ? ` Nicht gefunden: ${esc(missing.join(', '))}.` : '') +
        (preset.hint ? `<br>${esc(preset.hint)}` : '')
      : 'Keine passenden Sensoren gefunden. Sind die Geräte-Pakete eingebunden und HA neu gestartet?';
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
              <span class="swatch" style="background: ${colorOf('strings', st, stIdx)}"></span>
              <div class="txt">
                <b>${esc(st.name || `String ${stIdx + 1}`)}</b>
                <span>${esc(st.live?.entity || st.live || 'kein Sensor')}</span>
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
              ${b.key === 'systemdata' ? '' : `<span class="swatch" style="background: ${colorOf(b.key, e, i)}"></span>`}
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

  // Sucht alle bereits verwendeten Entitäten, klammert aber den aktuellen Dialog aus
  #getUsedEntities(skipBlock, skipIndex, skipParentId) {
    const used = new Set();
    const entityRegex = /^[a-z0-9_]+\.[a-z0-9_]+$/; // Filtert saubere HA-Entitäten (z.B. sensor.xyz)

    const findSensors = (obj) => {
      if (typeof obj === 'string' && entityRegex.test(obj)) {
        used.add(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(findSensors);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(findSensors);
      }
    };

    // Konfiguration klonen, damit wir unsere Arbeitskopie verändern können
    const configCopy = JSON.parse(JSON.stringify(this.#config || {}));

    // Den aktuell bearbeiteten Eintrag aus der Kopie löschen, 
    // damit man seine eigene Entität noch im Dropdown sieht!
    if (skipBlock) {
      if (skipBlock.key === 'strings' && skipParentId) {
        const parent = asList(configCopy.solar).find(s => s.id === skipParentId);
        if (parent && parent.strings && skipIndex >= 0) {
          parent.strings.splice(skipIndex, 1);
        }
      } else if (skipBlock.kind === 'list' && skipIndex >= 0) {
        asList(configCopy[skipBlock.key]).splice(skipIndex, 1);
      } else if (skipBlock.kind === 'single') {
        configCopy[skipBlock.key] = {};
      }
    }

    findSensors(configCopy);
    return Array.from(used);
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

    for (const f of COLOR_FIELDS) {
      if (f in this.#draft) this.#draft[f] = toRgbArray(this.#draft[f]);
    }

    this.#els.dialogTitle.textContent = parentId ? `String bearbeiten` : block.title;
    // 1. Liste aller bereits genutzten Entitäten holen
    const usedEntities = this.#getUsedEntities(block, index, parentId);

    // 2. Schema rekursiv durchlaufen und 'exclude_entities' injizieren
    const injectExcludes = (schemaArr) => {
      return schemaArr.map(field => {
        const newField = { ...field }; // Feld flach klonen
        
        // Wenn es verschachtelt ist (z.B. expandable), rekursiv aufrufen
        if (newField.schema) {
          newField.schema = injectExcludes(newField.schema);
        }
        
        // Wenn das Feld ein Entitäten-Selektor ist, Liste hinzufügen
        if (newField.selector && newField.selector.entity) {
          newField.selector = JSON.parse(JSON.stringify(newField.selector)); // Selektor tief klonen
          newField.selector.entity.exclude_entities = usedEntities;
        }
        
        return newField;
      });
    };

    // Manipuliertes Schema an das Formular übergeben
    this.#els.form.schema = injectExcludes(block.schema);
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
    if (config.settings?.read_only) return;
    // Nur über die Integration speichern. Früher ging die Zuordnung zusätzlich
    // als "config-changed" raus – im Karteneditor landete sie so als
    // Kartenoption im Dashboard und von dort wieder im Speicher.
    if (this.#hass) {
      try {
        await saveConfig(this.#hass, config);
      } catch (err) {
        console.error("Fehler beim Speichern der Konfiguration via we/save:", err);
      }
    }
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