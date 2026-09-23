/**
 * we-tiles-card
 * Nur die HA-Tile-Kacheln (Erzeugung/Batterie/Netz/Haushalt/Wallbox) —
 * eigener Abschnitt neben dem Hauptdiagramm, hört auf Zeitraum-Änderungen
 * von we-period-card, ohne diese Karte selbst zu kennen.
 */
import { openChartPopup } from './we-chart.js';
import {
  asList, fmtEnergy, fmtEuro, esc, registerCard, centralConfig, WueflFormEditor, sel,
  TILE_CSS, GRID_CSS, getPeriod, onPeriodChange, fetchStats, colorOf, priceInfo,
  tileHtml, cssColor,
} from './we-shared.js';

const SERIES = [
  { key: 'pv_energy', label: 'Solar', color: (c) => colorOf('solar', asList(c.solar)[0]), icon: 'mdi:solar-power',
    getIds: (c) => asList(c.solar).map(s => s.total).filter(Boolean) },
  { key: 'battery_out', label: 'Batterie', color: (c) => colorOf('battery', asList(c.battery)[0]), icon: 'mdi:battery-high', pair: 'battery', short: 'entladen',
    getIds: (c) => asList(c.battery).map(b => b.out_total).filter(Boolean) },
  { key: 'battery_in', label: 'Batterie', color: (c) => colorOf('battery', asList(c.battery)[0], 0, 'color_in'), icon: 'mdi:battery-high', pair: 'battery', short: 'geladen',
    getIds: (c) => asList(c.battery).map(b => b.in_total).filter(Boolean) },
  { key: 'grid_import', label: 'Netz', color: (c) => colorOf('grid', c.grid), icon: 'mdi:transmission-tower', pair: 'grid', short: 'Bezug',
    getIds: (c) => asList(c.grid?.import_total).filter(Boolean) },
  { key: 'grid_export', label: 'Netz', color: (c) => colorOf('grid', c.grid, 0, 'color_export'), icon: 'mdi:transmission-tower', pair: 'grid', short: 'Einspeisung',
    getIds: (c) => asList(c.grid?.export_total).filter(Boolean) },
  { key: 'house_energy', label: 'Haushalt', color: (c) => colorOf('consumers', c.consumers), icon: 'mdi:home',
    getIds: (c) => asList(c.consumers?.total).filter(Boolean) },
  { key: 'wallbox_energy', label: 'Wallbox', color: (c) => colorOf('wallboxes', asList(c.wallboxes)[0]), icon: 'mdi:ev-station',
    getIds: (c) => asList(c.wallboxes).map(w => w.total).filter(Boolean) },
];
const PAIR_NAMES = { grid: 'Netz', battery: 'Batterie' };

/** Zuordnung speichert entweder "sensor.x" oder { entity: "sensor.x" }. */
const getEntity = (val) => (typeof val === 'string' ? val : val?.entity || null);

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${TILE_CSS}
.ha-tile { min-height: auto; }
.state { color: var(--secondary-text-color); padding: 24px 0; text-align: center; }

