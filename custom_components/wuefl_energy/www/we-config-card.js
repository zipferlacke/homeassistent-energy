import { saveConfig, rawConfig, colorOf, readOnlyFor } from './we-shared.js';
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
const datum = () => ({ date: {} });
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

// Pakete liegen neben diesem Modul unter packages/ – so kommen sie mit HACS
// mit und lassen sich direkt aus der Zuordnung herunterladen.
const packageUrl = (file) => new URL(`./packages/${file}`, import.meta.url).href;
const myHa = (path) => `https://my.home-assistant.io/redirect/${path}`;

/** Links als kleine Chips: Download (Paket) oder externe Seite. */
function linksHtml(links) {
  return (links ?? []).map((l) => (l.download
    ? `<a class="chip" href="${packageUrl(l.download)}" download="${esc(l.download)}">${icon('mdi:download')}${esc(l.label)}</a>`
    : `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener">${icon('mdi:open-in-new')}${esc(l.label)}</a>`)).join('');
}

/**
 * Muster aus Vorlagen in einen regulären Ausdruck übersetzen:
 * "*" = beliebige Zeichen, "#" = ein Namensteil ohne "_" (z. B. eine
 * Seriennummer), alles andere muss exakt passen – über die ganze ID.
 */
function patternRegex(pattern) {
  const body = pattern.split(/([*#])/).map((part) => {
    if (part === '*') return '.*';
    if (part === '#') return '[^._]+';
    return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`, 'i');
}

const isWildcard = (pattern) => /[*#]/.test(pattern);

function findEntity(states, pattern) {
  if (!states) return null;
  if (states[pattern]) return pattern;
  if (!isWildcard(pattern)) {
    // HA hängt bei doppelten Namen _2, _3 … an (z. B. Paket zweimal eingebunden
    // oder Entität einmal gelöscht und neu angelegt)
    const reg = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}_\\d+$`);
    return Object.keys(states).filter((id) => reg.test(id)).sort()[0] || null;
  }
  const reg = patternRegex(pattern);
  return Object.keys(states).find((id) => reg.test(id)) || null;
}

/** Passt ein vorhandener Wert zu einem Vorlagen-Muster (oder einer Liste davon)? */
function matchesPattern(value, spec) {
  const values = asList(value).map((v) => (typeof v === 'object' ? v?.entity : v)).filter(Boolean);
  return asList(spec).some((p) => typeof p === 'string'
    && values.some((v) => v === p || (isWildcard(p) && patternRegex(p).test(v))));
}

// Felder einer Vorlage, die sie beschreiben und nicht in die Zuordnung gehören
const PRESET_META = ['label', 'hint', 'replaces', 'group', 'source', 'links'];

// Reiter der Vorlagen – in dieser Reihenfolge, leere werden ausgelassen
const PRESET_GROUPS = [
  { id: 'Wechselrichter', icon: 'mdi:solar-power-variant' },
  { id: 'Batterie', icon: 'mdi:home-battery-outline' },
  { id: 'Ladesäule', icon: 'mdi:ev-station' },
  { id: 'Allgemein', icon: 'mdi:home-lightning-bolt-outline' },
].filter((g) => Object.values(PRESETS).some((p) => (p.group ?? 'Allgemein') === g.id));

/** Vorlagen eines Reiters fürs Auswahlmenü, mit Quelle der Sensoren. */
function presetOptions(group) {
  return Object.entries(PRESETS)
    .filter(([, p]) => (p.group ?? 'Allgemein') === group)
    .map(([key, p]) => `<option value="${key}">${esc(p.source ? `${p.label} · ${p.source}` : p.label)}</option>`)
    .join('');
}

function normalizeConfig(cfg) {
  const c = { ...(cfg || {}) };
  // Reste älterer Vorlagen-Versionen, die ihre Beschreibung mitgespeichert haben
  for (const key of ['group', 'source', 'links']) delete c[key];
  c.solar = asList(c.solar);
  c.battery = asList(c.battery);
  c.heatpump = asList(c.heatpump);
  c.wallboxes = asList(c.wallboxes);
  c.water = asList(c.water);
  c.grid = c.grid || {};
  c.consumers = c.consumers || {};
  c.systemdata = c.systemdata || {};
  // Jeder Listeneintrag braucht eine id – die Integration ordnet darüber
  // z. B. Lademodus und Soll-Leistung der richtigen Wallbox zu
  for (const key of ['solar', 'battery', 'heatpump', 'wallboxes', 'water']) {
    const used = new Set(c[key].map((e) => e?.id).filter(Boolean));
    c[key] = c[key].map((e, i) => {
      if (!e || typeof e !== 'object' || e.id) return e;
      let id = `${key}_${i}`;
      for (let n = 2; used.has(id); n += 1) id = `${key}_${i}_${n}`;
      used.add(id);
      return { id, ...e };
    });
  }
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
    note: 'Fester Preis? Dann einfach die Zahl beim Helfer der Integration eintragen. Für einen dynamischen Tarif liefert der Anbieter einen Sensor mit den Stundenpreisen – der gehört in „Preisprognose Bezug“ und erscheint dann als Diagramm in der Live-Ansicht und beim Preisladen der Wallbox.',
    links: [
      { label: 'Tibber (eingebaut)', url: myHa('config_flow_start/?domain=tibber') },
      { label: 'Nord Pool (eingebaut)', url: myHa('config_flow_start/?domain=nordpool') },
      { label: 'EPEX Spot in HACS', url: myHa('hacs_repository/?owner=mampfes&repository=ha_epex_spot&category=integration') },
      { label: 'aWATTar/Tibber-Preise in HACS', url: myHa('hacs_repository/?owner=custom-components&repository=awattar&category=integration') },
    ],
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
    note: 'PV-Prognose (für Prognose-Kurve, „genug Strom ab …“ und die Wallbox-Vorschau): Solcast (genauer, HACS) oder das eingebaute Forecast.Solar einrichten und unter Energie als Prognose der Solarproduktion eintragen – dann wird sie automatisch gefunden.',
    links: [
      { label: 'Solcast in HACS', url: myHa('hacs_repository/?owner=BJReplay&repository=ha-solcast-solar&category=integration') },
      { label: 'Forecast.Solar einrichten', url: myHa('config_flow_start/?domain=forecast_solar') },
      { label: 'Energie-Einstellungen', url: myHa('config_energy/') },
    ],
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
          { name: 'min_current_value', selector: number(1, 16, 1) },
        ],
      },
      {
        type: 'expandable',
        name: 'control',
        title: 'Steuerung durch die Automation',
        schema: [
          { name: 'current_set', selector: { entity: { filter: [{ domain: 'number' }, { domain: 'input_number' }] } } },
          { name: 'charge_stop', selector: { entity: { filter: [{ domain: 'select' }, { domain: 'input_select' }, { domain: 'switch' }, { domain: 'input_boolean' }] } } },
          { name: 'stop_option', selector: text() },
          { name: 'start_option', selector: text() },
          { name: 'phase_switch', selector: { entity: { filter: [{ domain: 'select' }, { domain: 'input_select' }] } } },
          { name: 'phase1_option', selector: text() },
          { name: 'phase3_option', selector: text() },
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
      { name: 'surplus_threshold_value', selector: number(50, 20000, 50) },
      { name: 'import_protect_from', selector: datum() },
      { name: 'import_protect_to', selector: datum() },
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
    min_current_value: 'Minimaler Ladestrom (A)',
    current_set: 'Ladestrom-Vorgabe (A)',
    charge_stop: 'Laden pausieren',
    stop_option: 'Option „Pause“',
    start_option: 'Option „Laden erlaubt“',
    phase_switch: 'Phasenumschaltung',
    phase1_option: 'Option „1-phasig“',
    phase3_option: 'Option „3-phasig“',
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
    surplus_threshold_value: 'Größerer Verbraucher ab (W über Grundlast)',
    import_protect_from: 'Import-Schutz ab',
    import_protect_to: 'Import-Schutz bis',
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
    phases_value: 'Anzahl Phasen beim Laden mit voller Leistung (1–3).',
    max_power_value: 'Maximal erreichbare Ladeleistung in Watt (W).',
    min_current_value: 'Kleinster Strom je Phase, mit dem das Auto lädt – meist 6 A. Mit Phasenumschaltung beginnt Solarladen so schon ab 1-phasig 6 A (≈ 1,4 kW) statt 3-phasig (≈ 4,1 kW).',
    current_set: 'Zahl-Entität, in die die Automation den Ladestrom in Ampere schreibt (z. B. go-e "Angeforderter Strom", Mennekes "HEMS Stromvorgabe"). Leer = die Wallbox liest nur die Soll-Leistung der Helfer.',
    charge_stop: 'Optional. Schalter oder Auswahl zum Pausieren, falls der Ladestrom nicht auf 0 A gehen kann (go-e: "Manueller Lademodus"). Leer = Pause über 0 A.',
    stop_option: 'Bei einer Auswahl: Option, die das Laden pausiert (go-e: 1). Bei Schaltern leer lassen – aus = Pause.',
    start_option: 'Bei einer Auswahl: Option, die das Laden wieder erlaubt (go-e: 0).',
    phase_switch: 'Optional. Auswahl für 1-/3-phasiges Laden (go-e: "Phasen Wechselmodus"). Die Automation lädt dann bei wenig Sonne 1-phasig.',
    phase1_option: 'Option für 1-phasiges Laden (go-e: 1).',
    phase3_option: 'Option für 3-phasiges Laden (go-e: 2).',
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
    surplus_threshold_value: 'Ab wie viel freier Leistung über der Grundlast die Live-Ansicht „genug Strom für größere Verbraucher“ meldet – 1000 für die Waschmaschine, 5000 fürs Auto. Leer = 2000 W.',
    import_protect_from: 'Ab diesem Tag rührt kein CSV-Import die Werte mehr an. Gedacht für den Tag, ab dem Home Assistant selbst aufzeichnet – so kann ein Import keine echten Messwerte überschreiben. Leer = kein Schutz.',
    import_protect_to: 'Bis einschließlich diesem Tag rührt kein CSV-Import die Werte an. Gedacht, um einen sorgfältig aufgebauten Altbestand einzufrieren. Leer = kein Schutz.',
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
  #doneTimer = null;

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
    this.toggleAttribute('read-only', readOnlyFor(this.#config, this.#hass?.user));
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

        /* Werkzeugleiste oben: Vorlage, Farben, Nur lesen.
           Jede Zeile: links Inhalt, rechts eine gleich breite Knopfspalte;
           alle Bedienelemente gleich hoch. */
        .tools {
          background: var(--secondary-background-color, #f5f5f5);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
        }
        .tool-row {
          align-items: center;
          display: grid;
          gap: 8px 10px;
          grid-template-columns: minmax(0, 1fr) 12rem;
        }
        .tool-row + .tool-row, .tool-row.sep {
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 10px;
        }
        .tool-row[hidden], .tools [hidden] { display: none !important; }
        .ctl {
          box-sizing: border-box;
          font: inherit;
          font-size: 0.9rem;
          height: 40px;
          margin: 0;
          width: 100%;
        }
        .preset-select {
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 8px;
          color: var(--primary-text-color);
          min-width: 0;
          outline: none;
          padding: 0 10px;
        }
        .preset-select:focus { border-color: var(--primary-color, #03a9f4); }
        .tools .btn.ctl { border-radius: 8px; justify-content: center; padding: 0 12px; white-space: nowrap; }
        .tools .btn.ctl ha-icon { --mdc-icon-size: 18px; }
        .tools .btn:disabled { cursor: default; opacity: .45; }
        .tool-info {
          align-items: center;
          color: var(--secondary-text-color);
          display: flex;
          font-size: 0.85rem;
          gap: 8px;
          line-height: 1.35;
          min-width: 0;
        }
        .tool-info ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
        .tool-info b { color: var(--primary-text-color); font-weight: 500; }
        .preset-report {
          color: var(--secondary-text-color);
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .preset-report:empty { display: none; }
        .tools-head { display: flex; flex-direction: column; gap: 2px; }
        .tools-head h3 { align-items: center; display: flex; font-size: 1.05rem; font-weight: 600; gap: 8px; margin: 0; }
        .tools-head h3 ha-icon { --mdc-icon-size: 20px; color: var(--primary-color, #03a9f4); }
        .tools-head span { color: var(--secondary-text-color); font-size: 0.82rem; line-height: 1.4; }
        .preset-tabs {
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 10px;
          display: grid;
          gap: 2px;
          grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
          padding: 3px;
        }
        .preset-tab {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 8px;
          color: var(--secondary-text-color);
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-size: 0.85rem;
          font-weight: 500;
          gap: 6px;
          height: 34px;
          justify-content: center;
          padding: 0 10px;
        }
        .preset-tab ha-icon { --mdc-icon-size: 18px; }
        .preset-tab:hover { color: var(--primary-text-color); }
        .preset-tab[aria-selected="true"] {
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        .preset-info { color: var(--secondary-text-color); display: flex; flex-direction: column; font-size: 0.82rem; gap: 6px; line-height: 1.4; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          align-items: center;
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 999px;
          color: var(--primary-color, #03a9f4);
          display: inline-flex;
          font-size: 0.8rem;
          font-weight: 500;
          gap: 4px;
          padding: 4px 10px;
          text-decoration: none;
        }
        .chip:hover { border-color: var(--primary-color, #03a9f4); }
        .chip ha-icon { --mdc-icon-size: 16px; }
        .block-note { color: var(--secondary-text-color); display: flex; flex-direction: column; font-size: 0.8rem; gap: 6px; line-height: 1.4; margin: -4px 0 12px; }
        a.btn { box-sizing: border-box; text-decoration: none; }
        .colors-confirm {
          align-items: center;
          background: color-mix(in srgb, var(--warning-color, #ffa600) 12%, transparent);
          border-radius: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 10px;
        }
        .colors-confirm .txt { flex: 1; font-size: 0.85rem; min-width: 12rem; }
        .colors-confirm .btn { height: 34px; }
        .btn.danger { background: var(--error-color, #db4437); }
        .colors-done {
          align-items: center;
          color: var(--success-color, #43a047);
          display: flex;
          font-size: 0.82rem;
          gap: 6px;
        }
        .colors-done ha-icon { --mdc-icon-size: 18px; }
        .ro-cell { display: flex; justify-content: flex-end; }
        .ro-users-box { display: grid; gap: 8px; }
        .user-chips { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 28px; }
        .user-chips .hint { color: var(--secondary-text-color, #666); font-size: 0.82rem; }
        .user-chip {
          align-items: center; background: transparent; border: 1px solid var(--divider-color, #ccc);
          border-radius: 999px; color: var(--primary-text-color); cursor: pointer; display: inline-flex;
          font: inherit; font-size: 0.85rem; gap: 4px; padding: 4px 12px 4px 8px;
        }
        .user-chip ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color, #666); }
        .user-chip[aria-pressed="true"] {
          background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent);
          border-color: var(--primary-color, #03a9f4);
        }
        .user-chip[aria-pressed="true"] ha-icon { color: var(--primary-color, #03a9f4); }
        .switch {
          background: var(--divider-color, #ccc); border: 0; border-radius: 999px; cursor: pointer;
          flex: 0 0 auto; height: 26px; padding: 3px; width: 46px;
        }
        .switch span { background: #fff; border-radius: 50%; display: block; height: 20px;
          transition: transform .2s ease; width: 20px; }
        .switch:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        .switch[aria-checked="true"] { background: var(--primary-color, #03a9f4); }
        .switch[aria-checked="true"] span { transform: translateX(20px); }
        @media (max-width: 560px) {
          .tool-row { grid-template-columns: minmax(0, 1fr); }
          .tool-row.ro { grid-template-columns: minmax(0, 1fr) auto; }
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
        :host([read-only]) :is(.edit-only, .act, .btn.add) { display: none !important; }
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
        <div class="ro-banner">${icon('mdi:lock-outline')}<span>Nur-Lese-Modus: Die Zuordnung kann nicht bearbeitet werden.</span></div>

        <div class="tools">
          <div class="tools-head edit-only">
            <h3>${icon('mdi:auto-fix')}Automatische Zuordnung</h3>
            <span>Art und Gerät wählen, „Anwenden“ – die passenden Sensoren werden eingetragen. Vorhandene, gültige Einträge bleiben.</span>
          </div>
          <div class="preset-tabs edit-only" role="tablist" aria-label="Art der Vorlage">
            ${PRESET_GROUPS.map((g, i) => `<button type="button" class="preset-tab" role="tab" data-group="${esc(g.id)}"
              aria-selected="${i === 0}">${icon(g.icon)}<span>${esc(g.id)}</span></button>`).join('')}
          </div>
          <div class="tool-row edit-only">
            <select id="preset" class="preset-select ctl" aria-label="Vorlage"></select>
            <button type="button" class="btn ctl" id="btn-apply-preset">
              ${icon('mdi:magic-staff')} Anwenden
            </button>
          </div>
          <div id="preset-info" class="preset-info edit-only" hidden></div>
          <div id="report" class="preset-report edit-only"></div>

          <div class="tool-row edit-only">
            <span class="tool-info">${icon('mdi:palette-outline')}<span id="colors-count"></span></span>
            <button type="button" class="btn secondary ctl" id="btn-reset-colors">
              ${icon('mdi:restore')} Standardfarben
            </button>
          </div>
          <div class="colors-confirm edit-only" id="colors-confirm" hidden>
            <span class="txt" id="colors-confirm-txt"></span>
            <button type="button" class="btn small secondary" id="btn-colors-cancel">Abbrechen</button>
            <button type="button" class="btn small danger" id="btn-colors-ok">${icon('mdi:restore')} Zurücksetzen</button>
          </div>
          <div class="colors-done edit-only" id="colors-done" hidden>${icon('mdi:check-circle-outline')}<span></span></div>

          <div class="tool-row ro sep" id="ro-row">
            <span class="tool-info">${icon('mdi:lock-outline')}<span><b>Nur lesen für alle</b> – sperrt Regler, Schalter und die Zuordnung. Pausiert auch die Automation – solange es an ist, wird nichts geschrieben.</span></span>
            <span class="ro-cell"><button class="switch" id="ro-switch" role="switch" aria-checked="false" aria-label="Nur lesen für alle" type="button"><span></span></button></span>
          </div>
          <div class="ro-users-box" id="ro-users-row">
            <span class="tool-info">${icon('mdi:account-eye-outline')}<span><b>Nur ansehen</b> – diese Personen sehen das Dashboard, können aber nichts bedienen oder ändern. Die Automation regelt weiter.</span></span>
            <div class="user-chips" id="ro-users" role="group" aria-label="Nur ansehen"></div>
          </div>
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
    this.#els.presetInfo = this.shadowRoot.querySelector('#preset-info');
    this.#els.preset.addEventListener('change', () => this.#showPresetInfo());
    for (const tab of this.shadowRoot.querySelectorAll('.preset-tab')) {
      tab.addEventListener('click', () => this.#selectPresetGroup(tab.dataset.group));
    }
    this.#selectPresetGroup(PRESET_GROUPS[0]?.id);

    const $ = (id) => this.shadowRoot.querySelector(id);
    this.#els.colorsCount = $('#colors-count');
    this.#els.btnResetColors = $('#btn-reset-colors');
    this.#els.colorsConfirm = $('#colors-confirm');
    this.#els.colorsConfirmTxt = $('#colors-confirm-txt');
    this.#els.colorsDone = $('#colors-done');
    this.#els.btnResetColors.addEventListener('click', () => this.#askResetColors());
    $('#btn-colors-cancel').addEventListener('click', () => { this.#els.colorsConfirm.hidden = true; });
    $('#btn-colors-ok').addEventListener('click', () => this.#resetColors());
    this.#els.tools = $('.tools');
    this.#els.roRow = $('#ro-row');
    this.#els.roSwitch = $('#ro-switch');
    this.#els.roSwitch.addEventListener('click', () => this.#setReadOnly(!this.#config?.settings?.read_only));
    this.#els.roUsersRow = $('#ro-users-row');
    this.#els.roUsers = $('#ro-users');
    this.#els.roUsers.addEventListener('click', (e) => {
      const chip = e.target.closest('.user-chip');
      if (chip) this.#toggleViewer(chip.dataset.user);
    });
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

  /** Reiter wechseln: Menü nur mit den Vorlagen dieser Art. */
  #selectPresetGroup(group) {
    for (const tab of this.shadowRoot.querySelectorAll('.preset-tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.group === group));
    }
    const noun = { Wechselrichter: 'Wechselrichter', Batterie: 'Batterie', 'Ladesäule': 'Ladesäule' }[group];
    this.#els.preset.innerHTML =
      `<option value="">${noun ? `${noun} wählen …` : 'Vorlage wählen …'}</option>${presetOptions(group)}`;
    this.#els.report.textContent = '';
    this.#showPresetInfo();
  }

  /** Was die gewählte Vorlage braucht: Hinweis, Download, Links. */
  #showPresetInfo() {
    const p = PRESETS[this.#els.preset.value];
    const box = this.#els.presetInfo;
    box.hidden = !p;
    if (!p) return;
    this.#els.report.textContent = '';
    box.innerHTML = `${p.hint ? `<span>${esc(p.hint)}</span>` : ''}${p.links?.length ? `<div class="chips">${linksHtml(p.links)}</div>` : ''}`;
  }

  async #applyPreset() {
    const preset = PRESETS[this.#els.preset.value];
    if (!preset) {
      this.#els.report.textContent = 'Bitte zuerst eine Vorlage auswählen.';
      return;
    }

    const states = this.#hass?.states;
    const next = normalizeConfig(this.#config);
    let filled = 0;
    // Schon gültig belegte Sensor-Felder – bleiben, zählen aber als "passt"
    let kept = 0;
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
        if (usable(have, `${path}.${field}`)) {
          if (isPattern(spec) || (Array.isArray(spec) && spec.length && spec.every(isPattern))) kept += 1;
          continue;
        }

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
      // Beschreibung der Vorlage, keine Zuordnung
      if (PRESET_META.includes(key)) continue;
      if (Array.isArray(spec)) {
        // Vorhandene Einträge ergänzen (Vorlage 1 → Eintrag 1 …), fehlende anlegen
        // Je Vorlagen-Eintrag den passenden vorhandenen Eintrag suchen:
        // erst einen vom selben Gerät (ein Feld passt schon zum Muster),
        // dann einen noch leeren – sonst neu anlegen. So landet z. B. eine
        // go-e-Vorlage nicht in einer schon eingerichteten Mennekes.
        const rows = asList(next[key]).map((r) => ({ ...r }));
        const taken = new Set();
        const hasEntity = (r) => Object.entries(r).some(([k, v]) => k !== 'id' && usable(v, `${key}.${k}`) && asList(v).some(isPattern));
        spec.forEach((t, i) => {
          const same = rows.findIndex((r, j) => !taken.has(j)
            && Object.entries(t).some(([f, p]) => isPattern(asList(p)[0]) && matchesPattern(r[f], p)));
          const idx = same >= 0 ? same : rows.findIndex((r, j) => !taken.has(j) && !hasEntity(r));
          if (idx >= 0) {
            taken.add(idx);
            rows[idx] = fill(t, rows[idx], key);
          } else {
            const row = { id: `${key}_${Date.now().toString(36)}_${i}`, ...fill(t, {}, key) };
            if (Object.keys(row).some((k) => isPattern(row[k]))) {
              taken.add(rows.length);
              rows.push(row);
            }
          }
        });
        next[key] = rows;
        continue;
      }
      next[key] = fill(spec, next[key], key);
    }

    this.#config = next;
    this.#render();
    await this.#persist(next);

    const notFound = missing.length ? ` Nicht gefunden: ${esc(missing.join(', '))}.` : '';
    const felder = (n) => `${n} ${n === 1 ? 'Feld' : 'Felder'}`;
    if (filled) {
      this.#els.report.innerHTML = `<strong>${felder(filled)} gefüllt oder korrigiert.</strong>` +
        (kept ? ` ${felder(kept)} waren schon zugeordnet und bleiben unverändert.` : ' Eigene, gültige Zuordnungen bleiben unverändert.') +
        notFound;
    } else if (kept) {
      this.#els.report.innerHTML = `<strong>Schon eingerichtet</strong> – alle ${felder(kept)} sind bereits zugeordnet, nichts geändert.` + notFound;
    } else {
      this.#els.report.innerHTML = 'Keine passenden Sensoren gefunden. Sind die Geräte-Pakete eingebunden und HA neu gestartet?';
    }
  }

  /* ------------------------------------------------------------------ *
   * UI Render-Schleife
   * ------------------------------------------------------------------ */

  #render() {
    if (!this.#built || !this.#config) return;

    // Nur lesen: nur Admins dürfen umschalten (landet in der Zuordnung)
    const admin = !!this.#hass?.user?.is_admin;
    const ro = !!this.#config.settings?.read_only;
    this.#els.roSwitch.setAttribute('aria-checked', String(ro));
    this.#els.roRow.hidden = !admin;
    this.#els.roRow.classList.toggle('sep', !ro);
    this.#els.roUsersRow.hidden = !admin;
    if (admin) this.#renderViewers();
    this.#els.tools.hidden = ro && !admin;

    const colors = countColors(this.#config);
    this.#els.colorsCount.textContent = colors
      ? `${colors} eigene ${colors === 1 ? 'Farbe' : 'Farben'} gesetzt`
      : 'Alle Objekte nutzen die Standardfarben';
    this.#els.btnResetColors.disabled = !colors;
    if (!colors) this.#els.colorsConfirm.hidden = true;

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
          ${b.note || b.links ? `<div class="block-note">${b.note ? `<span>${esc(b.note)}</span>` : ''}<div class="chips">${linksHtml(b.links)}</div></div>` : ''}
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
    // Ohne eigene Farbe zeigt der Farbwähler Schwarz – deshalb die Farbe
    // vorbelegen, die der Punkt in der Liste auch zeigt. Bleibt sie
    // unverändert, wird sie beim Speichern wieder entfernt (keine "eigene").
    const listLen = block.key === 'strings'
      ? asList(asList(this.#config.solar).find((s) => s.id === parentId)?.strings).length
      : asList(this.#config[block.key]).length;
    const pos = block.kind === 'list' || block.key === 'strings' ? (isNew ? listLen : index) : 0;
    this.#colorDefaults = {};
    for (const f of COLOR_FIELDS) {
      if (!block.schema.some((s) => s.name === f) || this.#draft[f]) continue;
      const rgb = toRgbArray(this.#resolveCss(colorOf(block.key, {}, pos, f)));
      if (!rgb) continue;
      this.#draft[f] = rgb;
      this.#colorDefaults[f] = rgb;
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

  /** Vorgabefarben der gerade offenen Bearbeitung (siehe #openDialog). */
  #colorDefaults = {};

  /** var(--x, #fallback) mit dem aktuellen Theme auflösen. */
  #resolveCss(value) {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(String(value ?? '').trim());
    if (!m) return value;
    return getComputedStyle(this).getPropertyValue(m[1]).trim() || this.#resolveCss(m[2] ?? '');
  }

  #closeDialog() {
    this.#els.overlay.classList.remove('open');
    this.#editing = null;
    this.#draft = {};
  }

  async #commit() {
    const { block, index, parentId } = this.#editing ?? {};
    if (!block) return;
    for (const [f, rgb] of Object.entries(this.#colorDefaults)) {
      if (String(this.#draft[f]) === String(rgb)) delete this.#draft[f];
    }
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

  /* ------------------------------------------------------------------ *
   * Standardfarben wiederherstellen
   * ------------------------------------------------------------------ */

  #askResetColors() {
    const n = countColors(this.#config);
    if (!n) return;
    this.#els.colorsDone.hidden = true;
    this.#els.colorsConfirmTxt.textContent =
      `${n} eigene ${n === 1 ? 'Farbe' : 'Farben'} entfernen? Grafik, Diagramme und Kacheln nutzen danach wieder die Standardfarben.`;
    this.#els.colorsConfirm.hidden = false;
  }

  async #resetColors() {
    this.#els.colorsConfirm.hidden = true;
    const n = countColors(this.#config);
    if (!n || this.#config.settings?.read_only) return;
    const next = stripColors(this.#config);
    this.#config = next;
    this.#render();
    const done = this.#els.colorsDone;
    try {
      await saveConfig(this.#hass, next);
      done.style.color = '';
      done.querySelector('span').textContent =
        `Standardfarben wiederhergestellt – ${n} eigene ${n === 1 ? 'Farbe' : 'Farben'} entfernt.`;
    } catch (err) {
      done.style.color = 'var(--error-color, #db4437)';
      done.querySelector('span').textContent = `Speichern fehlgeschlagen: ${err?.message ?? err}`;
    }
    done.hidden = false;
    clearTimeout(this.#doneTimer);
    this.#doneTimer = setTimeout(() => { done.hidden = true; }, 6000);
  }

  /** Nur-Lesen-Modus umschalten – direkt speichern, auch wenn er gerade an ist. */
  async #setReadOnly(on) {
    if (!this.#hass?.user?.is_admin) return;
    const next = { ...this.#config, settings: { ...(this.#config.settings ?? {}), read_only: on } };
    this.#config = next;
    this.toggleAttribute('read-only', readOnlyFor(next, this.#hass.user));
    this.#render();
    try {
      await saveConfig(this.#hass, next);
    } catch (err) {
      console.error('Nur-Lesen-Modus konnte nicht gespeichert werden:', err);
      this.#load();
    }
  }

  /** HA-Benutzer für "Nur ansehen" (die Liste dürfen nur Admins abrufen). */
  #users = null;
  async #loadUsers() {
    if (this.#users || !this.#hass?.user?.is_admin) return;
    this.#users = [];
    try {
      const all = await this.#hass.callWS({ type: 'config/auth/list' });
      this.#users = (all ?? [])
        .filter((u) => !u.system_generated && u.is_active && u.id !== this.#hass.user.id)
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'de'));
    } catch (err) {
      console.error('Benutzer konnten nicht geladen werden:', err);
    }
    this.#renderViewers();
  }

  #renderViewers() {
    const box = this.#els.roUsers;
    if (!box) return;
    if (!this.#users) { this.#loadUsers(); return; }
    const chosen = new Set(this.#config?.settings?.read_only_users ?? []);
    box.innerHTML = this.#users.length
      ? this.#users.map((u) => {
        const on = chosen.has(u.id);
        return `<button type="button" class="user-chip" data-user="${esc(u.id)}" aria-pressed="${on}">
          ${icon(on ? 'mdi:eye-outline' : 'mdi:account-outline')}${esc(u.name || u.username || 'Unbenannt')}</button>`;
      }).join('')
      : '<span class="hint">Keine weiteren Personen in Home Assistant angelegt (Einstellungen → Personen).</span>';
  }

  /** Person auf "nur ansehen" setzen oder wieder freigeben – sofort speichern. */
  async #toggleViewer(id) {
    if (!this.#hass?.user?.is_admin || !id) return;
    const list = new Set(this.#config.settings?.read_only_users ?? []);
    if (list.has(id)) list.delete(id); else list.add(id);
    const next = { ...this.#config, settings: { ...(this.#config.settings ?? {}), read_only_users: [...list] } };
    this.#config = next;
    this.#renderViewers();
    try {
      await saveConfig(this.#hass, next);
    } catch (err) {
      console.error('Nur ansehen konnte nicht gespeichert werden:', err);
      this.#load();
    }
  }

  async #persist(config) {
    if (readOnlyFor(config, this.#hass?.user)) return;
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

const COLOR_KEYS = ['color', 'color_in', 'color_export'];

/** Anzahl der eigenen Farben (color, color_in, color_export) in der Zuordnung. */
function countColors(v) {
  if (Array.isArray(v)) return v.reduce((n, x) => n + countColors(x), 0);
  if (!v || typeof v !== 'object') return 0;
  return Object.entries(v).reduce(
    (n, [k, x]) => n + (COLOR_KEYS.includes(k) && x != null && x !== '' ? 1 : countColors(x)), 0);
}

/** Zuordnung ohne eigene Farben. */
function stripColors(v) {
  if (Array.isArray(v)) return v.map(stripColors);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v).filter(([k]) => !COLOR_KEYS.includes(k)).map(([k, x]) => [k, stripColors(x)]));
}

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