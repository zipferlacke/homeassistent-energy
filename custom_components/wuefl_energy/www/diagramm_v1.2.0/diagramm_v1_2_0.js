/**
 * diagramm.js – Zeitreihen-Diagramm mit Titel, Chips, Legende und Vollbild
 * ============================================================================
 *
 * Ein Diagramm besteht aus drei Teilen, die sich einzeln austauschen lassen:
 *
 *   Rahmen    Titel, Chips, Legende, Vollbild-Schalter, Icons   ← dieses Modul
 *   Renderer  wer die fertige Option zeichnet                   ← austauschbar
 *   Quelle    woher die Zahlen kommen                           ← austauschbar
 *
 * Der Rahmen und die ganze Rechnerei – Auflösung wählen, Werte in Töpfe
 * zusammenfassen, Einheiten umrechnen, Option bauen – sind überall gleich.
 * Unterschiedlich ist nur, womit gezeichnet und woher geholt wird. Auf einer
 * Webseite ist das ECharts und eine SQL-Abfrage, in Home Assistant dessen
 * `ha-chart-base` und die Langzeitstatistik.
 *
 * ── Kürzester Weg ───────────────────────────────────────────────────────────
 *   import * as echarts from 'echarts';
 *   import { Diagramm } from './diagramm.js';
 *   import { echartsRenderer } from './renderer-echarts.js';
 *
 *   const d = new Diagramm(document.querySelector('#box'), {
 *     renderer: echartsRenderer(echarts),
 *     source: async (keys, start, end, stufe) => ({ ... }),
 *   });
 *   d.setConfig({ title: 'Batterie', series: [{ key: 'soc', name: 'Ladestand' }] });
 *
 * ── Die Quelle ──────────────────────────────────────────────────────────────
 * Eine Funktion (keys, start, end, stufe) → { key: zeilen[] }. `stufe` ist
 * einer der Namen aus STUFEN ('5minute' | 'hour' | 'day' | 'month'), `keys`
 * sind die Bezeichner aus der Konfiguration – was sie bedeuten, entscheidet
 * die Quelle: Entitäten, Spaltennamen, Messpunkte. Eine Zeile ist
 *   { start, change?, mean?, min?, max? }
 * mit `start` als Zeitstempel (ms oder ISO-Text).
 *
 * In SQL wird daraus ein GROUP BY über den Zeitstempel, in Home Assistant ein
 * Aufruf von recorder/statistics_during_period. Das Diagramm fragt immer
 * zuerst die feinste sinnvolle Stufe an und geht gröber, bis eine den
 * Zeitraum wirklich abdeckt – so sieht man auch dort etwas, wo es keine
 * feinen Werte (mehr) gibt.
 *
 * ── Konfiguration ───────────────────────────────────────────────────────────
 * setConfig() nimmt ein Objekt oder JSON als Text. Für YAML einmal einen
 * Parser anmelden (z. B. js-yaml), dann versteht parseConfig() auch den:
 *   import { setYamlParser } from './diagramm.js';
 *   setYamlParser(jsyaml.load);
 *
 * ── Icons ───────────────────────────────────────────────────────────────────
 * Default sind reine UTF-8-Zeichen, keine Icon-Schrift nötig. setIcons() nimmt
 * einen Set-Namen oder eine eigene Map; was darin fehlt, bleibt beim Default.
 *   setIcons('default-msr');
 *   setIcons({ fullscreen: '<ha-icon icon="mdi:fullscreen"></ha-icon>' });
 */

import { onPicker } from './picker_v1_2_0.js';

/* ══════════════════════════════════════════════════════════════════════════
   Icons
   ══════════════════════════════════════════════════════════════════════════ */

/** Verwendete Schlüssel: fullscreen fullscreenExit */
export const ICON_SETS = {
  'default-utf8': {
    fullscreen: '⛶',
    fullscreenExit: '✕',
  },
  'default-msr': {
    fullscreen: '<span class="msr">fullscreen</span>',
    fullscreenExit: '<span class="msr">fullscreen_exit</span>',
  },
};

const ICON_KEYS = Object.keys(ICON_SETS['default-utf8']);
let ICO = { ...ICON_SETS['default-utf8'] };

/** Icon-Set wechseln – wirkt sofort auf alle bereits gezeichneten Diagramme. */
export function setIcons(icons) {
  let map = icons;
  if (typeof icons === 'string') {
    map = ICON_SETS[icons] || ICON_SETS[`default-${icons}`];
    if (!map) {
      console.warn(`[diagramm] Unbekanntes Icon-Set "${icons}" – erlaubt sind `
        + `${Object.keys(ICON_SETS).map((k) => `"${k}"`).join(', ')} oder eine eigene Map.`);
      return;
    }
  }
  if (!map || typeof map !== 'object') {
    console.warn('[diagramm] setIcons() erwartet einen Set-Namen oder eine Map.');
    return;
  }
  const unknown = Object.keys(map).filter((k) => !ICON_KEYS.includes(k));
  if (unknown.length) {
    console.warn(`[diagramm] Unbekannte Icon-Schlüssel: ${unknown.join(', ')} – `
      + `erlaubt sind ${ICON_KEYS.join(', ')}.`);
  }
  ICO = { ...ICO, ...map };
  paintIcons(document);
}

/** Aktuelles Set auslesen (Kopie). */
export function getIcons() { return { ...ICO }; }

/** Alle Icon-Spans neu befüllen, auch die in Vollbild-Dialogen. */
function paintIcons(root) {
  root.querySelectorAll?.('[data-dg-ico]').forEach((el) => {
    const key = el.dataset.dgIco;
    if (key in ICO && el.innerHTML !== ICO[key]) el.innerHTML = ICO[key];
  });
}

// Set schon beim Import wählbar:  ./diagramm.js?icons=msr
(() => {
  try {
    const v = new URL(import.meta.url).searchParams.get('icons');
    if (v) setIcons(v.trim().toLowerCase());
  } catch { /* nichts zu tun */ }
})();

