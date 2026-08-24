/**
 * we-solar-chart-card
 * "Gesamt" plus eine Linie je Dachfläche, als Mittelwert der Leistung.
 * Reines Diagramm ohne Überschriftenzeile.
 */
import { asList, registerCard, WueflFormEditor, sel } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

const STRING_COLORS = [
  'var(--energy-grid-consumption-color, #488fc2)',
  'var(--wuefl-wallbox-color, #ba68c8)',
  'var(--energy-battery-out-color, #4db0a2)',
  'var(--wuefl-heatpump-color, #d85a30)',
];

class WueflEnergySolarChartCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-solar-chart-card-editor'); }
  static getStubConfig() { return {title:'Solarproduktion'}; }

  get defaultTitle() { return 'Solarproduktion'; }

  // HIER ist die Magie: Überschreibt den Standard der Basisklasse!
  get centralConfigType() { return 'live'; }

  // Bleibt wieder komplett synchron und sauber
  buildChartConfig(range) {
    const sensors = this._config;

    const mainPower = sensors?.pv_power_total;
    const strings = sensors?.pv_strings || [];
    const series = [];

    if (mainPower) {
      series.push({
        entity: mainPower,
        name: 'Gesamt',
        color: 'var(--energy-solar-color, #ff9800)',
        stat_type: 'mean',
        fill: 'gradient',
        type: range.overMonth ? "bar":"line"
      });
    }
    
    strings.forEach((str, i) => {
      series.push({
        entity: str.entity,
        name: str.name || `Fläche ${i + 1}`,
        color: STRING_COLORS[i % STRING_COLORS.length],
        stat_type: 'mean',
        fill: 'gradient',
        type: range.overMonth ? "bar":"line",
        ...(range.overMonth ? {stack: "bar"}:{})
      });
    });

    if (series.length === 0) return null;

    const energyEntity = (sensors?.pv_energy_total && sensors.pv_energy_total.length > 0) 
      ? sensors.pv_energy_total[0] 
      : mainPower;

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: 'kW' }],
      legend: [{ hidden: false, position: 'top-right' }],
      series,
      ...(energyEntity
        ? {
            chip: {
              entity: energyEntity,
              unit: 'kWh',
              stat_type: energyEntity !== mainPower ? 'sum' : 'mean',
              color: 'var(--energy-solar-color, #ff9800)',
            },
          }
        : {}),
    };
  }
}

const SCHEMA = [];
const LABELS = {};
class WueflEnergySolarChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-solar-chart-card', WueflEnergySolarChartCard);
customElements.define('we-solar-chart-card-editor', WueflEnergySolarChartCardEditor);

registerCard({
  type: 'we-solar-chart-card',
  name: 'wuefl Solarproduktion',
  description: 'Gesamt- und Einzeldach-Leistung als reine Diagrammkarte.',
});