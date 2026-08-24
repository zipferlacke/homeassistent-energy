/**
 * we-battery-chart-card
 * Ladestand-Verlauf (SOC in %).
 *
 * Feste Y-Achse 0–100 mit Schritt 25: der Wertebereich ist ja immer
 * derselbe, und ohne feste Vorgabe würden die Striche je nach Tagesverlauf
 * wandern. Die Karte ist bewusst flacher als die übrigen Diagramme — im
 * Raster über weniger Zeilen, im freien Layout über chart_height.
 */
import { asList, registerCard, WueflFormEditor, sel } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

class WueflEnergyBatteryChartCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-battery-chart-card-editor'); }
  static getStubConfig() { return { title: 'Batterie' }; }

  get defaultTitle() { return 'Batterie'; }
  getCardSize() { return 3; }

  buildChartConfig(range) {
    const socIds = asList(this._config.battery_soc);
    if (!socIds.length) return null;

    const series = socIds.map((entity, i) => ({
      entity,
      name: socIds.length > 1 ? `Batterie ${i + 1}` : 'Ladestand',
      color: 'var(--energy-battery-out-color, #4db0a2)',
      stat_type: 'mean',
      fill: 'gradient',
    }));

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: '%', min: 0, max: 100, interval: 25 }],
      // Eine einzelne Reihe braucht keine Legende — der Titel sagt schon,
      // was zu sehen ist.
      legend: [{ hidden: socIds.length <= 1, position: 'top-right' }],
      series,
      chip: {
        entity: socIds[0],
        unit: '%',
        stat_type: 'mean',
        calc_type: 'last',
        color: 'var(--energy-battery-out-color, #4db0a2)',
      },
    };
  }
}

const SCHEMA = [];
const LABELS = {};
class WueflEnergyBatteryChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-battery-chart-card', WueflEnergyBatteryChartCard);
customElements.define('we-battery-chart-card-editor', WueflEnergyBatteryChartCardEditor);

registerCard({
  type: 'we-battery-chart-card',
  name: 'wuefl Batterie-Verlauf',
  description: 'Ladestand mit fester Skala 0–100 %.',
});
