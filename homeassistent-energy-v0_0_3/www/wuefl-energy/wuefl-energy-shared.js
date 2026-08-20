/**
 * wuefl-energy-shared.js
 * Gemeinsame Basis für alle wuefl-Energy-Karten.
 *
 * Keine externen Abhängigkeiten: Farben, Abstände und Schriftgrößen kommen
 * aus dem aktiven Home-Assistant-Theme, mit eigenen Werten als Rückfallebene.
 * Icons sind Material Design Icons über <ha-icon>, das HA ohnehin mitbringt.
 */

/* ------------------------------------------------------------------ *
 * Gestaltungsvariablen
 *
 * Alles, was die Karten an Farbe und Maß brauchen, steht hier an einer
 * Stelle. Wer eigene Werte setzen will, überschreibt die --w-* oder gleich
 * die HA-Variable im Theme — beides wirkt sofort.
 * ------------------------------------------------------------------ */

export const TOKENS_CSS = `
:host {
  /* Flächen und Text */
  --w-bg:          var(--ha-card-background, var(--card-background-color, #fff));
  --w-bg-soft:     var(--secondary-background-color, rgba(127, 127, 127, .12));
  --w-bg-hover:    rgba(127, 127, 127, .22);
  --w-text:        var(--primary-text-color, #212121);
  --w-text-soft:   var(--secondary-text-color, #727272);
  --w-line:        var(--divider-color, rgba(127, 127, 127, .3));

  /* Bedienelemente */
  --w-accent:      var(--primary-color, #03a9f4);
  --w-on-accent:   var(--text-primary-color, #fff);
  --w-danger:      var(--error-color, #db4437);

  /* Maße */
  --w-radius:      var(--ha-card-border-radius, 12px);
  --w-pad:         14px;
  --w-input-h:     36px;
  --w-shadow:      var(--ha-card-box-shadow, 0 6px 18px rgba(0, 0, 0, .18));

  /* Schrift */
  --w-fs-sm:       .82rem;
  --w-fs-md:       1rem;
  --w-fs-lg:       1.2rem;

  /* Energiefarben. HA setzt diese im Energie-Dashboard, damit passen die
     Karten ohne Zutun zum eingebauten Dashboard. */
  --w-solar:       var(--energy-solar-color, #ff9800);
  --w-grid-in:     var(--energy-grid-consumption-color, #488fc2);
  --w-grid-out:    var(--energy-grid-return-color, #8353d1);
  --w-batt-out:    var(--energy-battery-out-color, #4db0a2);
  --w-batt-in:     var(--energy-battery-in-color, #f6c34c);

  /* Dafür hat HA nichts Eigenes — hier gelten unsere Werte. */
  --w-house:       var(--wuefl-house-color, #488fc2);
  --w-wallbox:     var(--wuefl-wallbox-color, #7f77dd);
  --w-heatpump:    var(--wuefl-heatpump-color, #d85a30);
  --w-price:       var(--wuefl-price-color, #fbaa00);
}
`;

/**
 * Grundgerüst, das alle drei Karten teilen: Kartenrahmen, Knöpfe, Kacheln,
 * Dialoge, Diagrammflächen. Vorher stand das dreimal fast gleich in den
 * Kartendateien.
 */
