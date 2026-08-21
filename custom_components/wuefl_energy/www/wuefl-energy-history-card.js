/**
 * wuefl-energy-history-card
 * Balken-/Flächendiagramm für die Gesamtzähler aus der Zuordnung.
 *
 * Bewusst an Home Assistants eigener Energie-Ansicht orientiert: dieselben
 * Farbvariablen (--energy-solar-color usw., über COLORS/TOKENS_CSS), Fläche
 * oberhalb der Nulllinie für Erzeugung, unterhalb für Verbrauch. Anders als
 * die native Karte braucht das kein separat eingerichtetes Energie-Dashboard
 * — nur die ohnehin gepflegte Zuordnung, gelesen über die ganz normale,
 * dokumentierte Langzeitstatistik-Abfrage.
 */

import {
  adoptSheet, asList, fmtEnergy, fmtPercent, icon, esc,
  registerCard, centralConfig, COLORS, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

const PERIODS = [
  { id: 'day', label: 'Tag' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
  { id: 'year', label: 'Jahr' },
  { id: 'custom', label: 'Benutzerdefiniert' },
];

/* Erzeugung oberhalb der Nulllinie, Verbrauch unterhalb — wie bei HA's
   eigener Energie-Ansicht. "pair" gruppiert Gegenstücke (Netz, Speicher)
   in der Legende zu einem Knopf mit zwei Punkten. */
const SERIES = [
  { key: 'pv_energy', label: 'Erzeugung', sign: 1, color: COLORS.pv },
  { key: 'battery_out', label: 'Speicher entladen', sign: 1, color: COLORS.battery_out, pair: 'battery', short: 'entladen' },
  { key: 'grid_export', label: 'Einspeisung', sign: -1, color: COLORS.grid_export, pair: 'grid', short: 'Einspeisung' },
  { key: 'grid_import', label: 'Netzbezug', sign: -1, color: COLORS.grid_import, pair: 'grid', short: 'Bezug' },
  { key: 'battery_in', label: 'Speicher geladen', sign: -1, color: COLORS.battery_in, pair: 'battery', short: 'geladen' },
  { key: 'house_energy', label: 'Haushalt', sign: -1, color: COLORS.house },
  { key: 'wallbox_energy', label: 'Wallbox', sign: -1, color: COLORS.wallbox },
  { key: 'heatpump_energy', label: 'Wärmepumpe', sign: -1, color: COLORS.heatpump },
];

const PAIR_NAMES = { grid: 'Netz', battery: 'Speicher' };

const CSS = `
.card { display: flex; flex-direction: column; gap: .7rem; }

.periods {
  background: var(--w-bg-soft);
  border-radius: var(--w-radius);
  display: grid;
  gap: 3px;
  grid-template-columns: repeat(4, 1fr) auto;
  padding: 3px;

  & .btn {
    background: transparent; border-radius: calc(var(--w-radius) - 3px);
    font-size: var(--w-fs-sm); height: auto; padding: .5rem .4rem;
    white-space: nowrap;

    &:hover { background: var(--w-bg-hover); }
    &[aria-pressed="true"] { background: var(--w-accent); color: var(--w-on-accent); }
  }
  & .btn.custom { padding: .5rem; }
}

.customrange {
  align-items: center; display: flex; flex-wrap: wrap; gap: .5rem;

  & input {
    background: var(--w-bg-soft); border: 0; border-radius: var(--w-radius);
    color: inherit; font: inherit; height: var(--w-input-h); padding: 0 .6rem;
  }
  & span { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
}

.chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.chips button {
  align-items: center; background: var(--w-bg-soft); border: 1px solid var(--w-line);
  border-radius: 999px; color: inherit; cursor: pointer; display: inline-flex;
  font: inherit; font-size: var(--w-fs-sm); gap: .4rem; padding: .3rem .7rem;

  &:hover { background: var(--w-bg-hover); }
  & .dot { border-radius: 3px; flex: none; height: .55rem; width: .55rem; }
  &.off { opacity: .45; text-decoration: line-through; }
}

.chart { position: relative; }
.chart svg { display: block; height: auto; width: 100%; }
.chart .axis { fill: var(--w-text-soft); font-size: 15px; font-variant-numeric: tabular-nums; }
.chart .grid-line { stroke: var(--w-line); stroke-width: 1; }
.chart .zero { stroke: var(--w-text); stroke-width: 1.5; }

.state { min-height: 10rem; }

.tiles {
  display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));

  & .tile {
    border-left: 3px solid var(--tile-color, var(--w-line));
    display: flex; flex-direction: column; gap: .15rem;

    & .k { align-items: center; color: var(--w-text-soft); display: flex; font-size: var(--w-fs-sm); gap: .35rem; }
    & .v { font-size: 1.05rem; font-variant-numeric: tabular-nums; font-weight: 700; }
    & .split { display: flex; font-size: var(--w-fs-sm); gap: .6rem; }
    & .split .in { color: var(--w-batt-out); }
    & .split .out { color: var(--w-danger); }
  }
}

.footer { display: flex; justify-content: flex-end; }
.footer .btn {
  font-size: var(--w-fs-sm); height: auto; padding: .4rem .8rem;
}
`;

/** Zwei Werte, die HA-typisch oberhalb/unterhalb der Nulllinie stehen: nur
 *  Balken, keine gerundeten Kanten, ein sanfter Verlauf zur Achse hin. */
function areaPath(points, x, yZero, ySign) {
  if (!points.length) return '';
  const top = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${p.toFixed(1)}`).join(' ');
  return `${top} L${x(points.length - 1).toFixed(1)} ${yZero} L${x(0).toFixed(1)} ${yZero} Z`;
}

class WueflEnergyHistoryCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #period = 'day';
  #hidden = new Set();
  #els = {};
  #cache = new Map();

  static getConfigElement() { return document.createElement('wuefl-energy-history-card-editor'); }
  static getStubConfig() { return { title: 'Energie' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#apply();
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
    }
    if (!this.#built) this.#build();
  }

  getCardSize() { return 6; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#apply();
    this.#loadData();
  }

  #apply() {
    this.#config = { title: 'Energie', ...this.#central, ...this.#own };
    this.#cache.clear();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'history');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2></h2>
      <div class="periods">
        ${PERIODS.filter((p) => p.id !== 'custom').map((p) => `<button type="button" class="btn" data-period="${p.id}"
          aria-pressed="${p.id === this.#period}">${p.label}</button>`).join('')}
        <button type="button" class="btn custom" data-period="custom"
          aria-pressed="${this.#period === 'custom'}" aria-label="Benutzerdefinierter Zeitraum">
          ${icon('mdi:calendar-range')}
        </button>
      </div>
      <div class="customrange" hidden>
        <input type="date" class="from">
        <span>bis</span>
        <input type="date" class="to">
        <button type="button" class="btn apply-range">Anzeigen</button>
      </div>
      <div class="chips"></div>
      <div class="chart"><div class="state">Lädt …</div></div>
      <div class="tiles"></div>
      <div class="footer">
        <button type="button" class="btn export">${icon('mdi:download')}CSV exportieren</button>
      </div>
    `;
    root.appendChild(card);

    const q = (x) => card.querySelector(x);
    this.#els = {
      card, title: q('h2'), periods: q('.periods'), chips: q('.chips'), chart: q('.chart'),
      tiles: q('.tiles'), customRange: q('.customrange'), from: q('.from'), to: q('.to'),
    };

    for (const btn of card.querySelectorAll('[data-period]')) {
      btn.addEventListener('click', () => {
        this.#period = btn.dataset.period;
        for (const b of card.querySelectorAll('[data-period]')) {
          b.setAttribute('aria-pressed', String(b === btn));
        }
        this.#els.customRange.hidden = this.#period !== 'custom';
        if (this.#period !== 'custom') this.#loadData();
      });
    }
    q('.apply-range').addEventListener('click', () => this.#loadData());
    q('.export').addEventListener('click', () => this.#exportCsv());

    this.#built = true;
    this.#loadData();
  }

  /* ------------------------------ Daten ------------------------------ */

  #used() {
    return SERIES.filter((s) => asList(this.#config[s.key]).length);
  }

  #range() {
    const now = new Date();
    if (this.#period === 'custom') {
      const fromVal = this.#els.from?.value;
      const toVal = this.#els.to?.value;
      const start = fromVal ? new Date(`${fromVal}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = toVal ? new Date(`${toVal}T23:59:59`) : now;
      return { start, end };
    }
    const start = new Date(now);
    if (this.#period === 'day') start.setHours(0, 0, 0, 0);
    else if (this.#period === 'week') { start.setDate(now.getDate() - now.getDay() + 1); start.setHours(0, 0, 0, 0); }
    else if (this.#period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
    else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
    return { start, end: now };
  }

  async #loadData() {
    if (!this.#hass) return;
    this.#els.title.textContent = this.#config.title ?? 'Energie';
    const used = this.#used();
    this.#renderChips(used);

    if (!used.length) {
      this.#els.chart.innerHTML = '<div class="state">Noch keine Gesamtzähler zugeordnet.</div>';
      this.#els.tiles.innerHTML = '';
      return;
    }

    const { start, end } = this.#range();
    const cacheKey = `${this.#period}:${start.getTime()}`;
    let totals = this.#cache.get(cacheKey);

    if (!totals) {
      const ids = used.flatMap((s) => asList(this.#config[s.key]));
      const spanDays = (end - start) / 86_400_000;
      const period = this.#period === 'day' ? 'hour'
        : this.#period === 'week' || this.#period === 'month' ? 'day'
        : this.#period === 'custom' ? (spanDays <= 3 ? 'hour' : spanDays <= 90 ? 'day' : 'month')
        : 'month';
      let stats = {};
      try {
        stats = await this.#hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          statistic_ids: ids,
          period,
          types: ['change'],
        });
      } catch {
        stats = {};
      }
      totals = { stats, period };
      this.#cache.set(cacheKey, totals);
    }

    this.#renderChart(used, totals.stats, totals.period, start, end);
    this.#renderTiles(used, totals.stats);
  }

  /* ------------------------------ Legende ---------------------------- */

  #renderChips(used) {
    const items = [];
    const seen = new Set();
    for (const s of used) {
      if (!s.pair) { items.push({ keys: [s.key], label: s.label, colors: [s.color] }); continue; }
      if (seen.has(s.pair)) continue;
      seen.add(s.pair);
      const both = used.filter((x) => x.pair === s.pair);
      items.push({
        keys: both.map((x) => x.key),
        label: both.length > 1 ? `${PAIR_NAMES[s.pair]} ${both.map((x) => x.short).join(' / ')}` : s.label,
        colors: both.map((x) => x.color),
      });
    }

    this.#els.chips.innerHTML = items.map((i) => {
      const off = i.keys.every((k) => this.#hidden.has(k));
      const dots = i.colors.map((c, n) => `<span class="dot" style="background:${c}; opacity:${n ? .6 : 1}"></span>`).join('');
      return `<button type="button" data-keys="${i.keys.join(',')}" class="${off ? 'off' : ''}">${dots}${esc(i.label)}</button>`;
    }).join('');

    for (const btn of this.#els.chips.querySelectorAll('[data-keys]')) {
      btn.addEventListener('click', () => {
        const keys = btn.dataset.keys.split(',');
        const off = keys.every((k) => this.#hidden.has(k));
        for (const k of keys) { if (off) this.#hidden.delete(k); else this.#hidden.add(k); }
        this.#loadData();
      });
    }
  }

  /* ------------------------------ Diagramm ---------------------------- */

  #renderChart(used, stats, period, start, end) {
    const buckets = [];
    const cursor = new Date(start);
    while (cursor < end) {
      buckets.push(new Date(cursor));
      if (period === 'hour') cursor.setHours(cursor.getHours() + 1);
      else if (period === 'day') cursor.setDate(cursor.getDate() + 1);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
    if (!buckets.length) buckets.push(new Date(start));
    const bucketMs = buckets.map((b) => +b);

    const bucketIndex = (t) => {
      for (let i = bucketMs.length - 1; i >= 0; i--) if (t >= bucketMs[i]) return i;
      return 0;
    };

    const series = used
      .filter((s) => !this.#hidden.has(s.key))
      .map((s) => {
        const values = new Array(buckets.length).fill(0);
        for (const id of asList(this.#config[s.key])) {
          for (const row of stats[id] ?? []) {
            values[bucketIndex(row.start)] += Number(row.change) || 0;
          }
        }
        return { ...s, values: values.map((v) => v * s.sign) };
      });

    const up = series.filter((s) => s.sign > 0);
    const dn = series.filter((s) => s.sign < 0);
    const upTotals = buckets.map((_, i) => up.reduce((a, s) => a + s.values[i], 0));
    const dnTotals = buckets.map((_, i) => dn.reduce((a, s) => a + s.values[i], 0));
    const max = Math.max(1, ...upTotals);
    const min = Math.min(-1, ...dnTotals);

    const W = 1000, H = 260, L = 46, R = 12, T = 14, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const x = (i) => L + (buckets.length > 1 ? (i / (buckets.length - 1)) * pw : pw / 2);
    const span = max - min || 1;
    const y = (v) => T + ph - ((v - min) / span) * ph;
    const yZero = y(0);

    const out = [
      `<line class="grid-line" x1="${L}" y1="${y(max)}" x2="${W - R}" y2="${y(max)}"/>`,
      `<text class="axis" x="${L - 8}" y="${y(max) + 5}" text-anchor="end">${fmtEnergy(max)}</text>`,
      `<line class="grid-line" x1="${L}" y1="${y(min)}" x2="${W - R}" y2="${y(min)}"/>`,
      `<text class="axis" x="${L - 8}" y="${y(min) + 5}" text-anchor="end">${fmtEnergy(min)}</text>`,
      `<line class="zero" x1="${L}" y1="${yZero}" x2="${W - R}" y2="${yZero}"/>`,
    ];

    // Liniendiagramm: jede Serie als eigene Linie, Erzeugung oberhalb,
    // Verbrauch unterhalb der Nulllinie, keine Fläche mehr.
    for (const s of [...up, ...dn]) {
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
      out.push(`<path d="M${pts.join(' L')}" fill="none" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round" style="stroke: ${s.color}"/>`);
    }

    const tickEvery = Math.max(1, Math.ceil(buckets.length / 8));
    buckets.forEach((b, i) => {
      if (i % tickEvery && i !== buckets.length - 1) return;
      const label = period === 'hour' ? `${String(b.getHours()).padStart(2, '0')}`
        : period === 'day' ? `${b.getDate()}.${b.getMonth() + 1}.`
        : `${b.toLocaleString('de-DE', { month: 'short' })}`;
      out.push(`<text class="axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${label}</text>`);
    });

    this.#els.chart.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Energie">${out.join('')}</svg>`;
  }

  /* ------------------------------ Kacheln ---------------------------- */

  #renderTiles(used, stats) {
    const total = (s) => asList(this.#config[s.key]).reduce(
      (a, id) => a + (stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0,
    );
    const soc = asList(this.#config.battery_soc);
    let socAvg = null;
    if (soc.length) {
      const vals = soc.map((id) => {
        const rows = stats[id] ?? [];
        return rows.length ? rows.reduce((a, r) => a + (Number(r.mean ?? r.state) || 0), 0) / rows.length : null;
      }).filter((v) => v !== null);
      if (vals.length) socAvg = vals.reduce((a, v) => a + v, 0) / vals.length;
    }

    const visible = used.filter((s) => !this.#hidden.has(s.key));
    const tiles = [];
    const seenPair = new Set();

    for (const s of visible) {
      // Gegenstücke (Netz, Speicher) landen in einer gemeinsamen Kachel mit
      // beiden Werten, statt zwei fast gleich aussehenden Einzelkacheln.
      if (s.pair) {
        if (seenPair.has(s.pair)) continue;
        seenPair.add(s.pair);
        const both = visible.filter((x) => x.pair === s.pair);
        const inSeries = both.find((x) => x.sign > 0) ?? both[0];
        const outSeries = both.find((x) => x.sign < 0) ?? both[1];
        const inVal = inSeries ? total(inSeries) : 0;
        const outVal = outSeries ? total(outSeries) : 0;
        tiles.push(`<div class="tile" style="--tile-color: ${inSeries?.color ?? outSeries?.color}">
          <span class="k">${esc(PAIR_NAMES[s.pair])}</span>
          <span class="v">${fmtEnergy(inVal + outVal)}</span>
          <span class="split">
            ${inSeries ? `<span class="in">${fmtEnergy(inVal)} ${esc(inSeries.short)}</span>` : ''}
            ${outSeries ? `<span class="out">${fmtEnergy(outVal)} ${esc(outSeries.short)}</span>` : ''}
          </span>
        </div>`);
        continue;
      }
      tiles.push(`<div class="tile" style="--tile-color: ${s.color}">
        <span class="k">${esc(s.label)}</span>
        <span class="v">${fmtEnergy(total(s))}</span>
      </div>`);
    }
    if (socAvg !== null) {
      tiles.push(`<div class="tile"><span class="k">Ladestand ⌀</span><span class="v">${fmtPercent(socAvg)}</span></div>`);
    }
    this.#els.tiles.innerHTML = tiles.join('');
  }

  /* ------------------------------ Export ------------------------------ */

  #exportCsv() {
    const cacheKey = [...this.#cache.keys()].pop();
    const totals = cacheKey ? this.#cache.get(cacheKey) : null;
    if (!totals) return;

    const used = this.#used().filter((s) => !this.#hidden.has(s.key));
    const rows = [['Zeitpunkt', ...used.map((s) => s.label)]];
    const byTime = new Map();

    for (const s of used) {
      for (const id of asList(this.#config[s.key])) {
        for (const row of totals.stats[id] ?? []) {
          const t = new Date(row.start).toISOString();
          if (!byTime.has(t)) byTime.set(t, {});
          byTime.get(t)[s.key] = (byTime.get(t)[s.key] ?? 0) + (Number(row.change) || 0);
        }
      }
    }
    for (const [t, vals] of [...byTime.entries()].sort()) {
      rows.push([t, ...used.map((s) => (vals[s.key] ?? 0).toFixed(3))]);
    }

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `energie-${this.#period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };

class WueflEnergyHistoryCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-energy-history-card', WueflEnergyHistoryCard);
customElements.define('wuefl-energy-history-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'wuefl-energy-history-card',
  name: 'wuefl Energie',
  description: 'Balkendiagramm im Stil von Home Assistants Energie-Ansicht, gespeist aus der Zuordnung.',
});
