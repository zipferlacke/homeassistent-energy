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
  --w-bg:          var(--card-background-color, #fff);
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
  --w-radius:      12px;
  --w-pad:         14px;
  --w-input-h:     36px;
  --w-shadow:      0 2px 8px rgba(0, 0, 0, .12);

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

/* Ein Element mit "hidden" muss immer verschwinden, auch wenn eine Klasse
   direkt display:flex/grid darauf setzt. Ohne diese Regel gewinnt bei
   gleicher Spezifität das Autoren-CSS gegen die UA-Regel [hidden]{display:none}
   – der Effekt ist ein Regler, der trotz hidden sichtbar bleibt. */
[hidden] { display: none !important; }

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
 * PV-Prognose
 * ------------------------------------------------------------------ */

/**
 * Liest die Stundenkurve aus einem Prognose-Sensor.
 *
 * Jede Integration legt sie anders ab, deshalb wird der Reihe nach
 * probiert statt fest verdrahtet:
 *   Forecast.Solar   wh_period          { "2026-08-20T09:00:00+02:00": 1234 }
 *   Solcast          detailedForecast   [{ period_start, pv_estimate }]
 *   Open-Meteo u.a.  watt_hours_period  wie Forecast.Solar
 *
 * Ergebnis ist immer eine nach Zeit sortierte Liste { time, kwh }.
 * `attrOverride` schlägt die Erkennung, falls doch mal etwas Eigenes kommt.
 */
export function pvForecast(state, attrOverride) {
  if (!state?.attributes) return [];
  const attrs = state.attributes;
  const names = attrOverride
    ? [attrOverride]
    : ['watt_hours_period', 'wh_period', 'watt_hours', 'wh_hours',
       'detailedForecast', 'detailedHourly', 'forecast'];

  for (const name of names) {
    const raw = attrs[name];
    if (!raw) continue;

    // Objektform: Zeitstempel -> Wattstunden im Zeitraum
    if (!Array.isArray(raw) && typeof raw === 'object') {
      const out = Object.entries(raw)
        .map(([t, wh]) => ({ time: new Date(t), kwh: Number(wh) / 1000 }))
        .filter((e) => !Number.isNaN(+e.time) && Number.isFinite(e.kwh));
      if (out.length) return out.sort((a, b) => a.time - b.time);
    }

    // Listenform: Einträge mit Startzeit und entweder Energie oder Leistung
    if (Array.isArray(raw) && raw.length) {
      const rows = raw
        .map((e) => {
          const t = e.period_start ?? e.datetime ?? e.start_time ?? e.start ?? e.time;
          return t
            ? {
                time: new Date(t),
                kw: Number(e.pv_estimate ?? e.pv_estimate10 ?? e.power ?? e.value),
                wh: Number(e.wh_period ?? e.watt_hours ?? e.energy),
              }
            : null;
        })
        .filter((e) => e && !Number.isNaN(+e.time));
      if (!rows.length) continue;

      rows.sort((a, b) => a.time - b.time);
      // Solcast liefert Leistung im Zeitraum, meist halbstündlich. Die
      // Schrittweite kommt aus den Daten selbst, nicht aus einer Annahme.
      const stepH = rows.length > 1
        ? Math.max(0.1, (rows[1].time - rows[0].time) / 3_600_000)
        : 1;
      const out = rows.map((r) => ({
        time: r.time,
        kwh: Number.isFinite(r.wh) ? r.wh / 1000 : Number.isFinite(r.kw) ? r.kw * stepH : 0,
      }));
      if (out.some((e) => e.kwh > 0)) return out;
    }
  }
  return [];
}

/** Erwarteter Restertrag ab jetzt bis Sonnenuntergang, plus verbleibende Stunden. */
export function pvOutlook(hass, ids, attrOverride) {
  const now = new Date();
  let rest = 0;
  let last = now.getHours();
  let any = false;

  for (const id of asList(ids)) {
    const series = pvForecast(hass?.states?.[id], attrOverride);
    if (!series.length) {
      // Ohne Kurve bleibt nur der Tagesgesamtwert – grob halbiert als Rest.
      const v = energy(hass, id);
      if (v !== null) rest += v * 0.5;
      continue;
    }
    any = true;
    for (const e of series) {
      if (e.time > now && e.time.toDateString() === now.toDateString()) {
        rest += e.kwh;
        last = Math.max(last, e.time.getHours());
      }
    }
  }
  return { rest, hours: Math.max(0, last - now.getHours()), detailed: any };
}

export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Wann ist genug Sonnenüberschuss zusammengekommen?
 *
 * Läuft die Prognose Stunde für Stunde durch — über heute hinaus, solange
 * die Vorhersage reicht. Kommt der Bedarf erst morgen zusammen, ist das eine
 * ehrlichere Antwort als "heute nicht mehr erreichbar".
 * Ergebnis: Date oder null, wenn die Vorhersage nicht weit genug reicht.
 */
export function solarEta(hass, ids, attrOverride, baseloadKw, neededKwh) {
  if (neededKwh <= 0) return new Date();

  const now = new Date();
  const merged = new Map();
  for (const id of asList(ids)) {
    for (const e of pvForecast(hass?.states?.[id], attrOverride)) {
      const key = +e.time;
      merged.set(key, (merged.get(key) ?? 0) + e.kwh);
    }
  }
  if (!merged.size) return null;

  const rows = [...merged.entries()].sort((a, b) => a[0] - b[0]);
  // Schrittweite aus den Daten, damit Halbstundenwerte richtig gewichtet werden.
  const stepH = rows.length > 1 ? Math.max(0.1, (rows[1][0] - rows[0][0]) / 3_600_000) : 1;

  let left = neededKwh;
  for (const [time, kwh] of rows) {
    if (time <= +now) continue;
    const surplus = kwh - baseloadKw * stepH;
    if (surplus <= 0) continue;
    if (surplus >= left) {
      // Innerhalb dieses Zeitraums erreicht – anteilig interpolieren.
      const share = left / surplus;
      return new Date(time + share * stepH * 3_600_000);
    }
    left -= surplus;
  }
  return null;
}

/** "um 14:26", "morgen um 14:26", "übermorgen um …", sonst "Fr um …". */
export function fmtWhen(date) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(new Date())) / 86_400_000);
  const clock = `um ${fmtClock(date)}`;
  if (days <= 0) return clock;
  if (days === 1) return `morgen ${clock}`;
  if (days === 2) return `übermorgen ${clock}`;
  return `${WEEKDAYS[date.getDay()]} ${clock}`;
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
 * Tageswerte aus Gesamtzählern
 * ------------------------------------------------------------------ */