/* ══════════════════════════════════════════════════════════════════════════
   Konfiguration
   ══════════════════════════════════════════════════════════════════════════ */

let yamlParser = null;

/** YAML-Parser anmelden, z. B. setYamlParser(jsyaml.load). */
export function setYamlParser(fn) { yamlParser = typeof fn === 'function' ? fn : null; }

/**
 * Konfiguration aus Objekt, JSON oder YAML.
 *
 * JSON wird immer verstanden. YAML nur, wenn vorher ein Parser angemeldet
 * wurde – einen eigenen mitzuliefern wäre größer als das ganze Modul.
 */
export function parseConfig(input) {
  if (input && typeof input === 'object') return input;
  const text = String(input ?? '').trim();
  if (!text) return {};
  try { return JSON.parse(text); } catch { /* dann YAML versuchen */ }
  if (yamlParser) {
    const out = yamlParser(text);
    if (out && typeof out === 'object') return out;
  }
  throw new Error('Konfiguration ist weder gültiges JSON noch (mit angemeldetem Parser) YAML.');
}

/* ══════════════════════════════════════════════════════════════════════════
   Auflösung: fragen statt schätzen
   ══════════════════════════════════════════════════════════════════════════ */

/** Was eine Quelle anbieten kann – von fein nach grob. */
export const STUFEN = [
  { name: '5minute', ms: 300_000 },
  { name: 'hour', ms: 3_600_000 },
  { name: 'day', ms: 86_400_000 },
  { name: 'month', ms: 2_592_000_000 },
];

const STUNDE = 3_600_000;
const TAG = 86_400_000;

/** Ab welcher Abdeckung des Zeitraums eine Stufe als brauchbar gilt. */
const GENUG = 0.9;

function startStufe(wunschMs) {
  let i = 0;
  for (let k = 0; k < STUFEN.length; k += 1) if (STUFEN[k].ms <= wunschMs) i = k;
  return i;
}

const zeitVon = (r) => (typeof r.start === 'number' ? r.start : Date.parse(r.start));

/**
 * Wie viel vom Zeitraum die Antwort belegt.
 *
 * Nur zu prüfen, ob überhaupt Zeilen kamen, reicht nicht: Beim Blick auf eine
 * Woche liegen für die letzten zwei Tage feine Werte vor und davor nichts.
 * Die Antwort wäre nicht leer, aber fünf Siebtel der Woche fehlten.
 */
function abdeckung(antwort, start, end, stufeMs) {
  const spanne = Math.max(1, +end - +start);
  let beste = 0;
  for (const zeilen of Object.values(antwort ?? {})) {
    if (!zeilen?.length) continue;
    const zeiten = zeilen.map(zeitVon).filter(Number.isFinite);
    if (!zeiten.length) continue;
    const von = Math.min(...zeiten), bis = Math.max(...zeiten) + stufeMs;
    beste = Math.max(beste, (Math.min(bis, +end) - Math.max(von, +start)) / spanne);
  }
  return Math.min(1, Math.max(0, beste));
}

/**
 * Daten holen, so fein wie die Quelle diesen Zeitraum wirklich führt.
 * → { zeilen, stufe, stufeMs, rasterMs, abdeckung }
 */
export async function getData(source, keys, start, end, wunschMs) {
  const liste = [...keys];
  if (!liste.length || typeof source !== 'function') {
    return { zeilen: {}, stufe: null, stufeMs: 0, rasterMs: wunschMs, abdeckung: 0 };
  }
  let bestes = null;
  for (let i = startStufe(wunschMs); i < STUFEN.length; i += 1) {
    const stufe = STUFEN[i];
    const zeilen = await source(liste, start, end, stufe.name);
    const deckt = abdeckung(zeilen, start, end, stufe.ms);
    const treffer = {
      zeilen, stufe: stufe.name, stufeMs: stufe.ms,
      rasterMs: Math.max(wunschMs, stufe.ms), abdeckung: deckt,
    };
    if (deckt >= GENUG) return treffer;
    if (!bestes || deckt > bestes.abdeckung) bestes = treffer;
  }
  return bestes;
}

/* ══════════════════════════════════════════════════════════════════════════
   Zeitraum und Töpfe
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Zeitraum aus der Konfiguration.
 *
 * `start`/`end` gewinnen immer. Sonst beschreibt `range` einen kalendergenauen
 * Zeitraum ('1d' = heute ab 0 Uhr, '1m' = dieser Monat) oder, mit "last"
 * davor, ein rollendes Fenster ab jetzt zurück ('last 7d').
 */
