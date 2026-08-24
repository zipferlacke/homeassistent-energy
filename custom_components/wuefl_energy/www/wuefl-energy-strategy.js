/**
 * wuefl-energy-strategy.js
 * Erzeugt das Dashboard über den wuefl-energy-grid-container.
 */

import { deriveConfig, normalizeConfig } from './wuefl-energy-shared.js';

// =======================================================
// Lazy Loader für Cards & Grid-Container
// =======================================================
let cardsLoaded = null;
function ensureCards() {
  if (!cardsLoaded) {
    cardsLoaded = Promise.all([
      import('./wuefl-energy-grid-container.js'),
      import('./wuefl-energy-live-card.js'),
      import('./wuefl-energy-history-card.js'),
      import('./wuefl-energy-period-card.js'),
      import('./wuefl-energy-tiles-card.js'),
      import('./wuefl-energy-battery-chart-card.js'),
      import('./wuefl-energy-solar-chart-card.js'),
      import('./wuefl-wallbox-card.js'),
      import('./wuefl-energy-settings-card.js'),
      import('./wuefl-energy-config-card.js'),
    ]);
  }
  return cardsLoaded;
}

async function loadConfig(hass) {
  try {
    return normalizeConfig(await hass.callWS({ type: 'wuefl_energy/get' }));
  } catch {
    return normalizeConfig({});
  }
}

// =======================================================
// Dashboard Strategy Class
// =======================================================
class WueflEnergyDashboardStrategy {
  static async generate(config, hass) {
    await ensureCards();

    const raw = await loadConfig(hass);
    const derived = deriveConfig(raw);
    const views = [];

    // ---------------------------------------------------
    // Live - Seite
    // ---------------------------------------------------
    const temps = raw.info?.temperatures ?? [];
    const extra = raw.info?.extra_entities ?? [];
    const hasLive = !!raw.grid?.power || !!raw.solar?.power || raw.battery.length > 0;

    if (hasLive) {
      const liveCards = [{ type: 'custom:wuefl-energy-live-card', slot: 'live' }];
      const hasSideCards = temps.length > 0 || extra.length > 0;

      if (temps.length) {
        liveCards.push({ type: 'entities', title: 'Temperaturen', entities: temps, slot: 'temps' });
      }
      if (extra.length) {
        liveCards.push({ type: 'entities', title: 'Weitere Werte', entities: extra, slot: 'extra' });
      }

      views.push({
        title: 'Live',
        path: 'live',
        icon: 'mdi:home-lightning-bolt',
        type: 'sections',
        show_icon_and_title: true,
        sections: [{
          cards: [{
            type: 'custom:wuefl-energy-grid-container',
            grid_options: {
              columns: 'full'
            },
            views: hasSideCards ? [
              {
                min: '800px',
                columns: '2fr 1fr',
                areas: `
                  "live temps"
                  "live extra"
                `
              }
            ] : [],
            cards: liveCards
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // Energiehistorie - Seite
    // ---------------------------------------------------
    const energyGroups = {
      pv: derived.history.pv_energy, batteryOut: derived.history.battery_out,
      gridExport: derived.history.grid_export, gridImport: derived.history.grid_import,
      batteryIn: derived.history.battery_in, house: derived.history.house_energy,
      wallbox: derived.history.wallbox_energy, heatpump: derived.history.heatpump_energy,
    };
    const hasEnergyEntities = Object.values(energyGroups).some((l) => l.length);

    if (hasEnergyEntities) {
      views.push({
        title: 'Energie',
        path: 'energie',
        icon: 'mdi:chart-box',
        show_icon_and_title: true,
        type: 'sections',
        sections: [{
          cards: [{
            type: 'custom:wuefl-energy-grid-container',
            grid_options: {
              columns: 'full'
            },
            views: [
              {
                min: '1000px',
                columns: '2fr  1fr',
                areas: `
                  "head head"
                  "period period"
                  "history tiles"
                  "battery tiles"
                  "solar tiles"
                `
              }
            ],
            cards: [
              { type: 'markdown', content: '# Energieverlauf', text_only: true, slot: 'head' },
              { type: 'custom:wuefl-energy-period-card', slot: 'period' },
              { type: 'custom:wuefl-energy-history-card', slot: 'history' },
              { type: 'custom:wuefl-energy-tiles-card', slot: 'tiles' },
              { type: 'custom:wuefl-energy-battery-chart-card', slot: 'battery' },
              { type: 'custom:wuefl-energy-solar-chart-card', slot: 'solar' },
            ]
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // Wallbox - Seite
    // ---------------------------------------------------
    if (raw.wallboxes.length) {
      const multiple = raw.wallboxes.length > 1;
      const wbCards = [
        { type: 'markdown', content: multiple ? '# Wallboxen' : '# Wallbox', text_only: true, slot: 'head' },
        ...raw.wallboxes.map((wb, i) => ({
          type: 'custom:wuefl-wallbox-card',
          slot: `wb_${i}`
        }))
      ];

      const wbAreaDesktop = multiple
        ? ['"head head"', ...Array.from({ length: Math.ceil(raw.wallboxes.length / 2) }, (_, i) => {
            const left = `wb_${i * 2}`;
            const right = raw.wallboxes[i * 2 + 1] ? `wb_${i * 2 + 1}` : `wb_${i * 2}`;
            return `"${left} ${right}"`;
          })].join('\n')
        : '';

      views.push({
        title: multiple ? 'Wallboxen' : 'Wallbox',
        path: 'wallbox',
        icon: 'mdi:ev-station',
        show_icon_and_title: true,
        type: 'sections',
        sections: [{
          cards: [{
            type: 'custom:wuefl-energy-grid-container',
            grid_options: {
              columns: 'full'
            },
            views: multiple ? [
              {
                min: '1000px',
                columns: 'repeat(auto-fit, minmax(500px, 1fr))',
              }
            ] : [],
            cards: wbCards
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // Einstellungen - Seite
    // ---------------------------------------------------
    views.push({
      title: 'Einstellungen',
      path: 'einstellungen',
      icon: 'mdi:cog',
      type: 'sections',
      sections: [{
        cards: [{
          type: 'custom:wuefl-energy-grid-container',
          grid_options: {
            columns: 'full'
          },
          cards: [
            { type: 'markdown', content: '# Einstellungen', text_only: true, slot: 'head' },
            { type: 'custom:wuefl-energy-settings-card', slot: 'main' },
          ]
        }]
      }]
    });

    // ---------------------------------------------------
    // Zuordnung - Seite (Sub-View)
    // ---------------------------------------------------
    views.push({
      title: 'Zuordnung',
      path: 'zuordnung',
      icon: 'mdi:format-list-checks',
      type: 'sections',
      subview: true,
      sections: [{
        cards: [{
          type: 'custom:wuefl-energy-grid-container',
          grid_options: {
            columns: 'full'
          },
          cards: [
            { type: 'custom:wuefl-energy-config-card', slot: 'main' },
          ]
        }]
      }]
    });

    return { title: 'wuefl Energie', views };
  }
}

customElements.define('ll-strategy-dashboard-wuefl-energy', WueflEnergyDashboardStrategy);

window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((s) => s.type === 'wuefl-energy')) {
  window.customStrategies.push({
    type: 'wuefl-energy',
    strategyType: 'dashboard',
    name: 'wuefl Energie',
    description: 'Live-Energiefluss, Bilanz, Wallboxen — dynamisch strukturiert per Custom Grid Container.',
  });
}