export const BASE_CSS = `
:host { display: block; }

.card {
  background: var(--w-bg);
  border-radius: var(--w-radius);
  box-sizing: border-box;
  color: var(--w-text);
  padding: var(--w-pad);

  & h2 { font-size: var(--w-fs-lg); margin: 0; }
  & h3 { font-size: var(--w-fs-md); margin: 0; }
}

/* Alle klickbaren Flächen sehen gleich aus. */
.btn {
  align-items: center;
  background: var(--w-bg-soft);
  border: 0;
  border-radius: var(--w-radius);
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: .4rem;
  height: var(--w-input-h);
  justify-content: center;
  padding: 0 .95rem;

  &:hover { background: var(--w-bg-hover); }
  &:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 2px; }
  &[aria-pressed="true"], &.is-on {
    background: var(--w-accent);
    color: var(--w-on-accent);
    font-weight: 600;
  }
}

/* Kennzahlenkachel: Beschriftung klein oben, Wert groß darunter. */
.tile {
  background: var(--w-bg-soft);
  border: 0;
  border-radius: var(--w-radius);
  color: inherit;
  font: inherit;
  padding: .55rem .7rem;
  text-align: left;

  & .k { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); }
  & .v { font-size: var(--w-fs-lg); font-variant-numeric: tabular-nums; font-weight: 700; }
}
button.tile { cursor: pointer; &:hover { background: var(--w-bg-hover); } }

.state {
  color: var(--w-text-soft);
  display: grid;
  padding: 2rem 0;
  place-items: center;
  text-align: center;
}

ha-icon { --mdc-icon-size: 20px; }

dialog {
  background: var(--w-bg);
  border: 0;
  border-radius: var(--w-radius);
  color: var(--w-text);
  padding: 1rem 1.15rem 1.25rem;

  &::backdrop { background: rgb(0 0 0 / .45); }
  & header { align-items: center; display: flex; justify-content: space-between; margin-bottom: .5rem; }
  & .close {
    background: var(--w-danger); border: 0; border-radius: var(--w-radius);
    color: #fff; cursor: pointer; display: grid; height: 2rem; place-items: center; width: 2rem;
  }
  & .actions { display: flex; gap: .5rem; justify-content: flex-end; margin-top: .9rem; }
}

/* Diagrammflächen – Achsen und Gitter sehen überall gleich aus. */
.plotbox {
  position: relative;

  & svg { display: block; height: auto; width: 100%; }
  & .axis { fill: var(--w-text-soft); font-size: 15px; font-variant-numeric: tabular-nums; }
  & .grid-line { stroke: var(--w-line); stroke-width: 1; }
  & .zero { stroke: var(--w-text); stroke-width: 2; }
  & .side { fill: var(--w-text-soft); font-size: 14px; }
}
`;

/* ------------------------------------------------------------------ *
 * Farben und Icons
 *
 * Die Farben sind absichtlich var()-Ausdrücke. Wichtig: In SVG dürfen sie
 * nur über style="fill: …" gesetzt werden, nicht über fill="…" — als
 * Präsentationsattribut werten Browser var() nicht aus.
 * ------------------------------------------------------------------ */

export const COLORS = {
  pv: 'var(--w-solar)',
  grid_import: 'var(--w-grid-in)',
  grid_export: 'var(--w-grid-out)',
  battery_out: 'var(--w-batt-out)',
  battery_in: 'var(--w-batt-in)',
  house: 'var(--w-house)',
  wallbox: 'var(--w-wallbox)',
  heatpump: 'var(--w-heatpump)',
  price: 'var(--w-price)',
};

/** Material Design Icons – bringt Home Assistant mit, kein eigener Font. */
export const ICONS = {
  pv: 'mdi:solar-power-variant',
  grid_import: 'mdi:transmission-tower-export',
  grid_export: 'mdi:transmission-tower-import',
  battery_out: 'mdi:battery-arrow-down',
  battery_in: 'mdi:battery-charging',
  house: 'mdi:home',
  wallbox: 'mdi:ev-station',
  heatpump: 'mdi:heat-pump',
  price: 'mdi:currency-eur',
};

/** Ein Icon als HTML. Nur hier definiert, damit ein Wechsel leichtfällt. */
export const icon = (name, extra = '') =>
  `<ha-icon icon="${name}"${extra ? ` ${extra}` : ''}></ha-icon>`;

/**
 * Stilblatt an ein Shadow Root hängen. Tokens und Grundgerüst kommen
 * immer mit, das kartenspezifische CSS obendrauf.
 */
const SHEETS = new Map();

function sheet(key, cssText) {
  if (!SHEETS.has(key)) {
    const s = new CSSStyleSheet();
    s.replaceSync(cssText);
    SHEETS.set(key, s);
  }
  return SHEETS.get(key);
}