export function zeitraum(range, start, end) {
  if (start && end) return { start: new Date(start), end: new Date(end) };
  const now = new Date();
  let s = new Date(), e = new Date();
  const m = String(range || '1d').trim().match(/^(last)?\s*(\d+)?\s*(min|h|d|w|m|y)$/i);
  if (!m) return { start: s, end: e };
  const rollend = !!m[1];
  const n = parseInt(m[2] || '1', 10);
  const u = m[3].toLowerCase();

  if (u === 'min' || u === 'h' || rollend) {
    e = new Date(+now);
    s = new Date(+now);
    if (u === 'min') s.setMinutes(now.getMinutes() - n);
    else if (u === 'h') s.setHours(now.getHours() - n);
    else if (u === 'd') s.setDate(now.getDate() - n);
    else if (u === 'w') s.setDate(now.getDate() - n * 7);
    else if (u === 'm') s.setMonth(now.getMonth() - n);
    else if (u === 'y') s.setFullYear(now.getFullYear() - n);
    return { start: s, end: e };
  }
  if (u === 'd') {
    s.setHours(0, 0, 0, 0); s.setDate(now.getDate() - (n - 1));
    e.setHours(23, 59, 59, 999);
  } else if (u === 'w') {
    const wt = now.getDay() || 7;             // Montag = 1
    s.setHours(0, 0, 0, 0); s.setDate(now.getDate() - (wt - 1) - (n - 1) * 7);
    e = new Date(+s); e.setDate(s.getDate() + n * 7 - 1); e.setHours(23, 59, 59, 999);
  } else if (u === 'm') {
    s = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (u === 'y') {
    s = new Date(now.getFullYear() - (n - 1), 0, 1);
    e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  return { start: s, end: e };
}

/** '10min' | '2h' | '1d' | '1m' → { ms, unit, val } */
export function rasterAus(spec, range) {
  if (typeof spec === 'number') return { ms: spec, unit: 'ms', val: spec };
  let s = spec;
  if (!s) {
    if (range === '1d') s = '10min';
    else if (range === '1w' || range === '1m') s = '1d';
    else if (range === '1y') s = '1m';
    else s = '1h';
  }
  const m = String(s).trim().match(/^(\d+)?\s*(min|h|d|w|m|y)$/i);
  if (!m) return { ms: parseInt(s, 10) || STUNDE, unit: 'h', val: 1 };
  const val = parseInt(m[1] || '1', 10);
  const unit = m[2].toLowerCase();
  const ms = { min: 60_000, h: STUNDE, d: TAG, w: 7 * TAG, m: 30 * TAG, y: 365 * TAG }[unit] * val;
  return { ms, unit, val };
}

/** Wunschraster auf das anheben, was die Quelle hergibt. */
export function rasterAusQuelle(raster, stufeMs) {
  if (!stufeMs || stufeMs <= raster.ms) return raster;
  if (stufeMs <= STUNDE) return { ms: STUNDE, unit: 'h', val: 1 };
  if (stufeMs <= TAG) return { ms: TAG, unit: 'd', val: 1 };
  return { ms: stufeMs, unit: 'm', val: 1 };
}

/**
 * Beginn des Topfs, in den `t` fällt.
 *
 * Ausgerichtet an der lokalen Zeit ab `origin`, nicht an UTC – sonst beginnt
 * ein Tages-Topf östlich von Greenwich mitten in der Nacht davor und alle
 * Werte rutschen einen Tag.
 */
function topfKey(t, raster, origin) {
  const d = new Date(t);
  if (raster.unit === 'm' || raster.unit === 'y') {
    const monate = raster.unit === 'y' ? 12 * raster.val : raster.val;
    const idx = (d.getFullYear() - origin.getFullYear()) * 12 + d.getMonth() - origin.getMonth();
    return new Date(origin.getFullYear(), origin.getMonth() + Math.floor(idx / monate) * monate, 1).getTime();
  }
  if (raster.unit === 'd' || raster.unit === 'w') {
    const tage = raster.unit === 'w' ? 7 * raster.val : raster.val;
    const tagStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const o = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate());
    const idx = Math.round((tagStart - o) / TAG);
    return new Date(o.getFullYear(), o.getMonth(), o.getDate() + Math.floor(idx / tage) * tage).getTime();
  }
  return origin.getTime() + Math.floor((t - origin.getTime()) / raster.ms) * raster.ms;
}

function naechsterTopf(key, raster) {
  const d = new Date(key);
  if (raster.unit === 'm') return new Date(d.getFullYear(), d.getMonth() + raster.val, 1).getTime();
  if (raster.unit === 'y') return new Date(d.getFullYear() + raster.val, d.getMonth(), 1).getTime();
  if (raster.unit === 'd') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + raster.val).getTime();
  if (raster.unit === 'w') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * raster.val).getTime();
  return key + raster.ms;
}

/**
 * Ab welchem Rückschritt ein Zähler als zurückgesetzt gilt.
 *
 * Maßstab ist, was dieser Wert im Zeitraum normalerweise in einem Schritt
 * schafft. Ein Leseversatz bleibt weit darunter, ein kaputter Zählerstand
 * liegt weit darüber – und den nach vorn zu verrechnen legt alles Folgende
 * lahm. Ohne brauchbaren Maßstab wird nichts verschluckt.
 */
function rueckfallGrenze(rows) {
  const pos = (rows ?? []).map((r) => Number(r.change))
    .filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (pos.length < 4) return Infinity;
  return pos[Math.floor(pos.length * 0.9)] * 3;
}

/**
 * Zeilen aufbereiten: Rückschritte verrechnen, verspätete Schritte verteilen.
 *
 * Ein Zähler zählt in festen Schritten. Bei kleiner Last steht deshalb
 * minutenlang 0 und dann kommt der ganze Schritt auf einmal – verbraucht
 * wurde aber die ganze Zeit über. Ein einzelner Schritt nach einer Nullstrecke
 * wird daher gleichmäßig über sie verteilt; größere Sprünge bleiben, wo sie
 * sind, und die Summe ändert sich nie.
 */
export function prepareRows(rows, isMean, onlyPositive, now = Date.now()) {
  const out = [];
  let carry = 0;
  const grenze = isMean || !onlyPositive ? Infinity : rueckfallGrenze(rows);

  for (const row of rows ?? []) {
    const t = zeitVon(row);
    if (!Number.isFinite(t) || t > now) continue;
    let value = Number(isMean ? (row.mean ?? row.state ?? row.value) : row.change);
    if (!Number.isFinite(value)) continue;
    if (onlyPositive && !isMean) {
      if (value < -grenze) { carry = 0; out.push([t, 0]); continue; }
      value += carry;
      carry = value < 0 ? value : 0;
      if (value < 0) value = 0;
    }
    out.push([t, value]);
  }

  if (isMean || !onlyPositive || out.length < 4) return out;
  const positives = out.map(([, v]) => v).filter((v) => v > 0.0001).sort((a, b) => a - b);
  if (positives.length < 4) return out;
  const quantum = positives[Math.floor(positives.length * 0.1)];
  const MAX_RUN = 12;
  let zeros = 0;
  for (let i = 0; i < out.length; i += 1) {
    const v = out[i][1];
    if (v <= 0.0001) { zeros += 1; continue; }
    if (zeros > 0 && zeros <= MAX_RUN && v <= quantum * 1.5) {
      const teil = v / (zeros + 1);
      for (let k = i - zeros; k <= i; k += 1) out[k][1] = teil;
    }
    zeros = 0;
  }
  return out;
}

