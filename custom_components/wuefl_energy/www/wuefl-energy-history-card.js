/**
 * wuefl-energy-history-card
 * Das Hauptdiagramm ("Verteilung"). Baut nur die Konfiguration aus der
 * Zuordnung, gezeichnet wird von <wuefl-energy-chart>.
 *
 * "legend_group" fasst Reihen in der Legende zusammen: Netzbezug und
 * Einspeisung erscheinen als ein Eintrag "Netz", der beide gemeinsam
 * ein- und ausblendet — ebenso Laden/Entladen als "Batterie".
 */
import { asList, registerCard, WueflFormEditor, sel } from './wuefl-energy-shared.js';
import { WueflChartWrapper } from './wuefl-energy-chart-base.js';

const SERIES = [
  { key: 'pv_energy', name: 'Solar', group: 'Solar', sign: 1, color: 'var(--energy-solar-color, #ff9800)' },
  { key: 'battery_out', name: 'Batterie entladen', group: 'Batterie', sign: 1, color: 'var(--energy-battery-out-color, #4db0a2)' },
  { key: 'battery_in', name: 'Batterie geladen', group: 'Batterie', sign: -1, color: 'var(--energy-battery-in-color, #f6c34c)' },
  { key: 'grid_import', name: 'Netz Bezug', group: 'Netz', sign: 1, color: 'var(--energy-grid-consumption-color, #488fc2)' },
  { key: 'grid_export', name: 'Netz Einspeisung', group: 'Netz', sign: -1, color: 'var(--energy-grid-return-color, #8353d1)' },
  { key: 'house_energy', name: 'Haushalt', group: 'Haushalt', sign: -1, color: 'var(--wuefl-house-color, #e57373)' },
  { key: 'wallbox_energy', name: 'Wallbox', group: 'Wallbox', sign: -1, color: 'var(--wuefl-wallbox-color, #ba68c8)' },
  { key: 'heatpump_energy', name: 'Wärmepumpe', group: 'Wärmepumpe', sign: -1, color: 'var(--wuefl-heatpump-color, #d85a30)' },
];

class WueflEnergyHistoryCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('wuefl-energy-history-card-editor'); }
  static getStubConfig() { return { title: 'Verteilung' }; }

  get defaultTitle() { return 'Verteilung'; }
  getCardSize() { return 6; }

  buildChartConfig(range) {
  const oneMonthLater = new Date(range.start);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const series = [];
    for (const s of SERIES) {
      for (const entity of asList(this._config[s.key])) {
        series.push({
          entity,
          name: s.name,
          legend_group: s.group,
          color: s.color,
          stat_type: 'change',
          sign: s.sign,
          fill: 'gradient',
          stack: s.sign > 0 ? 'up' : 'down',
          type: range.overMonth ? "bar":"line"
        });
      }
    }
    if (!series.length) return null;

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: 'kWh' }],
      legend: [{ hidden: false, position: 'bottom-center' }],
      series,
      // Chip: die Erzeugung im Zeitraum, unabhängig von der Aggregation.
      // ...(asList(this._config.pv_energy).length
      //   ? {
      //       chip: {
      //         entity: asList(this._config.pv_energy)[0],
      //         unit: 'kWh',
      //         stat_type: 'change',
      //         calc_type: 'sum',
      //         color: 'var(--energy-solar-color, #ff9800)',
      //       },
      //     }
      //   : {}),
    };
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
  description: 'Hauptdiagramm mit Legenden-Gruppen — folgt der Zeitraum-Karte.',
});
