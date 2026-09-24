/**
 * we-data-io.js
 * Export und Import der Energiedaten (Langzeitstatistik von HA) als CSV.
 *
 * Export: Energie je Stunde/Tag/Monat für alle Gesamtzähler der Zuordnung.
 * Import: CSV aus anderen Systemen (clever-PV, 1KOMMA5°, SMA, Fronius
 * Solar.web …) oder aus dem eigenen Export. Der Zeitraum der Datei wird
 * geschrieben, auch wenn dort schon Werte stehen – ein zweiter Import mit
 * korrigierten Zahlen ersetzt also den ersten. Damit die vorhandene
 * Statistik danach weiterläuft, hängen sich die Summen an die erste Stunde
 * an, die nach dem Zeitraum schon Daten hat.
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

/** Einträge der Zuordnung ohne Gesamtzähler – für die gibt es nichts zu importieren. */
export function missingCounters(cfg) {
  const out = [];
  const miss = (label, ...vals) => { if (!vals.some((v) => asList(v).map(entityOf).some(Boolean))) out.push(label); };
  asList(cfg?.solar).forEach((s, i) => miss(`PV ${s?.name || i + 1}`, s?.total));
  if (cfg?.grid && Object.keys(cfg.grid).length) {
    miss('Netzbezug', cfg.grid.import_total);
    miss('Einspeisung', cfg.grid.export_total);
  }
  asList(cfg?.battery).forEach((b, i) => miss(`Akku ${b?.name || i + 1}`, b?.in_total, b?.out_total));
  asList(cfg?.wallboxes).forEach((w, i) => miss(`Wallbox ${w?.name || i + 1}`, w?.total));
  asList(cfg?.heatpump).forEach((h, i) => miss(`Wärmepumpe ${h?.name || i + 1}`, h?.total));
  return out;
}

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

/**
 * CSV (Semikolon, Dezimalkomma – öffnet sich in Excel direkt richtig).
 *
 * Feiner als fünf Minuten gibt es nicht: So führt Home Assistant seine
 * Langzeitstatistik. Jedes gröbere Minutenraster (10, 15, 30 …) fasst der
 * Export aus den Fünf-Minuten-Werten zusammen, die Summe bleibt dieselbe.
 */
const rasterMs = (period) => {
  const m = /^(\d+)min$/.exec(period);
  return m ? +m[1] * 60_000 : 0;
};