/**
 * Zeilen in Töpfe zusammenfassen.
 *
 * Vergangene Töpfe ohne Daten bekommen bei Zählern eine 0 – da wurde
 * nachweislich nichts verbraucht. Bei Mittelwerten ist „keine Daten“ etwas
 * anderes als 0, dort bleibt es leer. Töpfe in der Zukunft entstehen gar
 * nicht erst.
 */
export function bucketize(rows, raster, statType = 'change', start = null, end = null, onlyPositive = false) {
  const toepfe = new Map();
  const origin = start ?? new Date(0);
  const now = Date.now();
  const isMean = statType === 'mean';

  if (start && end) {
    const last = Math.min(+end, now);
    for (let k = topfKey(+start, raster, origin); k <= last; k = naechsterTopf(k, raster)) {
      toepfe.set(k, { sum: 0, count: 0 });
    }
  }
  for (const [t, value] of prepareRows(rows, isMean, onlyPositive, now)) {
    const key = topfKey(t, raster, origin);
    const b = toepfe.get(key) ?? { sum: 0, count: 0 };
    b.sum += value; b.count += 1;
    toepfe.set(key, b);
  }
  return [...toepfe.entries()].sort((a, b) => a[0] - b[0])
    .map(([t, b]) => [t, isMean ? (b.count > 0 ? b.sum / b.count : null) : b.sum]);
}

/* ══════════════════════════════════════════════════════════════════════════
   Einheiten und Farben
   ══════════════════════════════════════════════════════════════════════════ */

const EINHEITEN = {
  mW: 1e-3, W: 1, kW: 1e3, MW: 1e6, GW: 1e9,
  mWh: 1e-3, Wh: 1, kWh: 1e3, MWh: 1e6, GWh: 1e9,
};

/** Faktor von einer Einheit in die andere, 1 wenn unbekannt. */
export function skalierung(von, nach) {
  if (!von || !nach || von === nach) return 1;
  const a = EINHEITEN[von], b = EINHEITEN[nach];
  return a && b ? a / b : 1;
}

/** CSS-Variablen auflösen, damit auch der Tooltip die echte Farbe kennt. */
function farbe(el, wert, rueckfall = '#888888') {
  if (!wert) return rueckfall;
  let c = String(wert).trim();
  let tiefe = 0;
  while (c.startsWith('var(') && tiefe < 5) {
    const name = c.slice(4, c.indexOf(',') > -1 ? c.indexOf(',') : -1).trim();
    const gelesen = getComputedStyle(el).getPropertyValue(name).trim();
    if (!gelesen) { c = c.includes(',') ? c.slice(c.indexOf(',') + 1, -1).trim() : '#888888'; break; }
    c = gelesen; tiefe += 1;
  }
  return c || '#888888';
}

/** Farbe mit Deckkraft – über canvas, damit auch Namen, hsl() und oklch() gehen. */
export function mitAlpha(c, alpha) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = c;
    const res = ctx.fillStyle;
    if (res.startsWith('#')) {
      let hex = res.slice(1);
      if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (res.startsWith('rgb')) return res.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  } catch { /* dann eben ohne */ }
  return c;
}

const nf = (v, stellen = 2) => Number(v).toLocaleString(undefined, { maximumFractionDigits: stellen });

/* ══════════════════════════════════════════════════════════════════════════
   ECharts-Option
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Aus fertig aufbereiteten Reihen die Option bauen.
 *
 * Bewusst getrennt vom Rest: Wer einen anderen Renderer schreibt, bekommt
 * genau dieses Objekt und entscheidet selbst, was er damit macht.
 */
