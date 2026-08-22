/**
 * wuefl-energy-solar-chart-card
 * "Gesamt" plus eine Linie je Dachfläche, als Mittelwert der Leistung (W)
 * — braucht dafür keinen eigenen kWh-Zähler pro Fläche, nur den ohnehin
 * vorhandenen Leistungssensor. Eigener Abschnitt, blendet sich selbst
 * aus, wenn keine Solaranlage zugeordnet ist.
 */
import {
  registerCard, centralConfig, WueflFormEditor, sel, GRID_CSS,
  cssColor, getPeriod, onPeriodChange, embedGraphCard, CHART_HINT_CSS,
} from './wuefl-energy-shared.js';

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${CHART_HINT_CSS}
.chart-slot { display: block; }
`;

class WueflEnergySolarChartCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #stopPeriod = null;
  #card = null;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-solar-chart-card-editor'); }
  static getStubConfig() { return { title: 'Solarproduktion' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Solarproduktion', ...this.#central, ...this.#own };
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
  getCardSize() { return 3; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Solarproduktion', ...this.#central, ...this.#own };
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

  #chartConfig(range) {
    const series = [];
    const mainPower = this.#central?.raw?.solar?.power;
    if (mainPower) {
      series.push({
        statistic_id: mainPower,
        chart_type: 'line',
        id: 'series_total',
        name: 'Gesamt',
        stat_type: 'mean',
        fill: true,
        gradient_fill: true,
        line_style: 'dashed',
        smooth: 1,
        color: cssColor(this, '--energy-solar-color', '#ff9800'),
      });
    }

    const strings = this.#central?.raw?.strings ?? [];
    strings.forEach((str, i) => {
      const entity = str.power;
      if (entity && !series.some((s) => s.statistic_id === entity)) {
        series.push({
          statistic_id: entity,
          chart_type: 'line',
          id: `series_${i + 1}`,
          name: str.name || `Fläche ${i + 1}`,
          stat_type: 'mean',
          fill: true,
          gradient_fill: true,
          smooth: 1,
        });
      }
    });
    if (!series.length) return null;

    const isOneDay = (range.end - range.start) <= 86_400_000;
    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '180px',
      y_axes: [{ id: 'left', fit_y_data: true, unit: 'W', center_zero: false }],
      period: isOneDay ? '5minute' : undefined,
      timespan: { mode: 'fixed', start: range.start.toISOString(), end: range.end.toISOString() },
      series,
    };
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const range = getPeriod();
    const config = this.#chartConfig(range);
    if (!config) {
      this.hidden = true;
      return;
    }
    this.hidden = false;
    this.#card = await embedGraphCard(this.#hass, this.#card, this.#els.slot, config);
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergySolarChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('wuefl-energy-solar-chart-card', WueflEnergySolarChartCard);
customElements.define('wuefl-energy-solar-chart-card-editor', WueflEnergySolarChartCardEditor);

registerCard({
  type: 'wuefl-energy-solar-chart-card',
  name: 'wuefl Solarproduktion',
  description: 'Gesamt- und Einzeldach-Leistung für die Energie-Ansicht.',
});
