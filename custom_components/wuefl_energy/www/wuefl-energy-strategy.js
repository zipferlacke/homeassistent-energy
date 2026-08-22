/**
 * wuefl-energy-strategy
 * Erzeugt das Dashboard aus der Zuordnung, statt es von Hand zu pflegen.
 *
 * Angelegt wird es einmal über Einstellungen → Dashboards → Hinzufügen und
 * die Auswahl "wuefl Energie". Danach entstehen die Ansichten aus dem, was
 * zugeordnet ist: keine Wallbox eingetragen, keine Wallbox-Ansicht. Wer
 * später eine hinzufügt, muss am Dashboard nichts ändern.
 */

import { deriveConfig, normalizeConfig } from './wuefl-energy-shared.js';

/* Die Karten werden NICHT hier oben statisch importiert. Home Assistant
   gibt nur ein kurzes Zeitfenster, um die Strategie anzumelden — fünf
   Karten-Module vorab zu laden würde das unnötig verzögern und im
   schlimmsten Fall zum Timeout führen. Stattdessen lädt ensureCards() sie
   erst, wenn die Strategie wirklich gebraucht wird (siehe generate()). */
let cardsLoaded = null;
function ensureCards() {
  if (!cardsLoaded) {
    cardsLoaded = Promise.all([
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

const section = (cards, title) => ({ type: 'grid', cards, ...(title ? { title } : {}) });

/**
 * `groups` ist entweder eine flache Kartenliste (ein einzelner Abschnitt,
 * ohne Überschrift — das bisherige Verhalten) oder ein Array aus
 * { title, cards }-Objekten, wird dann zu je einem eigenen Abschnitt mit
 * eigenem Rahmen und eigener Überschrift. Mehrere Abschnitte fließen bei
 * Home Assistant von selbst nebeneinander, bis max_columns erreicht ist —
 * dafür ist das Sections-Layout gebaut, keine eigene Grid-Arbeit nötig.
 */
const view = (title, path, icon, groups, max_columns) => {
  const isGrouped = Array.isArray(groups) && groups.length > 0 && groups[0]?.cards !== undefined;
  const sections = isGrouped
    ? groups.map((g) => section(g.cards, g.title))
    : [section(groups)];
  const result = {
    title: title,
    path: path,
    icon: icon,
    show_icon_and_title: true,
    type: 'sections',
    sections,
  };
  if (max_columns !== undefined) {
    result.max_columns = max_columns;
  }
  return result;
};

async function loadConfig(hass) {
  try {
    return normalizeConfig(await hass.callWS({ type: 'wuefl_energy/get' }));
  } catch {
    // Ohne Integration bleibt nur die Zuordnungsansicht — dort steht dann
    // auch der Hinweis, was fehlt.
    return normalizeConfig({});
  }
}

class WueflEnergyDashboardStrategy {
  static async generate(config, hass) {
    // Erst hier laden, nicht beim Modul-Start — die Klasse selbst ist
    // sofort registriert (siehe ganz unten), unabhängig davon, wie lange
    // das Nachladen der Karten dauert.
    await ensureCards();

    const raw = await loadConfig(hass);
    const derived = deriveConfig(raw);
    const views = [];

    const hasLive = !!raw.grid?.power || !!raw.solar?.power || raw.battery.length > 0;
    if (hasLive) {
      views.push(view('Live', 'live', 'mdi:home-lightning-bolt', [
        { type: 'custom:wuefl-energy-live-card', grid_options: { columns: 'full' } },
      ], 2));
    }

    // Die Energie-Ansicht nutzt eine Karte im Stil von HA's Energie-Ansicht
    // (gespiegelte Fläche, dieselben Farbvariablen), gespeist rein aus der
    // Zuordnung — kein separat eingerichtetes Energie-Dashboard nötig.
    const energyGroups = {
      pv: derived.history.pv_energy, batteryOut: derived.history.battery_out,
      gridExport: derived.history.grid_export, gridImport: derived.history.grid_import,
      batteryIn: derived.history.battery_in, house: derived.history.house_energy,
      wallbox: derived.history.wallbox_energy, heatpump: derived.history.heatpump_energy,
    };
    const hasEnergyEntities = Object.values(energyGroups).some((l) => l.length);

    if (hasEnergyEntities) {
      views.push(view('Energie', 'energie', 'mdi:chart-box', [
        { title: 'Zeitraum', cards: [{ type: 'custom:wuefl-energy-period-card' }] },
        { title: 'Verteilung', cards: [{ type: 'custom:wuefl-energy-history-card' }] },
        { title: 'Kennzahlen', cards: [{ type: 'custom:wuefl-energy-tiles-card' }] },
        { title: 'Speicher', cards: [{ type: 'custom:wuefl-energy-battery-chart-card' }] },
        { title: 'Solarproduktion', cards: [{ type: 'custom:wuefl-energy-solar-chart-card' }] },
      ], 2));
    }

    if (raw.wallboxes.length) {
      // Bei einer Wallbox reicht ein Abschnitt ohne eigene Überschrift —
      // der Name steht ja schon in der Karte selbst. Bei mehreren bekommt
      // jede ihren eigenen Abschnitt mit dem Namen als Überschrift, statt
      // alle Karten ununterschieden nebeneinanderzustellen.
      const groups = raw.wallboxes.length === 1
        ? [{ type: 'custom:wuefl-wallbox-card', slot: 1, grid_options: { columns: 'full' } }]
        : raw.wallboxes.map((wb, i) => ({
            title: wb.name || `Wallbox ${i + 1}`,
            cards: [{ type: 'custom:wuefl-wallbox-card', slot: i + 1 }],
          }));
      views.push(view(
        raw.wallboxes.length > 1 ? 'Wallboxen' : 'Wallbox',
        'wallbox',
        'mdi:ev-station',
        groups,
        Math.max(2, Math.min(2, raw.wallboxes.length)),
      ));
    }

    const temps = raw.info?.temperatures ?? [];
    const extra = raw.info?.extra_entities ?? [];
    if (temps.length || extra.length) {
      views.push(view('Infos', 'infos', 'mdi:thermometer', [
        ...(temps.length ? [{ type: 'entities', title: 'Temperaturen', entities: temps }] : []),
        ...(extra.length ? [{ type: 'entities', title: 'Weitere Werte', entities: extra }] : []),
      ]));
    }

    // Einstellungen sind immer da: sie führen zur Zuordnung, und ohne die
    // käme man aus einem leeren Dashboard nicht mehr heraus. Die Laderegeln
    // darin blenden sich selbst aus, wenn es keine Wallbox gibt.
    views.push(view('Einstellungen', 'einstellungen', 'mdi:cog', [
      { type: 'custom:wuefl-energy-settings-card', grid_options: { columns: 'full' } },
    ], 2));

    // Die Zuordnung war als randloses "panel" gedacht, weil sie lang ist —
    // das bedeutet bei Home Assistant aber ausdrücklich volle Breite ohne
    // die übliche Begrenzung. "sections" gibt ihr dieselbe angenehme
    // Breite wie jede andere Ansicht; "subview" bleibt, damit sie weiterhin
    // kein eigener Reiter ist, sondern nur über den Knopf in den
    // Einstellungen erreichbar (mit Zurück-Pfeil statt Reiterleiste).
    views.push({
      title: 'Zuordnung',
      path: 'zuordnung',
      icon: 'mdi:format-list-checks',
      type: 'sections',
      subview: true,
      max_columns: 2,
      sections: [section([
        { type: 'custom:wuefl-energy-config-card', grid_options: { columns: 'full' } },
      ])],
    });

    return { title: 'wuefl Energie', views };
  }
}

customElements.define('ll-strategy-dashboard-wuefl-energy', WueflEnergyDashboardStrategy);

/* Damit die Strategy im Dialog "Dashboard hinzufügen" auftaucht. */
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((s) => s.type === 'wuefl-energy')) {
  window.customStrategies.push({
    type: 'wuefl-energy',
    // Seit Home Assistant 2026.5 nötig, damit die Strategie im "Neues
    // Dashboard"-Dialog korrekt verarbeitet wird — ohne dieses Feld bricht
    // HA dort mit "can't access property 'startsWith', … is undefined" ab.
    strategyType: 'dashboard',
    name: 'wuefl Energie',
    description: 'Live-Energiefluss, Bilanz, Wallboxen — die Ansichten entstehen aus deiner Zuordnung.',
  });
}