/**
 * Summiert für jeden Zähler, was seit Mitternacht dazugekommen ist.
 *
 * Damit reicht in der Zuordnung ein einziger Gesamtzähler je Größe. Einen
 * zweiten Sensor für "heute" zu verlangen wäre doppelte Arbeit — Home
 * Assistant führt die Langzeitstatistik ohnehin und kann die Differenz
 * über jeden Zeitraum bilden.
 */
export async function todayTotals(hass, ids) {
  const wanted = [...new Set(asList(ids).filter(Boolean))];
  if (!hass || !wanted.length) return {};

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  try {
    const res = await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      statistic_ids: wanted,
      period: 'day',
      types: ['change'],
    });
    const out = {};
    for (const [id, rows] of Object.entries(res ?? {})) {
      out[id] = asList(rows).reduce((a, r) => a + (Number(r.change) || 0), 0);
    }
    return out;
  } catch {
    // Ohne Recorder-Statistik bleiben die Tageswerte eben leer.
    return {};
  }
}

/** Tagessumme über mehrere Zähler. Ohne Daten null statt 0. */
export function todaySum(totals, ids) {
  const wanted = asList(ids).filter((id) => totals?.[id] !== undefined);
  if (!wanted.length) return null;
  return wanted.reduce((a, id) => a + totals[id], 0);
}

