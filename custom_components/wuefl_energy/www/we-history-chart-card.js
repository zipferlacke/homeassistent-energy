/**
 * we-history-chart-card.js
 * Hauptdiagramm ("Verteilung") auf Basis der präzisen Objekt-/Array-Struktur aus we-config-card.js.
 */
import { registerCard, WueflFormEditor, sel, asList, colorOf } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

/**
 * Welche Zähler in die Verteilung gehen. Je Objekt der Zuordnung eine
 * Serie in dessen Farbe – bei mehreren Objekten einer Art (zwei PV-Anlagen,
 * zwei Wallboxen …) mit deren Namen in der Legende.
 */
const SERIES = [
  { kind: 'solar', list: true, field: 'total', group: 'Solar', sign: 1 },
  { kind: 'battery', list: true, field: 'out_total', group: 'Batterie entladen', sign: 1 },
  { kind: 'battery', list: true, field: 'in_total', group: 'Batterie geladen', sign: -1, color: 'color_in' },
  { kind: 'grid', field: 'import_total', group: 'Netz Bezug', sign: 1 },
  { kind: 'grid', field: 'export_total', group: 'Netz Einspeisung', sign: -1, color: 'color_export' },
  { kind: 'consumers', field: 'total', group: 'Haushalt', sign: -1 },
  { kind: 'wallboxes', list: true, field: 'total', group: 'Wallbox', sign: -1 },
  { kind: 'heatpump', list: true, field: 'total', group: 'Wärmepumpe', sign: -1 },
];

const entityOf = (v) => (typeof v === 'string' ? v : v?.entity ?? null);

function seriesEntries(cfg, def) {
  const entries = def.list ? asList(cfg[def.kind]) : [cfg[def.kind] ?? {}];
  const many = entries.length > 1;
  return entries.flatMap((entry, i) => {
    const name = many ? `${def.group} · ${entry.name || i + 1}` : def.group;
    const color = colorOf(def.kind, entry, i, def.color ?? 'color');
    return [...new Set(asList(entry[def.field]).map(entityOf).filter(Boolean))]
      .map((entity) => ({ entity, name, color }));
  });
}

class WueflEnergyHistoryCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-history-chart-card-editor'); }
  static getStubConfig() { return { title: 'Verteilung' }; }

  get defaultTitle() { return 'Verteilung'; }
  getCardSize() { return 6; }

  buildChartConfig(range) {
    const series = [];

    for (const def of SERIES) {
      for (const { entity, name, color } of seriesEntries(this._config, def)) {
        series.push({
          entity,
          name,
          legend_group: name,
          color,
          stat_type: 'change',
          // Zählerstände laufen nur vorwärts – ein Minus ist eine Korrektur
          only_positive: true,
          sign: def.sign,
          fill: 'gradient',
          // Ein gemeinsamer Stapel: ECharts stapelt positive Werte nach oben
          // und negative nach unten – so stehen die Balken übereinander statt
          // nebeneinander und können doppelt so breit sein.
          stack: 'energie',
          type: range.overMonth ? 'bar' : 'line',
        });
      }
    }

    if (!series.length) return null;

    return {
      aggregation: this._aggregation(range),
      // Feiner geht nicht als die Zähler zählen – gröber schon, siehe we-chart
      adaptive: true,
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