`;

class WueflEnergyTilesCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #stopPeriod = null;
  #els = {};

  static getConfigElement() { return document.createElement('we-tiles-card-editor'); }
  static getStubConfig() { return { title: 'Kennzahlen' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Kennzahlen', ...this.#central, ...this.#own };
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) this.#loadCentral();
    if (this.isConnected) this.#listen();
    if (!this.#built) this.#build();
  }

  // An- und Abmelden wandert mit dem Ein- und Aushängen der Karte mit
  connectedCallback() {
    if (!this.#hass) return;
    this.#listen();
    this.#refresh();
  }

  disconnectedCallback() {
    this.#stopPeriod?.();
    this.#stopPeriod = null;
    window.removeEventListener('we-config-changed', this.#onConfigChanged);
  }

  #onConfigChanged = () => this.#loadCentral();

  #listen() {
    if (this.#stopPeriod) return;
    this.#stopPeriod = onPeriodChange(() => this.#refresh());
    window.addEventListener('we-config-changed', this.#onConfigChanged);
  }
  getCardSize() { return 3; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Kennzahlen', ...this.#central, ...this.#own };
    this.#refresh();
  }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
    const card = document.createElement('div');
    card.className = 'card ha-tile-grid';
    root.replaceChildren(card);
    this.#els = { grid: card };
    this.#built = true;
    this.#refresh();
  }

  #used() {
    return SERIES.filter((s) => s.getIds(this.#config).length > 0);
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const used = this.#used();
    if (!used.length) {
      this.#els.grid.innerHTML = '<div class="state">Noch keine Gesamtzähler zugeordnet.</div>';
      return;
    }
    const ids = used.flatMap((s) => s.getIds(this.#config));
    // Nur die zuletzt gestartete Abfrage zeichnet – ältere Antworten verwerfen
    const seq = ++this.#seq;
    const range = getPeriod();
    const [stats, preise] = await Promise.all([
      fetchStats(this.#hass, ids, range, ['change']),
      this.#fetchPrices(range),
    ]);
    if (seq !== this.#seq) return;
    this.#stats = stats;
    this.#prices = preise;
    this.#render(used);
  }

  #stats = {};
  #prices = { import: new Map(), export: new Map() };
  #seq = 0;

  /**
   * Die Preise von damals, nicht den von jetzt.
   *
   * Schreibt der Preissensor Statistiken (bei dynamischen Tarifen die Regel,
   * weil er eine Messgröße ist), liegt je Stunde ein Mittelwert im Recorder.
   * Den holen wir uns – so stimmen Bilanz und Ersparnis auch für einen Monat.
   * Gibt es keine Statistik, wird weiter mit dem aktuellen Preis gerechnet.
   */
  async #fetchPrices(range) {
    const c = this.#config;
    const ents = {
      import: getEntity(c.grid?.price_import),
      export: getEntity(c.grid?.price_export),
    };
    const ids = [...new Set(Object.values(ents).filter(Boolean))];
    const stats = ids.length ? await fetchStats(this.#hass, ids, range, ['mean']) : {};

    const toCt = (id) => {
      const unit = (this.#hass.states?.[id]?.attributes?.unit_of_measurement ?? '').toLowerCase();
      return /€|eur/.test(unit) && !/ct|cent/.test(unit) ? 100 : 1;
    };
    const map = (id) => {
      const out = new Map();
      if (!id) return out;
      const f = toCt(id);
      for (const row of stats[id] ?? []) {
        const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
        const v = Number(row.mean);
        if (!Number.isNaN(t) && Number.isFinite(v)) out.set(t, v * f);
      }
      return out;
    };
    return { import: map(ents.import), export: map(ents.export) };
  }

  #total(s) {
    return s.getIds(this.#config).reduce(
      (a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0,
    );
  }

  /**
   * Geld-Kacheln für den gewählten Zeitraum.
   *
   * Gerechnet wird mit den Preisen, die gerade gelten (fester Preis aus den
   * Einstellungen oder der aktuelle Wert des Preissensors). Bei einem
   * dynamischen Tarif ist das für längere Zeiträume eine Näherung.
   */
  #moneyTiles(used) {
    const c = this.#config;
    const has = (key) => used.some((x) => x.key === key);
    const rows = this.#moneyRows(used);
    if (!rows.length) return [];

    // Dieselben Zahlen wie im Diagramm: Summe über die Abschnitte
    const summe = (f) => rows.reduce((a, r) => a + f(r), 0);
    const saved = has('pv_energy') ? summe((r) => r.gespart) : null;
    const earned = has('grid_export') ? summe((r) => r.eingespeist) : null;
    const paid = has('grid_import') ? summe((r) => r.bezogen) : null;
    if (saved === null && earned === null && paid === null) return [];

    const tiles = [];

    if (earned !== null || paid !== null) {
      tiles.push(tileHtml({
        icon: 'mdi:cash-multiple', color: cssColor(this, '--primary-color', '#03a9f4'),
        title: 'Bilanz', value: fmtEuro((earned ?? 0) - (paid ?? 0)), click: 'geld:bilanz',
        subtitle: [
          earned !== null ? `<span class="sub-item" style="color: ${colorOf('battery', asList(c.battery)[0])}">${esc(fmtEuro(earned))} eingespeist</span>` : '',
          paid !== null ? `<span class="sub-item" style="color: var(--error-color, #db4437)">${esc(fmtEuro(-paid))} bezogen</span>` : '',
        ].join(''),
      }));
    }

    const cost = Number(c.systemdata?.system_cost_value);
    const beitrag = (saved ?? 0) + (earned ?? 0);
    if (Number.isFinite(cost) && cost > 0) {
      const anteil = (beitrag / cost) * 100;
      tiles.push(tileHtml({
        icon: 'mdi:cash-clock', color: colorOf('solar', asList(c.solar)[0]),
        title: 'Zur Amortisation', value: fmtEuro(beitrag, { signed: false }), click: 'geld:amortisation',
        subtitle: `<span class="sub-item">${esc(`${anteil.toFixed(anteil < 1 ? 2 : 1).replace('.', ',')} % der Anlage`)}</span>`,
      }));
    } else if (saved !== null) {
      tiles.push(tileHtml({
        icon: 'mdi:solar-power', color: colorOf('solar', asList(c.solar)[0]),
        title: 'Durch PV gespart', value: fmtEuro(saved, { signed: false }), click: 'geld:gespart',
        subtitle: `<span class="sub-item">${esc('Anschaffungskosten in den Einstellungen ergänzen für die Amortisation')}</span>`,
      }));
    }
    return tiles;
  }

  /**
   * Euro je Abschnitt aus den schon geladenen Statistiken.
   *
   * Die Zeilen aller Zähler liegen auf demselben Raster (Stunde, Tag oder
   * Monat), deshalb lässt sich je Abschnitt rechnen: eingespeist × Vergütung,
   * bezogen × Arbeitspreis und der Eigenverbrauch (Erzeugung minus
   * Einspeisung) zum Arbeitspreis.
   */
  #moneyRows(used) {
    const c = this.#config;
    const pImp = priceInfo(this.#hass, c, 'import').now;
    const pExp = priceInfo(this.#hass, c, 'export').now;
    const idsOf = (key) => (used.find((x) => x.key === key)?.getIds(c)) ?? [];

    const perBucket = (ids) => {
      const map = new Map();
      for (const id of ids) {
        for (const row of this.#stats[id] ?? []) {
          const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
          if (Number.isNaN(t)) continue;
          map.set(t, (map.get(t) ?? 0) + Math.max(0, Number(row.change) || 0));
        }
      }
      return map;
    };

    const imp = perBucket(idsOf('grid_import'));
    const exp = perBucket(idsOf('grid_export'));
    const pv = perBucket(idsOf('pv_energy'));
    const times = [...new Set([...imp.keys(), ...exp.keys(), ...pv.keys()])].sort((a, b) => a - b);

    // Preis des Abschnitts, sonst der aktuelle
    const preis = (art, t, jetzt) => this.#prices[art]?.get(t) ?? jetzt;

    return times.map((t) => {
      const e = exp.get(t) ?? 0;
      const i = imp.get(t) ?? 0;
      const p = pv.get(t) ?? 0;
      const cImp = preis('import', t, pImp);
      const cExp = preis('export', t, pExp);
      return {
        t,
        eingespeist: cExp === null ? 0 : (e * cExp) / 100,
        bezogen: cImp === null ? 0 : (i * cImp) / 100,
        gespart: cImp === null ? 0 : (Math.max(0, p - e) * cImp) / 100,
      };
    });
  }

  /** Reihen für die Geld-Diagramme; `art` ist bilanz, amortisation oder gespart. */
  #moneySeries(art, used, range) {
    const rows = this.#moneyRows(used);
    if (!rows.length) return [];
    const bar = range.overMonth || range.overWeek ? 'bar' : 'line';
    const punkte = (f) => rows.map((r) => [r.t, Math.round(f(r) * 100) / 100]);

    if (art === 'bilanz') {
      return [
        { name: 'Eingespeist', data: punkte((r) => r.eingespeist), unit: '€',
          color: colorOf('grid', this.#config.grid, 0, 'color_export'), type: bar, stack: 'plus', fill: 'gradient' },
        { name: 'Bezogen', data: punkte((r) => -r.bezogen), unit: '€',
          color: colorOf('grid', this.#config.grid), type: bar, stack: 'minus', fill: 'gradient' },
      ];
    }

    // Beitrag je Abschnitt plus die aufgelaufene Summe
    let summe = 0;
    const beitrag = (r) => (art === 'gespart' ? r.gespart : r.gespart + r.eingespeist);
    const kumuliert = rows.map((r) => { summe += beitrag(r); return [r.t, Math.round(summe * 100) / 100]; });
    return [
      { name: art === 'gespart' ? 'Gespart' : 'Beitrag', data: punkte(beitrag), unit: '€',
        color: colorOf('solar', asList(this.#config.solar)[0]), type: bar, fill: 'gradient' },
      { name: 'Summe im Zeitraum', data: kumuliert, unit: '€', y_axis: 1,
        color: colorOf('battery', asList(this.#config.battery)[0]), type: 'line', smooth: 0.35, fill: false },
    ];
  }

  #render(used) {
    const html = [];
    const seen = new Set();

    for (const s of used) {
      const color = s.color(this.#config);
      if (s.pair) {
        if (seen.has(s.pair)) continue;
        seen.add(s.pair);
        const both = used.filter((x) => x.pair === s.pair);
        const total = both.reduce((a, x) => a + this.#total(x), 0);
        const subs = both.map((x) => {
          const c = x.color(this.#config);
          return `<span class="sub-item" style="color: ${c}">${fmtEnergy(this.#total(x))} ${esc(x.short)}</span>`;
        }).join('');
        html.push(tileHtml({
          icon: s.icon, color, title: PAIR_NAMES[s.pair], value: fmtEnergy(total),
          subtitle: subs, click: `pair:${s.pair}`,
        }));
        continue;
      }
      html.push(tileHtml({
        icon: s.icon, color, title: s.label, value: fmtEnergy(this.#total(s)),
        click: `key:${s.key}`,
      }));
    }
    html.push(...this.#moneyTiles(used));
    this.#els.grid.innerHTML = html.join('');
    for (const btn of this.#els.grid.querySelectorAll('[data-click]')) {
      btn.addEventListener('click', () => this.#openDetail(btn.dataset.click));
    }
  }

  /**
   * Klick auf eine Kachel: derselbe Wert als Diagramm, im selben Zeitraum
   * und in denselben Farben wie die Verteilung.
   */
  #openDetail(what) {
    const [kind, id] = String(what).split(':');
    const used = this.#used();
    const range = getPeriod();

    if (kind === 'geld') {
      const titel = { bilanz: 'Bilanz', amortisation: 'Zur Amortisation', gespart: 'Durch PV gespart' };
      this.#showChart(titel[id] ?? 'Geld', this.#moneySeries(id, used, range), range, '€');
      return;
    }

    const parts = kind === 'pair'
      ? used.filter((s) => s.pair === id)
      : used.filter((s) => s.key === id);
    if (!parts.length) return;

    const title = kind === 'pair' ? PAIR_NAMES[id] : parts[0].label;
    const series = parts.flatMap((s) => s.getIds(this.#config).map((entity, i) => ({
      entity,
      name: parts.length > 1 || s.getIds(this.#config).length > 1
        ? `${s.label}${s.short ? ` ${s.short}` : ''}${s.getIds(this.#config).length > 1 ? ` ${i + 1}` : ''}`
        : s.label,
      color: s.color(this.#config),
      stat_type: 'change',
      only_positive: true,
      // Verbrauchsseiten nach unten, wie in der Verteilung
      sign: s.key === 'battery_in' || s.key === 'grid_export' ? -1 : 1,
      fill: 'gradient',
      smooth: 0.35,
      type: range.overMonth ? 'bar' : 'line',
    })));

    this.#showChart(title, series, range, 'kWh');
  }

  /** Diagramm einer Kachel im gemeinsamen Fenster zeigen. */
  #showChart(title, series, range, unit) {
    openChartPopup({
      root: this.shadowRoot,
      hass: this.#hass,
      title,
      config: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        aggregation: range.overYear ? '1m' : range.overMonth ? '1d' : range.overWeek ? '2h' : range.overDay ? '10min' : '5min',
        y_axes: series.some((s) => s.y_axis === 1) ? [{ unit }, { unit }] : [{ unit }],
        legend: [{ hidden: series.length <= 1, position: 'top-center' }],
        series,
      },
    });
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyTilesCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-tiles-card', WueflEnergyTilesCard);
customElements.define('we-tiles-card-editor', WueflEnergyTilesCardEditor);

registerCard({
  type: 'we-tiles-card',
  name: 'wuefl Kennzahlen',
  description: 'Tageswerte als HA-Kacheln — folgt dem Zeitraum der Energie-Ansicht.',
});