/**
 * wuefl-energy-history-card
 * Energiebilanz über Tag, Woche, Monat, Jahr oder freien Zeitraum.
 *
 * Tag und Woche als gestapelte Flächen, ab Monat als Balken. Darunter der
 * Ladestand auf derselben Zeitachse.
 */

import {
  adoptSheet, asList, fmtEnergy, fmtSigned, fmtPercent, icon,
  registerCard, centralConfig, mergeConfig, COLORS, ICONS, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

const SERIES = [
  { key: 'pv_energy', label: 'PV-Erzeugung', sign: 1, color: COLORS.pv, icon: ICONS.pv, group: 'Erzeugung' },
  { key: 'grid_import', label: 'Netzbezug', sign: 1, color: COLORS.grid_import, icon: ICONS.grid_import, group: 'Netz' },
  { key: 'grid_export', label: 'Einspeisung', sign: -1, color: COLORS.grid_export, icon: ICONS.grid_export, group: 'Netz' },
  { key: 'battery_out', label: 'Speicher entladen', sign: 1, color: COLORS.battery_out, icon: ICONS.battery_out, group: 'Speicher' },
  { key: 'battery_in', label: 'Speicher geladen', sign: -1, color: COLORS.battery_in, icon: ICONS.battery_in, group: 'Speicher' },
  { key: 'house_energy', label: 'Haushalt', sign: -1, color: COLORS.house, icon: ICONS.house, group: 'Verbrauch' },
  { key: 'wallbox_energy', label: 'Wallboxen', sign: -1, color: COLORS.wallbox, icon: ICONS.wallbox, group: 'Verbrauch' },
  { key: 'heatpump_energy', label: 'Wärmepumpen', sign: -1, color: COLORS.heatpump, icon: ICONS.heatpump, group: 'Verbrauch' },
];

const GROUPS = ['Erzeugung', 'Netz', 'Speicher', 'Verbrauch'];
const PRESETS = [
  { id: 'day', label: 'Tag' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
  { id: 'year', label: 'Jahr' },
];

const CSS = `
.card {
  display: flex; flex-direction: column; gap: .7rem;
}

.periods {
  align-items: center; display: flex; flex-wrap: wrap; gap: .4rem;

  & .btn.icon { padding: 0; width: var(--w-input-h); }
  & .spacer { flex: 1 1 auto; }
  & .range { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
}

.chips {
  display: flex; flex-wrap: wrap; gap: .35rem;

  & button {
    align-items: center;
    background: var(--w-bg-soft);
    border: 1px solid var(--w-line);
    border-radius: 999px; color: inherit; cursor: pointer;
    display: inline-flex; font: inherit; font-size: var(--w-fs-sm);
    gap: .4rem; padding: .3rem .7rem;

    &:hover { background: var(--w-bg-hover); }
    &:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 2px; }
    & .dot { border-radius: 3px; flex: none; height: .55rem; width: .55rem; }
    &.off { opacity: .45; text-decoration: line-through; }
  }
}

.soc-title { color: var(--w-text-soft); font-size: var(--w-fs-sm); }

.tip {
  background: var(--w-bg);
  border: 1px solid var(--w-line);
  border-radius: var(--w-radius);
  box-shadow: var(--w-shadow);
  display: none; font-size: var(--w-fs-sm); min-width: 12rem;
  padding: .5rem .65rem; pointer-events: none; position: absolute; top: .25rem; z-index: 3;

  & .when { color: var(--w-text-soft); margin-bottom: .25rem; }
  & .line { display: flex; gap: 1rem; justify-content: space-between; padding: 1px 0; }
  & .soc-line { border-top: 1px solid var(--w-line); margin-top: .3rem; padding-top: .3rem; }
  & b { font-variant-numeric: tabular-nums; font-weight: 600; }
  & .dot { border-radius: 3px; display: inline-block; height: .55rem; margin-right: .4rem; width: .55rem; }
}

.groups { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }

.group {
  background: var(--w-bg-soft);
  border-radius: var(--w-radius); padding: .6rem .75rem;

  & h3 { color: var(--w-text-soft); font-size: var(--w-fs-sm); font-weight: 400; margin: 0 0 .35rem; }
  & .row { align-items: center; display: flex; gap: .5rem; justify-content: space-between; padding: .15rem 0; }
  & .name { align-items: center; display: flex; gap: .4rem; }
  & ha-icon { --mdc-icon-size: 18px; }
  & b { font-variant-numeric: tabular-nums; font-weight: 600; }
  & .sumline {
    border-top: 1px solid var(--w-line); color: var(--w-text-soft);
    margin-top: .35rem; padding-top: .35rem;
  }
}

.state { min-height: 12rem; }

dialog.picker {
  & label {
    display: block; font-size: var(--w-fs-sm); margin-bottom: .6rem;

    & input {
      background: var(--w-bg-soft); border: 0; border-radius: var(--w-radius);
      color: inherit; display: block; font: inherit; height: var(--w-input-h);
      margin-top: .2rem; padding: 0 .7rem; width: 100%;
    }
  }
  & .ok { background: var(--w-accent); color: var(--w-on-accent); }
}
`;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

class WueflEnergyHistoryCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #els = {};
  #preset = 'day';
  #custom = null;
  #hidden = new Set();
  #data = null;
  #geo = null;
  #timer = null;

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
  }

  connectedCallback() { this.#timer = setInterval(() => this.#load(), 300_000); }
  disconnectedCallback() { clearInterval(this.#timer); }
  getCardSize() { return 13; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#apply();
    this.#load();
  }

  #apply() {
    const merged = mergeConfig(this.#central, this.#own);
    this.#config = { title: 'Energie', default_period: 'day', ...merged };
    this.#preset = this.#config.default_period;
    this.#built = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
    this.#build();
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
        ${PRESETS.map((p) => `<button type="button" class="btn" data-preset="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}
        <button type="button" class="btn icon" data-preset="custom" aria-pressed="false" aria-label="Eigener Zeitraum">
          ${icon('mdi:calendar-month')}
        </button>
        <span class="spacer"></span><span class="range"></span>
      </div>
      <div class="chips"></div>
      <div class="chart plotbox"><div class="tip"></div></div>
      <div class="soc-title">Ladestand der Speicher</div>
      <div class="soc plotbox"></div>
      <div class="groups"></div>
      <dialog class="picker">
        <h3>Eigener Zeitraum</h3>
        <label>Von <input type="date" class="from"></label>
        <label>Bis <input type="date" class="to"></label>
        <div class="actions">
          <button type="button" class="btn cancel">Abbrechen</button>
          <button type="button" class="btn ok">Anzeigen</button>
        </div>
      </dialog>
    `;
    root.appendChild(card);

    this.#els = {
      card,
      title: card.querySelector('h2'),
      range: card.querySelector('.range'),
      chips: card.querySelector('.chips'),
      chart: card.querySelector('.chart'),
      tip: card.querySelector('.tip'),
      soc: card.querySelector('.soc'),
      socTitle: card.querySelector('.soc-title'),
      groups: card.querySelector('.groups'),
      buttons: [...card.querySelectorAll('[data-preset]')],
      dialog: card.querySelector('dialog.picker'),
      from: card.querySelector('input.from'),
      to: card.querySelector('input.to'),
    };

    for (const btn of this.#els.buttons) {
      btn.addEventListener('click', () => {
        if (btn.dataset.preset === 'custom') {
          const { start, end } = this.#range();
          this.#els.from.value = isoDate(start);
          this.#els.to.value = isoDate(new Date(end.getTime() - 1));
          this.#els.dialog.showModal();
          return;
        }
        this.#preset = btn.dataset.preset;
        this.#custom = null;
        this.#load();
      });
    }
    card.querySelector('.cancel').addEventListener('click', () => this.#els.dialog.close());
    card.querySelector('.ok').addEventListener('click', () => {
      const from = this.#els.from.valueAsDate;
      const to = this.#els.to.valueAsDate;
      if (!from || !to) return;
      this.#custom = { start: startOfDay(from), end: new Date(startOfDay(to).getTime() + 86_400_000) };
      this.#preset = 'custom';
      this.#els.dialog.close();
      this.#load();
    });

    this.#els.title.textContent = this.#config.title ?? '';
    this.#built = true;
    this.#renderState('Daten werden geladen …');
    this.#syncButtons();
  }

  /* ------------------------------ Zeitraum -------------------------- */

  #range() {
    const now = new Date();
    const today = startOfDay(now);
    if (this.#preset === 'custom' && this.#custom) {
      const days = (this.#custom.end - this.#custom.start) / 86_400_000;
      return { ...this.#custom, period: days <= 2 ? 'hour' : days <= 70 ? 'day' : 'month', area: days <= 8 };
    }
    switch (this.#preset) {
      case 'week': {
        const wd = (today.getDay() + 6) % 7;
        return { start: new Date(today.getTime() - wd * 86_400_000), end: now, period: 'day', area: true };
      }
      case 'month':
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, period: 'day', area: false };
      case 'year':
        return { start: new Date(now.getFullYear(), 0, 1), end: now, period: 'month', area: false };
      default:
        return { start: today, end: now, period: 'hour', area: true };
    }
  }

  #rangeLabel(start, end) {
    const f = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const last = new Date(end.getTime() - 1);
    return isoDate(start) === isoDate(last) ? f.format(start) : `${f.format(start)} – ${f.format(last)}`;
  }

  /* ------------------------------ Daten ----------------------------- */

  #used() { return SERIES.filter((s) => asList(this.#config[s.key]).length); }

  async #load() {
    if (!this.#hass || !this.#built) return;
    const used = this.#used();
    const socIds = asList(this.#config.battery_soc);
    if (!used.length) {
      this.#renderState('Noch keine Sensoren zugeordnet. Seitenleiste → wuefl Energie → Energie-Ansicht.');
      return;
    }

    const ids = [...new Set([...used.flatMap((s) => asList(this.#config[s.key])), ...socIds])];
    const { start, end, period, area } = this.#range();
    this.#els.range.textContent = this.#rangeLabel(start, end);
    this.#syncButtons();

    try {
      const stats = await this.#hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: ids,
        period,
        types: ['change', 'mean'],
      });
      this.#data = { ...this.#bucketize(stats, used, socIds), period, area };
      this.#renderChips();
      this.#renderChart();
      this.#renderSoc();
      this.#renderGroups();
    } catch (err) {
      this.#renderState('Statistiken konnten nicht geladen werden. Prüfen, ob der Recorder die Sensoren aufzeichnet.');
      console.error('[wuefl-energy] statistics_during_period', err);
    }
  }

  #bucketize(stats, used, socIds) {
    const index = new Map();
    const buckets = [];
    const at = (ts) => {
      if (!index.has(ts)) {
        index.set(ts, buckets.length);
        buckets.push({ ts, values: {}, soc: null, socN: 0 });
      }
      return buckets[index.get(ts)];
    };

    for (const s of used) {
      for (const id of asList(this.#config[s.key])) {
        for (const row of stats[id] ?? []) {
          const ts = typeof row.start === 'number' ? row.start : Date.parse(row.start);
          if (row.change === null || row.change === undefined) continue;
          const b = at(ts);
          b.values[s.key] = (b.values[s.key] ?? 0) + Math.abs(row.change);
        }
      }
    }
    for (const id of socIds) {
      for (const row of stats[id] ?? []) {
        const ts = typeof row.start === 'number' ? row.start : Date.parse(row.start);
        if (row.mean === null || row.mean === undefined) continue;
        const b = at(ts);
        b.soc = (b.soc ?? 0) + row.mean;
        b.socN += 1;
      }
    }
    buckets.sort((a, b) => a.ts - b.ts);
    for (const b of buckets) if (b.socN) b.soc /= b.socN;

    const totals = {};
    for (const s of used) totals[s.key] = buckets.reduce((a, b) => a + (b.values[s.key] ?? 0), 0);
    return { buckets, totals, hasSoc: socIds.length > 0 };
  }

  /* ------------------------------ Ausgabe --------------------------- */

  #syncButtons() {
    for (const b of this.#els.buttons) b.setAttribute('aria-pressed', String(b.dataset.preset === this.#preset));
  }

  #renderState(text) {
    this.#els.chart.innerHTML = `<div class="state">${text}</div>`;
    this.#els.soc.innerHTML = '';
    this.#els.socTitle.style.display = 'none';
  }

  #visible() { return this.#used().filter((s) => !this.#hidden.has(s.key)); }

  #renderChips() {
    this.#els.chips.innerHTML = this.#used()
      .map((s) => {
        const off = this.#hidden.has(s.key);
        return `<button type="button" data-series="${s.key}" class="${off ? 'off' : ''}" aria-pressed="${!off}">
          <span class="dot" style="background:${s.color}"></span>${s.label}</button>`;
      })
      .join('');
    for (const btn of this.#els.chips.querySelectorAll('[data-series]')) {
      btn.addEventListener('click', () => {
        const k = btn.dataset.series;
        this.#hidden.has(k) ? this.#hidden.delete(k) : this.#hidden.add(k);
        this.#renderChips();
        this.#renderChart();
        this.#renderGroups();
      });
    }
  }

  #renderChart() {
    const { buckets, period, area } = this.#data;
    if (!buckets.length) {
      this.#renderState('Für diesen Zeitraum liegen keine Statistiken vor.');
      return;
    }

    const W = 1000, H = 420, L = 78, R = 20, T = 16, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const up = this.#visible().filter((s) => s.sign > 0);
    const dn = this.#visible().filter((s) => s.sign < 0);

    let pm = 0, nm = 0;
    for (const b of buckets) {
      pm = Math.max(pm, up.reduce((a, s) => a + (b.values[s.key] ?? 0), 0));
      nm = Math.max(nm, dn.reduce((a, s) => a + (b.values[s.key] ?? 0), 0));
    }
    const span = pm + nm || 1;
    const zero = T + (pm / span) * ph;
    const n = buckets.length;
    const X = area
      ? (i) => L + (n < 2 ? pw / 2 : (i / (n - 1)) * pw)
      : (i) => L + (i + 0.5) * (pw / n);
    this.#geo = { X, zero, span, ph, T, L, pw, W, H, n };

    const out = ['<defs>'];
    for (const s of [...up, ...dn]) {
      out.push(`<linearGradient id="grad-${s.key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color: ${s.color}; stop-opacity: .8"/>
        <stop offset="1" style="stop-color: ${s.color}; stop-opacity: .15"/></linearGradient>`);
    }
    out.push('</defs>');

    // Gitter und Achsenzahlen ober- und unterhalb der Null
    for (const f of [0.5, 1]) {
      const yUp = zero - f * (zero - T);
      const yDn = zero + f * (T + ph - zero);
      out.push(`<line class="grid-line" x1="${L}" y1="${yUp.toFixed(1)}" x2="${W - R}" y2="${yUp.toFixed(1)}"/>`);
      out.push(`<line class="grid-line" x1="${L}" y1="${yDn.toFixed(1)}" x2="${W - R}" y2="${yDn.toFixed(1)}"/>`);
      out.push(`<text class="axis" x="${L - 10}" y="${(yUp + 5).toFixed(1)}" text-anchor="end">${fmtEnergy(pm * f)}</text>`);
      out.push(`<text class="axis" x="${L - 10}" y="${(yDn + 5).toFixed(1)}" text-anchor="end">${fmtEnergy(nm * f)}</text>`);
    }
    out.push(`<line class="zero" x1="${L}" y1="${zero}" x2="${W - R}" y2="${zero}"/>`);
    out.push(`<text class="axis" x="${L - 10}" y="${zero + 5}" text-anchor="end">0</text>`);
    out.push(`<text class="side" x="${L + 6}" y="${T + 14}">Erzeugung und Bezug</text>`);
    out.push(`<text class="side" x="${L + 6}" y="${T + ph - 5}">Verbrauch und Einspeisung</text>`);

    if (area) {
      for (const [side, set] of [[1, up], [-1, dn]]) {
        let base = new Array(n).fill(0);
        for (const s of set) {
          const top = buckets.map((b, i) => base[i] + (b.values[s.key] ?? 0));
          const upper = top.map((v, i) => `${X(i).toFixed(1)} ${(zero - (side * v * ph) / span).toFixed(1)}`);
          const lower = base.map((v, i) => `${X(i).toFixed(1)} ${(zero - (side * v * ph) / span).toFixed(1)}`).reverse();
          out.push(`<path d="M${upper.join(' L')} L${lower.join(' L')} Z" fill="url(#grad-${s.key})" stroke-width="1.5" style="stroke: ${s.color}"/>`);
          base = top;
        }
      }
    } else {
      const bw = Math.max(3, Math.min(28, (pw / n) * 0.6));
      buckets.forEach((b, i) => {
        const cx = X(i);
        let top = zero, bottom = zero;
        for (const s of up) {
          const h = ((b.values[s.key] ?? 0) * ph) / span;
          if (h < 0.4) continue;
          top -= h;
          out.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" style="fill: ${s.color}"/>`);
        }
        for (const s of dn) {
          const h = ((b.values[s.key] ?? 0) * ph) / span;
          if (h < 0.4) continue;
          out.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${bottom.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" style="fill: ${s.color}"/>`);
          bottom += h;
        }
      });
    }

    const step = Math.max(1, Math.ceil(n / 12));
    buckets.forEach((b, i) => {
      if (i % step) return;
      out.push(`<text class="axis" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${this.#tick(b.ts, period)}</text>`);
    });
    out.push(`<line id="cursor" x1="0" y1="${T}" x2="0" y2="${T + ph}" stroke-width="1" opacity="0" style="stroke: var(--w-text-soft)"/><g id="marks"></g>`);

    this.#els.chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Energiebilanz">${out.join('')}</svg>`;
    this.#els.chart.appendChild(this.#els.tip);
    this.#hookPointer();
  }

  #renderSoc() {
    const { buckets, hasSoc } = this.#data;
    const points = buckets.filter((b) => b.soc !== null);
    this.#els.socTitle.style.display = hasSoc && points.length ? '' : 'none';
    if (!hasSoc || !points.length || !this.#geo) {
      this.#els.soc.innerHTML = '';
      return;
    }

    const { X, L, W } = this.#geo;
    const H = 130, T = 10, B = 22;
    const ph = H - T - B;
    const pts = buckets
      .map((b, i) => (b.soc === null ? null : `${X(i).toFixed(1)} ${(T + (1 - Math.max(0, Math.min(100, b.soc)) / 100) * ph).toFixed(1)}`))
      .filter(Boolean);

    const out = [`<defs><linearGradient id="socg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: ${COLORS.battery_out}; stop-opacity: .45"/>
      <stop offset="1" style="stop-color: ${COLORS.battery_out}; stop-opacity: 0"/></linearGradient></defs>`];
    out.push(`<path d="M${pts.join(' L')} L${X(buckets.length - 1).toFixed(1)} ${T + ph} L${X(0).toFixed(1)} ${T + ph} Z" fill="url(#socg)"/>`);
    out.push(`<path d="M${pts.join(' L')}" fill="none" stroke-width="2.5" style="stroke: ${COLORS.battery_out}"/>`);
    out.push(`<text class="axis" x="${L - 10}" y="${T + 12}" text-anchor="end">100 %</text>`);
    out.push(`<text class="axis" x="${L - 10}" y="${T + ph}" text-anchor="end">0 %</text>`);

    this.#els.soc.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ladestand der Speicher">${out.join('')}</svg>`;
  }

  #tick(ts, period) {
    const d = new Date(ts);
    if (period === 'hour') return String(d.getHours()).padStart(2, '0');
    if (period === 'month') return new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(d);
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(d);
  }

  #stamp(ts, period) {
    const d = new Date(ts);
    if (period === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00 Uhr`;
    if (period === 'month') return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  }

  #hookPointer() {
    const svg = this.#els.chart.querySelector('svg');
    const tip = this.#els.tip;
    const cursor = svg.querySelector('#cursor');
    const marks = svg.querySelector('#marks');
    const { buckets, period } = this.#data;

    const move = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((clientX - rect.left) / rect.width) * this.#geo.W;
      let best = 0, dist = Infinity;
      buckets.forEach((_, i) => {
        const d = Math.abs(this.#geo.X(i) - vx);
        if (d < dist) { dist = d; best = i; }
      });

      const b = buckets[best];
      const gx = this.#geo.X(best);
      cursor.setAttribute('x1', gx);
      cursor.setAttribute('x2', gx);
      cursor.setAttribute('opacity', '0.7');

      let top = this.#geo.zero, bottom = this.#geo.zero;
      let dots = '';
      const rows = [];
      for (const s of this.#visible()) {
        const v = b.values[s.key] ?? 0;
        if (v < 0.001) continue;
        const h = (v * this.#geo.ph) / this.#geo.span;
        const y = s.sign > 0 ? (top -= h) : (bottom += h);
        dots += `<circle cx="${gx.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" stroke-width="1.5" style="fill: ${s.color}; stroke: var(--w-bg)"/>`;
        rows.push(`<div class="line"><span><span class="dot" style="background:${s.color}"></span>${s.label}</span><b>${fmtSigned(s.sign * v)}</b></div>`);
      }
      marks.innerHTML = dots;

      tip.innerHTML =
        `<div class="when">${this.#stamp(b.ts, period)}</div>` +
        (rows.join('') || '<div class="line">Keine Werte</div>') +
        (b.soc === null ? '' : `<div class="line soc-line"><span>Ladestand</span><b>${fmtPercent(b.soc)}</b></div>`);
      tip.style.display = 'block';
      const host = this.#els.chart.clientWidth;
      const px = (gx / this.#geo.W) * host;
      tip.style.left = `${Math.max(0, Math.min(host - tip.offsetWidth, px - tip.offsetWidth / 2))}px`;
    };

    const clear = () => {
      tip.style.display = 'none';
      cursor.setAttribute('opacity', '0');
      marks.innerHTML = '';
    };

    svg.addEventListener('mousemove', (e) => move(e.clientX));
    svg.addEventListener('mouseleave', clear);
    svg.addEventListener('touchstart', (e) => move(e.touches[0].clientX), { passive: true });
    svg.addEventListener('touchmove', (e) => { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
    svg.addEventListener('touchend', clear);
  }

  #renderGroups() {
    const { totals } = this.#data;
    const used = this.#used();
    const html = [];

    for (const group of GROUPS) {
      const items = used.filter((s) => s.group === group);
      if (!items.length) continue;
      const rows = items
        .map((s) => `<div class="row"><span class="name">
            ${icon(s.icon, `style="color: ${s.color}"`)}${s.label}</span>
            <b>${fmtSigned(s.sign * (totals[s.key] ?? 0))}</b></div>`)
        .join('');

      let footer = '';
      if (items.length > 1) {
        const net = items.reduce((a, s) => a + s.sign * (totals[s.key] ?? 0), 0);
        const value = group === 'Verbrauch'
          ? fmtEnergy(items.reduce((a, s) => a + (totals[s.key] ?? 0), 0))
          : fmtSigned(net);
        footer = `<div class="row sumline"><span>${group === 'Verbrauch' ? 'Summe' : 'Bilanz'}</span><b>${value}</b></div>`;
      }
      html.push(`<div class="group"><h3>${group}</h3>${rows}${footer}</div>`);
    }
    this.#els.groups.innerHTML = html.join('');
  }
}

/* -------------------------------------------------------------------- */

const SCHEMA = [
  { name: 'title', selector: sel.text() },
  {
    name: 'default_period',
    selector: { select: { mode: 'dropdown', options: PRESETS.map((p) => ({ value: p.id, label: p.label })) } },
  },
  {
    type: 'expandable', name: '', title: 'Abweichend von der zentralen Zuordnung',
    schema: SERIES.map((s) => ({ name: s.key, selector: sel.entities() })),
  },
];

const LABELS = {
  title: 'Überschrift',
  default_period: 'Zeitraum beim Öffnen',
  pv_energy: 'PV-Erzeugung (kWh)',
  grid_import: 'Netzbezug (kWh)',
  grid_export: 'Einspeisung (kWh)',
  battery_in: 'Speicher geladen (kWh)',
  battery_out: 'Speicher entladen (kWh)',
  house_energy: 'Haushalt (kWh)',
  wallbox_energy: 'Wallboxen (kWh)',
  heatpump_energy: 'Wärmepumpen (kWh)',
};

class WueflEnergyHistoryCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-energy-history-card', WueflEnergyHistoryCard);
customElements.define('wuefl-energy-history-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'wuefl-energy-history-card',
  name: 'wuefl Energiebilanz',
  description: 'Flächen- und Balkendiagramm mit Ladestandsverlauf.',
});