/* ------------------------------------------------------------------ *
 * Ladezustand der Wallbox
 * ------------------------------------------------------------------ */

/**
 * Die sechs Zustände, auf die alles abgebildet wird. Jede Wallbox meldet
 * ihren Zustand anders — Mennekes als Text ("Auto lädt (State C)"), andere
 * als Rohzahl, wieder andere in OCPP-Englisch ("SuspendedEV"). Die Karte
 * kennt deshalb nur diese sechs und übersetzt beim Einlesen.
 */
export const CHARGE_STATES = {
  frei:      { label: 'kein Fahrzeug', icon: 'mdi:ev-plug-type2', color: 'var(--w-text-soft)' },
  verbunden: { label: 'angeschlossen', icon: 'mdi:ev-plug-type2', color: 'var(--w-accent)' },
  laedt:     { label: 'lädt', icon: 'mdi:battery-charging', color: 'var(--w-batt-out)' },
  pausiert:  { label: 'pausiert', icon: 'mdi:pause-circle-outline', color: 'var(--w-price)' },
  fertig:    { label: 'abgeschlossen', icon: 'mdi:check-circle-outline', color: 'var(--w-batt-out)' },
  fehler:    { label: 'Störung', icon: 'mdi:alert-circle-outline', color: 'var(--w-danger)' },
};

/* Reihenfolge ist entscheidend, weil sich die Texte überschneiden:
   "Kein Auto angesteckt" enthält "angesteckt", und "lädt nicht" enthält
   "lädt". Deshalb stehen alle Verneinungen ganz vorn — sonst gewinnt das
   Teilwort und der Zustand wird falsch erkannt. */
const STATE_PATTERNS = [
  ['frei', /kein auto|kein fahrzeug|nicht angesteckt|nicht verbunden/i],
  ['fehler', /fehler|störung|stoerung|fault|error|state\s*e/i],
  ['verbunden', /lädt nicht|laedt nicht|nicht laden|state\s*b|suspendedevse/i],
  ['laedt', /lädt|laedt|laden aktiv|charging|state\s*c|state\s*d/i],
  ['pausiert', /pausiert|suspended|paused|unterbrochen/i],
  ['fertig', /beendet|abgeschlossen|fertig|finish|complete/i],
  ['verbunden', /angesteckt|angeschlossen|belegt|vorbereitung|preparing|connected|occupied/i],
  ['frei', /verfügbar|verfuegbar|available|frei|idle|state\s*a/i],
];

/**
 * Übersetzt den gemeldeten Zustand in einen der sechs bekannten.
 *
 * `map` erlaubt eine ausdrückliche Zuordnung je Wallbox — nötig bei
 * Sensoren, die nur eine Rohzahl liefern, denn "3" ist ohne Kontext nicht
 * eindeutig. Ohne Zuordnung greift die Mustererkennung über den Text.
 */