export function buildOption(reihen, achsen, start, end, raster, cfg, host, zustand = {}) {
  const { voll = false, zoom = false } = zustand;
  const gesamt = reihen.length;
  const balken = reihen.some((s) => (s.type || cfg.type || 'line') === 'bar');

  const series = reihen.map((s, i) => {
    const typ = s.type || cfg.type || 'line';
    let areaStyle;
    if (typ === 'line') {
      if (s.fill === 'gradient' && s.stack) {
        // Gestapelt sind die Flächen Schichten übereinander. Mit einem Verlauf
        // ins Durchsichtige verschwimmen sie, deshalb hier eine glatte Füllung.
        areaStyle = { color: mitAlpha(s.farbe, 0.45) };
      } else if (s.fill === 'gradient') {
        areaStyle = { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: mitAlpha(s.farbe, 0.5) },
          { offset: 1, color: mitAlpha(s.farbe, 0.05) }] } };
      } else if (s.fill === 'soft') {
        areaStyle = { color: mitAlpha(s.farbe, 0.12) };
      } else if (s.fill !== false && s.fill !== undefined) {
        areaStyle = { opacity: 0.25 };
      }
    }
    return {
      name: s.legend_group || s.name || s.key,
      id: s.name || s.key,
      type: typ,
      stack: s.stack,
      // Innerhalb eines Stapels haben alle Reihen dasselbe Vorzeichen. Ohne
      // diese Angabe entscheidet ECharts bei einer 0 selbst, auf welche Seite
      // der Nulllinie sie gehört.
      ...(s.stack ? { stackStrategy: 'all' } : {}),
      yAxisIndex: s.y_axis || 0,
      data: s.versteckt ? [] : s.punkte,
      symbol: 'none',
      smooth: typ === 'line' ? (s.smooth ?? true) : undefined,
      ...(typ === 'line' && (s.smooth ?? true) ? { smoothMonotone: 'x' } : {}),
      ...(typ === 'line' && s.step ? { step: s.step } : {}),
      z: s.background ? 1 : s.stack ? gesamt + 1 - i : 2,
      itemStyle: { color: s.farbe },
      areaStyle,
      lineStyle: typ === 'line'
        ? { width: 1.5, ...(s.dashed ? { type: 'dashed', opacity: 0.8 } : {}) } : undefined,
      // Zwei Stapel – Erzeugung oben, Verbrauch unten – sollen übereinander
      // stehen, nicht nebeneinander. Wo Reihen nebeneinander gehören, etwa
      // eine Summe neben ihren Teilen, schaltet bar_overlap: false das ab.
      ...(typ === 'bar' ? {
        barCategoryGap: '25%', barMaxWidth: 48,
        ...(cfg.bar_overlap === false ? {} : { barGap: '-100%' }),
      } : {}),
    };
  });

  const textFarbe = getComputedStyle(host).getPropertyValue('--dg-text-soft').trim() || '#777';
  const linienFarbe = getComputedStyle(host).getPropertyValue('--dg-line').trim() || '#e0e0e0';
  const ueberJahre = start.getFullYear() !== end.getFullYear();

  return {
    animation: false,
    // Oben Platz für den Namen der Y-Achse – ohne den schneidet ECharts ihn
    // an der Gitterkante ab und aus "kWh" wird "kWn".
    // Mit `axis_width` bekommt die Y-Achse eine feste Breite. Nur so stehen
    // mehrere gekoppelte Diagramme untereinander wirklich bündig – sonst
    // richtet sich jedes nach der Breite seiner eigenen Zahlen.
    grid: cfg.axis_width
      ? { left: cfg.axis_width, right: 8, top: achsen.some((a) => a.unit) ? 28 : 12, bottom: 22 }
      : { left: 8, right: 8, top: achsen.some((a) => a.unit) ? 28 : 12, bottom: 4, containLabel: true },
    xAxis: [{
      type: 'time', min: +start, max: +end,
      axisLine: { lineStyle: { color: linienFarbe } },
      axisLabel: { color: textFarbe, hideOverlap: true, formatter: zeitFormat(raster, ueberJahre) },
      splitLine: { show: raster.ms >= TAG, lineStyle: { color: linienFarbe, opacity: .6 } },
    }],
    yAxis: achsen.map((ax, i) => ({
      type: 'value', name: ax.unit || '',
      min: ax.min, max: ax.max,
      ...(ax.interval !== undefined ? { interval: ax.interval } : {}),
      ...(ax.split_number !== undefined ? { splitNumber: ax.split_number } : {}),
      position: i === 1 ? 'right' : 'left',
      nameLocation: 'end', nameGap: 12,
      nameTextStyle: { color: textFarbe, align: i === 1 ? 'right' : 'left', padding: [0, 0, 0, 0] },
      axisLabel: { color: textFarbe },
      splitLine: { show: i === 0, lineStyle: { color: linienFarbe, opacity: .6 } },
    })),
    // Zoomen und Schieben per Geste erst nach einem Klick ins Diagramm –
    // sonst bleibt auf dem Handy jede Wischbewegung hängen, statt die Seite
    // zu scrollen.
    dataZoom: [{ type: 'inside', disabled: !zoom, filterMode: 'none' }],
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: balken ? 'shadow' : 'line' },
      // In einer Karte ist wenig Platz: Der Kasten sitzt an der Linie am
      // oberen oder unteren Rand – auf der Seite, wo der Finger nicht ist.
      // Im Vollbild ist Platz genug, dort folgt er dem Zeiger.
      ...(voll ? {} : {
        position: (punkt, params, dom, rect, groesse) => {
          const [b, h] = groesse.viewSize;
          const [kb, kh] = groesse.contentSize;
          return [Math.min(Math.max(punkt[0] - kb / 2, 0), Math.max(0, b - kb)),
            punkt[1] > h / 2 ? 0 : Math.max(0, h - kh)];
        },
      }),
      formatter: (params) => tooltip(params, reihen, raster, achsen),
    },
    series,
  };
}

