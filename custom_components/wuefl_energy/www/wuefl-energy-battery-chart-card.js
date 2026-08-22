/**
 * wuefl-energy-battery-chart-card
 * Nur der Ladestand-Verlauf (SOC, %) — eigener Abschnitt, blendet sich
 * selbst aus, wenn kein Speicher zugeordnet ist oder der gewählte
 * Zeitraum länger als ein Tag ist (Mittelwert über Wochen wäre wenig
 * aussagekräftig für einen Prozentwert).
 */
import {
  asList, registerCard, centralConfig, WueflFormEditor, sel, GRID_CSS,
  cssColor, getPeriod, onPeriodChange, embedGraphCard, CHART_HINT_CSS,
} from './wuefl-energy-shared.js';

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${CHART_HINT_CSS}
.chart-slot { display: block; }
`;

class WueflEnergyBatteryChartCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #stopPeriod = null;
  #card = null;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-battery-chart-card-editor'); }
  static getStubConfig() { return { title: 'Speicher' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Speicher', ...this.#central, ...this.#own };
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
    this.#config = { title: 'Speicher', ...this.#central, ...this.#own };
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
    const socIds = asList(this.#config.battery_soc);
    // Ladestand als Verlauf über Wochen/Monate wäre nur ein flaches Band,
    // das keine sinnvolle Aussage mehr trifft — deshalb nur an Tagen.
    const isOneDay = (range.end - range.start) <= 86_400_000;
    if (!socIds.length || !isOneDay) return null;

    const series = socIds.map((id, i) => ({
      statistic_id: id,
      name: socIds.length > 1 ? `Speicher ${i + 1}` : 'Ladestand',
      stat_type: 'mean',
      chart_type: 'line',
      fill: true,
      gradient_fill: true,
      smooth: 1,
      color: cssColor(this, '--energy-battery-out-color', '#4db0a2'),
      unit: '%',
    }));

    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '180px',
      y_axes: [{ id: 'left', fit_y_data: true, unit: '%', center_zero: false }],
      period: '5minute',
      timespan: { mode: 'fixed', start: range.start.toISOString(), end: range.end.toISOString() },
      series,
    };
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const range = getPeriod();
    const config = this.#chartConfig(range);
    if (!config) {
      // Kein Speicher oder Zeitraum zu lang: die ganze Karte weglassen,
      // nicht nur leer anzeigen.
      this.hidden = true;
      return;
    }
    this.hidden = false;
    this.#card = await embedGraphCard(this.#hass, this.#card, this.#els.slot, config);
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyBatteryChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('wuefl-energy-battery-chart-card', WueflEnergyBatteryChartCard);
customElements.define('wuefl-energy-battery-chart-card-editor', WueflEnergyBatteryChartCardEditor);

registerCard({
  type: 'wuefl-energy-battery-chart-card',
  name: 'wuefl Speicher-Verlauf',
  description: 'Ladestand-Diagramm für die Energie-Ansicht, nur an Einzeltagen.',
});
