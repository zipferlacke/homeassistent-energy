/**
 * we-shared.js
 * Gemeinsame Basis für alle we-Karten.
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

  /* Energiefarben – gleiche Vorgaben wie DEFAULT_COLORS, per Theme
     (--wuefl-*-color) oder je Objekt in der Zuordnung änderbar. */
  --w-solar:       var(--wuefl-solar-color, #F5A623);
  --w-grid-in:     var(--wuefl-grid-import-color, #3B82F6);
  --w-grid-out:    var(--wuefl-grid-export-color, #A78BFA);
  --w-batt-out:    var(--wuefl-battery-out-color, #2BB673);
  --w-batt-in:     var(--wuefl-battery-in-color, #86E0AE);
  --w-house:       var(--wuefl-house-color, #EF6461);
  --w-wallbox:     var(--wuefl-wallbox-color, #22C3D6);
  --w-heatpump:    var(--wuefl-heatpump-color, #EC4899);
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

/* Nur-Lesen-Modus: alles Bedienbare sichtbar, aber gesperrt. */
:host([read-only]) :is(.modes, .target, .slider, .control, .choice, .switch:not(.switch-ro), .writable) {
  opacity: .55;
  pointer-events: none;
}
:host(:not([read-only])) .ro-only { display: none !important; }

/* Hinweis: getönte Fläche mit Info-Icon statt grauem Kasten mit Randstrich. */
.info {
  align-items: flex-start;
  background: color-mix(in srgb, var(--w-accent) 9%, transparent);
  border-radius: var(--w-radius);
  color: var(--w-text);
  display: flex;
  font-size: var(--w-fs-sm);
  gap: .65rem;
  line-height: 1.5;
  padding: .7rem .85rem;

  & > ha-icon { --mdc-icon-size: 18px; color: var(--w-accent); flex: 0 0 auto; margin-top: .1rem; }
  & > .txt { flex: 1 1 auto; min-width: 0; }
  & p { margin: 0; }
  & p + p { margin-top: .35rem; }
  & .link {
    background: none; border: 0; color: var(--w-accent); cursor: pointer;
    font: inherit; font-weight: 600; padding: 0;
    &:hover { text-decoration: underline; }
  }
}

/* Aufklappbereich: abgerundete Fläche, Icon im Kreis, Pfeil dreht sich. */
details.fold {
  background: var(--w-bg-soft);
  border-radius: var(--w-radius);
  margin-top: .8rem;
  overflow: hidden;

  & > summary {
    align-items: center; cursor: pointer; display: flex; font-weight: 500;
    gap: .7rem; list-style: none; padding: .7rem .85rem; user-select: none;
    &::-webkit-details-marker { display: none; }
    & > span { flex: 1 1 auto; }
    & .ico {
      background: color-mix(in srgb, var(--w-accent) 15%, transparent); border-radius: 50%;
      color: var(--w-accent); display: grid; flex: 0 0 auto; height: 2rem; place-items: center; width: 2rem;
      & ha-icon { --mdc-icon-size: 18px; }
    }
    & .chev { --mdc-icon-size: 22px; color: var(--w-text-soft); transition: transform .2s ease; }
    &:hover { background: var(--w-bg-hover); }
    &:focus-visible { outline: 2px solid var(--w-accent); outline-offset: -2px; }
  }
  &[open] > summary .chev { transform: rotate(180deg); }
  & > .body { display: grid; gap: .8rem; padding: .2rem .85rem .9rem; }
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

/* ------------------------------------------------------------------ *
 * Farben je Objekt der Zuordnung
 *
 * Jedes Objekt (Netz, PV-Anlage, String, Batterie, Haushalt, Wärmepumpe,
 * Wallbox, Wasser) kann in der Zuordnung eine eigene Farbe haben. Ohne
 * eigene Farbe gilt die Vorgabe: das erste Objekt einer Art bekommt die
 * Theme-Farbe (wie im HA-Energie-Dashboard), weitere eine Farbe aus der
 * Palette, damit sie sich im Diagramm unterscheiden.
 *
 * Die Vorgaben sind vollständige var(--ha-variable, #fallback)-Ausdrücke,
 * damit sie auch in Karten ohne TOKENS_CSS (z. B. we-chart) auflösen.
 * ------------------------------------------------------------------ */

const PALETTE = ['#3B82F6', '#EC4899', '#22C3D6', '#F5A623', '#A78BFA', '#2BB673', '#EF6461', '#A3E635'];

/**
 * Abgestimmte Vorgaben: jede Art hat einen eigenen Farbton, Paare (Akku
 * entladen/laden, Netz Bezug/Einspeisung) sind hell/dunkel desselben Tons.
 * Bewusst eigene --wuefl-*-Variablen statt --energy-*: manche Themes setzen
 * die HA-Energiefarben so, dass sich Arten gleichen (z. B. Akku und Haus rot).
 * Im Theme lassen sich alle --wuefl-*-color überschreiben.
 */
const DEFAULT_COLORS = {
  grid:        { color: 'var(--wuefl-grid-import-color, #3B82F6)', color_export: 'var(--wuefl-grid-export-color, #A78BFA)' },
  solar:       { color: 'var(--wuefl-solar-color, #F5A623)', palette: ['#FACC15', '#FB923C', '#EAB308', '#F97316'] },
  strings:     { color: '#FB7185', palette: ['#38BDF8', '#A3E635', '#C084FC', '#FBBF24', '#2DD4BF'] },
  battery:     { color: 'var(--wuefl-battery-out-color, #2BB673)', color_in: 'var(--wuefl-battery-in-color, #86E0AE)', palette: ['#059669', '#34D399'] },
  consumers:   { color: 'var(--wuefl-house-color, #EF6461)' },
  heatpump:    { color: 'var(--wuefl-heatpump-color, #EC4899)', palette: ['#DB2777', '#F472B6'] },
  wallboxes:   { color: 'var(--wuefl-wallbox-color, #22C3D6)', palette: ['#0EA5E9', '#06B6D4', '#67E8F9'] },
  water:       { color: 'var(--wuefl-water-color, #38BDF8)', palette: ['#0284C7', '#7DD3FC'] },
};

/** Farbwert aus der Zuordnung als CSS-Farbe: [r,g,b] vom Farbwähler oder Text. */
export function toCssColor(value) {
  if (Array.isArray(value) && value.length >= 3) return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/**
 * Farbe eines Objekts der Zuordnung.
 * kind:  Schlüssel der Zuordnung ("solar", "battery", "grid", …)
 * entry: der Eintrag selbst (für seine eigene Farbe)
 * index: Position in der Liste, für die Vorgabe weiterer Einträge
 * field: "color" (Standard), "color_in" (Batterie laden), "color_export" (Netz einspeisen)
 */
export function colorOf(kind, entry, index = 0, field = 'color') {
  const own = toCssColor(entry?.[field]);
  if (own) return own;
  const d = DEFAULT_COLORS[kind] ?? {};
  if (index > 0 && d.palette?.length) return d.palette[(index - 1) % d.palette.length];
  return d[field] ?? d.color ?? PALETTE[index % PALETTE.length];
}

/**
 * Setzt die Karten-Tokens (--w-solar, --w-house, …) auf die Farben der
 * Zuordnung. Alles, was COLORS benutzt (Live-Grafik, Kacheln, Flüsse),
 * übernimmt damit automatisch die gewählten Farben.
 */
export function applyColorVars(el, config) {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const vars = {
    '--w-solar': colorOf('solar', first(config?.solar)),
    '--w-grid-in': colorOf('grid', config?.grid),
    '--w-grid-out': colorOf('grid', config?.grid, 0, 'color_export'),
    '--w-batt-out': colorOf('battery', first(config?.battery)),
    '--w-batt-in': colorOf('battery', first(config?.battery), 0, 'color_in'),
    '--w-house': colorOf('consumers', config?.consumers),
    '--w-wallbox': colorOf('wallboxes', first(config?.wallboxes)),
    '--w-heatpump': colorOf('heatpump', first(config?.heatpump)),
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

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
  const imp = direction === 'import';
  // Eigene Kartenoptionen zuerst, sonst die zentrale Zuordnung (grid.*)
  const entity = imp
    ? config.price_entity ?? config.grid?.price_import
    : config.price_export_entity ?? config.grid?.price_export;
  const forecastEntity = imp ? config.grid?.price_import_forecast : config.grid?.price_export_forecast;
  const fixed = imp ? config.price_import_fixed : config.price_export_fixed;
  const st = entity ? hass?.states?.[entity] : null;

  if (!st) return { now: fixed ?? null, unit: 'ct/kWh', forecast: [], fixed: true };

  let now = Number(st.state);
  const unit = st.attributes.unit_of_measurement ?? 'ct/kWh';
  // €/kWh-Sensoren auf ct umrechnen, damit die Achse lesbar bleibt
  const toCt = /€|eur/i.test(unit) && !/ct|cent/i.test(unit) ? 100 : 1;
  if (Number.isFinite(now)) now *= toCt;
  else now = fixed ?? null;

  // Prognose aus eigenem Sensor, sonst aus den Attributen des Preissensors
  const fst = (forecastEntity && hass?.states?.[forecastEntity]) || st;
  const attr = config.price_forecast_attribute ?? 'prices';
  const raw = fst.attributes[attr] ?? fst.attributes.forecast ?? fst.attributes.data ?? [];
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

/**
 * Detail-Dialog von HA öffnen. Im Nur-Lesen-Modus nur für reine Anzeige-
 * Entitäten – bei Reglern, Schaltern & Co. ließe sich dort sonst etwas ändern.
 */
export function moreInfo(node, entityId) {
  if (!entityId) return;
  if (readOnlyMode && !/^(sensor|binary_sensor|weather|sun)\./.test(entityId)) return;
  fireEvent(node, 'hass-more-info', { entityId });
}

/* ------------------------------------------------------------------ *
 * Nur-Lesen-Modus
 *
 * Liegt in der Zuordnung unter settings.read_only (nur Admins können die
 * Zuordnung speichern). Ist er an, sperren alle Karten ihre Bedienelemente
 * und schicken keine Service-Aufrufe mehr. Die Automation läuft weiter.
 * ------------------------------------------------------------------ */
let readOnlyMode = false;

/** Ist das Dashboard gerade auf "nur lesen" gestellt? */
export function isReadOnly() {
  return readOnlyMode;
}

/** Setzt das Attribut read-only an der Karte – BASE_CSS sperrt damit die Bedienung. */
export function applyReadOnly(el) {
  el.toggleAttribute('read-only', readOnlyMode);
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
 * Navigiert zu einer Ansichtsseite
 * @param {*} viewSlug Url der seite nur der letze Teils z.B "settings"
 */
export function navigateToView(viewSlug = "settings") {
  // Aktuellen Pfad in Segmente teilen (z. B. "/lovelace-wuefl/home" -> ["lovelace-wuefl", "home"])
  const segments = window.location.pathname.split("/").filter(Boolean);

  if (segments.length > 1) {
    // Letztes Segment ("home") durch den neuen Slug ("settings") ersetzen
    segments[segments.length - 1] = viewSlug;
  } else if (segments.length === 1) {
    // Falls nur der Dashboard-Name steht ("lovelace-wuefl"), Slug anhängen
    segments.push(viewSlug);
  } else {
    // Fallback für Root
    segments.push("lovelace", viewSlug);
  }

  const newPath = "/" + segments.join("/");

  history.pushState(null, "", newPath);
  window.dispatchEvent(new CustomEvent("location-changed"));
}

/**
 * Leere Zuordnung. Alles, wovon es mehrere geben kann, ist eine Liste —
 * auch wenn es null oder eines ist. Das erspart Sonderfälle an jeder Stelle,
 * an der später gezählt oder summiert wird.
 */
export const EMPTY_CONFIG = {
  version: 4,
  grid: {},
  solar: [],
  strings: [],
  battery: [],
  consumers: {},
  heatpump: [],
  wallboxes: [],
  system: {},
};

const list = (v) => (Array.isArray(v) ? v : []);
const pluck = (rows, key) => list(rows).map((r) => r?.[key]).filter(Boolean);


let centralPromise = null;
let centralSubscribed = false;

/**
 * Holt die Zuordnung und liefert die abgeleiteten Abschnitte.
 * Fehlt die Integration, kommt ein leeres Gerüst zurück und die Karten
 * arbeiten allein mit ihrer eigenen Konfiguration weiter.
 */
export async function centralConfig(hass) {
  if (!hass) return {};

  if (!centralPromise) {
    centralPromise = hass.callWS({ type: 'we/get' }).catch(() => {
      // Fehlschläge nicht dauerhaft merken – sonst bliebe eine noch
      // startende Integration bis zum Seitenwechsel "leer".
      centralPromise = null;
      return {};
    });
  }
  const config = (await centralPromise) ?? {};
  readOnlyMode = !!config?.settings?.read_only;

  if (!centralSubscribed && hass.connection) {
    centralSubscribed = true;
    hass.connection
      .subscribeEvents(() => {
        centralPromise = null;
        window.dispatchEvent(new CustomEvent('we-config-changed'));
      }, 'we_updated')
      .catch(() => {
        centralSubscribed = false;
      });
  }

  return config
}

/**
 * Zuordnung aus der Integration.
 * withInternal = true: inklusive der Helfer-Entitäten der Integration
 * (Lademodus, Laderegler …) – so, wie Karten und Automation sie sehen.
 * withInternal = false: nur das, was der Nutzer selbst zugeordnet hat –
 * für den Editor, damit keine Helfer mit abgespeichert werden.
 */
export async function rawConfig(hass, withInternal = false) {
  return (await hass.callWS({ type: 'we/get', raw: !withInternal }).catch(() => ({}))) ?? {};
}

/** Zuordnung speichern und alle offenen Karten benachrichtigen. */
export async function saveConfig(hass, config) {
  await hass.callWS({ type: 'we/save', config });
  centralPromise = null;
  window.dispatchEvent(new CustomEvent('we-config-changed'));
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
  const str = String(colorString).trim();
  // "var(--name)", "var(--name, #fallback)" oder bloß "--name"
  const m = str.match(/^var\(\s*(--[^,\s)]+)\s*(?:,\s*(.+))?\)$/);
  const name = m ? m[1] : str.startsWith('--') ? str : null;
  if (!name) return str;
  const computed = getComputedStyle(element).getPropertyValue(name).trim();
  return computed || m?.[2]?.trim() || fallback;
}

/* ------------------------------------------------------------------ *
 * Kachel- und Umschalter-Optik im HA-Tile-Stil
 * ------------------------------------------------------------------ *
 * Erst in der Energie-Ansicht entstanden, jetzt zentral hier — damit
 * Live-Karte und Wallbox-Karte exakt dieselbe Optik bekommen, statt drei
 * leicht unterschiedliche Kopien zu pflegen.
 */

/** In jede Karte einbinden, die tileHtml()/toggleHtml() benutzt. */
/**
 * Allgemeiner Seiten-Aufbau: zentriertes, einspaltiges Grid mit maximal
 * 1000px Breite. In jede Karte, die sich so begrenzen soll, direkt in den
 * äußeren Container einsetzen (nicht als eigene Klasse — einfach als
 * Eigenschaften in die vorhandene Wurzel-Regel einbetten):
 *
 *   .card { ${GRID_CSS} ... weitere eigene Regeln ... }
 *
 * Wer mehr als eine Spalte braucht (z. B. die Energie-Ansicht: Diagramm
 * neben den Kacheln), überschreibt grid-template-columns selbst per
 * @media-Regel — GRID_CSS liefert nur die gemeinsame Basis.
 */
export const GRID_CSS = `
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
  margin: 0 auto;
  max-width: 1000px;
  width: 100%;
`;

export const TILE_CSS = `
.ha-tile-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
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

/* ------------------------------------------------------------------ *
 * Geteilter Zeitraum für die Energie-Ansicht
 * ------------------------------------------------------------------ *
 * Die Energie-Ansicht besteht aus mehreren eigenständigen Karten in
 * getrennten nativen Abschnitten (Zeitraum-Auswahl, Diagramm, Kennzahlen,
 * Batterie, Solarproduktion) — sie sind unterschiedliche Custom Elements,
 * keine gemeinsame Klasse mehr. Damit trotzdem alle denselben Zeitraum
 * zeigen, ohne dass sich die Karten gegenseitig referenzieren, liegt der
 * aktuelle Zeitraum hier als einziger Ort der Wahrheit: ein ES-Modul wird
 * pro Seite genau einmal ausgeführt, der Zustand ist also automatisch
 * zwischen allen Karten geteilt, die "we-shared.js" importieren.
 */
const PERIOD_EVENT = 'we-period-changed';
let currentPeriod = null;

/** Hilfsfunktion: Berechnet Kalender- und Zeitspannen-Flags für den Zeitraum */
function enrichPeriod(range) {
  if (!range?.start || !range?.end) return range;

  const start = new Date(range.start);
  const end = new Date(range.end);

  // --- 1. TAG ---
  const overDay = (end-start) >= 24 * 60 * 60 * 1000-1;

  // --- 2. WOCHE (>= 7 Tage ODER exakt Montag bis Sonntag) ---
  const plus1Week = new Date(start);
  plus1Week.setDate(plus1Week.getDate() + 7);

  const isMondayStart = start.getDay() === 1; // JS: 1 = Montag
  const isSundayEnd = end.getDay() === 0;     // JS: 0 = Sonntag
  const isFullCalWeek = isMondayStart && (isSundayEnd || end >= plus1Week);

  const overWeek = end >= plus1Week || isFullCalWeek;

  // --- 3. MONAT (>= 1 Monat ODER exakt 1. bis letzter Tag des Monats) ---
  const plus1Month = new Date(start);
  plus1Month.setMonth(plus1Month.getMonth() + 1);

  const isFirstDay = start.getDate() === 1;
  const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const isLastDay = end.getDate() === lastDayOfMonth;
  const isFullCalMonth = isFirstDay && (isLastDay || end >= plus1Month);

  const overMonth = end >= plus1Month || isFullCalMonth;

  // --- 4. JAHR (>= 1 Jahr ODER exakt 1. Jan bis 31. Dez) ---
  const plus1Year = new Date(start);
  plus1Year.setFullYear(plus1Year.getFullYear() + 1);

  const isJan1 = start.getMonth() === 0 && start.getDate() === 1;
  const isDec31 = end.getMonth() === 11 && end.getDate() === 31;
  const isFullCalYear = isJan1 && (isDec31 || end >= plus1Year);

  const overYear = end >= plus1Year || isFullCalYear;

  return {
    ...range,
    overDay,
    overWeek,
    overMonth,
    overYear,
  };
}

function defaultPeriodRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return enrichPeriod({ period: 'day', start, end: end });
}

/** Aktuellen Zeitraum lesen — beim allerersten Aufruf "heute". */
export function getPeriod() {
  if (!currentPeriod) currentPeriod = defaultPeriodRange();
  return currentPeriod;
}

/** Zeitraum ändern und alle anderen Energie-Karten benachrichtigen. */
export function setPeriod(range) {
  currentPeriod = enrichPeriod(range);
  window.dispatchEvent(new CustomEvent(PERIOD_EVENT, { detail: currentPeriod }));
}

/** In #connectedCallback() aufrufen; gibt die Aufräum-Funktion zurück. */
export function onPeriodChange(fn) {
  const handler = (ev) => fn(ev.detail);
  window.addEventListener(PERIOD_EVENT, handler);
  return () => window.removeEventListener(PERIOD_EVENT, handler);
}

/** Zeitfenster in eine passende Statistik-Auflösung übersetzen. */
export function periodResolution(range) {
  const days = (range.end - range.start) / 86_400_000;
  if (range.period === 'day') return 'hour';
  if (range.period === 'week' || range.period === 'month') return 'day';
  if (range.period === 'custom') return days <= 3 ? 'hour' : days <= 90 ? 'day' : 'month';
  return 'month';
}

/** Gemeinsamer Aufruf für recorder/statistics_during_period, mit Fehlerabsicherung. */
export async function fetchStats(hass, ids, range, types = ['change']) {
  if (!hass || !ids.length) return {};
  try {
    return await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: range.start.toISOString(),
      end_time: range.end.toISOString(),
      statistic_ids: ids,
      period: periodResolution(range),
      types,
    });
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Diagramm-Karte einbetten ("energy-custom-graph-card" von Thyraz)
 * ------------------------------------------------------------------ *
 * Alle Energie-Diagramme (Hauptverteilung, Batterie, Solarproduktion)
 * betten dieselbe fremde Karte auf dieselbe Art ein — deshalb hier einmal
 * zentral statt in jeder Karte einzeln kopiert.
 */
export const CHART_HINT_CSS = `
.missing {
  padding: 16px;
  & h3 { margin: 0 0 8px; }
  & p { color: var(--secondary-text-color); line-height: 1.5; margin: 0 0 12px; }
  & a { color: var(--primary-color); }
  & .links { display: flex; flex-wrap: wrap; gap: 12px; }
}
.state { color: var(--secondary-text-color); padding: 24px 0; text-align: center; }
`;

export const THYRAZ_REPO_URL = 'https://github.com/Thyraz/energy-custom-graph';
export const THYRAZ_HACS_URL = 'https://my.home-assistant.io/redirect/hacs_repository/'
  + '?owner=Thyraz&repository=energy-custom-graph&category=dashboard';

export function missingChartHtml() {
  return `<ha-card><div class="missing">
    <h3>Diagramm-Karte fehlt</h3>
    <p>Diese Ansicht nutzt <strong>Energy Custom Graph</strong> von Thyraz — reuse von
      HA's eigener ECharts-Instanz statt einer eigenen Diagramm-Bibliothek.</p>
    <div class="links">
      <a href="${THYRAZ_HACS_URL}" target="_blank" rel="noreferrer">In HACS öffnen</a>
      <a href="${THYRAZ_REPO_URL}" target="_blank" rel="noreferrer">Projektseite auf GitHub</a>
    </div>
  </div></ha-card>`;
}

/**
 * Legt die Diagramm-Karte im übergebenen Slot an oder aktualisiert sie.
 * `existingCard` ist der zuvor zurückgegebene Wert — beim ersten Aufruf
 * null. Gibt die (ggf. neu erzeugte) Karteninstanz zurück, oder null, wenn
 * nichts angezeigt werden konnte.
 */
export async function embedGraphCard(hass, existingCard, slotEl, config) {
  if (!customElements.get('energy-custom-graph-card')) {
    slotEl.innerHTML = missingChartHtml();
    return null;
  }
  if (!config || !config.series?.length) {
    slotEl.innerHTML = '<div class="state">Keine Daten vorhanden.</div>';
    return null;
  }
  let card = existingCard;
  if (!card) {
    const helpers = await window.loadCardHelpers?.();
    card = helpers ? helpers.createCardElement(config) : document.createElement('energy-custom-graph-card');
    if (!helpers) card.setConfig?.(config);
    card.hass = hass;
    slotEl.replaceChildren(card);
  } else {
    card.setConfig?.(config);
    card.hass = hass;
  }
  return card;
}