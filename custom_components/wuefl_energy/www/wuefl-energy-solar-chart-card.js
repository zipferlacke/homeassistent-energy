/**
 * wuefl-energy-solar-chart-card
 * "Gesamt" plus eine Linie je Dachfläche, als Mittelwert der Leistung.
 *
 * Der Chip zeigt bewusst NICHT einen Wert aus dem Diagramm: das zeigt
 * Leistung (W), und deren Mittelwert ist keine Energiemenge. Er hängt
 * stattdessen am kWh-Gesamtzähler — nur so steht dort die tatsächliche
 * Gesamterzeugung.
 */
import { asList, registerCard, WueflFormEditor, sel } from './wuefl-energy-shared.js';
import { WueflChartWrapper } from './wuefl-energy-chart-base.js';

const STRING_COLORS = [
  'var(--energy-grid-consumption-color, #488fc2)',
  'var(--wuefl-wallbox-color, #ba68c8)',
  'var(--energy-battery-out-color, #4db0a2)',
  'var(--wuefl-heatpump-color, #d85a30)',
];

class WueflEnergySolarChartCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('wuefl-energy-solar-chart-card-editor'); }
  static getStubConfig() { return { title: 'Solarproduktion' }; }

  get defaultTitle() { return 'Solarproduktion'; }

  buildChartConfig(range) {
    const mainPower = this._central?.raw?.solar?.power;
    const strings = (this._central?.raw?.strings ?? []).filter((s) => s.power);
    const series = [];

    if (mainPower) {
      series.push({
        entity: mainPower,
        name: 'Gesamt',
        color: 'var(--energy-solar-color, #ff9800)',
        stat_type: 'mean',
        fill: 'gradient',
      });
    }
    strings.forEach((str, i) => {
      series.push({
        entity: str.power,
        name: str.name || `Fläche ${i + 1}`,
        color: STRING_COLORS[i % STRING_COLORS.length],
        stat_type: 'mean',
        fill: 'gradient',
      });
    });
    if (!series.length) return null;

    const energyIds = asList(this._config.pv_energy);
    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: 'kW' }],
      legend: [{ hidden: false, position: 'top-right' }],
      series,
      ...(energyIds.length
        ? {
            chip: {
              entity: energyIds[0],
              unit: 'kWh',
              stat_type: 'change',
              calc_type: 'sum',
              color: 'var(--energy-solar-color, #ff9800)',
            },
          }
        : {}),
    };
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
  description: 'Gesamt- und Einzeldach-Leistung, Chip zeigt den Ertrag in kWh.',
});
