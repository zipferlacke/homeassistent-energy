/**
 * we-solar-chart-card.js
 * Solarproduktion (Gesamt sowie einzelne Anlagen / Strings).
 * Liest die Konfiguration direkt aus dem zentralen `solar`-Array der we-config-card.
 */
import { registerCard, WueflFormEditor, sel, colorOf } from './we-shared.js';
import { WueflChartWrapper } from './we-chart-base.js';

function getEntity(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.entity) return val.entity;
  return null;
}

class WueflEnergySolarChartCard extends WueflChartWrapper {
  static getConfigElement() { return document.createElement('we-solar-chart-card-editor'); }
  static getStubConfig() { return { title: 'Solarproduktion' }; }

  get defaultTitle() { return 'Solarproduktion'; }

  buildChartConfig(range) {
    const solarPlants = this._config.solar ?? [];
    const series = [];
    let chipEntity = null;
    let colorIdx = 0;

    solarPlants.forEach((plant, plantIdx) => {
      const plantLive = getEntity(plant.live);
      const plantTotal = getEntity(plant.total);

      if (!chipEntity && plantTotal) {
        chipEntity = plantTotal;
      }

      if (plantLive) {
        series.push({
          entity: plantLive,
          name: plant.name || (solarPlants.length > 1 ? `Anlage ${plantIdx + 1}` : 'Gesamt'),
          color: colorOf('solar', plant, plantIdx),
          stat_type: 'mean',
          fill: 'gradient',
          type: range.overMonth ? 'bar' : 'line',
        });

        if (!chipEntity) {
          chipEntity = plantLive;
        }
      }

      const strings = plant.strings ?? [];
      strings.forEach((str, strIdx) => {
        const strLive = getEntity(str.live);
        if (!strLive) return;

        series.push({
          entity: strLive,
          name: str.name || `String ${strIdx + 1}`,
          color: colorOf('strings', str, colorIdx++),
          stat_type: 'mean',
          fill: 'gradient',
          type: range.overMonth ? 'bar' : 'line',
          ...(range.overMonth ? { stack: 'bar' } : {}),
        });
      });
    });

    if (series.length === 0) return null;

    return {
      aggregation: this._aggregation(range),
      y_axes: [{ unit: 'kW' }],
      legend: [{ hidden: false, position: 'bottom-right' }],
      series,
      ...(chipEntity
        ? {
            chip: {
              entity: chipEntity,
              unit: 'kWh',
              stat_type: 'sum',
              color: colorOf('solar', solarPlants[0]),
            },
          }
        : {}),
    };
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergySolarChartCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('we-solar-chart-card', WueflEnergySolarChartCard);
customElements.define('we-solar-chart-card-editor', WueflEnergySolarChartCardEditor);

registerCard({
  type: 'we-solar-chart-card',
  name: 'wuefl Solarproduktion',
  description: 'Gesamt- und Einzeldach-Leistung als reine Diagrammkarte.',
});