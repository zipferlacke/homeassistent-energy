/**
 * we-battery-chart-card.js
 * Ladestand-Verlauf (SOC in %).
 *
 * Liest den Akkustand (percent), Name und Farbe aus dem neuen zentralen
 * `battery`-Array der we-config-card.
 */
import { registerCard, WueflFormEditor, sel } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

function getBatterySocSeries(cfg) {
  const batteries = cfg.battery ?? [];
  const series = [];

  batteries.forEach((b, i) => {
    const rawEntity = b.percent;
    const entity = typeof rawEntity === 'string' ? rawEntity : rawEntity?.entity;
    if (!entity) return;

    series.push({
      entity,
      name: b.name || (batteries.length > 1 ? `Batterie ${i + 1}` : 'Ladestand'),
      color: b.color || 'var(--energy-battery-out-color, #4db0a2)',
      stat_type: 'mean',
      fill: 'gradient',
    });
  });

  return series;
}

class WueflEnergyBatteryChartCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-battery-chart-card-editor'); }
  static getStubConfig() { return { title: 'Batterie' }; }

  get defaultTitle() { return 'Batterie'; }
  getCardSize() { return 3; }

  buildChartConfig(range) {
    const series = getBatterySocSeries(this._config);
    if (!series.length) return null;

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: '%', min: 0, max: 100, interval: 25 }],
      legend: [{ hidden: series.length <= 1, position: 'top-right' }],
      series,
      chip: {
        entity: series[0].entity,
        unit: '%',
        stat_type: 'mean',
        calc_type: 'last',
        color: series[0].color,
      },
    };
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyBatteryChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-battery-chart-card', WueflEnergyBatteryChartCard);
customElements.define('we-battery-chart-card-editor', WueflEnergyBatteryChartCardEditor);

registerCard({
  type: 'we-battery-chart-card',
  name: 'wuefl Batterie-Verlauf',
  description: 'Ladestand mit fester Skala 0–100 %.',
});