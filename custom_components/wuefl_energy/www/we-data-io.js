/**
 * we-data-io.js
 * Export und Import der Energiedaten (Langzeitstatistik von HA) als CSV.
 *
 * Export: Energie je Stunde/Tag/Monat für alle Gesamtzähler der Zuordnung.
 * Import: CSV aus anderen Systemen (clever-PV, 1KOMMA5°, SMA, Fronius
 * Solar.web …) oder aus dem eigenen Export. Ergänzt wird nur, was VOR dem
 * ersten eigenen Wert in HA liegt – vorhandene Statistik bleibt unangetastet.
 * Die Summen der ergänzten Stunden laufen dafür rückwärts auf 0 zu, so
 * passt der Übergang zu den vorhandenen Werten ohne Sprung.
 */
import { adoptSheet, asList, esc, icon, centralConfig, isReadOnly } from './we-shared.js';

const entityOf = (v) => (typeof v === 'string' ? v : v?.entity ?? null);
const HOUR = 3_600_000;

/* ------------------------------------------------------------------ *
 * Ziele: alle Energiezähler der Zuordnung
 * ------------------------------------------------------------------ */

export const KINDS = {
  solar: 'PV-Erzeugung',
  grid_import: 'Netzbezug',
  grid_export: 'Einspeisung',
  battery_in: 'Akku geladen',
  battery_out: 'Akku entladen',
  consumers: 'Hausverbrauch',
  wallbox: 'Wallbox',
  heatpump: 'Wärmepumpe',
};

export function energyTargets(cfg) {
  const out = [];
  const add = (kind, label, value) => {
    for (const entity of asList(value).map(entityOf).filter(Boolean)) {
      if (!out.some((t) => t.entity === entity)) out.push({ kind, label, entity });
    }
  };
  const named = (base, x, i, n) => (n > 1 || x?.name ? `${base} ${x?.name || i + 1}` : base);
  const solar = asList(cfg?.solar);
  solar.forEach((s, i) => add('solar', named('PV', s, i, solar.length), s?.total));
  add('grid_import', 'Netzbezug', cfg?.grid?.import_total);
  add('grid_export', 'Einspeisung', cfg?.grid?.export_total);
  const batt = asList(cfg?.battery);
  batt.forEach((b, i) => {
    const suffix = batt.length > 1 ? ` ${b?.name || i + 1}` : '';
    add('battery_in', `Akku geladen${suffix}`, b?.in_total);
    add('battery_out', `Akku entladen${suffix}`, b?.out_total);
  });
  add('consumers', 'Hausverbrauch', cfg?.consumers?.total);
  const wbs = asList(cfg?.wallboxes);
  wbs.forEach((w, i) => add('wallbox', named('Wallbox', w, i, wbs.length), w?.total));
  const hps = asList(cfg?.heatpump);
  hps.forEach((h, i) => add('heatpump', named('Wärmepumpe', h, i, hps.length), h?.total));
  // Gleiche Beschriftung (z. B. zwei Netzbezug-Zähler) eindeutig machen
  for (const t of out) {
    if (out.filter((x) => x.label === t.label).length > 1) t.label = `${t.label} (${t.entity})`;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
function fmtTime(date, period) {
  const d = new Date(date);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (period === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (period === 'day') return day;
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fmtNum = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(3).replace('.', ','));

/** CSV (Semikolon, Dezimalkomma – öffnet sich in Excel direkt richtig). */
export async function exportCsv(hass, targets, start, end, period) {
  const ids = targets.map((t) => t.entity);
  const res = ids.length
    ? await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period,
      types: ['change'],
      units: { energy: 'kWh' },
    })
    : {};
  const times = new Map();
  targets.forEach((t, col) => {
    for (const row of res?.[t.entity] ?? []) {
      const key = +new Date(row.start);
      if (!times.has(key)) times.set(key, new Array(targets.length).fill(null));
      times.get(key)[col] = Number(row.change);
    }
  });
  const lines = [['Zeit', ...targets.map((t) => `${t.label} (kWh)`)].join(';')];
  for (const key of [...times.keys()].sort((a, b) => a - b)) {
    lines.push([fmtTime(key, period), ...times.get(key).map(fmtNum)].join(';'));
  }
  return { csv: `﻿${lines.join('\r\n')}\r\n`, rows: times.size };
}

/* ------------------------------------------------------------------ *
 * CSV lesen
 * ------------------------------------------------------------------ */

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  const [headers = [], ...data] = rows;
  return { delimiter, headers, rows: data };
}