export function chargeState(hass, entityId, map) {
  const raw = entityId ? hass?.states?.[entityId]?.state : null;
  if (raw === null || raw === undefined || raw === 'unknown' || raw === 'unavailable') return null;

  const mapped = map?.[String(raw).trim()];
  if (mapped && CHARGE_STATES[mapped]) return mapped;

  const text = String(raw);
  for (const [state, pattern] of STATE_PATTERNS) {
    if (pattern.test(text)) return state;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Zentrale Zuordnung aus der Integration
 * ------------------------------------------------------------------ */

/**
 * Leere Zuordnung. Alles, wovon es mehrere geben kann, ist eine Liste —
 * auch wenn es null oder eines ist. Das erspart Sonderfälle an jeder Stelle,
 * an der später gezählt oder summiert wird.
 */
export const EMPTY_CONFIG = {
  version: 4,
  grid: {},
  solar: {},
  strings: [],
  battery: [],
  consumers: {},
  heatpump: [],
  wallboxes: [],
  cars: [],
  price: {},
  system: {},
  info: {},
};

const list = (v) => (Array.isArray(v) ? v : []);
const pluck = (rows, key) => list(rows).map((r) => r?.[key]).filter(Boolean);

/** Sorgt dafür, dass jede erwartete Liste auch wirklich eine ist. */
export function normalizeConfig(raw) {
  const c = { ...EMPTY_CONFIG, ...(raw ?? {}) };
  for (const key of ['strings', 'battery', 'heatpump', 'wallboxes', 'cars']) c[key] = list(c[key]);
  for (const key of ['grid', 'solar', 'consumers', 'price', 'system', 'info']) {
    c[key] = c[key] ?? {};
  }
  return c;
}

/**
 * Übersetzt die Zuordnung in die flachen Abschnitte, mit denen die Karten
 * arbeiten. Die Karten müssen dadurch nichts über Listen, Autos oder
 * Wallbox-Zuordnung wissen — sie bekommen fertige Entitätslisten.
 */
/**
 * Übersetzt die Zuordnung in die flachen Abschnitte, mit denen die Karten
 * arbeiten. "internal" kommt vom Backend und enthält die Entitäts-IDs der
 * Helfer, die die Integration selbst anlegt (Lademodus, Ladestrom,
 * Ladeziel, die vier anlagenweiten Laderegler) — dafür gibt es keinen
 * Zuordnungsschritt mehr, die Integration weiß es selbst.
 */
export function deriveConfig(raw, internal = {}) {
  const c = normalizeConfig(raw);
  const cars = new Map(c.cars.map((car, i) => [car.id ?? `car_${i}`, car]));
  const rules = internal.rules ?? {};

  const live = {
    // Explizit benannt statt "...c.grid" blind zu verteilen: die Live-Karte
    // erwartet grid_power/invert_grid, der Zuordnungs-Block heißt intern
    // nur power/invert. Ein reines Spread hätte "power" statt "grid_power"
    // erzeugt und damit die ganze Netz-Gruppe unsichtbar gemacht.
    grid_power: c.grid.power,
    invert_grid: c.grid.invert,
    pv_power_total: c.solar.power,
    pv_power: pluck(c.strings, 'power'),
    // Zusätzlich die Dachflächen samt der in der Zuordnung vergebenen Namen —
    // pv_power allein enthält nur die Entitäts-IDs, dabei ginge der Name
    // verloren und die Karte müsste auf den friendly_name des Sensors
    // zurückfallen.
    pv_strings: c.strings
      .filter((s) => s.power)
      .map((s, i) => ({ entity: s.power, name: s.name || `Fläche ${i + 1}` })),
    pv_energy_total: asList(c.solar.energy_total),
    pv_forecast_entities: asList(c.solar.forecast),
    pv_forecast_attribute: c.solar.forecast_attribute,

    battery_power: pluck(c.battery, 'power'),
    battery_soc: pluck(c.battery, 'soc'),
    battery_in_total: pluck(c.battery, 'in_total'),
    battery_out_total: pluck(c.battery, 'out_total'),
    // Ein Schalter für alle Speicher: gemischte Vorzeichen wären ohnehin
    // ein Fehler in der Zuordnung.
    invert_battery: c.battery.some((b) => b.invert),

    grid_import_total: asList(c.grid.import_total),
    grid_export_total: asList(c.grid.export_total),

    house_power: c.consumers.house_power,
    house_energy_total: asList(c.consumers.energy_total),
    heatpump_power: pluck(c.heatpump, 'power'),
    heatpump_energy_total: pluck(c.heatpump, 'energy_total'),
    wallbox_power: pluck(c.wallboxes, 'power'),
    wallbox_energy_total: pluck(c.wallboxes, 'energy_total'),

    weather_entity: c.info.weather_entity,
  };

  const history = {
    pv_energy: live.pv_energy_total,
    grid_import: live.grid_import_total,
    grid_export: live.grid_export_total,
    battery_in: live.battery_in_total,
    battery_out: live.battery_out_total,
    battery_soc: live.battery_soc,
    house_energy: live.house_energy_total,
    wallbox_energy: live.wallbox_energy_total,
    heatpump_energy: live.heatpump_energy_total,
  };

  // Wallbox und Auto sind getrennt gepflegt und werden hier zusammengeführt.
  // Lademodus, Ladestrom und Ladeziel kommen aus "internal" — die legt die
  // Integration selbst an, dafür trägt niemand eine Entität ein.
  const wallboxes = c.wallboxes.map((wb, i) => {
    const car = cars.get(wb.car) ?? {};
    const iw = internal.wallboxes?.[wb.id] ?? {};
    return {
      ...wb,
      name: wb.name || car.name || `Wallbox ${i + 1}`,
      power_entity: wb.power,
      total_energy_entity: wb.energy_total,
      session_energy_entity: wb.energy_session,
      // Ladestand: bevorzugt vom Fahrzeug, sonst was die Wallbox meldet.
      car_soc_entity: car.soc ?? wb.car_soc,
      // Ladeziel: eine echte Fahrzeug-Integration darf mitreden, sonst
      // greift der von der Integration angelegte Regler.
      target_soc_entity: car.target ?? iw.target_entity,
      capacity: car.capacity ?? wb.capacity,
      mode_entity: iw.mode_entity,
      current_entity: iw.current_entity,
      ...rules,
      ...c.price,
      pv_forecast_entities: live.pv_forecast_entities,
      pv_forecast_attribute: live.pv_forecast_attribute,
      house_base_load: c.system.house_base_load,
    };
  });

  return {
    live: { ...live, ...c.price, ...c.system },
    history: { ...history, title: c.system.history_title },
    price: c.price,
    system: c.system,
    rules,
    info: c.info,
    wallboxes,
    cars: c.cars,
    hasBattery: c.battery.length > 0,
    raw: c,
  };
}

let centralPromise = null;
let centralSubscribed = false;

/**
 * Holt die Zuordnung und liefert die abgeleiteten Abschnitte.
 * Fehlt die Integration, kommt ein leeres Gerüst zurück und die Karten
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
  const payload = (await centralPromise) ?? {};
  const all = deriveConfig(payload, payload.internal);

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

/** Rohe Zuordnung, wie sie gespeichert ist — für die Einstellungsansicht. */
export async function rawConfig(hass) {
  const data = await hass.callWS({ type: 'wuefl_energy/get' }).catch(() => ({}));
  // "internal" ist ein vom Backend berechnetes Zusatzfeld, kein Teil der
  // vom Nutzer gepflegten Zuordnung — beim Bearbeiten und erneuten
  // Speichern soll es nicht versehentlich mit persistiert werden.
  const { internal, ...rest } = data ?? {};
  return normalizeConfig(rest);
}

/** Zuordnung speichern und alle offenen Karten benachrichtigen. */
export async function saveConfig(hass, config) {
  await hass.callWS({ type: 'wuefl_energy/save', config });
  centralPromise = null;
  window.dispatchEvent(new CustomEvent('wuefl-energy-config-changed'));
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

/**
 * Löst eine CSS-Variable (bloßer Name, z. B. "--energy-solar-color") gegen
 * das aktuell aktive Theme auf. `element` muss die eigene Karte sein
 * (nicht document.documentElement), sonst greift nicht garantiert das
 * gewählte Theme. Ist colorString gar keine Variable, sondern schon eine
 * fertige Farbe, kommt sie unverändert zurück.
 */
export function cssColor(element, colorString, fallback) {
  if (!colorString) return fallback;
  const cleanVar = colorString.startsWith('var(') ? colorString.slice(4, -1).trim() : colorString;
  if (cleanVar.startsWith('--')) {
    const computed = getComputedStyle(element).getPropertyValue(cleanVar).trim();
    if (computed) return computed;
  }
  return cleanVar.startsWith('--') ? fallback : cleanVar;
}

/* ------------------------------------------------------------------ *
 * Kachel- und Umschalter-Optik im HA-Tile-Stil
 * ------------------------------------------------------------------ *
 * Erst in der Energie-Ansicht entstanden, jetzt zentral hier — damit
 * Live-Karte und Wallbox-Karte exakt dieselbe Optik bekommen, statt drei
 * leicht unterschiedliche Kopien zu pflegen.
 */

/** In jede Karte einbinden, die tileHtml()/toggleHtml() benutzt. */
export const TILE_CSS = `
.ha-tile-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.ha-tile {
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  background: var(--ha-card-background, var(--card-background-color, #fff));
  padding: 12px; display: flex; align-items: center; min-height: 100%; box-sizing: border-box;
}
button.ha-tile { border: 0; cursor: pointer; font: inherit; text-align: left; width: 100%; }
.tile-content { display: flex; align-items: center; gap: 12px; width: 100%; }
.tile-icon-container {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--icon-bg); color: var(--icon-color);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.tile-icon-container ha-icon { display: flex; align-items: center; justify-content: center; }
.tile-info { display: flex; flex-direction: column; justify-content: center; flex: 1; overflow: hidden; }
.tile-title { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.tile-value { font-size: 16px; font-weight: 600; color: var(--primary-text-color); margin-top: 1px; }
.tile-subtitle { font-size: 11px; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; }
.sub-item { display: flex; align-items: center; gap: 2px; }
`;

/** Segmented Control wie bei Tag/Woche/Monat/Jahr in der Energie-Ansicht. */
export const TOGGLE_CSS = `
.time-buttons {
  background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
  border-radius: 12px;
  display: inline-flex;
  padding: 3px;
  gap: 2px;
}
.time-btn {
  background: transparent;
  border: none;
  border-radius: 9px;
  color: var(--secondary-text-color, #727272);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  transition: all 0.2s ease;
}
.time-btn:hover { color: var(--primary-text-color, #212121); }
.time-btn.active {
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #212121);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
`;

/**
 * Baut eine ha-tile-Kachel: Icon links in einem farbigen Kreis, Titel/Wert/
 * Untertitel daneben. Mit `entity` oder `click` wird daraus ein echter
 * <button> mit passendem data-Attribut (für moreInfo bzw. eigene
 * Klick-Logik wie die Erklär-Tiles); ohne beides bleibt es ein reines
 * <ha-card>.
 */
export function tileHtml({ icon, color, title, value, subtitle, entity, click }) {
  const style = `--icon-color: ${color}; --icon-bg: color-mix(in srgb, ${color} 18%, transparent);`;
  const inner = `
    <div class="tile-content">
      <div class="tile-icon-container" style="${style}"><ha-icon icon="${esc(icon)}"></ha-icon></div>
      <div class="tile-info">
        <div class="tile-title">${esc(title)}</div>
        <div class="tile-value">${esc(value)}</div>
        ${subtitle ? `<div class="tile-subtitle">${subtitle}</div>` : ''}
      </div>
    </div>`;
  const attr = entity ? `data-entity="${esc(entity)}"` : click ? `data-click="${esc(click)}"` : '';
  return attr
    ? `<ha-card class="ha-tile"><button type="button" class="ha-tile" style="background:none;border:0;width:100%;padding:0" ${attr}>${inner}</button></ha-card>`
    : `<ha-card class="ha-tile">${inner}</ha-card>`;
}