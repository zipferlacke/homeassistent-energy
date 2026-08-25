import { rawConfig } from './we-shared.js';

// =======================================================
// Lazy Loader für Cards & Grid-Container
// =======================================================
let cardsLoaded = null;
function ensureCards() {
  if (!cardsLoaded) {
    cardsLoaded = Promise.all([
      import('./we-grid-container.js'),
      import('./we-live-card.js'),
      import('./we-history-chart-card.js'),
      import('./we-period-card.js'),
      import('./we-tiles-card.js'),
      import('./we-battery-chart-card.js'),
      import('./we-solar-chart-card.js'),
      import('./wuefl-wallbox-card.js'),
      import('./we-settings-card.js'),
      import('./we-config-card.js'),
    ]);
  }
  return cardsLoaded;
}

// =======================================================
// Dashboard Strategy Class
// =======================================================
class WueflEnergyDashboardStrategy {
  static async generate(g, hass) {
    await ensureCards();
    
    // Direktes Laden der neuen Speicher-Struktur
    const config = (await rawConfig(hass, true)) ?? {};
    const views = [];

    // ---------------------------------------------------
    // 1. Live - Seite
    // ---------------------------------------------------
    const temps = config.systemdata?.temperatures ?? [];
    const extra = config.systemdata?.extra_entities ?? [];

    const hasGridLive = !!config.grid?.live;
    const hasSolarLive = Array.isArray(config.solar) && config.solar.some((s) => !!s.live);
    const hasBatteryLive = Array.isArray(config.battery) && config.battery.some((b) => !!b.live);
    const hasLive = hasGridLive || hasSolarLive || hasBatteryLive;

    if (hasLive) {
      const liveCards = [{ type: 'custom:we-live-card', slot: 'live' }];
      const hasSideCards = temps.length > 0 || extra.length > 0;

      if (temps.length) {
        liveCards.push({ type: 'entities', title: 'Temperaturen', entities: temps, slot: 'temps' });
      }
      if (extra.length) {
        liveCards.push({ type: 'entities', title: 'Weitere Werte', entities: extra, slot: 'extra' });
      }

      const liveAreasMobile = ['"live"', temps.length ? '"temps"' : '', extra.length ? '"extra"' : ''].filter(Boolean).join('\n');
      
      let desktopAreas = '"live"';
      if (temps.length && extra.length) {
        desktopAreas = `"live temps"\n"live extra"`;
      } else if (temps.length) {
        desktopAreas = `"live temps"`;
      } else if (extra.length) {
        desktopAreas = `"live extra"`;
      }

      views.push({
        type: 'sections',
        title: 'Live',
        path: 'live',
        icon: 'mdi:home-lightning-bolt',
        show_icon_and_title: true,
        cards: [],
        max_columns: 4,
        sections: [{
          type: 'grid',
          column_span: 4,
          cards: [{
            type: 'custom:we-grid-container',
            grid_options: { columns: 'full' },
            views: [
              {
                max: '799px',
                columns: '1fr',
                areas: liveAreasMobile
              },
              ...(hasSideCards ? [{
                min: '800px',
                columns: '2fr 1fr',
                areas: desktopAreas
              }] : [{
                min: '800px',
                columns: '1fr',
                areas: `"live"`
              }])
            ],
            cards: liveCards
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // 2. Energiehistorie - Seite
    // ---------------------------------------------------
    const solarTotals = Array.isArray(config.solar) ? config.solar.map((s) => s.total).filter(Boolean) : [];
    const batteryInTotals = Array.isArray(config.battery) ? config.battery.map((b) => b.in_total).filter(Boolean) : [];
    const batteryOutTotals = Array.isArray(config.battery) ? config.battery.map((b) => b.out_total).filter(Boolean) : [];
    const wallboxTotals = Array.isArray(config.wallboxes) ? config.wallboxes.map((w) => w.total).filter(Boolean) : [];
    const heatpumpTotals = Array.isArray(config.heatpump) ? config.heatpump.map((h) => h.total).filter(Boolean) : [];

    const hasEnergyEntities = [
      config.grid?.import_total,
      config.grid?.export_total,
      config.consumers?.total,
      ...solarTotals,
      ...batteryInTotals,
      ...batteryOutTotals,
      ...wallboxTotals,
      ...heatpumpTotals,
    ].some(Boolean);

    if (hasEnergyEntities) {
      views.push({
        type: 'sections',
        title: 'Energie',
        path: 'energie',
        icon: 'mdi:chart-box',
        show_icon_and_title: true,
        cards: [],
        max_columns: 4,
        sections: [{
          type: 'grid',
          column_span: 4,
          cards: [{
            type: 'custom:we-grid-container',
            gap: '20px',
            grid_options: { columns: 'full' },
            views: [
              {
                max: '999px',
                columns: 'minmax(0, 1fr)',
                rows: 'auto auto 400px 200px auto 400px',
                areas: `
                  "head"
                  "time"
                  "history"
                  "battery"
                  "tiles"
                  "solar"
                `
              },
              {
                min: '1000px',
                columns: 'minmax(0, 2fr) minmax(0, 1fr)',
                rows: 'auto auto 400px 200px 400px',
                areas: `
                  "head head"
                  "time    time"
                  "history tiles"
                  "battery tiles"
                  "solar tiles"
                `
              }
            ],
            cards: [
              { type: 'markdown', content: '# Energieverlauf', text_only: true, slot: 'head' },
              { type: 'custom:we-period-card', slot: 'time' },
              { type: 'custom:we-history-chart-card', slot: 'history' },
              { type: 'custom:we-tiles-card', slot: 'tiles' },
              { type: 'custom:we-battery-chart-card', slot: 'battery' },
              { type: 'custom:we-solar-chart-card', slot: 'solar' },
            ]
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // 3. Wallbox - Seite
    // ---------------------------------------------------
    const wallboxes = Array.isArray(config.wallboxes) ? config.wallboxes : [];
    if (wallboxes.length) {
      const multiple = wallboxes.length > 1;
      const wbCards = [
        { type: 'markdown', content: multiple ? '# Wallboxen' : '# Wallbox', text_only: true, slot: 'head' },
        ...wallboxes.map((wb, i) => ({
          type: 'custom:wuefl-wallbox-card',
          slot: `wb_${i}`
        }))
      ];

      const wbMobileAreas = ['"head"', ...wallboxes.map((_, i) => `"wb_${i}"`)].join('\n');
      const wbDesktopAreas = multiple
        ? ['"head head"', ...Array.from({ length: Math.ceil(wallboxes.length / 2) }, (_, i) => {
            const left = `wb_${i * 2}`;
            const right = wallboxes[i * 2 + 1] ? `wb_${i * 2 + 1}` : `wb_${i * 2}`;
            return `"${left} ${right}"`;
          })].join('\n')
        : '"head"\n"wb_0"';

      views.push({
        type: 'sections',
        title: multiple ? 'Wallboxen' : 'Wallbox',
        path: 'wallbox',
        icon: 'mdi:ev-station',
        show_icon_and_title: true,
        cards: [],
        max_columns: 4,
        sections: [{
          type: 'grid',
          column_span: 4,
          cards: [{
            type: 'custom:we-grid-container',
            grid_options: { columns: 'full' },
            views: [
              {
                max: '999px',
                areas: wbMobileAreas
              },
              {
                min: '1000px',
                columns: multiple ? '1fr 1fr' : '1fr',
                areas: wbDesktopAreas
              }
            ],
            cards: wbCards
          }]
        }]
      });
    }

    // ---------------------------------------------------
    // 4. Einstellungen - Seite
    // ---------------------------------------------------
    views.push({
      type: 'sections',
      title: 'Einstellungen',
      path: 'einstellungen',
      icon: 'mdi:cog',
      show_icon_and_title: false,
      cards: [],
      max_columns: 4,
      sections: [{
        type: 'grid',
        column_span: 4,
        cards: [{
          type: 'custom:we-grid-container',
          grid_options: { columns: 'full' },
          views: [
            {
              areas: `
                "head"
                "main"
              `
            }
          ],
          cards: [
            { type: 'markdown', content: '# Einstellungen', text_only: true, slot: 'head' },
            { type: 'custom:we-settings-card', slot: 'main' },
          ]
        }]
      }]
    });

    // ---------------------------------------------------
    // 5. Zuordnung - Seite (Sub-View)
    // ---------------------------------------------------
    views.push({
      type: 'sections',
      title: 'Zuordnung',
      path: 'zuordnung',
      icon: 'mdi:format-list-checks',
      show_icon_and_title: true,
      subview: true,
      cards: [],
      max_columns: 4,
      sections: [{
        type: 'grid',
        column_span: 4,
        cards: [{
          type: 'custom:we-grid-container',
          grid_options: { columns: 'full' },
          views: [
            {
              areas: `"main"`
            }
          ],
          cards: [
            { type: 'custom:we-config-card', slot: 'main', ...config },
          ]
        }]
      }]
    });

    return { title: 'W-Energie Dashboard', views };
  }
}

customElements.define('ll-strategy-dashboard-we', WueflEnergyDashboardStrategy);

window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((s) => s.type === 'we')) {
  window.customStrategies.push({
    type: 'we',
    strategyType: 'dashboard',
    name: 'W-Energie Dashboard',
    description: 'Live-Energiefluss, Bilanz, Wallboxen — dynamisch strukturiert per Custom Grid Container.',
  });
}