export async function exportCsv(hass, targets, start, end, period) {
  const ids = targets.map((t) => t.entity);
  const bucketMs = rasterMs(period);
  const res = ids.length
    ? await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period: bucketMs ? '5minute' : period,
      types: ['change'],
      units: { energy: 'kWh' },
    })
    : {};
  const times = new Map();
  targets.forEach((t, col) => {
    for (const row of res?.[t.entity] ?? []) {
      const roh = +new Date(row.start);
      const key = bucketMs ? Math.floor(roh / bucketMs) * bucketMs : roh;
      if (!times.has(key)) times.set(key, new Array(targets.length).fill(null));
      const v = Number(row.change);
      if (Number.isFinite(v)) times.get(key)[col] = (times.get(key)[col] ?? 0) + v;
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
 * Monatsname → Nummer. Deutsch und Englisch, ausgeschrieben oder abgekürzt.
 *
 * Verglichen werden die ersten drei Buchstaben ohne Punkt und ohne Umlaut,
 * damit "Jan", "Jan.", "Januar" und "January" alle auf dasselbe fallen.
 */
const MONAT = {
  jan: 0, feb: 1, mar: 2, mrz: 2, apr: 3, mai: 4, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};

function monatNr(wort) {
  const w = String(wort ?? '').toLowerCase()
    .replace(/\./g, '')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
  const nr = MONAT[w.slice(0, 3)];
  return nr === undefined ? null : nr;
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
  // Mit Monatsnamen: "1. Jan. 2026", "1 Januar 2026 14:00"
  if ((m = s.match(/^(\d{1,2})\.?\s+([A-Za-zÄÖÜäöüß]+)\.?,?\s+(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/))) {
    const mo = monatNr(m[2]);
    if (mo !== null) {
      const d = new Date(+m[3], mo, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
      return { date: d, grain: m[4] !== undefined ? 'hour' : 'day' };
    }
  }
  // Englische Reihenfolge: "Jan 1, 2026"
  if ((m = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = monatNr(m[1]);
    if (mo !== null) return { date: new Date(+m[3], mo, +m[2]), grain: 'day' };
  }
  // Nur Monat: "Jan. 2026", "Januar 2026"
  if ((m = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{4})$/))) {
    const mo = monatNr(m[1]);
    if (mo !== null) return { date: new Date(+m[2], mo, 1), grain: 'month' };
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

/**
 * Für jeden Zähler der Zuordnung die passende Spalte der Datei raten.
 * Erst exakt nach Beschriftung (eigener Export), dann nach Stichworten;
 * jede Spalte wird höchstens einmal vergeben – bei zwei PV-Anlagen
 * bekommt die zweite die zweite passende Spalte.
 */
export function guessColumns(targets, headers, columns) {
  const used = new Set();
  const clean = (h) => String(h ?? '').replace(/\s*[([]?(k|m)?wh[)\]]?\s*$/i, '').trim().toLowerCase();
  const pick = (test) => columns.find((c) => !used.has(c) && test(headers[c]));
  const out = new Map();
  for (const t of targets) {
    const c = pick((h) => clean(h) === t.label.toLowerCase());
    if (c !== undefined) { used.add(c); out.set(t.entity, c); }
  }
  for (const t of targets) {
    if (out.has(t.entity)) continue;
    const re = GUESS.find(([kind]) => kind === t.kind)?.[1];
    // Spalte gehört zu dieser Art, wenn keine vorher geprüfte Art besser passt
    const c = re && pick((h) => GUESS.find(([, r]) => r.test(h))?.[0] === t.kind);
    if (c !== undefined && c !== false) { used.add(c); out.set(t.entity, c); }
  }
  return out;
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
 * Energie je Stunde (kWh) aus einer Spalte.
 *
 * Steht in der Datei nur ein Tages- oder Monatswert, wird er gleichmäßig auf
 * alle Stunden des Zeitraums verteilt. In der Tagesansicht ergibt das eine
 * waagerechte Linie statt eines einzelnen Balkens um zwölf; Tages-, Wochen-
 * und Monatssummen bleiben gleich. Nur Stunden, die noch nicht vorbei sind,
 * fallen weg – in die Zukunft lässt sich nichts schreiben.
 */
export function toHourly(rows, timeCol, col, { mode = 'interval', factor = 1, parse, now = Date.now() } = {}) {
  const num = parse ?? numberParser(rows.map((r) => r[col] ?? ''));
  const pts = rows
    .map((r) => ({ t: parseTime(r[timeCol]), v: num(r[col]) * factor }))
    .filter((p) => p.t && Number.isFinite(p.v))
    .sort((a, b) => a.t.date - b.t.date);
  const out = new Map();
  const setze = (key, kwh) => {
    if (key + HOUR > now) return;
    out.set(key, (out.get(key) ?? 0) + kwh);
  };
  const place = (p, kwh) => {
    const d = new Date(p.t.date);
    if (p.t.grain === 'hour') {
      d.setMinutes(0, 0, 0);
      setze(+d, kwh);
      return;
    }
    d.setHours(0, 0, 0, 0);
    // Tag: 24 Stunden. Monat: alle Stunden bis zum gleichen Tag im Folgemonat.
    const bis = new Date(d);
    if (p.t.grain === 'month') bis.setMonth(bis.getMonth() + 1);
    else bis.setDate(bis.getDate() + 1);
    const stunden = Math.round((bis - d) / HOUR);
    const anteil = kwh / stunden;
    for (let i = 0; i < stunden; i += 1) setze(+d + i * HOUR, anteil);
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
 * Fehlende Stunden zwischen erstem und letztem Wert mit 0 auffüllen.
 *
 * Der Import ersetzt nur Stunden, die in der Datei stehen. Ohne Auffüllen
 * bliebe eine Stunde, für die die Datei nichts hergibt, auf ihrem alten Wert
 * stehen – nach einem Tagesimport und einem späteren Stundenimport wäre der
 * Tag dann eine Mischung aus beidem. Mit den Nullen bestimmt die Datei den
 * Zeitraum vollständig.
 *
 * Gelöscht wird dabei nichts: Home Assistant kennt keine Lücke, sondern nur
 * Stunden ohne Verbrauch. Eine 0 ist genau das.
 */
export function fillGaps(hourly) {
  if (hourly.length < 2) return hourly;
  const vorhanden = new Map(hourly.map((h) => [h.start, h.kwh]));
  const bis = hourly[hourly.length - 1].start;
  const out = [];
  for (let t = hourly[0].start; t <= bis; t += HOUR) out.push({ start: t, kwh: vorhanden.get(t) ?? 0 });
  return out;
}

/**
 * Geschützter Zeitraum aus zwei Datumsfeldern, in Millisekunden.
 *
 * Wird je Import gesetzt, nicht dauerhaft gespeichert – meist unterscheidet
 * sich die Grenze von Datei zu Datei. Beide Enden sind freiwillig: Nur "von"
 * schützt alles ab dem Tag (typisch: ab hier zeichnet Home Assistant selbst
 * auf), nur "bis" schützt alles davor. Der "bis"-Tag zählt ganz dazu, sonst
 * wäre der letzte Tag halb geschützt.
 */
export function protectRange(vonStr, bisStr) {
  const tag = (v, ende) => {
    if (!v) return null;
    const d = new Date(`${v}T00:00:00`);
    if (Number.isNaN(+d)) return null;
    if (ende) d.setDate(d.getDate() + 1);
    return +d;
  };
  return { von: tag(vonStr, false), bis: tag(bisStr, true) };
}

/** Liegt die Stunde im geschützten Zeitraum? */
export function isProtected(start, schutz) {
  if (!schutz) return false;
  const { von, bis } = schutz;
  if (von === null && bis === null) return false;
  if (von !== null && start < von) return false;
  if (bis !== null && start >= bis) return false;
  return true;
}

/**
 * Stunden mit vorhandenen Werten, für mehrere Zähler in einer Abfrage.
 *
 * Ein Jahr sind 8.760 Zeilen je Zähler. Bei sieben Zählern einzeln abgefragt
 * warten wir siebenmal hintereinander auf dieselbe Spanne – gebündelt holt
 * Home Assistant alles in einem Durchgang. Gefragt wird nur nach 'sum': Ob
 * eine Stunde existiert, steht damit fest, und 'change' müsste HA erst
 * ausrechnen.
 */
export async function existingHoursMany(hass, ids, von, bis) {
  const leer = new Map(ids.map((id) => [id, new Set()]));
  if (!ids.length) return leer;
  try {
    const res = await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: new Date(von).toISOString(),
      end_time: new Date(bis + HOUR).toISOString(),
      statistic_ids: ids, period: 'hour', types: ['sum'],
    });
    for (const id of ids) {
      leer.set(id, new Set((res?.[id] ?? []).map((r) => +new Date(r.start))));
    }
    return leer;
  } catch {
    return leer;
  }
}

/** Stunden, für die es schon Werte gibt, als Menge von Zeitstempeln. */
export async function existingHours(hass, id, von, bis) {
  return (await existingHoursMany(hass, [id], von, bis)).get(id) ?? new Set();
}

/**
 * Was vom Import übrig bleibt, in zusammenhängende Blöcke zerlegt.
 *
 * Fällt in der Mitte etwas weg – ein geschützter Abschnitt oder, im Modus
 * "behalten", bereits vorhandene Stunden –, zerfällt der Import in mehrere
 * Blöcke. Jeder braucht später seinen eigenen Anschluss an die vorhandenen
 * Summen, sonst steht an den Nahtstellen ein Sprung.
 *
 * modus: 'overwrite' schreibt alles außer Geschütztem, 'keep' lässt
 * zusätzlich jede Stunde stehen, für die es schon einen Wert gibt.
 */
export function planBlocks(hourly, { schutz = null, vorhanden = null, modus = 'overwrite' } = {}) {
  const bloecke = [];
  let lauf = null;
  let geschuetzt = 0;
  let behalten = 0;
  let ersetzt = 0;

  for (const h of hourly) {
    let weg = false;
    if (isProtected(h.start, schutz)) { geschuetzt += 1; weg = true; }
    else if (vorhanden?.has(h.start)) {
      if (modus === 'keep') { behalten += 1; weg = true; }
      else ersetzt += 1;
    }
    if (weg) { lauf = null; continue; }
    if (!lauf || h.start !== lauf[lauf.length - 1].start + HOUR) { lauf = []; bloecke.push(lauf); }
    lauf.push(h);
  }
  return { bloecke, geschuetzt, behalten, ersetzt };
}

/**
 * Statistik-Zeilen für recorder/import_statistics.
 *
 * Home Assistant speichert je Stunde eine laufende Summe; die Energie einer
 * Stunde ist die Differenz zur Stunde davor. Ein Import muss sich deshalb an
 * die vorhandenen Werte anhängen, sonst steht an der Nahtstelle ein Sprung.
 *
 * Gibt es nach dem Zeitraum schon Werte, rechnen wir rückwärts: Die letzte
 * importierte Stunde bekommt genau die Summe, die die erste vorhandene
 * Stunde erwartet (ihre Summe minus ihrem eigenen Verbrauch). Damit bleibt
 * alles Spätere unverändert richtig – auch beim zweiten Import über
 * denselben Zeitraum. Gibt es nur davor Werte, wird vorwärts weitergezählt.
 *
 * anchor: { vorher: Summe davor | null, nachher: { sum, change } | null }
 */
export function buildStats(hourly, anchor = {}, toUnit = 1) {
  const rows = hourly;
  const sums = new Array(rows.length);
  const gesamt = rows.reduce((a, r) => a + r.kwh, 0);
  const { vorher = null, nachher = null } = anchor ?? {};

  const base = nachher
    ? (Number(nachher.sum) || 0) - (Number(nachher.change) || 0) - gesamt
    : (Number(vorher) || 0);

  let acc = base;
  rows.forEach((r, i) => { acc += r.kwh; sums[i] = acc; });

  const round = (v) => Math.round(v * toUnit * 1000) / 1000;
  // Ankerzeile davor, damit die erste Stunde ihre Differenz bekommt – aber
  // nur, wenn dort nichts Echtes steht, das wir sonst überschreiben würden.
  const anker = rows.length && vorher === null
    ? [{ start: new Date(rows[0].start - HOUR).toISOString(), sum: round(base) }]
    : [];
  return {
    stats: [...anker, ...rows.map((r, i) => ({ start: new Date(r.start).toISOString(), sum: round(sums[i]) }))],
    kwh: gesamt,
    from: rows[0]?.start ?? null,
    to: rows.length ? rows[rows.length - 1].start : null,
  };
}

/** Anfang des Folgemonats zu einem Zeitpunkt. */
function naechsterMonat(ms) {
  const d = new Date(ms);
  return +new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/**
 * Monate mit Daten, damit die Suche nach dem Anschluss keine Lücke verpasst.
 *
 * Vorher wurde stur ein Fenster von 32 Tagen abgesucht. Liegt der nächste
 * vorhandene Wert weiter weg – bei jahresweisem Import ist das der Normalfall
 * –, fand die Suche nichts, der Block wurde vorwärts weitergezählt, und an der
 * Nahtstelle stand ein Sprung in Höhe des gesamten Imports.
 */
async function monateMitDaten(hass, id, von, bis) {
  const res = await hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: new Date(von).toISOString(),
    ...(bis === null ? {} : { end_time: new Date(bis).toISOString() }),
    statistic_ids: [id], period: 'month', types: ['sum'],
  });
  return (res?.[id] ?? []).map((r) => +new Date(r.start)).sort((a, b) => a - b);
}

/** Summe der letzten Stunde mit Daten vor `bis` (ms) oder null. */
export async function statSumBefore(hass, id, bis) {
  try {
    const monate = await monateMitDaten(hass, id, 0, bis);
    // Von hinten, der jüngste Monat mit Daten gewinnt
    for (let i = monate.length - 1; i >= 0; i -= 1) {
      const start = monate[i];
      const res = await hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(start).toISOString(),
        end_time: new Date(Math.min(naechsterMonat(start), bis)).toISOString(),
        statistic_ids: [id], period: 'hour', types: ['sum'],
      });
      const rows = (res?.[id] ?? []).filter((r) => +new Date(r.start) < bis);
      if (rows.length) return Number(rows[rows.length - 1].sum);
    }
    return null;
  } catch {
    return null;
  }
}

/** Erste Stunde mit Daten ab `ab` (ms) samt Summe und Verbrauch, oder null. */
export async function statAfter(hass, id, ab) {
  try {
    const monate = await monateMitDaten(hass, id, ab, null);
    for (const start of monate) {
      const von = Math.max(ab, start);
      const res = await hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(von).toISOString(),
        end_time: new Date(naechsterMonat(start)).toISOString(),
        statistic_ids: [id], period: 'hour', types: ['sum', 'change'],
      });
      const h0 = (res?.[id] ?? []).find((r) => +new Date(r.start) >= ab);
      if (h0) return { start: +new Date(h0.start), sum: Number(h0.sum), change: Number(h0.change) };
    }
    return null;
  } catch {
    return null;
  }
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

/**
 * Die gesamte Langzeitstatistik dieser Zähler löschen.
 *
 * Nur für den Neuanfang: Liegen in einer Kette Sprünge aus verunglückten
 * Importen, lässt sich das nicht mehr stückweise heilen – ein Import
 * überschreibt immer nur seinen eigenen Bereich, die falschen Versätze
 * daneben bleiben. Nach dem Leeren baut ein Import von vorn eine saubere
 * Kette auf.
 */
export async function clearStats(hass, ids) {
  await hass.callWS({ type: 'recorder/clear_statistics', statistic_ids: ids });
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
td .ent { color: var(--w-text-soft); font-size: .75rem; }
tr.off td:not(:first-child):not(:nth-child(2)) { opacity: .4; }
td.ex { color: var(--w-text-soft); font-variant-numeric: tabular-nums; max-width: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-wrap { overflow-x: auto; }
.msg { font-size: var(--w-fs-sm); line-height: 1.5; margin-top: .4rem; }
.msg.ok { color: var(--success-color, #43a047); }
.msg.err { color: var(--error-color, #db4437); }
.summary { font-size: var(--w-fs-sm); line-height: 1.6; margin: .4rem 0; }
.summary b { font-weight: 600; }
.steps { color: var(--w-text-soft); font-size: var(--w-fs-sm); line-height: 1.5; margin: .5rem 0 0; padding-left: 1.2rem; }
.steps b { color: var(--w-text); font-weight: 600; }
.steps li + li { margin-top: .2rem; }
.confirm {
  align-items: center; background: color-mix(in srgb, var(--warning-color, #ffa600) 12%, transparent);
  border-radius: var(--w-radius); display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; padding: .6rem .75rem;
}
.confirm .txt { flex: 1; font-size: var(--w-fs-sm); min-width: 12rem; }
details.wipe { border-top: 1px solid var(--w-line); margin-top: 1rem; padding-top: .6rem; }
details.wipe > summary { color: var(--w-text-soft); cursor: pointer; font-size: var(--w-fs-sm); }
details.wipe .list { display: flex; flex-direction: column; gap: .25rem; margin: .5rem 0; }
details.wipe label { align-items: center; display: flex; font-size: var(--w-fs-sm); gap: .4rem; }
details.wipe .danger { color: var(--error-color, #db4437); }
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
  #cols = new Map(); // Zahlenspalten der Datei: Spalte → { name, example, factor, mode }
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
    this.#els.wipeList.innerHTML = this.#targets.map((t) =>
      `<label><input type="checkbox" value="${esc(t.entity)}"> ${esc(t.label)}`
      + `<span class="ent">${esc(t.entity)}</span></label>`).join('')
      || '<span class="note">In der Zuordnung sind noch keine Gesamtzähler eingetragen.</span>';
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
        <span class="note">Energie aus der Langzeitstatistik von Home Assistant als CSV-Tabelle (Excel-tauglich, kWh).
          Alles unter einer Stunde entsteht aus den Fünf-Minuten-Werten, und die hält der Recorder nur
          etwa zehn Tage – für ältere Zeiträume je Stunde oder gröber.</span>
        <div class="line">
          <input type="date" class="from" value="${today.getFullYear()}-01-01" aria-label="Von">
          <span>bis</span>
          <input type="date" class="to" value="${iso(today)}" aria-label="Bis">
          <select class="period" aria-label="Auflösung">
            <option value="5minute">je 5 Minuten</option>
            <option value="10min">je 10 Minuten</option>
            <option value="15min">je 15 Minuten</option>
            <option value="30min">je 30 Minuten</option>
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
          dem Wechselrichter-Portal oder aus dem Export oben.</span>
        <ol class="steps">
          <li><b>Datei wählen</b> – jede CSV mit einer Datums-Spalte geht. Stehen dort nur Tages- oder Monatswerte, verteilt der Import sie gleichmäßig über den Zeitraum.</li>
          <li><b>Spalten wählen</b> – für jeden deiner Zähler aus der Zuordnung (PV, Netzbezug, Einspeisung, Akku, Wallbox …) die passende Spalte der Datei.
            Meist ist sie schon vorausgewählt, Einheit und „Zählerstand / Energie je Zeitraum“ ebenso. Zähler ohne Spalte bleiben unverändert.</li>
          <li><b>Prüfen</b> – zeigt je Zähler, wie viel aus welchem Zeitraum geschrieben wird.</li>
          <li><b>Importieren</b> – landet in der Langzeitstatistik dieser Zähler; Diagramme, Kacheln und das Energie-Dashboard von HA zeigen es dann mit an.
            Werte im Zeitraum der Datei werden ersetzt: Ein zweiter Import mit korrigierten Zahlen überschreibt den ersten. Was danach kommt, bleibt unverändert.
            Wo schon Werte stehen, kannst du wählen, ob sie überschrieben werden oder stehen bleiben, und einen Zeitraum angeben, den dieser Import gar nicht anfassen soll.</li>
        </ol>
        <div class="line">
          <label class="btn">${icon('mdi:file-upload-outline')}<span>CSV-Datei wählen</span>
            <input type="file" class="file" accept=".csv,.txt,text/csv" hidden></label>
          <span class="note file-name"></span>
        </div>
        <div class="mapping" hidden>
          <div class="line"><span>Datum/Zeit steht in</span><select class="time-col"></select></div>
          <div class="line"><span>Wo schon Werte stehen</span>
            <select class="overlap">
              <option value="overwrite">mit den neuen überschreiben</option>
              <option value="keep">vorhandene behalten</option>
            </select>
          </div>
          <div class="line"><span>Unangetastet lassen</span>
            <input type="date" class="keep-from"><span>bis</span><input type="date" class="keep-to">
          </div>
          <span class="note">Nur für diesen Import. Was in diesem Zeitraum liegt, wird weder überschrieben
            noch auf 0 gesetzt – gedacht für den Tag, ab dem Home Assistant selbst aufzeichnet
            (dann nur das linke Feld füllen). Beide Felder leer = kein Schutz.</span>
          <span class="note missing" hidden></span>
          <div class="table-wrap"><table>
            <thead><tr><th>Zähler aus der Zuordnung</th><th>Spalte der Datei</th><th>Beispiel</th><th>Einheit</th><th>Art</th></tr></thead>
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

        <details class="wipe">
          <summary>Statistik eines Zählers leeren (Neuanfang)</summary>
          <span class="note">Löscht die <b>gesamte</b> Langzeitstatistik der gewählten Zähler – auch das,
            was Home Assistant selbst aufgezeichnet hat. Gedacht für den Fall, dass in der Summenkette
            Sprünge aus früheren Importen stecken: Die lassen sich nicht stückweise heilen, weil ein Import
            immer nur seinen eigenen Bereich überschreibt. Danach alles in einem Zug neu importieren,
            ältestes Jahr zuerst.</span>
          <span class="note danger">Vorher exportieren! Was hier gelöscht wird, ist weg –
            der Export oben ist die einzige Sicherung.</span>
          <div class="list wipe-list"></div>
          <button type="button" class="btn wipe-go">${icon('mdi:delete-sweep-outline')}<span>Ausgewählte leeren</span></button>
          <div class="confirm wipe-confirm" hidden>
            <span class="txt">Langzeitstatistik der ausgewählten Zähler vollständig löschen? Das lässt sich nicht rückgängig machen.</span>
            <button type="button" class="btn wipe-cancel">Abbrechen</button>
            <button type="button" class="btn primary wipe-ok">Ja, leeren</button>
          </div>
          <div class="msg wipe-msg"></div>
        </details>
      </div>
    `;
    const q = (s) => root.querySelector(s);
    this.#els = {
      from: q('.from'), to: q('.to'), period: q('.period'),
      exportBtn: q('.export'), exportNote: q('.export-note'), exportMsg: q('.export-msg'),
      importPart: q('.import-part'), file: q('.file'), fileName: q('.file-name'),
      mapping: q('.mapping'), timeCol: q('.time-col'), tbody: q('tbody'),
      check: q('.check'), summary: q('.summary'), go: q('.go'), confirm: q('.confirm'),
      overlap: q('.overlap'), keepFrom: q('.keep-from'), keepTo: q('.keep-to'),
      wipeList: q('.wipe-list'), wipeGo: q('.wipe-go'), wipeConfirm: q('.wipe-confirm'),
      wipeMsg: q('.wipe-msg'),
      importMsg: q('.import-msg'),
      missing: q('.missing'),
    };
    this.#els.exportBtn.addEventListener('click', () => this.#export());
    this.#els.file.addEventListener('change', () => this.#readFile());
    this.#els.timeCol.addEventListener('change', () => { this.#csv.timeCol = Number(this.#els.timeCol.value); this.#renderMapping(); });
    this.#els.check.addEventListener('click', () => this.#check());
    // Jede dieser Einstellungen ändert den Plan – das Geprüfte gilt nicht mehr
    for (const el of [this.#els.overlap, this.#els.keepFrom, this.#els.keepTo]) {
      el.addEventListener('change', () => {
        this.#els.summary.hidden = true;
        this.#els.go.hidden = true;
        this.#plan = null;
      });
    }
    this.#els.go.addEventListener('click', () => { this.#els.confirm.hidden = false; });
    q('.cancel').addEventListener('click', () => { this.#els.confirm.hidden = true; });
    this.#els.wipeGo.addEventListener('click', () => {
      this.#els.wipeConfirm.hidden = !this.#wipeAuswahl().length;
      if (!this.#wipeAuswahl().length) {
        setMsg(this.#els.wipeMsg, 'err');
        this.#els.wipeMsg.textContent = 'Kein Zähler ausgewählt.';
      }
    });
    q('.wipe-cancel').addEventListener('click', () => { this.#els.wipeConfirm.hidden = true; });
    q('.wipe-ok').addEventListener('click', () => this.#wipe());
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

    // Zahlenspalten der Datei mit Beispiel, Einheit und Art
    this.#cols = new Map();
    headers.forEach((h, c) => {
      if (c === timeCol) return;
      const values = rows.map((r) => r[c] ?? '');
      const nums = values.map(numberParser(values));
      if (!nums.some(Number.isFinite)) return;
      this.#cols.set(c, {
        name: h || `Spalte ${c + 1}`,
        example: values.find((v) => v !== '') ?? '',
        factor: unitFactor(h),
        mode: guessMode(nums),
      });
    });
    const guess = guessColumns(this.#targets, headers, [...this.#cols.keys()]);

    const missing = missingCounters(this.#cfg);
    this.#els.missing.hidden = !missing.length;
    this.#els.missing.textContent = missing.length
      ? `Ohne Gesamtzähler in der Zuordnung (dafür ist kein Import möglich): ${missing.join(', ')}.`
      : '';

    const colOpts = (sel) => `<option value="">– nicht importieren –</option>${[...this.#cols].map(([c, info]) =>
      `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(info.name)}</option>`).join('')}`;
    this.#els.tbody.innerHTML = this.#targets.map((t) => `<tr data-entity="${esc(t.entity)}">
        <td><b>${esc(t.label)}</b><br><span class="ent">${esc(t.entity)}</span></td>
        <td><select class="col">${colOpts(guess.get(t.entity))}</select></td>
        <td class="ex"></td>
        <td><select class="unit">
          <option value="0.001">Wh</option><option value="1">kWh</option><option value="1000">MWh</option>
        </select></td>
        <td><select class="mode">
          <option value="interval">Energie je Zeitraum</option><option value="meter">Zählerstand</option>
        </select></td>
      </tr>`).join('');
    for (const tr of this.#els.tbody.querySelectorAll('tr')) {
      const sel = tr.querySelector('.col');
      sel.addEventListener('change', () => this.#syncRow(tr));
      this.#syncRow(tr);
    }
  }

  /** Beispiel, Einheit und Art zur gewählten Spalte vorbelegen. */
  #syncRow(tr) {
    const info = this.#cols.get(Number(tr.querySelector('.col').value));
    const on = tr.querySelector('.col').value !== '' && !!info;
    tr.classList.toggle('off', !on);
    tr.querySelector('.ex').textContent = on ? info.example : '';
    tr.querySelector('.unit').disabled = !on;
    tr.querySelector('.mode').disabled = !on;
    if (on) {
      tr.querySelector('.unit').value = String(info.factor);
      tr.querySelector('.mode').value = info.mode;
    }
  }

  async #check() {
    const msg = this.#els.importMsg;
    setMsg(msg, ''); msg.textContent = 'Wird geprüft …';
    const { rows, timeCol } = this.#csv;
    const byEntity = new Map();
    for (const tr of this.#els.tbody.querySelectorAll('tr')) {
      const entity = tr.dataset.entity;
      const col = tr.querySelector('.col').value;
      if (!entity || col === '') continue;
      const hourly = toHourly(rows, timeCol, Number(col), {
        mode: tr.querySelector('.mode').value,
        factor: Number(tr.querySelector('.unit').value),
      });
      const acc = byEntity.get(entity) ?? new Map();
      for (const h of hourly) acc.set(h.start, (acc.get(h.start) ?? 0) + h.kwh);
      byEntity.set(entity, acc);
    }
    if (!byEntity.size) {
      setMsg(msg, 'err'); msg.textContent = 'Bitte mindestens einem Zähler eine Spalte der Datei zuweisen.';
      return;
    }
    const schutz = protectRange(this.#els.keepFrom.value, this.#els.keepTo.value);
    const modus = this.#els.overlap.value;
    let plan = [];
    try {
      // Erst die Stundenreihen rechnen – das geht ohne Home Assistant
      const reihen = [];
      for (const [entity, acc] of byEntity) {
        const roh = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([start, kwh]) => ({ start, kwh }));
        if (!roh.length) continue;
        // Die Datei bestimmt den Zeitraum vollständig – Stunden ohne Wert
        // werden auf 0 gesetzt, nicht stehen gelassen.
        const hourly = fillGaps(roh);
        reihen.push({ entity, hourly, leer: hourly.length - roh.length });
      }
      if (!reihen.length) throw new Error('keine Werte');

      // Eine Abfrage für alle Zähler statt einer je Zähler
      const spanneVon = Math.min(...reihen.map((r) => r.hourly[0].start));
      const spanneBis = Math.max(...reihen.map((r) => r.hourly[r.hourly.length - 1].start));
      msg.textContent = 'Vorhandene Werte werden gelesen …';
      const vorhandenAlle = await existingHoursMany(
        this.#hass, reihen.map((r) => r.entity), spanneVon, spanneBis,
      );

      // Die Zähler hängen nicht voneinander ab – also nebeneinander rechnen
      msg.textContent = 'Anschluss wird gesucht …';
      plan = await Promise.all(reihen.map(async ({ entity, hourly, leer }) => {
        const vorhanden = vorhandenAlle.get(entity) ?? new Set();
        const { bloecke, geschuetzt, behalten, ersetzt } = planBlocks(hourly, { schutz, vorhanden, modus });

        // Jeder Block hängt sich für sich an die vorhandenen Summen an.
        const teile = await Promise.all(bloecke.map(async (block) => {
          const von = block[0].start;
          const bis = block[block.length - 1].start;
          const [vorher, nachher] = await Promise.all([
            statSumBefore(this.#hass, entity, von),
            statAfter(this.#hass, entity, bis + HOUR),
          ]);
          const b = buildStats(block, { vorher, nachher });
          // Steht der Block zwischen zwei festen Summen, muss die Rechnung
          // aufgehen. Tut sie es nicht, landet der Rest in der ersten
          // geschriebenen Stunde – das gehört vorher gesagt.
          const naht = vorher !== null && nachher
            ? ((Number(nachher.sum) || 0) - (Number(nachher.change) || 0)) - vorher - b.kwh
            : 0;
          return { b, naht };
        }));

        const stats = teile.flatMap((t) => t.b.stats);
        const kwh = teile.reduce((a, t) => a + t.b.kwh, 0);
        const naht = teile.reduce((a, t) => a + t.naht, 0);
        const label = this.#targets.find((t) => t.entity === entity)?.label ?? entity;
        return {
          entity, label, stats, kwh, leer, geschuetzt, behalten, ersetzt,
          naht: Math.abs(naht) < 0.01 ? 0 : naht,
          from: bloecke[0]?.[0]?.start ?? null,
          to: bloecke.length ? bloecke[bloecke.length - 1].at(-1).start : null,
          bloecke: bloecke.length,
        };
      }));
    } catch (err) {
      setMsg(msg, 'err'); msg.textContent = `Prüfen fehlgeschlagen: ${err?.message ?? err}`;
      return;
    }
    const day = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '–');
    const zahl = (v, n = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: n });
    const std = (n) => `${n} Stunde${n === 1 ? '' : 'n'}`;
    this.#els.summary.hidden = false;
    this.#els.summary.innerHTML = plan.map((p) => {
      if (!p.stats.length) {
        return `<div><b>${esc(p.label)}</b>: nichts zu importieren`
          + `${p.geschuetzt ? ' – alles liegt im geschützten Zeitraum' : ''}`
          + `${p.behalten && !p.geschuetzt ? ' – überall stehen schon Werte, die behalten werden' : ''}</div>`;
      }
      const teile = [];
      if (p.ersetzt)    teile.push(`${std(p.ersetzt)} mit vorhandenen Werten werden <b>ersetzt</b>`);
      if (p.behalten)   teile.push(`${std(p.behalten)} bleiben, weil dort schon Werte stehen`);
      if (p.geschuetzt) teile.push(`${std(p.geschuetzt)} liegen im <b>geschützten Zeitraum</b> und bleiben unangetastet`);
      if (p.leer)       teile.push(`${std(p.leer)} ohne Wert in der Datei werden auf 0 gesetzt`);
      if (p.naht)       teile.push(`an der Nahtstelle bleibt eine Differenz von ${zahl(p.naht, 2)} kWh, die in der ersten geschriebenen Stunde landet`);
      return `<div><b>${esc(p.label)}</b>: ${zahl(p.kwh)} kWh vom ${day(p.from)} bis ${day(p.to)}`
        + `${p.bloecke > 1 ? ` in ${p.bloecke} Abschnitten` : ''}`
        + `${teile.length ? ` · ${teile.join(' · ')}` : ''}</div>`;
    }).join('');
    this.#plan = plan.filter((p) => p.stats.length);
    this.#els.go.hidden = !this.#plan.length;
    if (this.#plan.length) { msg.textContent = ''; return; }
    // Nichts zu schreiben kann zwei Gründe haben – der Unterschied ist wichtig
    const geblockt = plan.some((p) => p.geschuetzt || p.behalten);
    setMsg(msg, geblockt ? '' : 'err');
    msg.textContent = geblockt
      ? 'Es bleibt nichts zu schreiben: Alles aus der Datei liegt im geschützten Zeitraum oder hat schon Werte, die behalten werden sollen.'
      : 'In der Datei stehen für die gewählten Spalten keine Werte.';
  }

  /** Die angehakten Zähler. */
  #wipeAuswahl() {
    return [...this.#els.wipeList.querySelectorAll('input:checked')].map((c) => c.value);
  }

  async #wipe() {
    this.#els.wipeConfirm.hidden = true;
    const msg = this.#els.wipeMsg;
    const ids = this.#wipeAuswahl();
    if (!ids.length || isReadOnly()) return;
    const namen = ids.map((id) => this.#targets.find((t) => t.entity === id)?.label ?? id);
    setMsg(msg, ''); msg.textContent = 'Wird geleert …';
    try {
      await clearStats(this.#hass, ids);
      // Ein geprüfter Plan gehört jetzt zu einem Stand, den es nicht mehr gibt
      this.#plan = null;
      this.#els.summary.hidden = true;
      this.#els.go.hidden = true;
      this.#els.wipeList.querySelectorAll('input:checked').forEach((c) => { c.checked = false; });
      setMsg(msg, 'ok');
      msg.textContent = `Geleert: ${namen.join(', ')}. Jetzt neu importieren, ältestes Jahr zuerst.`;
    } catch (err) {
      setMsg(msg, 'err');
      msg.textContent = `Leeren fehlgeschlagen: ${err?.message ?? err}`;
    }
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