/** Zahl aus "1.234,5", "1,234.5", "12,5", "12.5" – je Spalte entschieden. */
export function numberParser(values) {
  // Dezimalkomma, außer die Spalte nutzt das Komma als Tausendertrennung ("1,234.5")
  const comma = values.some((v) => /\d,\d/.test(v)) && !values.some((v) => /\d,\d{3}\.\d/.test(v));
  return (v) => {
    let s = String(v ?? '').replace(/[\s ]/g, '').replace(/[^\d,.\-+eE]/g, '');
    if (!s) return NaN;
    s = comma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    return Number(s);
  };
}

/**
 * Zeitpunkt aus üblichen Formaten. grain = wie fein: hour, day oder month.
 * Ohne Zeitzone gilt Ortszeit.
 */
export function parseTime(value) {
  const s = String(value ?? '').trim().replace(/^"|"$/g, '');
  let m;
  if (/^\d{10}$|^\d{13}$/.test(s)) {
    const d = new Date(Number(s) * (s.length === 10 ? 1000 : 1));
    return { date: d, grain: 'hour' };
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/))) {
    if (m[7]) return { date: new Date(s.replace(' ', 'T')), grain: 'hour' };
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return { date: d, grain: m[4] !== undefined ? 'hour' : 'day' };
  }
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(y, +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
    return { date: d, grain: m[4] !== undefined ? 'hour' : 'day' };
  }
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/)) || (m = s.match(/^(\d{1,2})[./](\d{4})$/))) {
    const [y, mo] = m[1].length === 4 ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return { date: new Date(y, mo - 1, 1), grain: 'month' };
  }
  return null;
}

/** Spalte, in der fast alle Werte Zeitpunkte sind. */
export function detectTimeColumn(headers, rows) {
  const sample = rows.slice(0, 30);
  let best = -1, bestScore = 0;
  headers.forEach((_, c) => {
    const ok = sample.filter((r) => parseTime(r[c])).length;
    if (ok > bestScore) { best = c; bestScore = ok; }
  });
  return bestScore >= Math.max(1, sample.length * 0.8) ? best : -1;
}

/** Faktor nach kWh aus der Spaltenüberschrift. */
export function unitFactor(header) {
  const h = String(header ?? '').toLowerCase();
  if (/mwh/.test(h)) return 1000;
  if (/kwh/.test(h)) return 1;
  if (/\bwh\b|\(wh\)|\[wh\]/.test(h)) return 0.001;
  return 1;
}

const GUESS = [
  ['battery_out', /(akku|batter|speicher).*(entlad|discharg|abgabe)|(entlad|discharg).*(akku|batter)/i],
  ['battery_in', /(akku|batter|speicher).*(lad|charg|aufnahme)|(lad|charg).*(akku|batter)/i],
  ['grid_export', /einspeis|export|feed|abgabe|sold|verkauf/i],
  ['grid_import', /netzbezug|bezug|import|purchas|grid.?cons|netz(?!.*einspeis)/i],
  ['wallbox', /wallbox|ladest|\bev\b|e-?auto|fahrzeug|charger/i],
  ['heatpump', /w[äa]rmepumpe|heat.?pump/i],
  ['solar', /pv|solar|erzeug|produ|yield|ertrag|generation/i],
  ['consumers', /verbrauch|consum|haus|load|bedarf/i],
];

/** Ziel für eine Spalte raten – erst exakt nach Beschriftung, dann nach Stichworten. */
export function guessTarget(header, targets) {
  const h = String(header ?? '').replace(/\s*\((k|m)?wh\)\s*$/i, '').trim().toLowerCase();
  const exact = targets.find((t) => t.label.toLowerCase() === h);
  if (exact) return exact.entity;
  for (const [kind, re] of GUESS) {
    if (re.test(header)) return targets.find((t) => t.kind === kind)?.entity ?? '';
  }
  return '';
}