export function adoptSheet(root, cssText, key) {
  root.adoptedStyleSheets = [
    sheet('tokens', TOKENS_CSS),
    sheet('base', BASE_CSS),
    sheet(key, cssText),
  ];
}

/* ------------------------------------------------------------------ *
 * Zustände lesen
 * ------------------------------------------------------------------ */

/** Nimmt einen String, eine Liste oder undefined und liefert immer eine Liste. */
export function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

/**
 * Sammelt alle Entitäts-IDs, die irgendwo in einer Konfiguration stehen —
 * auch tief in Listen und Unterobjekten wie den Wallbox-Blöcken.
 * Damit weiß eine Karte, welche Zustandsänderungen sie überhaupt angehen.
 */
export function entityIds(config) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ENTITY_ID.test(v)) out.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(config);
  return [...out];
}

/**
 * Hat sich an den genannten Entitäten etwas getan? Home Assistant tauscht
 * das Zustandsobjekt bei jeder Änderung aus, ein Vergleich der Referenz
 * genügt also.
 */
export function statesChanged(prev, next, ids) {
  if (!prev) return true;
  for (const id of ids) {
    if (prev.states?.[id] !== next.states?.[id]) return true;
  }
  return false;
}

export function num(hass, entityId, { invert = false } = {}) {
  if (!hass || !entityId) return null;
  const v = Number(hass.states[entityId]?.state);
  return Number.isFinite(v) ? v * (invert ? -1 : 1) : null;
}

function unitOf(hass, entityId) {
  return (hass?.states?.[entityId]?.attributes?.unit_of_measurement ?? '').toLowerCase();
}

/** Leistung in Watt, egal ob der Sensor W, kW oder MW liefert. */
export function power(hass, entityId, opts = {}) {
  const v = num(hass, entityId, opts);
  if (v === null) return null;
  const u = unitOf(hass, entityId);
  return u === 'kw' ? v * 1000 : u === 'mw' ? v * 1e6 : v;
}

/** Energie in kWh, egal ob der Sensor Wh, kWh oder MWh liefert. */
export function energy(hass, entityId, opts = {}) {
  const v = num(hass, entityId, opts);
  if (v === null) return null;
  const u = unitOf(hass, entityId);
  return u === 'wh' ? v / 1000 : u === 'mwh' ? v * 1000 : v;
}

