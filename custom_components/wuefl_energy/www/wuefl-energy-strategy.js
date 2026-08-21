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

/* Die Karten müssen geladen sein, bevor die Ansichten sie benutzen. */
import './wuefl-energy-live-card.js';
import './wuefl-energy-history-card.js';
import './wuefl-wallbox-card.js';
import './wuefl-energy-settings-card.js';
import './wuefl-energy-config-card.js';

const section = (cards) => ({ type: 'grid', cards });

/**
 * Baut die Kartenkonfiguration für die Energie-Ansicht.
 *
 * Ist "Thyraz/energy-custom-graph" installiert (per HACS, erkennbar am
 * registrierten Custom Element), nutzen wir die — deren Beispiel Nr. 4 in
 * der eigenen Dokumentation baut exakt HA's Energie-Ansicht nach, mit
 * denselben Farbvariablen, und braucht wie unsere eigene Karte nur die
 * Entitäten direkt, kein separates Energie-Dashboard. Ohne Installation
 * bleibt es bei unserer eigenen, mitgelieferten Karte — funktioniert immer,
 * ohne zusätzliche Abhängigkeit.
 */
function energyCard(entities) {
  if (customElements.get('energy-custom-graph-card')) {
    const stack = 'energie';
    const bar = (statistic_id, name, color, invert = false) => ({
      statistic_id, name, chart_type: 'bar', stack, color,
      ...(invert ? { multiply: -1 } : {}),
    });
    const series = [
      ...entities.pv.map((id) => bar(id, 'Erzeugung', '--energy-solar-color')),
      ...entities.batteryOut.map((id) => bar(id, 'Speicher entladen', '--energy-battery-out-color')),
      ...entities.gridExport.map((id) => bar(id, 'Einspeisung', '--energy-grid-return-color', true)),
      ...entities.gridImport.map((id) => bar(id, 'Netzbezug', '--energy-grid-consumption-color', true)),
      ...entities.batteryIn.map((id) => bar(id, 'Speicher geladen', '--energy-battery-in-color', true)),
      ...entities.house.map((id) => bar(id, 'Haushalt', '--w-house', true)),
      ...entities.wallbox.map((id) => bar(id, 'Wallbox', '--w-wallbox', true)),
      ...entities.heatpump.map((id) => bar(id, 'Wärmepumpe', '--w-heatpump', true)),
    ];
    return { type: 'custom:energy-custom-graph-card', title: 'Energie', series };
  }
  return { type: 'custom:wuefl-energy-history-card' };
}

/** Eine Ansicht im Sections-Layout. */
const view = (title, path, iconName, cards, columns = 2) => ({
  title,
  path,
  icon: iconName,
  type: 'sections',
  max_columns: columns,
  sections: [section(cards)],
});

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
    const raw = await loadConfig(hass);
    const derived = deriveConfig(raw);
    const views = [];

    const hasLive = !!raw.grid?.power || !!raw.solar?.power || raw.battery.length > 0;
    if (hasLive) {
      views.push(view('Live', 'live', 'mdi:home-lightning-bolt', [
        { type: 'custom:wuefl-energy-live-card' },
      ], 1));
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

    // Hat der Nutzer zusätzlich Home Assistants eigenes Energie-Dashboard
    // eingerichtet (Einstellungen → Energie), kommt dessen native
    // Verteilungs-Karte obendrauf — reiner Lesezugriff, nichts wird
    // verändert. Fehlt die Konfiguration, wirft der Aufruf, dann bleibt es
    // bei der Karte aus der Zuordnung.
    let hasNativeEnergy = false;
    try {
      const prefs = await hass.callWS({ type: 'energy/get_prefs' });
      hasNativeEnergy = (prefs?.energy_sources?.length ?? 0) > 0;
    } catch {
      hasNativeEnergy = false;
    }

    if (hasEnergyEntities || hasNativeEnergy) {
      views.push(view('Energie', 'energie', 'mdi:chart-box', [
        ...(hasNativeEnergy ? [{ type: 'energy-usage-graph', title: 'Verteilung' }] : []),
        ...(hasEnergyEntities ? [energyCard(energyGroups)] : []),
      ], 1));
    }

    if (raw.wallboxes.length) {
      views.push(view(
        raw.wallboxes.length > 1 ? 'Wallboxen' : 'Wallbox',
        'wallbox',
        'mdi:ev-station',
        raw.wallboxes.map((_, i) => ({ type: 'custom:wuefl-wallbox-card', slot: i + 1 })),
        Math.min(2, raw.wallboxes.length),
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