/** Zählerstand (steigt immer) oder Energie je Zeitraum? */
export function guessMode(values) {
  const v = values.filter(Number.isFinite);
  if (v.length < 3) return 'interval';
  let up = 0;
  for (let i = 1; i < v.length; i += 1) if (v[i] >= v[i - 1]) up += 1;
  const min = Math.min(...v), max = Math.max(...v);
  return up / (v.length - 1) >= 0.95 && min > 0 && min > max * 0.5 ? 'meter' : 'interval';
}

/**
 * Energie je Stunde (kWh) aus einer Spalte. Tages- und Monatswerte landen
 * mittags auf dem ersten Tag – in Tages- und Monatsansichten stimmt die
 * Summe, in der Stundenansicht alter Tage steht der Wert als ein Balken.
 */
export function toHourly(rows, timeCol, col, { mode = 'interval', factor = 1, parse, now = Date.now() } = {}) {
  const num = parse ?? numberParser(rows.map((r) => r[col] ?? ''));
  const pts = rows
    .map((r) => ({ t: parseTime(r[timeCol]), v: num(r[col]) * factor }))
    .filter((p) => p.t && Number.isFinite(p.v))
    .sort((a, b) => a.t.date - b.t.date);
  const out = new Map();
  const place = (p, kwh) => {
    const d = new Date(p.t.date);
    if (p.t.grain === 'hour') d.setMinutes(0, 0, 0);
    else d.setHours(12, 0, 0, 0);
    const key = +d;
    if (key + HOUR > now) return;
    out.set(key, (out.get(key) ?? 0) + kwh);
  };
  if (mode === 'meter') {
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const diff = pts[i + 1].v - pts[i].v;
      if (diff >= 0) place(pts[i], diff); // Rücksprung (Zählertausch) auslassen
    }
  } else {
    for (const p of pts) if (p.v >= 0) place(p, p.v);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([start, kwh]) => ({ start, kwh }));
}

/**
 * Statistik-Zeilen für recorder/import_statistics. Nur Stunden vor
 * firstStart (erster vorhandener Wert in HA). Mit vorhandenen Werten laufen
 * die Summen auf 0 zu – so bleibt der Übergang stimmig.
 */
export function buildStats(hourly, firstStart, toUnit = 1) {
  const rows = firstStart ? hourly.filter((h) => h.start < firstStart) : hourly;
  const sums = new Array(rows.length);
  let base = 0; // Summe vor der ersten Zeile
  if (firstStart) {
    let acc = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) { sums[i] = acc; acc -= rows[i].kwh; }
    base = acc;
  } else {
    let acc = 0;
    rows.forEach((r, i) => { acc += r.kwh; sums[i] = acc; });
  }
  const round = (v) => Math.round(v * toUnit * 1000) / 1000;
  // HA rechnet die Energie einer Stunde als Differenz zur vorigen Summe –
  // ohne Ankerzeile davor ginge der erste Wert verloren.
  const anchor = rows.length ? [{ start: new Date(rows[0].start - HOUR).toISOString(), sum: round(base) }] : [];
  return {
    stats: [...anchor, ...rows.map((r, i) => ({ start: new Date(r.start).toISOString(), sum: round(sums[i]) }))],
    skipped: hourly.length - rows.length,
    kwh: rows.reduce((a, r) => a + r.kwh, 0),
    from: rows[0]?.start ?? null,
    to: rows.length ? rows[rows.length - 1].start : null,
  };
}

/** Erster vorhandener Stundenwert einer Statistik (ms) oder null. */
export async function firstStatStart(hass, id) {
  const month = await hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: new Date(2000, 0, 1).toISOString(),
    statistic_ids: [id], period: 'month', types: ['sum'],
  });
  const m0 = month?.[id]?.[0];
  if (!m0) return null;
  const from = +new Date(m0.start);
  const hours = await hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: new Date(from).toISOString(),
    end_time: new Date(from + 32 * 24 * HOUR).toISOString(),
    statistic_ids: [id], period: 'hour', types: ['sum'],
  });
  const h0 = hours?.[id]?.[0];
  return h0 ? +new Date(h0.start) : from;
}

