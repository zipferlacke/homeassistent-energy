/**
 * we-history-chart-card.js
 * Hauptdiagramm ("Verteilung") auf Basis der präzisen Objekt-/Array-Struktur aus we-config-card.js.
 */
import { registerCard, WueflFormEditor, sel } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

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

function getEntitiesForSeries(cfg, key) {
  const list = [];

  const push = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(push);
    } else if (typeof val === 'string') {
      list.push(val);
    } else if (typeof val === 'object' && val.entity) {
      list.push(val.entity);
    }
  };

  switch (key) {
    // Arrays (kind: 'list')
    case 'pv_energy':
      cfg.solar?.forEach((s) => push(s.total));
      break;
    case 'battery_out':
      cfg.battery?.forEach((b) => push(b.out_total));
      break;
    case 'battery_in':
      cfg.battery?.forEach((b) => push(b.in_total));
      break;
    case 'wallbox_energy':
      cfg.wallboxes?.forEach((w) => push(w.total));
      break;
    case 'heatpump_energy':
      cfg.heatpump?.forEach((hp) => push(hp.total));
      break;

    // Einzelne Objekte (kind: 'single') – Felder können Strings oder Arrays sein (multiple: true)
    case 'grid_import':
      push(cfg.grid?.import_total);
      break;
    case 'grid_export':
      push(cfg.grid?.export_total);
      break;
    case 'house_energy':
      push(cfg.consumers?.total);
      break;
  }

  return [...new Set(list)];
}

class WueflEnergyHistoryCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-history-chart-card-editor'); }
  static getStubConfig() { return { title: 'Verteilung' }; }

  get defaultTitle() { return 'Verteilung'; }
  getCardSize() { return 6; }

  buildChartConfig(range) {
    const series = [];

    for (const s of SERIES) {
      const entities = getEntitiesForSeries(this._config, s.key);
      for (const entity of entities) {
        series.push({
          entity,
          name: s.name,
          legend_group: s.group,
          color: s.color,
          stat_type: 'change',
          sign: s.sign,
          fill: 'gradient',
          stack: s.sign > 0 ? 'up' : 'down',
          type: range.overMonth ? 'bar' : 'line',
        });
      }
    }

    if (!series.length) return null;

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: 'kWh' }],
      legend: [{ hidden: false, position: 'bottom-center' }],
      series,
    };
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };

class WueflEnergyHistoryCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('we-history-chart-card', WueflEnergyHistoryCard);
customElements.define('we-history-chart-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'we-history-chart-card',
  name: 'wuefl Energie-Verteilung',
  description: 'Hauptdiagramm mit Legenden-Gruppen — folgt der Zeitraum-Karte.',
});