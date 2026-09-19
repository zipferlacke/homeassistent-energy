/**
 * we-price-chart-card.js
 * Strompreis des Tages als normales Diagramm.
 *
 * Anders als die Verlaufskarten hängt diese Karte nicht am Zeitraum-Picker:
 * Ein Preis gilt für heute (und, sobald die Börse sie veröffentlicht hat,
 * für morgen). Die Werte kommen aus dem Prognose-Sensor der Zuordnung –
 * dieselbe Quelle, die auch die Wallbox fürs Preisladen nutzt.
 */
import './we-chart.js';
import { registerCard, WueflFormEditor, sel, centralConfig, priceInfo, colorOf, adoptSheet } from './we-shared.js';

// Die Karte steht in einer Zeile mit automatischer Höhe – das Diagramm
// braucht deshalb eine eigene
const CSS = ':host { display: block; height: 320px; } we-chart { height: 100%; }';

class WueflEnergyPriceChartCard extends HTMLElement {
  static getConfigElement() { return document.createElement('we-price-chart-card-editor'); }
  static getStubConfig() { return { title: 'Strompreis' }; }

  #own = {};
  #config = {};
  #hass = null;
  #chart = null;
  #sig = '';

  setConfig(config) { this.#own = config ?? {}; }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) this.#loadCentral();
    else this.#refresh();
  }

  async #loadCentral() {
    this.#config = { ...(await centralConfig(this.#hass)), ...this.#own };
    this.#refresh(true);
  }

  connectedCallback() {
    window.addEventListener('we-config-changed', this.#onConfig);
    this.#refresh(true);
  }

  disconnectedCallback() {
    window.removeEventListener('we-config-changed', this.#onConfig);
  }

  #onConfig = () => this.#loadCentral();

  /** Nur neu zeichnen, wenn sich die Preise wirklich geändert haben. */
  #refresh(force = false) {
    if (!this.#hass) return;
    const price = priceInfo(this.#hass, this.#config, 'import');
    const rows = price.forecast;
    if (!rows.length) {
      this.hidden = true;
      return;
    }
    const sig = `${rows.length}:${+rows[0].time}:${+rows[rows.length - 1].time}:${price.now}`;
    if (!force && sig === this.#sig) return;
    this.#sig = sig;
    this.hidden = false;

    if (!this.#chart) {
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      adoptSheet(root, CSS);
      this.#chart = document.createElement('we-chart');
      root.replaceChildren(this.#chart);
    }

    // Vom ersten Preis bis zum Ende der letzten Stunde
    const step = rows.length > 1 ? +rows[1].time - +rows[0].time : 3600_000;
    const start = new Date(rows[0].time);
    const end = new Date(+rows[rows.length - 1].time + step);
    const color = colorOf('grid', this.#config.grid);

    this.#chart.setConfig({
      title: this.#own.title ?? 'Strompreis',
      start: start.toISOString(),
      end: end.toISOString(),
      aggregation: step >= 3600_000 ? '1h' : '15min',
      y_axes: [{ unit: 'ct/kWh' }],
      legend: [{ hidden: true }],
      series: [{
        name: 'Strompreis',
        unit: 'ct/kWh',
        // Treppe: ein Preis gilt für die ganze Stunde
        data: rows.map((r) => [+r.time, Math.round(r.value * 100) / 100]),
        color,
        type: 'line',
        step: 'end',
        smooth: false,
        fill: 'gradient',
      }],
      ...(price.now === null ? {} : {
        chip: { value: Math.round(price.now * 100) / 100, unit: 'ct/kWh', color },
      }),
    });
    this.#chart.hass = this.#hass;
  }

  getCardSize() { return 6; }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyPriceChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-price-chart-card', WueflEnergyPriceChartCard);
customElements.define('we-price-chart-card-editor', WueflEnergyPriceChartCardEditor);

registerCard({
  type: 'we-price-chart-card',
  name: 'wuefl Strompreis',
  description: 'Der Börsenstrompreis für heute und morgen als Diagramm.',
});