/** In HA importieren – neuere HA-Versionen wollen mean_type/unit_class, ältere kennen sie nicht. */
export async function importStats(hass, entity, stats) {
  const metaList = await hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: [entity] }).catch(() => []);
  const meta = asList(metaList)[0];
  const st = hass.states?.[entity];
  const unit = meta?.statistics_unit_of_measurement ?? st?.attributes?.unit_of_measurement ?? 'kWh';
  const base = {
    has_sum: true,
    name: meta?.name ?? st?.attributes?.friendly_name ?? null,
    source: 'recorder',
    statistic_id: entity,
    unit_of_measurement: unit,
  };
  for (let i = 0; i < stats.length; i += 2000) {
    const chunk = stats.slice(i, i + 2000);
    try {
      await hass.callWS({ type: 'recorder/import_statistics', metadata: { ...base, has_mean: false, mean_type: 0, unit_class: 'energy' }, stats: chunk });
    } catch (err) {
      if (!/extra keys|not allowed|invalid/i.test(String(err?.message ?? err))) throw err;
      await hass.callWS({ type: 'recorder/import_statistics', metadata: { ...base, has_mean: false }, stats: chunk });
    }
  }
}

/** Faktor kWh → Einheit der Statistik (kWh, Wh, MWh). */
export function toStatUnit(unit) {
  const u = String(unit ?? 'kWh').toLowerCase();
  return u === 'wh' ? 1000 : u === 'mwh' ? 0.001 : 1;
}

/* ------------------------------------------------------------------ *
 * Bedienelement für die Einstellungen
 * ------------------------------------------------------------------ */

const CSS = `
:host { display: block; }
.sub { font-weight: 600; margin: 0 0 .4rem; }
.sub + .note, .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); line-height: 1.45; }
.part + .part { border-top: 1px solid var(--w-line); margin-top: 1rem; padding-top: 1rem; }
.line { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; margin: .6rem 0 .3rem; }
input[type="date"], select {
  background: var(--w-bg-soft); border: 0; border-radius: var(--w-radius); color: inherit;
  font: inherit; font-size: var(--w-fs-sm); height: var(--w-input-h, 2.4rem); padding: 0 .6rem;
}
.btn.primary { background: var(--w-accent); color: var(--w-on-accent, #fff); }
.btn:disabled { cursor: default; opacity: .45; }
table { border-collapse: collapse; font-size: var(--w-fs-sm); margin: .6rem 0; width: 100%; }
th, td { border-bottom: 1px solid var(--w-line); padding: .35rem .3rem; text-align: left; vertical-align: middle; }
th { color: var(--w-text-soft); font-weight: 600; }
td select { height: 2rem; max-width: 100%; }
td.ex { color: var(--w-text-soft); font-variant-numeric: tabular-nums; max-width: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-wrap { overflow-x: auto; }
.msg { font-size: var(--w-fs-sm); line-height: 1.5; margin-top: .4rem; }
.msg.ok { color: var(--success-color, #43a047); }
.msg.err { color: var(--error-color, #db4437); }
.summary { font-size: var(--w-fs-sm); line-height: 1.6; margin: .4rem 0; }
.summary b { font-weight: 600; }
.confirm {
  align-items: center; background: color-mix(in srgb, var(--warning-color, #ffa600) 12%, transparent);
  border-radius: var(--w-radius); display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; padding: .6rem .75rem;
}
.confirm .txt { flex: 1; font-size: var(--w-fs-sm); min-width: 12rem; }
[hidden] { display: none !important; }
`;

/** Meldung einfärben, ohne die übrigen Klassen zu verlieren. */
function setMsg(el, kind) {
  el.classList.toggle('ok', kind === 'ok');
  el.classList.toggle('err', kind === 'err');
}