/** Beschriftung der Zeitachse, passend zur Topfgröße. */
function zeitFormat(raster, ueberJahre) {
  if (raster.unit === 'm' || raster.unit === 'y') return (v) => new Date(v).toLocaleDateString(undefined, { month: 'short', year: ueberJahre ? '2-digit' : undefined });
  if (raster.ms >= TAG) return (v) => new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  if (raster.ms >= STUNDE) return (v) => new Date(v).toLocaleString(undefined, { weekday: 'short', hour: '2-digit' });
  return (v) => new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Tooltip mit Zeitspanne des Topfs und Summe darunter. */
function tooltip(params, reihen, raster, achsen) {
  const liste = Array.isArray(params) ? params : [params];
  if (!liste.length) return '';
  const t = liste[0].value?.[0] ?? liste[0].axisValue;
  const von = new Date(t);
  const bis = new Date(naechsterTopf(+von, raster));
  const lang = raster.ms >= TAG;
  const kopf = lang
    ? (raster.unit === 'm'
      ? von.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : von.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }))
    : `${von.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} – `
      + `${bis.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  const zeilen = liste.filter((p) => p.value?.[1] !== null && p.value?.[1] !== undefined).map((p) => {
    const s = reihen.find((r) => (r.legend_group || r.name || r.key) === p.seriesName);
    const einheit = s?.einheit ?? achsen[s?.y_axis || 0]?.unit ?? '';
    const punkt = `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:9px;height:9px;background:${p.color}"></span>`;
    return `<div style="display:flex;gap:10px;justify-content:space-between">
      <span>${punkt}${p.seriesName}</span><b>${nf(Math.abs(p.value[1]))} ${einheit}</b></div>`;
  });
  return `<div style="font-weight:600;margin-bottom:4px">${kopf}</div>${zeilen.join('')}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Das Diagramm
   ══════════════════════════════════════════════════════════════════════════ */

const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Diagramm {
  #host; #renderer; #source; #els = {}; #griff = null;
  #cfg = {}; #reihen = []; #aus = new Set(); #seq = 0; #ro = null; #fs = null; #heimat = null;
  #voll = false; #zoomAn = false; #ausserhalb = null;
  #pickerAb = null; #pickerRange = null;

  /**
   * @param {Element} host      Element, in das gezeichnet wird
   * @param {object}  opts
   * @param {object}  opts.renderer  mount/draw/resize/destroy
   * @param {Function} opts.source   (keys, start, end, stufe) → { key: zeilen[] }
   * @param {object|string} [opts.icons]  Icon-Set nur für dieses Diagramm
   */
  constructor(host, { renderer, source, icons } = {}) {
    if (!host) throw new Error('[diagramm] Ohne Host-Element geht es nicht.');
    if (!renderer?.mount) throw new Error('[diagramm] Es fehlt der renderer.');
    this.#host = host;
    this.#renderer = renderer;
    this.#source = source;
    if (icons) setIcons(icons);
    this.#bauen();
  }

  /* ── Aufbau ─────────────────────────────────────────────────────────────── */

  #bauen() {
    const el = this.#host;
    el.classList.add('dg');
    el.innerHTML = `
      <div class="dg_head">
        <div class="dg_title"></div>
        <div class="dg_tools"></div>
      </div>
      <div class="dg_legend dg_top"></div>
      <div class="dg_plot"><div class="dg_legend dg_inner" hidden></div></div>
      <div class="dg_legend dg_bottom"></div>
      <div class="dg_note"></div>`;
    const q = (s) => el.querySelector(s);
    this.#els = {
      head: q('.dg_head'), title: q('.dg_title'), tools: q('.dg_tools'),
      top: q('.dg_top'), inner: q('.dg_inner'), bottom: q('.dg_bottom'),
      plot: q('.dg_plot'), note: q('.dg_note'),
    };
    this.#griff = this.#renderer.mount(this.#els.plot);

    el.addEventListener('click', () => this.#zoom(true));
    this.#ausserhalb = (e) => { if (!e.composedPath().includes(el)) this.#zoom(false); };
    window.addEventListener('pointerdown', this.#ausserhalb);

    // Jede Größenänderung erreicht den Renderer – das ist der Unterschied
    // zwischen „Vollbild sieht richtig aus“ und „Diagramm klebt oben“.
    this.#ro = new ResizeObserver(([e]) => {
      // Beim Umzug in den Dialog ist die Fläche kurz 0 – dann nicht messen,
      // sonst merkt sich ECharts die Null.
      if (e?.contentRect?.height > 0) this.#renderer.resize?.(this.#griff);
    });
    this.#ro.observe(this.#els.plot);
  }

  /* ── Öffentliche Schnittstelle ──────────────────────────────────────────── */

  /** Konfiguration setzen – Objekt, JSON oder (mit Parser) YAML. */
  setConfig(cfg) {
    this.#cfg = parseConfig(cfg);
    this.#aus.clear();
    this.#kopf();
    this.#anPicker();
    // Hängt es an einem Picker, kommt der Zeitraum von dort – und mit ihm
    // sofort ein refresh(). Zweimal laden muss deshalb niemand.
    if (!this.#cfg.picker) this.refresh();
    return this;
  }

  /**
   * An einen Zeitraum-Picker hängen.
   *
   * Steht `picker: '<id>'` in der Konfiguration, kommt der Zeitraum von dort
   * und `range`/`start`/`end` werden übergangen. Mehrere Diagramme mit
   * derselben id folgen demselben Picker, ohne voneinander zu wissen; die
   * Reihenfolge beim Bauen ist egal.
   */
  #anPicker() {
    this.#pickerAb?.();
    this.#pickerAb = null;
    this.#pickerRange = null;
    if (!this.#cfg.picker) return;
    this.#pickerAb = onPicker(this.#cfg.picker, (r) => {
      this.#pickerRange = r;
      this.refresh();
    });
  }

  get config() { return this.#cfg; }

  /** Quelle nachträglich wechseln. */
  setSource(source) { this.#source = source; this.refresh(); return this; }

  /** Neu laden und zeichnen. */
  async refresh() {
    const seq = ++this.#seq;
    const alt = () => seq !== this.#seq;
    const cfg = this.#cfg;
    if (!cfg?.series?.length) return;

    const { start, end } = this.#pickerRange ?? zeitraum(cfg.range, cfg.start, cfg.end);
    const wunsch = rasterAus(cfg.aggregation, cfg.range);
    const achsen = Array.isArray(cfg.y_axes) && cfg.y_axes.length
      ? cfg.y_axes : [{ unit: cfg.y_axis_unit || '' }];

    const keys = new Set(cfg.series.filter((s) => (s.key ?? s.entity) && !s.data)
      .map((s) => s.key ?? s.entity));
    for (const c of this.#chipsAus(cfg)) if (c.key) keys.add(c.key);

    this.#els.note.textContent = '';
    try {
      const quelle = await getData(this.#source, keys, start, end, wunsch.ms);
      if (alt()) return;
      const zeilen = quelle?.zeilen ?? {};
      const raster = rasterAusQuelle(wunsch, quelle?.stufeMs);

      // Ehrlich bleiben: Wenn es gröber wurde als gewünscht, steht das dran.
      if (quelle?.stufeMs > wunsch.ms) {
        this.#els.note.textContent = `Für diesen Zeitraum liegen nur Werte je `
          + `${stufenName(quelle.stufe)} vor – feiner lässt sich das nicht zeigen.`;
      }

      this.#reihen = cfg.series.map((s) => this.#reihe(s, zeilen, raster, achsen, start, end));
      this.#legende();
      this.#chips(zeilen, start, end, achsen);
      this.#renderer.draw(this.#griff,
        buildOption(this.#reihen, achsen, start, end, raster, cfg, this.#host,
        { voll: this.#voll, zoom: this.#zoomBereit() }));
      // Gekoppelte Diagramme teilen Fadenkreuz, Tooltip und Zoom
      if (cfg.group) this.#renderer.link?.(this.#griff, cfg.group);
      this.#renderer.resize?.(this.#griff);
    } catch (err) {
      if (alt()) return;
      this.#els.note.innerHTML = `<span class="dg_error">Fehler: ${html(err?.message ?? err)}</span>`;
    }
  }

  /** Vollbild von außen schalten. */
  toggleFullscreen(an) {
    const soll = an === undefined ? !this.#voll : !!an;
    if (soll === this.#voll) return;
    if (soll) this.#auf(); else this.#zu();
  }

  /** Läuft das Diagramm gerade im Vollbild? */
  get fullscreen() { return this.#voll; }

  destroy() {
    this.#seq += 1;
    this.#ro?.disconnect();
    if (this.#ausserhalb) window.removeEventListener('pointerdown', this.#ausserhalb);
    this.#pickerAb?.();
    this.#renderer.destroy?.(this.#griff);
    this.#fs?.remove();
    this.#host.replaceChildren();
    this.#host.classList.remove('dg');
  }

  /* ── Kopf: Titel, Chips, Vollbild ───────────────────────────────────────── */

  /**
   * Der Kopf steht immer, auch im Vollbild – vorher wurde für das Vollbild ein
   * zweites Diagramm ohne Titel gebaut, und Chips gab es dort gar keine.
   */
  #kopf() {
    const cfg = this.#cfg;
    // `card: false` nimmt dem Diagramm Hintergrund, Rand und Innenabstand –
    // dann sitzt es nackt in dem, was es umgibt.
    this.#host.classList.toggle('dg_nackt', cfg.card === false);
    this.#els.title.textContent = cfg.title ?? '';
    this.#els.tools.replaceChildren();
    // Platzhalter für die Chips – Farbe und Inhalt kommen mit den Daten
    for (const _ of this.#chipsAus(cfg)) {
      const chip = document.createElement('span');
      chip.className = 'dg_chip';
      chip.hidden = true;
      this.#els.tools.appendChild(chip);
    }
    if (cfg.fullscreen !== false) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dg_btn dg_fsbtn';
      btn.title = 'Vollbild';
      btn.setAttribute('aria-label', 'Diagramm im Vollbild öffnen');
      btn.innerHTML = `<span class="dg_glyph" data-dg-ico="fullscreen">${ICO.fullscreen}</span>`;
      btn.addEventListener('click', () => this.toggleFullscreen(true));
      this.#els.tools.appendChild(btn);
    }
    this.#els.head.hidden = !cfg.title && !this.#els.tools.children.length;
  }

  /** `chips: [...]`, `chip: {...}` – beides erlaubt, beliebig viele. */
  #chipsAus(cfg) {
    const roh = cfg.chips ?? cfg.chip;
    return (Array.isArray(roh) ? roh : roh ? [roh] : []).filter(Boolean);
  }

  #chips(zeilen, start, end, achsen) {
    const defs = this.#chipsAus(this.#cfg);
    const knoten = [...this.#els.tools.querySelectorAll('.dg_chip')];
    defs.forEach((c, i) => {
      const el = knoten[i];
      if (!el) return;
      const wert = c.value !== undefined ? Number(c.value) : this.#chipWert(c, zeilen);
      if (wert === null || !Number.isFinite(wert)) { el.hidden = true; return; }
      // Ohne eigene Angabe trägt ein Chip die Farbe der Reihe, zu der er
      // gehört – ein Chip zum Netzbezug soll aussehen wie der Netzbezug.
      const reihe = this.#reihen.find((r) => r.key === c.key);
      el.style.setProperty('--dg-chip-color', farbe(this.#host, c.color, reihe?.farbe ?? ''));
      const einheit = c.unit ?? reihe?.einheit ?? achsen[0]?.unit ?? '';
      el.hidden = false;
      el.innerHTML = (c.label ? `<span class="dg_chip_label">${html(c.label)}</span>` : '')
        + `${html(nf(wert, c.decimals ?? 2))}${einheit ? ` ${html(einheit)}` : ''}`;
    });
  }

  /** Ein Chip fasst den ganzen Zeitraum in einer Zahl zusammen. */
  #chipWert(c, zeilen) {
    const rows = zeilen?.[c.key] ?? [];
    if (!rows.length) return null;
    const art = c.calc ?? c.stat_type ?? 'sum';
    const werte = rows
      .map((r) => Number(art === 'sum' ? r.change : (r[art] ?? r.mean ?? r.change)))
      .filter(Number.isFinite);
    if (!werte.length) return null;
    if (art === 'sum') return werte.reduce((a, b) => a + b, 0);
    if (art === 'mean') return werte.reduce((a, b) => a + b, 0) / werte.length;
    if (art === 'max') return Math.max(...werte);
    if (art === 'min') return Math.min(...werte);
    if (art === 'last') return werte[werte.length - 1];
    return null;
  }

  /* ── Reihen und Legende ─────────────────────────────────────────────────── */

  #reihe(s, zeilen, raster, achsen, start, end) {
    const key = s.key ?? s.entity;
    const name = s.legend_group || s.name || key;
    const achse = achsen[s.y_axis || 0] ?? {};
    const c = farbe(this.#host, s.color);

    if (s.data) {
      return { ...s, key, farbe: c, versteckt: this.#aus.has(name),
        einheit: s.unit ?? achse.unit ?? '',
        punkte: s.data.filter(([t]) => t >= +start && t <= +end) };
    }
    const roh = zeilen?.[key] ?? [];
    const toepfe = bucketize(roh, raster, s.stat_type || 'change', start, end, !!s.only_positive);
    const faktor = (s.multiplier ?? 1) * skalierung(s.unit, achse.unit) * (s.sign ?? 1);
    return { ...s, key, farbe: c, versteckt: this.#aus.has(name),
      einheit: achse.unit ?? s.unit ?? '',
      punkte: toepfe.map(([t, v]) => [t, v === null ? null : v * faktor]) };
  }

  #legende() {
    const cfg = Array.isArray(this.#cfg.legend) ? this.#cfg.legend[0] : this.#cfg.legend;
    for (const el of [this.#els.top, this.#els.inner, this.#els.bottom]) el.replaceChildren();
    this.#els.inner.hidden = true;
    if (cfg?.hidden) return;

    const pos = cfg?.position ?? 'top-right';
    const innen = pos.startsWith('inner');
    const ziel = innen ? this.#els.inner : pos.includes('bottom') ? this.#els.bottom : this.#els.top;
    ziel.dataset.pos = pos;
    if (innen) this.#els.inner.hidden = false;

    const gesehen = new Set();
    for (const s of this.#reihen) {
      const name = s.legend_group || s.name || s.key;
      if (!name || gesehen.has(name)) continue;
      gesehen.add(name);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dg_item';
      item.setAttribute('aria-pressed', String(!this.#aus.has(name)));
      item.innerHTML = `<span class="dg_dot" style="background:${html(s.farbe)}"></span>${html(name)}`;
      item.addEventListener('click', () => {
        if (this.#aus.has(name)) this.#aus.delete(name); else this.#aus.add(name);
        this.refresh();
      });
      ziel.appendChild(item);
    }
  }

  /* ── Vollbild ───────────────────────────────────────────────────────────── */

  /**
   * Vollbild zeigt dasselbe Diagramm, nicht eine Kopie.
   *
   * Vorher wurde ein zweites Diagramm gebaut: Der Titel musste dort von Hand
   * nachgereicht werden, die Chips fehlten, und alles musste erneut geladen
   * werden. Jetzt wandert der Knoten in den Dialog und danach zurück – damit
   * stimmen Titel, Chips und Legende dort zwangsläufig.
   */
  #auf() {
    if (!this.#fs) {
      const dlg = document.createElement('dialog');
      dlg.className = 'dg_fs';
      // Escape und jedes andere Schließen von außen landen hier. #zu() ist
      // absichtlich mehrfach aufrufbar – auf die Reihenfolge der Ereignisse
      // ist kein Verlass, auf den eigenen Zustand schon.
      dlg.addEventListener('close', () => this.#zu());
      // In denselben Baum wie das Diagramm – sonst greift in einem
      // Schatten-Baum das Stilblatt des Dialogs nicht.
      const wurzel = this.#host.getRootNode?.() ?? document;
      (wurzel === document ? document.body : wurzel).appendChild(dlg);
      this.#fs = dlg;
    }
    // Merken, wo das Diagramm herkommt, und einen Platzhalter derselben Größe
    // hinterlassen – sonst springt das Layout darunter beim Öffnen.
    const platz = document.createElement('div');
    platz.style.height = `${this.#host.offsetHeight}px`;
    this.#heimat = { eltern: this.#host.parentNode, platz, vor: this.#host.nextSibling };
    this.#heimat.eltern?.insertBefore(platz, this.#host);

    const btn = this.#els.tools.querySelector('.dg_fsbtn');
    if (btn) {
      btn.title = 'Vollbild verlassen';
      btn.setAttribute('aria-label', 'Vollbild verlassen');
      btn.querySelector('[data-dg-ico]').dataset.dgIco = 'fullscreenExit';
      btn.querySelector('[data-dg-ico]').innerHTML = ICO.fullscreenExit;
      btn.onclick = () => this.toggleFullscreen(false);
    }

    this.#fs.replaceChildren(this.#host);
    this.#voll = true;
    this.#fs.showModal();
    this.#nachmessen();
    this.#fs.requestFullscreen?.().catch(() => {});
  }

  #zu() {
    if (!this.#voll) return;
    this.#voll = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    const h = this.#heimat;
    if (h?.eltern) {
      h.eltern.insertBefore(this.#host, h.platz);
      h.platz.remove();
    }
    this.#heimat = null;
    if (this.#fs?.open) this.#fs.close();
    const btn = this.#els.tools.querySelector('.dg_fsbtn');
    if (btn) {
      btn.title = 'Vollbild';
      btn.setAttribute('aria-label', 'Diagramm im Vollbild öffnen');
      btn.querySelector('[data-dg-ico]').dataset.dgIco = 'fullscreen';
      btn.querySelector('[data-dg-ico]').innerHTML = ICO.fullscreen;
      btn.onclick = () => this.toggleFullscreen(true);
    }
    this.#nachmessen();
  }

  /**
   * Darf gerade gezoomt werden?
   *
   * `zoom: false` schaltet es ganz ab, `zoom: true` immer an. Ohne Angabe
   * erst nach einem Klick ins Diagramm – im Vollbild sofort, da ist die
   * Geste eindeutig.
   */
  #zoomBereit() {
    if (this.#cfg.zoom === false) return false;
    if (this.#cfg.zoom === true) return true;
    return this.#voll || this.#zoomAn;
  }

  #zoom(an) {
    if (this.#cfg.zoom !== undefined || this.#zoomAn === an) return;
    this.#zoomAn = an;
    this.#host.classList.toggle('dg_aktiv', an);
    this.refresh();
  }

  /**
   * Nach einem Umzug neu messen.
   *
   * Einmal sofort und zweimal über Einzelbilder verteilt: Beim Öffnen steht
   * die endgültige Größe des Dialogs erst nach dem Layout fest, beim
   * Zurückholen war das Element kurz gar nicht im Baum. Wer nur einmal misst,
   * behält die Zeichenfläche der jeweils anderen Ansicht.
   */
  #nachmessen() {
    const tu = () => this.#renderer.resize?.(this.#griff);
    tu();
    requestAnimationFrame(() => { tu(); requestAnimationFrame(tu); });
  }
}

const STUFEN_NAME = { '5minute': '5 Minuten', hour: 'Stunde', day: 'Tag', month: 'Monat' };
const stufenName = (s) => STUFEN_NAME[s] ?? s;

export default Diagramm;