/** Summe über eine Liste von Entitäten. Leere Liste ergibt null. */
export function sum(hass, ids, fn = power, opts = {}) {
  const list = asList(ids);
  if (!list.length) return null;
  let total = 0;
  let any = false;
  for (const id of list) {
    const v = fn(hass, id, opts);
    if (v !== null) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

/** Einzelwerte mit Namen – für Aufschlüsselungen wie PV-Stränge. */
export function breakdown(hass, ids, fn = power, opts = {}) {
  return asList(ids)
    .map((id) => ({
      id,
      name: hass?.states?.[id]?.attributes?.friendly_name ?? id,
      value: fn(hass, id, opts),
    }))
    .filter((e) => e.value !== null);
}

/* ------------------------------------------------------------------ *
 * Formatierung
 * ------------------------------------------------------------------ */

/** Fremde Zeichenketten absichern, bevor sie in innerHTML landen. */
export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

const de = (v, d) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export function fmtPower(watt) {
  if (watt === null || watt === undefined) return '–';
  const a = Math.abs(watt);
  return a >= 1000 ? `${de(watt / 1000, a >= 10000 ? 1 : 2)} kW` : `${de(Math.round(watt), 0)} W`;
}

export function fmtEnergy(kwh) {
  if (kwh === null || kwh === undefined) return '–';
  const a = Math.abs(kwh);
  if (a >= 1000) return `${de(kwh / 1000, 2)} MWh`;
  if (a >= 100) return `${de(kwh, 0)} kWh`;
  if (a >= 10) return `${de(kwh, 1)} kWh`;
  return `${de(kwh, 2)} kWh`;
}

export function fmtPercent(v, d = 0) {
  return v === null || v === undefined ? '–' : `${de(v, d)} %`;
}

export function fmtSigned(kwh) {
  if (kwh === null || kwh === undefined) return '–';
  return `${kwh < 0 ? '−' : '+'} ${fmtEnergy(Math.abs(kwh))}`;
}

export function fmtPrice(ct) {
  return ct === null || ct === undefined ? '–' : `${de(ct, 1)} ct`;
}

export function fmtClock(date) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Geldwert in Euro, mit Vorzeichen. */
export function fmtEuro(value, { signed = true } = {}) {
  if (value === null || value === undefined) return '–';
  const s = de(Math.abs(value), 2);
  return signed ? `${value < 0 ? '−' : '+'} ${s} €` : `${s} €`;
}

/** Restdauer als "2 h 10 min". */
export function fmtDuration(hours) {
  const total = Math.round(hours * 60);
  if (total < 1) return 'gleich';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/* ------------------------------------------------------------------ *
 * Strompreis
 * ------------------------------------------------------------------ */

/**
 * Liefert { now, unit, forecast } in ct/kWh.
 * Der Sensor darf einen festen Wert liefern oder eine Liste im Attribut.
 * Fehlt der Sensor, greift der Festpreis aus der Config.
 */
export function priceInfo(hass, config, direction = 'import') {
  const entity = direction === 'import' ? config.price_entity : config.price_export_entity;
  const fixed = direction === 'import' ? config.price_import_fixed : config.price_export_fixed;
  const st = entity ? hass?.states?.[entity] : null;

  if (!st) return { now: fixed ?? null, unit: 'ct/kWh', forecast: [], fixed: true };

  let now = Number(st.state);
  const unit = st.attributes.unit_of_measurement ?? 'ct/kWh';
  // €/kWh-Sensoren auf ct umrechnen, damit die Achse lesbar bleibt
  const toCt = /€|eur/i.test(unit) && !/ct|cent/i.test(unit) ? 100 : 1;
  if (Number.isFinite(now)) now *= toCt;
  else now = fixed ?? null;

  const attr = config.price_forecast_attribute ?? 'prices';
  const raw = st.attributes[attr] ?? st.attributes.forecast ?? st.attributes.data ?? [];
  const forecast = (Array.isArray(raw) ? raw : [])
    .map((e) => {
      const t = e.start_time ?? e.startsAt ?? e.start ?? e.time ?? e.datetime;
      const v = e.price ?? e.total ?? e.value ?? e.marketprice;
      return t && Number.isFinite(Number(v)) ? { time: new Date(t), value: Number(v) * toCt } : null;
    })
    .filter(Boolean);

  return { now, unit: 'ct/kWh', forecast, fixed: false };
}

/* ------------------------------------------------------------------ *
 * Wetter
 * ------------------------------------------------------------------ */

export const WEATHER_ICONS = {
  'clear-night': 'mdi:weather-night',
  cloudy: 'mdi:weather-cloudy',
  exceptional: 'mdi:alert-circle-outline',
  fog: 'mdi:weather-fog',
  hail: 'mdi:weather-hail',
  lightning: 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  partlycloudy: 'mdi:weather-partly-cloudy',
  pouring: 'mdi:weather-pouring',
  rainy: 'mdi:weather-rainy',
  snowy: 'mdi:weather-snowy',
  'snowy-rainy': 'mdi:weather-snowy-rainy',
  sunny: 'mdi:weather-sunny',
  windy: 'mdi:weather-windy',
  'windy-variant': 'mdi:weather-windy-variant',
};

export const weatherIcon = (c) => WEATHER_ICONS[c] ?? 'mdi:thermometer';
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/* ------------------------------------------------------------------ *
 * Diverses
 * ------------------------------------------------------------------ */

export function fireEvent(node, type, detail = {}) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

export function moreInfo(node, entityId) {
  if (entityId) fireEvent(node, 'hass-more-info', { entityId });
}

export function registerCard(entry) {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === entry.type)) {
    window.customCards.push({ preview: true, ...entry });
  }
}

/* ------------------------------------------------------------------ *
 * Editor-Basis: ha-form mit deutschen Beschriftungen
 * ------------------------------------------------------------------ */

export class WueflFormEditor extends HTMLElement {
  _config = {};
  _hass = null;
  _form = null;
  schema = [];
  labels = {};

  setConfig(config) {
    this._config = config;
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    this._sync();
  }

  connectedCallback() {
    if (this._form) return;
    this._form = document.createElement('ha-form');
    this._form.computeLabel = (s) => this.labels[s.name] ?? s.title ?? s.name;
    this._form.addEventListener('value-changed', (ev) => {
      this.dispatchEvent(
        new CustomEvent('config-changed', {
          detail: { config: ev.detail.value },
          bubbles: true,
          composed: true,
        }),
      );
    });
    this.appendChild(this._form);
    this._sync();
  }

  _sync() {
    if (!this._form) return;
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this.schema;
  }
}

/** Kurzschreibweisen für Selektoren im Editor. */
export const sel = {
  text: () => ({ text: {} }),
  bool: () => ({ boolean: {} }),
  entity: (domain = 'sensor') => ({ entity: { filter: { domain } } }),
  entities: (domain = 'sensor') => ({ entity: { filter: { domain }, multiple: true } }),
  any: () => ({ entity: {} }),
  pick: (domains) => ({ entity: { filter: domains.map((d) => ({ domain: d })) } }),
  number: (min, max, step = 1) => ({ number: { min, max, step, mode: 'box' } }),
};

/* ------------------------------------------------------------------ *
 * Zentrale Zuordnung aus der Integration
 * ------------------------------------------------------------------ */

let centralPromise = null;
let centralSubscribed = false;

/**
 * Holt die auf der Seite "wuefl Energie" gepflegte Zuordnung.
 * Fehlt die Integration, kommt ein leeres Objekt zurück und die Karten
 * arbeiten allein mit ihrer eigenen Konfiguration weiter.
 */
export async function centralConfig(hass, section) {
  if (!hass) return {};

  if (!centralPromise) {
    centralPromise = hass.callWS({ type: 'wuefl_energy/get' }).catch(() => {
      // Fehlschläge nicht dauerhaft merken – sonst bliebe eine noch
      // startende Integration bis zum Seitenwechsel "leer".
      centralPromise = null;
      return {};
    });
  }
  const all = (await centralPromise) ?? {};

  if (!centralSubscribed && hass.connection) {
    centralSubscribed = true;
    hass.connection
      .subscribeEvents(() => {
        centralPromise = null;
        window.dispatchEvent(new CustomEvent('wuefl-energy-config-changed'));
      }, 'wuefl_energy_updated')
      .catch(() => {
        centralSubscribed = false;
      });
  }

  return (section ? all[section] : all) ?? {};
}

/**
 * Mischt zentrale Zuordnung und Kartenkonfiguration.
 * Was in der Karte steht, gewinnt – sonst wäre die Karte nicht mehr
 * einzeln anpassbar.
 */
export function mergeConfig(central, own) {
  const out = { ...(central ?? {}) };
  for (const [k, v] of Object.entries(own ?? {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

/** Kleines Flächendiagramm für Preis- und Prognosestreifen. */
export function sparkline(points, color, { width = 300, height = 78, pad = 5 } = {}) {
  if (!points.length) return '';
  const max = Math.max(...points);
  const min = Math.min(0, ...points);
  const span = max - min || 1;
  const x = (i) =>
    pad + (points.length < 2 ? width / 2 : (i / (points.length - 1)) * (width - 2 * pad));
  const y = (v) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const id = `sg${Math.random().toString(36).slice(2, 8)}`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="spark">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: ${color}; stop-opacity: .45"/>
      <stop offset="1" style="stop-color: ${color}; stop-opacity: 0"/>
    </linearGradient></defs>
    <path d="${line} L${x(points.length - 1).toFixed(1)} ${height - pad} L${pad} ${height - pad} Z" fill="url(#${id})"/>
    <path d="${line}" style="stroke: ${color}" fill="none" stroke-width="2.5"
          stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