class WueflDataIo extends HTMLElement {
  #hass = null;
  #cfg = null;
  #targets = [];
  #csv = null;       // { headers, rows, timeCol }
  #plan = null;      // [{ entity, label, stats, … }]
  #els = {};

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) {
      this.#build();
      this.#loadConfig();
      window.addEventListener('we-config-changed', () => this.#loadConfig());
    }
    this.#syncRights();
  }

  async #loadConfig() {
    this.#cfg = (await centralConfig(this.#hass)) ?? {};
    this.#targets = energyTargets(this.#cfg);
    this.#els.exportBtn.disabled = !this.#targets.length;
    this.#els.exportNote.textContent = this.#targets.length
      ? `Enthält: ${this.#targets.map((t) => t.label).join(', ')}.`
      : 'In der Zuordnung sind noch keine Gesamtzähler (kWh) eingetragen.';
    if (this.#csv) this.#renderMapping();
  }

  #syncRights() {
    const can = !!this.#hass?.user?.is_admin && !isReadOnly();
    this.#els.importPart.hidden = !can;
  }

  #build() {
    const root = this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'data-io');
    const today = new Date();
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    root.innerHTML = `
      <div class="part">
        <div class="sub">Export</div>
        <span class="note">Energie aus der Langzeitstatistik von Home Assistant als CSV-Tabelle (Excel-tauglich, kWh).</span>
        <div class="line">
          <input type="date" class="from" value="${today.getFullYear()}-01-01" aria-label="Von">
          <span>bis</span>
          <input type="date" class="to" value="${iso(today)}" aria-label="Bis">
          <select class="period" aria-label="Auflösung">
            <option value="hour">je Stunde</option>
            <option value="day" selected>je Tag</option>
            <option value="month">je Monat</option>
          </select>
          <button type="button" class="btn primary export">${icon('mdi:download')}<span>CSV herunterladen</span></button>
        </div>
        <span class="note export-note"></span>
        <div class="msg export-msg"></div>
      </div>

      <div class="part import-part">
        <div class="sub">Import</div>
        <span class="note">Alte Daten beim Umstieg übernehmen – als CSV aus clever-PV, 1KOMMA5°, SMA, Fronius Solar.web,
          dem Wechselrichter-Portal oder aus dem Export oben. Ergänzt wird nur der Zeitraum vor dem ersten eigenen Wert
          in Home Assistant; vorhandene Daten bleiben unangetastet.</span>
        <div class="line">
          <label class="btn">${icon('mdi:file-upload-outline')}<span>CSV-Datei wählen</span>
            <input type="file" class="file" accept=".csv,.txt,text/csv" hidden></label>
          <span class="note file-name"></span>
        </div>
        <div class="mapping" hidden>
          <div class="line"><span>Zeit-Spalte</span><select class="time-col"></select></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Spalte</th><th>Beispiel</th><th>Übernehmen als</th><th>Einheit</th><th>Art</th></tr></thead>
            <tbody></tbody>
          </table></div>
          <button type="button" class="btn check">${icon('mdi:magnify')}<span>Prüfen</span></button>
          <div class="summary" hidden></div>
          <button type="button" class="btn primary go" hidden>${icon('mdi:database-import-outline')}<span>Importieren</span></button>
          <div class="confirm" hidden>
            <span class="txt">Import in die Langzeitstatistik von Home Assistant? Das lässt sich nicht mit einem Klick rückgängig machen.</span>
            <button type="button" class="btn cancel">Abbrechen</button>
            <button type="button" class="btn primary ok">Ja, importieren</button>
          </div>
        </div>
        <div class="msg import-msg"></div>
      </div>
    `;
    const q = (s) => root.querySelector(s);
    this.#els = {
      from: q('.from'), to: q('.to'), period: q('.period'),
      exportBtn: q('.export'), exportNote: q('.export-note'), exportMsg: q('.export-msg'),
      importPart: q('.import-part'), file: q('.file'), fileName: q('.file-name'),
      mapping: q('.mapping'), timeCol: q('.time-col'), tbody: q('tbody'),
      check: q('.check'), summary: q('.summary'), go: q('.go'), confirm: q('.confirm'),
      importMsg: q('.import-msg'),
    };
    this.#els.exportBtn.addEventListener('click', () => this.#export());
    this.#els.file.addEventListener('change', () => this.#readFile());
    this.#els.timeCol.addEventListener('change', () => { this.#csv.timeCol = Number(this.#els.timeCol.value); this.#renderMapping(); });
    this.#els.check.addEventListener('click', () => this.#check());
    this.#els.go.addEventListener('click', () => { this.#els.confirm.hidden = false; });
    q('.cancel').addEventListener('click', () => { this.#els.confirm.hidden = true; });
    q('.ok').addEventListener('click', () => this.#import());
  }

  async #export() {
    const msg = this.#els.exportMsg;
    const from = new Date(`${this.#els.from.value}T00:00:00`);
    const to = new Date(`${this.#els.to.value}T00:00:00`);
    if (!(from < to || +from === +to)) { setMsg(msg, 'err'); msg.textContent = 'Bitte einen gültigen Zeitraum wählen.'; return; }
    to.setDate(to.getDate() + 1);
    setMsg(msg, ''); msg.textContent = 'Wird zusammengestellt …';
    try {
      const period = this.#els.period.value;
      const { csv, rows } = await exportCsv(this.#hass, this.#targets, from, to, period);
      const name = `w-energie_${this.#els.from.value}_${this.#els.to.value}_${period}.csv`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(msg, 'ok');
      msg.textContent = `${rows} Zeilen exportiert (${name}).`;
    } catch (err) {
      setMsg(msg, 'err');
      msg.textContent = `Export fehlgeschlagen: ${err?.message ?? err}`;
    }
  }

  async #readFile() {
    const file = this.#els.file.files?.[0];
    this.#plan = null;
    this.#els.importMsg.textContent = '';
    if (!file) return;
    this.#els.fileName.textContent = file.name;
    const text = await file.text();
    const csv = parseCsv(text);
    const timeCol = detectTimeColumn(csv.headers, csv.rows);
    if (!csv.rows.length || timeCol < 0) {
      this.#els.mapping.hidden = true;
      setMsg(this.#els.importMsg, 'err');
      this.#els.importMsg.textContent = 'In der Datei wurde keine Spalte mit Datum/Uhrzeit erkannt.';
      return;
    }
    this.#csv = { ...csv, timeCol };
    this.#renderMapping();
  }

  #renderMapping() {
    const { headers, rows, timeCol } = this.#csv;
    this.#els.mapping.hidden = false;
    this.#els.summary.hidden = true;
    this.#els.go.hidden = true;
    this.#els.confirm.hidden = true;
    this.#els.timeCol.innerHTML = headers.map((h, i) =>
      `<option value="${i}" ${i === timeCol ? 'selected' : ''}>${esc(h || `Spalte ${i + 1}`)}</option>`).join('');
    const targetOpts = (sel) => `<option value="">– nicht übernehmen –</option>${this.#targets.map((t) =>
      `<option value="${esc(t.entity)}" ${t.entity === sel ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}`;
    this.#els.tbody.innerHTML = headers.map((h, c) => {
      if (c === timeCol) return '';
      const values = rows.map((r) => r[c] ?? '');
      const parse = numberParser(values);
      const nums = values.map(parse);
      if (!nums.some(Number.isFinite)) return '';
      const f = unitFactor(h);
      const mode = guessMode(nums);
      return `<tr data-col="${c}">
        <td>${esc(h || `Spalte ${c + 1}`)}</td>
        <td class="ex">${esc(values.find((v) => v !== '') ?? '')}</td>
        <td><select class="target">${targetOpts(guessTarget(h, this.#targets))}</select></td>
        <td><select class="unit">
          <option value="0.001" ${f === 0.001 ? 'selected' : ''}>Wh</option>
          <option value="1" ${f === 1 ? 'selected' : ''}>kWh</option>
          <option value="1000" ${f === 1000 ? 'selected' : ''}>MWh</option>
        </select></td>
        <td><select class="mode">
          <option value="interval" ${mode === 'interval' ? 'selected' : ''}>Energie je Zeitraum</option>
          <option value="meter" ${mode === 'meter' ? 'selected' : ''}>Zählerstand</option>
        </select></td>
      </tr>`;
    }).join('');
  }

  async #check() {
    const msg = this.#els.importMsg;
    setMsg(msg, ''); msg.textContent = 'Wird geprüft …';
    const { rows, timeCol } = this.#csv;
    const byEntity = new Map();
    for (const tr of this.#els.tbody.querySelectorAll('tr')) {
      const entity = tr.querySelector('.target').value;
      if (!entity) continue;
      const hourly = toHourly(rows, timeCol, Number(tr.dataset.col), {
        mode: tr.querySelector('.mode').value,
        factor: Number(tr.querySelector('.unit').value),
      });
      // Mehrere Spalten auf dasselbe Ziel (z. B. HT/NT) werden addiert
      const acc = byEntity.get(entity) ?? new Map();
      for (const h of hourly) acc.set(h.start, (acc.get(h.start) ?? 0) + h.kwh);
      byEntity.set(entity, acc);
    }
    if (!byEntity.size) {
      setMsg(msg, 'err'); msg.textContent = 'Bitte mindestens einer Spalte ein Ziel zuweisen.';
      return;
    }
    const plan = [];
    try {
      for (const [entity, acc] of byEntity) {
        const hourly = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([start, kwh]) => ({ start, kwh }));
        const first = await firstStatStart(this.#hass, entity);
        const b = buildStats(hourly, first);
        const label = this.#targets.find((t) => t.entity === entity)?.label ?? entity;
        plan.push({ entity, label, first, ...b });
      }
    } catch (err) {
      setMsg(msg, 'err'); msg.textContent = `Prüfen fehlgeschlagen: ${err?.message ?? err}`;
      return;
    }
    const day = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '–');
    this.#els.summary.hidden = false;
    this.#els.summary.innerHTML = plan.map((p) => `<div><b>${esc(p.label)}</b>: ${p.stats.length
      ? `${p.kwh.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kWh vom ${day(p.from)} bis ${day(p.to)}`
      : 'nichts zu ergänzen'}${p.skipped ? ` · ${p.skipped} ${p.skipped === 1 ? 'Wert' : 'Werte'} übersprungen (ab ${day(p.first)} hat HA schon eigene Daten)` : ''}</div>`).join('');
    this.#plan = plan.filter((p) => p.stats.length);
    this.#els.go.hidden = !this.#plan.length;
    msg.textContent = this.#plan.length ? '' : 'Für den Zeitraum der Datei hat Home Assistant bereits eigene Werte – es gibt nichts zu ergänzen.';
  }

  async #import() {
    this.#els.confirm.hidden = true;
    const msg = this.#els.importMsg;
    if (!this.#plan?.length || isReadOnly()) return;
    this.#els.go.disabled = true;
    const done = [];
    try {
      for (const p of this.#plan) {
        setMsg(msg, ''); msg.textContent = `Importiere ${p.label} …`;
        const meta = await this.#hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: [p.entity] }).catch(() => []);
        const unit = asList(meta)[0]?.statistics_unit_of_measurement ?? this.#hass.states?.[p.entity]?.attributes?.unit_of_measurement;
        const factor = toStatUnit(unit);
        await importStats(this.#hass, p.entity, p.stats.map((s) => ({ ...s, sum: Math.round(s.sum * factor * 1000) / 1000 })));
        done.push(p.label);
      }
      setMsg(msg, 'ok');
      msg.textContent = `Importiert: ${done.join(', ')}. HA übernimmt die Werte im Hintergrund – Diagramme zeigen sie nach einem Neuladen.`;
      this.#plan = null;
      this.#els.go.hidden = true;
    } catch (err) {
      setMsg(msg, 'err');
      msg.textContent = `Import fehlgeschlagen${done.length ? ` nach ${done.join(', ')}` : ''}: ${err?.message ?? err}`;
    } finally {
      this.#els.go.disabled = false;
    }
  }
}

if (!customElements.get('we-data-io')) customElements.define('we-data-io', WueflDataIo);
