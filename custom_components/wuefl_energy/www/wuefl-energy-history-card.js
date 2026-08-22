/**
 * wuefl-energy-history-card
 * Nur noch das Hauptdiagramm ("Verteilung") — Zeitraum-Auswahl, Kennzahlen,
 * Speicher- und Solarproduktions-Diagramm sind eigene Karten in eigenen
 * Abschnitten geworden (wuefl-energy-period-card, -tiles-card,
 * -battery-chart-card, -solar-chart-card). Betten dieselbe fremde
 * Diagramm-Karte ein wie diese Karte, folgen demselben geteilten Zeitraum.
 */
import {
  asList, registerCard, centralConfig, WueflFormEditor, sel, GRID_CSS,
  cssColor, getPeriod, onPeriodChange, embedGraphCard, CHART_HINT_CSS,
} from './wuefl-energy-shared.js';

const SERIES = [
  { key: 'pv_energy', label: 'Solar', legendName: 'Solar', sign: 1, color: '--energy-solar-color', fallback: '#ff9800' },
  { key: 'battery_out', label: 'Speicher', legendName: 'Batterie', sign: 1, color: '--energy-battery-out-color', fallback: '#4db0a2', pair: 'battery', short: 'entladen' },
  { key: 'battery_in', label: 'Speicher', legendName: 'Batterie', sign: -1, color: '--energy-battery-in-color', fallback: '#f6c34c', pair: 'battery', short: 'geladen' },
  { key: 'grid_import', label: 'Netz', legendName: 'Netz', sign: -1, color: '--energy-grid-consumption-color', fallback: '#488fc2', pair: 'grid', short: 'Bezug' },
  { key: 'grid_export', label: 'Netz', legendName: 'Netz', sign: -1, color: '--energy-grid-return-color', fallback: '#8353d1', pair: 'grid', short: 'Einspeisung' },
  { key: 'house_energy', label: 'Haushalt', legendName: 'Haushalt', sign: -1, color: '--wuefl-house-color', fallback: '#e57373' },
  { key: 'wallbox_energy', label: 'Wallbox', legendName: 'Wallbox', sign: -1, color: '--wuefl-wallbox-color', fallback: '#ba68c8' },
];

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${CHART_HINT_CSS}
.chart-slot { display: block; }
`;

class WueflEnergyHistoryCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #stopPeriod = null;
  #card = null;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-history-card-editor'); }
  static getStubConfig() { return { title: 'Verteilung' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Verteilung', ...this.#central, ...this.#own };
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (this.#card) this.#card.hass = hass;
    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
      this.#stopPeriod = onPeriodChange(() => this.#refresh());
    }
    if (!this.#built) this.#build();
  }

  disconnectedCallback() { this.#stopPeriod?.(); }
  getCardSize() { return 6; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Verteilung', ...this.#central, ...this.#own };
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
    card.className = 'card';
    card.innerHTML = '<div class="chart-slot"></div>';
    root.replaceChildren(card);
    this.#els = { slot: card.querySelector('.chart-slot') };
    this.#built = true;
    this.#refresh();
  }

  #used() { return SERIES.filter((s) => asList(this.#config[s.key]).length); }

  /** Bar unter ~7 Tagen ist unlesbar, Linie ab dort übersichtlicher. */
  #isLineChart(range) {
    if (range.period === 'day' || range.period === 'week') return true;
    if (range.period === 'month' || range.period === 'year') return false;
    return (range.end - range.start) / 86_400_000 <= 7;
  }

  #chartConfig(range) {
    const isLine = this.#isLineChart(range);
    const chartType = isLine ? 'line' : 'bar';
    const series = [];
    const seenLegends = new Set();

    for (const s of this.#used()) {
      for (const id of asList(this.#config[s.key])) {
        const legendName = s.legendName || s.label;
        const isDuplicate = seenLegends.has(legendName);
        seenLegends.add(legendName);
        series.push({
          statistic_id: id,
          name: legendName,
          stat_type: 'change',
          chart_type: chartType,
          fill: isLine,
          gradient_fill: isLine,
          color: cssColor(this, s.color, s.fallback),
          unit: 'kWh',
          stack: s.sign > 0 ? 'up' : 'down',
          multiply: s.sign > 0 ? 1 : -1,
          show_in_legend: !isDuplicate,
        });
      }
    }

    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '260px',
      y_axes: [{ id: 'left', fit_y_data: true, unit: 'kWh', center_zero: true }],
      period: this.#isLineChart(range) && (range.end - range.start) <= 86_400_000 ? '5minute' : undefined,
      timespan: { mode: 'fixed', start: range.start.toISOString(), end: range.end.toISOString() },
      series,
    };
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const range = getPeriod();
    this.#card = await embedGraphCard(this.#hass, this.#card, this.#els.slot, this.#chartConfig(range));
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyHistoryCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('wuefl-energy-history-card', WueflEnergyHistoryCard);
customElements.define('wuefl-energy-history-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'wuefl-energy-history-card',
  name: 'wuefl Energie-Verteilung',
  description: 'Das Hauptdiagramm der Energie-Ansicht — folgt der Zeitraum-Karte daneben.',
});
