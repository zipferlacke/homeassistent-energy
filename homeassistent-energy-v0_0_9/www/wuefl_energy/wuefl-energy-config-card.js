/**
 * wuefl-energy-config-card
 * Die Zuordnung als Ansicht im Dashboard statt als Seite in der Seitenleiste.
 *
 * Aufbau wie die Energie-Konfiguration von Home Assistant: ein Block je
 * Thema, darin die vorhandenen Einträge, darunter ein Knopf zum Hinzufügen.
 * Alles, wovon es mehrere geben kann — Solaranlagen, Speicher, Wallboxen,
 * Autos, Wärmepumpen — ist eine Liste und kommt mit null Einträgen zurecht.
 *
 * Gespeichert wird beim Schließen des Dialogs, nicht über einen globalen
 * Speichern-Knopf. Ein halb ausgefülltes Formular gibt es damit nicht.
 */

import {
  adoptSheet, icon, esc, registerCard, rawConfig, saveConfig, normalizeConfig,
  asList, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

/* ------------------------------------------------------------------ *
 * Auswahlfelder
 *
 * Sensornamen sind nicht genormt, die device_class schon. Danach wird
 * gefiltert, sonst stehen im Auswahlfeld mehrere hundert Einträge.
 * ------------------------------------------------------------------ */

let STRICT = true;

const sensor = (deviceClass, multiple = false) => ({
  entity: {
    filter: STRICT && deviceClass
      ? { domain: 'sensor', device_class: deviceClass }
      : { domain: 'sensor' },
    ...(multiple ? { multiple: true } : {}),
  },
});

const watt = (m) => sensor('power', m);
const kwh = (m) => sensor('energy', m);
const percent = (m) => sensor('battery', m);
const money = () => sensor('monetary');
const temp = (m) => sensor('temperature', m);
const pick = (domains, multiple = false) => ({
  entity: { filter: domains.map((d) => ({ domain: d })), ...(multiple ? { multiple: true } : {}) },
});
const text = () => ({ text: {} });
const bool = () => ({ boolean: {} });
const number = (min, max, step = 1) => ({ number: { min, max, step, mode: 'box' } });

/* ------------------------------------------------------------------ *
 * Die Blöcke
 *
 * `kind: 'single'` ist ein Eintrag, `kind: 'list'` beliebig viele.
 * `summary` baut die Zeile, die in der Übersicht steht.
 * ------------------------------------------------------------------ */

const BLOCKS = [
  {
    key: 'grid',
    kind: 'single',
    title: 'Stromnetz',
    icon: 'mdi:transmission-tower',
    intro: 'Der aktuelle Wert am Hausanschluss und die beiden Gesamtzähler. '
      + 'Tageswerte brauchst du nirgends anzugeben — die rechnet Home Assistant '
      + 'aus den Zählern selbst.',
    empty: 'Netzanschluss einrichten',
    summary: (e) => e.power,
    schema: [
      { name: 'power', selector: () => watt() },
      { name: 'invert', selector: () => bool() },
      { name: 'import_total', selector: () => kwh(true) },
      { name: 'export_total', selector: () => kwh(true) },
    ],
  },
  {
    key: 'solar',
    kind: 'single',
    title: 'Photovoltaik',
    icon: 'mdi:solar-power-variant',
    intro: 'Die maßgebliche Gesamtleistung der Anlage und der Gesamtzähler — '
      + 'bei Sungrow zum Beispiel "Total DC power" und "Total PV generation".',
    empty: 'Photovoltaik einrichten',
    summary: (e) => e.power,
    schema: [
      { name: 'power', selector: () => watt() },
      { name: 'energy_total', selector: () => kwh(true) },
      { name: 'forecast', selector: () => kwh(true) },
      { name: 'forecast_attribute', selector: () => text() },
    ],
  },
  {
    key: 'strings',
    kind: 'list',
    nestedIn: 'solar',
    title: 'Einzelne Dachflächen',
    icon: 'mdi:solar-panel',
    intro: 'Nur nötig, wenn du Ost und Süd getrennt sehen willst oder der '
      + 'Wechselrichter zwei MPPT-Eingänge einzeln meldet. Eine Fläche: leer lassen.',
    add: 'Dachfläche hinzufügen',
    label: (e, i) => e.name || `Fläche ${i + 1}`,
    summary: (e) => e.power,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'power', selector: () => watt() },
    ],
  },
  {
    key: 'battery',
    kind: 'list',
    title: 'Hausspeicher',
    icon: 'mdi:home-battery',
    intro: 'Aktuelle Leistung, Ladestand und die beiden Gesamtzähler. Stimmt die '
      + 'Richtung im Bild nicht, hilft der Schalter für das Vorzeichen.',
    add: 'Speicher hinzufügen',
    label: (e, i) => e.name || `Speicher ${i + 1}`,
    summary: (e) => e.power,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'power', selector: () => watt() },
      { name: 'invert', selector: () => bool() },
      { name: 'soc', selector: () => percent() },
      { name: 'in_total', selector: () => kwh() },
      { name: 'out_total', selector: () => kwh() },
    ],
  },
  {
    key: 'consumers',
    kind: 'single',
    title: 'Haushalt',
    icon: 'mdi:home',
    intro: 'Kann leer bleiben. Ohne Eintrag rechnet die Live-Ansicht den '
      + 'Hausverbrauch aus dem Rest: PV + Netz + Speicher minus Wallbox und Wärmepumpe.',
    empty: 'Haushalt einrichten',
    summary: (e) => e.house_power,
    schema: [
      { name: 'house_power', selector: () => watt() },
      { name: 'energy_total', selector: () => kwh(true) },
    ],
  },
  {
    key: 'heatpump',
    kind: 'list',
    title: 'Wärmepumpen',
    icon: 'mdi:heat-pump',
    intro: 'Die elektrische Aufnahme, nicht die abgegebene Wärme.',
    add: 'Wärmepumpe hinzufügen',
    label: (e, i) => e.name || `Wärmepumpe ${i + 1}`,
    summary: (e) => e.power,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'power', selector: () => watt() },
      { name: 'energy_total', selector: () => kwh() },
    ],
  },
  {
    key: 'cars',
    kind: 'list',
    title: 'Fahrzeuge',
    icon: 'mdi:car-electric',
    intro: 'Das Auto selbst, unabhängig davon woran es hängt. Meldet dein Fahrzeug '
      + 'den Ladestand über eine eigene Integration, trägst du ihn hier ein — sonst '
      + 'lässt du diesen Block leer und nimmst den Wert der Wallbox.',
    add: 'Fahrzeug hinzufügen',
    label: (e, i) => e.name || `Fahrzeug ${i + 1}`,
    summary: (e) => e.soc,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'soc', selector: () => percent() },
      { name: 'target', selector: () => pick(['number', 'input_number']) },
      { name: 'capacity', selector: () => number(10, 200, 1) },
    ],
  },
  {
    key: 'wallboxes',
    kind: 'list',
    title: 'Wallboxen',
    icon: 'mdi:ev-station',
    intro: 'Der Ladepunkt selbst. Welches Fahrzeug dort hängt, wählst du unten — '
      + 'die Liste kommt aus dem Block Fahrzeuge. Lademodus, Ladestrom und Ladeziel '
      + 'tauchen hier nicht auf: die legt die Integration automatisch an, sobald die '
      + 'Wallbox existiert. Bedient werden sie in der Ansicht <em>Einstellungen</em>, '
      + 'zu finden auch unter Einstellungen → Geräte & Dienste → Entitäten, Suche '
      + '"wuefl".',
    add: 'Wallbox hinzufügen',
    label: (e, i) => e.name || `Wallbox ${i + 1}`,
    summary: (e) => e.power,
    schema: [
      { name: 'name', selector: () => text() },
      { name: 'car', selector: (cfg) => ({
        select: {
          mode: 'dropdown',
          options: [
            { value: '', label: 'kein Fahrzeug zugeordnet' },
            ...asList(cfg.cars).map((car, i) => ({
              value: car.id ?? `car_${i}`,
              label: car.name || `Fahrzeug ${i + 1}`,
            })),
          ],
        },
      }) },
      { name: 'power', selector: () => watt() },
      { name: 'energy_total', selector: () => kwh() },
      {
        type: 'expandable',
        name: 'more',
        title: 'Weitere Angaben',
        fields: [
          { name: 'energy_session', selector: () => kwh() },
          { name: 'current_actual_entity', selector: () => sensor('current') },
          { name: 'phases', selector: () => number(1, 3, 1) },
          { name: 'max_power', selector: () => number(1000, 30000, 100) },
          { name: 'car_soc', selector: () => percent() },
        ],
      },
    ],
  },
  {
    key: 'price',
    kind: 'single',
    title: 'Strompreis',
    icon: 'mdi:currency-eur',
    intro: 'Bei festem Tarif reichen die beiden Festpreise ganz unten — kein Sensor '
      + 'nötig. Einen Preissensor bekommst du nur bei dynamischem Tarif: über die '
      + 'Integration deines Anbieters (Tibber), über Nord Pool oder EPEX Spot für den '
      + 'Börsenpreis, oder über aWATTar. Die richtest du unter Einstellungen → Geräte '
      + 'und Dienste ein, danach steht der Sensor hier zur Auswahl.',
    empty: 'Strompreis einrichten',
    summary: (e) => e.price_entity
      ?? (e.price_import_fixed ? `fest: ${e.price_import_fixed} ct/kWh` : null),
    schema: [
      { name: 'price_entity', selector: () => money() },
      { name: 'price_export_entity', selector: () => money() },
      { name: 'price_import_fixed', selector: () => number(0, 200, 0.1) },
      { name: 'price_export_fixed', selector: () => number(0, 200, 0.1) },
      { name: 'price_reference', selector: () => number(0, 200, 0.1) },
      { name: 'price_forecast_attribute', selector: () => text() },
    ],
  },
  {
    key: 'system',
    kind: 'single',
    title: 'Anlage',
    icon: 'mdi:home-lightning-bolt-outline',
    intro: 'Überschriften und die Anschaffungskosten, aus denen die Live-Ansicht '
      + 'den Beitrag des heutigen Tages zur Amortisation rechnet.',
    empty: 'Angaben zur Anlage',
    summary: (e) => (e.system_cost ? `${e.system_cost} €` : e.title),
    schema: [
      { name: 'title', selector: () => text() },
      { name: 'history_title', selector: () => text() },
      { name: 'system_cost', selector: () => number(0, 500000, 100) },
      { name: 'commissioned', selector: () => text() },
      { name: 'house_base_load', selector: () => number(0, 5000, 50) },
    ],
  },
  {
    key: 'info',
    kind: 'single',
    title: 'Wetter und Temperaturen',
    icon: 'mdi:thermometer',
    intro: 'Das Wetter erscheint oben in der Live-Ansicht, die Temperaturen in '
      + 'der Info-Ansicht.',
    empty: 'Wetter und Temperaturen',
    summary: (e) => e.weather_entity,
    schema: [
      { name: 'weather_entity', selector: () => ({ entity: { filter: { domain: 'weather' } } }) },
      { name: 'temperatures', selector: () => temp(true) },
      { name: 'extra_entities', selector: () => ({ entity: { multiple: true } }) },
    ],
  },
];

/**
 * Beschriftung und Hilfetext je Feld — je Block, damit "Leistung" bei der
 * Wallbox etwas anderes sagt als "Leistung" beim Speicher. Der Hilfetext
 * nennt immer die Einheit und ob es der Live-Wert oder ein Gesamt-Zähler ist,
 * das war vorher der fehlende Teil.
 */
const LABELS = {
  grid: {
    power: 'Netzleistung',
    invert: 'Richtung ist vertauscht',
    import_total: 'Bezug gesamt',
    export_total: 'Einspeisung gesamt',
  },
  solar: {
    power: 'PV-Leistung gesamt',
    energy_total: 'PV-Ertrag gesamt',
    forecast: 'Ertragsprognose',
    forecast_attribute: 'Prognose-Attribut (optional)',
  },
  strings: {
    name: 'Bezeichnung',
    power: 'Leistung dieser Fläche',
  },
  battery: {
    name: 'Bezeichnung',
    power: 'Speicherleistung',
    invert: 'Richtung ist vertauscht',
    soc: 'Ladestand',
    in_total: 'Geladen gesamt',
    out_total: 'Entladen gesamt',
  },
  consumers: {
    house_power: 'Hausverbrauch',
    energy_total: 'Hausverbrauch gesamt',
  },
  heatpump: {
    name: 'Bezeichnung',
    power: 'Leistungsaufnahme',
    energy_total: 'Zähler gesamt',
  },
  cars: {
    name: 'Name des Fahrzeugs',
    soc: 'Ladestand',
    target: 'Ladeziel',
    capacity: 'Akkukapazität',
  },
  wallboxes: {
    name: 'Bezeichnung',
    car: 'Zugeordnetes Fahrzeug',
    power: 'Ladeleistung',
    energy_total: 'Zähler gesamt',
    energy_session: 'Aktuelle Ladung',
    current_actual_entity: 'Ladestrom-Sensor',
    phases: 'Phasen',
    max_power: 'Maximale Leistung',
    car_soc: 'Ladestand laut Wallbox',
  },
  price: {
    price_entity: 'Preissensor Bezug',
    price_export_entity: 'Preissensor Einspeisung',
    price_import_fixed: 'Fester Arbeitspreis',
    price_export_fixed: 'Feste Einspeisevergütung',
    price_reference: 'Vergleichspreis für PV-Ersparnis',
    price_forecast_attribute: 'Preis-Attribut (optional)',
  },
  system: {
    title: 'Überschrift der Live-Ansicht',
    history_title: 'Überschrift der Energie-Ansicht',
    system_cost: 'Anschaffungskosten',
    commissioned: 'In Betrieb seit',
    house_base_load: 'Grundlast des Haushalts',
  },
  info: {
    weather_entity: 'Wetter',
    temperatures: 'Temperaturen',
    extra_entities: 'Weitere Werte',
  },
};

const HELPERS = {
  grid: {
    power: 'Live-Wert in Watt (W). Positiv = Bezug, negativ = Einspeisung.',
    invert: 'Setzen, wenn Bezug und Einspeisung vertauscht angezeigt werden.',
    import_total: 'Gesamt-Zähler in kWh, läuft immer weiter. Einen Tageswert brauchst '
      + 'du nicht — den rechnet Home Assistant selbst aus.',
    export_total: 'Gesamt-Zähler in kWh, läuft immer weiter.',
  },
  solar: {
    power: 'Live-Wert in Watt (W), die maßgebliche Gesamtleistung der Anlage — '
      + 'z. B. "Total DC power".',
    energy_total: 'Gesamt-Zähler in kWh seit Inbetriebnahme, z. B. "Total PV generation".',
    forecast: 'Sensor aus Forecast.Solar oder Solcast, liefert die Kurve für den Tag.',
    forecast_attribute: 'Leer lassen — das Format wird automatisch erkannt.',
  },
  strings: {
    name: 'Erscheint als Beschriftung in der Live-Ansicht, z. B. "Dach Ost".',
    power: 'Live-Wert in Watt (W) dieser einzelnen Fläche.',
  },
  battery: {
    name: 'Erscheint als Beschriftung in der Live-Ansicht.',
    power: 'Live-Wert in Watt (W). Positiv = entlädt, negativ = lädt.',
    invert: 'Setzen, wenn Laden und Entladen vertauscht angezeigt werden.',
    soc: 'Live-Wert in Prozent (%).',
    in_total: 'Gesamt-Zähler in kWh, wie viel insgesamt geladen wurde.',
    out_total: 'Gesamt-Zähler in kWh, wie viel insgesamt entladen wurde.',
  },
  consumers: {
    house_power: 'Live-Wert in Watt (W). Leer lassen: wird aus PV, Netz und Speicher berechnet.',
    energy_total: 'Gesamt-Zähler in kWh.',
  },
  heatpump: {
    name: 'Erscheint als Beschriftung in der Live-Ansicht.',
    power: 'Live-Wert in Watt (W), die elektrische Aufnahme — nicht die Wärmeleistung.',
    energy_total: 'Gesamt-Zähler in kWh.',
  },
  cars: {
    name: 'Erscheint als Beschriftung, z. B. der Name des Autos.',
    soc: 'Live-Wert in Prozent (%).',
    target: 'Zahlen-Helfer (number/input_number), an dem sich das Ladeziel einstellen lässt.',
    capacity: 'Nutzbare Akkukapazität in kWh, Grundlage der Ladezeit-Schätzung.',
  },
  wallboxes: {
    name: 'Erscheint als Überschrift der Wallbox-Karte.',
    car: 'Bestimmt, woher Ladestand und Ladeziel des Fahrzeugs kommen. Ohne '
      + 'Zuordnung nutzt die Karte das automatisch angelegte Ladeziel dieser '
      + 'Wallbox — Lademodus, Ladestrom und Ladeziel selbst erscheinen nicht hier, '
      + 'die legt die Integration automatisch an, sobald diese Wallbox existiert.',
    power: 'Live-Wert in Watt (W), die aktuelle Ladeleistung.',
    energy_total: 'Gesamt-Zähler in kWh.',
    energy_session: 'kWh seit Steckerstart, falls die Wallbox das meldet — sonst leer lassen.',
    current_actual_entity: 'Live-Wert in Ampere (A), falls die Wallbox den tatsächlichen '
      + 'Strom meldet. Sonst wird er aus Leistung und Phasenzahl gerechnet.',
    phases: 'Nur zum Umrechnen der Leistung in Ampere. Dreiphasig ist der Normalfall.',
    max_power: 'Höchstleistung in Watt (W), z. B. 11000 bei dreiphasig 16 A.',
    car_soc: 'Nur nötig, wenn kein Fahrzeug zugeordnet ist.',
  },
  price: {
    price_entity: 'Nur bei dynamischem Tarif — Live-Wert in ct/kWh aus Tibber, Nord Pool, '
      + 'EPEX Spot oder aWATTar.',
    price_export_entity: 'Nur bei Direktvermarktung.',
    price_import_fixed: 'Fester Wert in ct/kWh, inklusive Steuern und Abgaben. Reicht ohne '
      + 'dynamischen Tarif völlig.',
    price_export_fixed: 'Fester Wert in ct/kWh.',
    price_reference: 'Fester Wert in ct/kWh, womit die PV-Ersparnis bewertet wird — '
      + 'üblicherweise dein Arbeitspreis.',
    price_forecast_attribute: 'Leer lassen — wird automatisch erkannt.',
  },
  system: {
    system_cost: 'Fester Wert in Euro (€). Leer lassen blendet die Amortisations-Kachel aus.',
    house_base_load: 'Fester Wert in Watt (W), wird von der Ladezeit-Schätzung abgezogen.',
  },
};

/* ------------------------------------------------------------------ *
 * Vorlagen
 * ------------------------------------------------------------------ */

const PRESETS = {
  sungrow: {
    label: 'Sungrow Hybrid (Modbus)',
    grid: {
      power: ['meter_active_power'],
      import_total: ['total_imported_energy', 'total_import_energy'],
      export_total: ['total_exported_energy', 'total_export_energy'],
    },
    solar: {
      power: ['total_dc_power'],
      energy_total: ['total_pv_generation'],
    },
    battery: [{
      name: 'Hausspeicher',
      power: ['signed_battery_power', 'battery_power'],
      soc: ['battery_level'],
      in_total: ['total_battery_charge', 'total_charge_energy'],
      out_total: ['total_battery_discharge', 'total_discharge_energy'],
    }],
    consumers: { house_power: ['load_power'] },
    info: { temperatures: ['inverter_temperature', 'battery_temperature'] },
    hint: 'Beim Speicher zeigen manche Firmware-Stände das Vorzeichen andersherum. '
      + 'Stimmt Laden und Entladen nicht, den Schalter im Speicher-Block setzen.',
  },
};

/**
 * Sucht zu einem Namensbestandteil die passende Entität.
 * Feste IDs wären bei Sensoren falsch: dieselbe Integration vergibt je
 * nach Version sensor.total_dc_power oder sensor.sungrow_inverter_total_dc_power.
 *
 * Ein Eintrag mit dem Präfix "exact:" ist dagegen eine wörtliche
 * Entitäts-ID — genau dafür gedacht, wenn wir die ID selbst festgelegt
 * haben, wie bei den Helfern aus wuefl_wallbox.yaml.
 */
function findEntity(states, part) {
  if (part.startsWith('exact:')) {
    const id = part.slice(6);
    return states[id] ? id : null;
  }
  const exact = `sensor.${part}`;
  if (states[exact]) return exact;
  const hits = Object.keys(states).filter(
    (id) => id.startsWith('sensor.') && id.endsWith(`_${part}`),
  );
  return hits.sort((a, b) => a.length - b.length)[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Stil
 * ------------------------------------------------------------------ */

const CSS = `
.card { padding: 0; background: none; }

.intro {
  background: var(--w-bg);
  border-radius: var(--w-radius);
  margin-bottom: 1rem;
  padding: var(--w-pad);

  & p { color: var(--w-text-soft); line-height: 1.5; margin: .4rem 0 0; }
  & .row { align-items: center; display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .9rem; }
  & select {
    background: var(--w-bg-soft); border: 0; border-radius: var(--w-radius);
    color: inherit; font: inherit; height: var(--w-input-h); padding: 0 .6rem;
  }
  & .report { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm);
              line-height: 1.5; margin-top: .6rem; }
  & .filter { align-items: center; border-top: 1px solid var(--w-line); display: flex;
              gap: .6rem; margin-top: .9rem; padding-top: .8rem; }
  & .filter label { cursor: pointer; font-size: var(--w-fs-sm); }
  & .filter .why { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); }
}

.block {
  background: var(--w-bg);
  border-radius: var(--w-radius);
  margin-bottom: 1rem;
  padding: var(--w-pad);

  & h3 { align-items: center; display: flex; gap: .5rem; font-size: 1.15rem; }
  & h3 ha-icon { --mdc-icon-size: 24px; }
  & .intro-text { color: var(--w-text-soft); line-height: 1.5; margin: .4rem 0 .9rem; }
}

/* Verschachtelter Bereich, z. B. die Dachflächen unter Photovoltaik.
   Standardmäßig zu — er wird nur bei mehr als einer Anlage gebraucht. */
details.sub {
  border-top: 1px solid var(--w-line);
  margin-top: 1rem;
  padding-top: .2rem;

  & summary {
    align-items: center; cursor: pointer; display: flex; gap: .5rem;
    list-style: none; padding: .7rem 0; user-select: none;

    &::-webkit-details-marker { display: none; }
    & ha-icon:first-child { --mdc-icon-size: 20px; opacity: .8; }
    & span:not(.count) { flex: 1 1 auto; font-weight: 500; }
    & .count {
      background: var(--w-bg-soft); border-radius: 999px; color: var(--w-text-soft);
      font-size: var(--w-fs-sm); font-variant-numeric: tabular-nums;
      line-height: 1; padding: .25rem .55rem;
    }
    & .chev { --mdc-icon-size: 20px; color: var(--w-text-soft); transition: transform .2s ease; }
  }
  &[open] summary .chev { transform: rotate(180deg); }
  &:hover summary { color: var(--w-accent); }
  & .sub-body { padding-bottom: .3rem; }
}

.entry {
  align-items: center;
  border: 1px solid var(--w-line);
  border-radius: var(--w-radius);
  display: flex;
  gap: .5rem;
  margin-bottom: .5rem;
  padding: .6rem .75rem;

  & .txt { flex: 1 1 auto; min-width: 0; }
  & .txt b { display: block; }
  & .txt span { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .act {
    background: none; border: 0; border-radius: 50%; color: var(--w-text-soft);
    cursor: pointer; display: grid; height: 2.2rem; place-items: center; width: 2.2rem;
    &:hover { background: var(--w-bg-soft); color: var(--w-text); }
  }
  & .act.del:hover { color: var(--w-danger); }
}

.add {
  background: color-mix(in srgb, var(--w-accent) 14%, transparent);
  color: var(--w-accent);
  font-weight: 500;
  &:hover { background: color-mix(in srgb, var(--w-accent) 22%, transparent); }
}

dialog.edit {
  max-height: 84vh;
  max-width: min(34rem, 94vw);
  overflow: auto;
  width: 34rem;

  & ha-form { display: block; margin-top: .5rem; }
}
`;

/* ------------------------------------------------------------------ */

class WueflEnergyConfigCard extends HTMLElement {
  #hass = null;
  #config = null;
  #built = false;
  #els = {};
  #editing = null;
  #draft = {};

  static getConfigElement() { return document.createElement('wuefl-energy-config-card-editor'); }
  static getStubConfig() { return {}; }

  setConfig() { /* Die Karte hat selbst nichts einzustellen. */ }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) this.#load();
    if (this.#els.form) this.#els.form.hass = hass;
  }

  getCardSize() { return 20; }

  async #load() {
    this.#config = await rawConfig(this.#hass);
    this.#render();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'config');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="intro">
        <h2>Zuordnung</h2>
        <p>Welche Entität wofür steht. Alles hier ist optional — was fehlt, wird in
           den Ansichten einfach nicht gezeigt. Zum Anfangen reichen der Stromnetz-Block
           und eine Solaranlage.</p>
        <div class="row">
          <select class="preset"><option value="">Vorlage wählen …</option></select>
          <button type="button" class="btn apply">Vorlage anwenden</button>
        </div>
        <span class="report"></span>
        <div class="filter">
          <input type="checkbox" id="strict" checked>
          <label for="strict">Nur passende Sensoren anzeigen
            <span class="why">Filtert nach Einheit. Fehlt ein Sensor in der Auswahl,
              setzt seine Integration keine Einheit — dann hier ausschalten.</span>
          </label>
        </div>
      </div>
      <div class="blocks"></div>
      <dialog class="edit">
        <header><h3></h3>
          <button type="button" class="close" aria-label="Schließen">${icon('mdi:close')}</button>
        </header>
        <div class="formbox"></div>
        <div class="actions">
          <button type="button" class="btn cancel">Abbrechen</button>
          <button type="button" class="btn ok">Übernehmen</button>
        </div>
      </dialog>
    `;
    root.appendChild(card);

    const q = (x) => card.querySelector(x);
    this.#els = {
      card, blocks: q('.blocks'), dialog: q('dialog.edit'),
      dialogTitle: q('dialog h3'), formbox: q('.formbox'),
      preset: q('select.preset'), report: q('.report'),
    };

    for (const [id, p] of Object.entries(PRESETS)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = p.label;
      this.#els.preset.appendChild(o);
    }

    q('.apply').addEventListener('click', () => this.#applyPreset());
    q('#strict').addEventListener('change', (ev) => {
      STRICT = ev.target.checked;
      if (this.#editing) this.#openDialog(this.#editing.block, this.#editing.index);
    });
    q('.close').addEventListener('click', () => this.#closeDialog());
    q('.cancel').addEventListener('click', () => this.#closeDialog());
    q('.ok').addEventListener('click', () => this.#commit());

    this.#built = true;
  }

  /* ------------------------------ Anzeige --------------------------- */

  /** Baut Einträge + Hinzufügen-Knopf eines Blocks — ohne die äußere Karte,
   *  damit dasselbe Stück auch als eingebetteter Unterbereich taugt. */
  #renderEntries(b) {
    const entries = b.kind === 'list'
      ? asList(this.#config[b.key])
      : (Object.keys(this.#config[b.key] ?? {}).length ? [this.#config[b.key]] : []);

    const rows = entries.map((e, i) => {
      const label = b.kind === 'list' ? b.label(e, i) : b.title;
      const sub = b.summary(e);
      return `<div class="entry">
        <div class="txt"><b>${esc(label)}</b><span>${esc(sub ?? 'noch nichts zugeordnet')}</span></div>
        <button type="button" class="act edit" data-block="${b.key}" data-index="${i}"
                aria-label="Bearbeiten">${icon('mdi:pencil')}</button>
        ${b.kind === 'list'
          ? `<button type="button" class="act del" data-block="${b.key}" data-index="${i}"
               aria-label="Entfernen">${icon('mdi:delete')}</button>`
          : ''}
      </div>`;
    }).join('');

    const addLabel = b.kind === 'list' ? b.add : b.empty;
    const showAdd = b.kind === 'list' || !entries.length;

    return {
      count: entries.length,
      html: `${rows}
        ${showAdd
          ? `<button type="button" class="btn add" data-block="${b.key}" data-index="-1">
               ${icon('mdi:plus')}${addLabel}</button>`
          : ''}`,
    };
  }

  #render() {
    if (!this.#built) this.#build();
    if (!this.#config) return;

    // Verschachtelte Blöcke (z. B. die Dachflächen unter Photovoltaik)
    // vorab bauen, damit sie im Elternblock statt als eigene Karte landen.
    const nested = {};
    for (const b of BLOCKS.filter((x) => x.nestedIn)) {
      nested[b.nestedIn] = { block: b, ...this.#renderEntries(b) };
    }

    this.#els.blocks.innerHTML = BLOCKS.filter((b) => !b.nestedIn).map((b) => {
      const { html } = this.#renderEntries(b);
      const sub = nested[b.key];

      return `<div class="block">
        <h3>${icon(b.icon)}${b.title}</h3>
        <p class="intro-text">${b.intro}</p>
        ${html}
        ${sub ? `<details class="sub">
          <summary>${icon(sub.block.icon)}<span>${sub.block.title}</span>
            <span class="count">${sub.count}</span>
            ${icon('mdi:chevron-down', 'class="chev"')}</summary>
          <div class="sub-body">
            <p class="intro-text">${sub.block.intro}</p>
            ${sub.html}
          </div>
        </details>` : ''}
      </div>`;
    }).join('');

    for (const btn of this.#els.blocks.querySelectorAll('[data-block]')) {
      const block = BLOCKS.find((b) => b.key === btn.dataset.block);
      const index = Number(btn.dataset.index);
      if (btn.classList.contains('del')) {
        btn.addEventListener('click', () => this.#remove(block, index));
      } else {
        btn.addEventListener('click', () => this.#openDialog(block, index));
      }
    }
  }

  /* ------------------------------ Dialog ---------------------------- */

  #openDialog(block, index) {
    this.#editing = { block, index };
    const isNew = block.kind === 'list' && index < 0;
    this.#draft = isNew
      ? {}
      : { ...(block.kind === 'list' ? asList(this.#config[block.key])[index] : this.#config[block.key]) };

    this.#els.dialogTitle.textContent = block.title;
    this.#els.formbox.replaceChildren();

    const form = document.createElement('ha-form');
    form.hass = this.#hass;
    form.data = this.#draft;
    // computeLabel/computeHelper müssen vor "schema" gesetzt sein: das
    // Setzen von schema löst das Zeichnen aus, ohne die beiden Funktionen
    // stünden beim ersten Öffnen nur die technischen Rohnamen da.
    form.computeLabel = (s) => LABELS[block.key]?.[s.name] ?? s.name;
    form.computeHelper = (s) => HELPERS[block.key]?.[s.name] ?? '';
    // Die Selektoren sind Funktionen, weil "car" die Fahrzeugliste braucht
    // und der Filterschalter die device_class an- und abschaltet. Ein Eintrag
    // vom Typ "expandable" wird rekursiv aufgelöst — so lassen sich seltener
    // gebrauchte Felder in einem Aufklapp-Bereich verstecken, ohne dass jeder
    // Block sein eigenes Verschachtelungs-Gerüst bräuchte.
    const buildSchema = (entries) => entries.map((f) => (
      f.type === 'expandable'
        ? { type: 'expandable', name: f.name, title: f.title, schema: buildSchema(f.fields) }
        : { name: f.name, selector: f.selector(this.#config) }
    ));
    form.schema = buildSchema(block.schema);
    form.addEventListener('value-changed', (ev) => { this.#draft = ev.detail.value; });
    this.#els.formbox.appendChild(form);
    this.#els.form = form;

    this.#els.dialog.showModal();
  }

  #closeDialog() {
    this.#editing = null;
    this.#els.dialog.close();
  }

  async #commit() {
    const { block, index } = this.#editing ?? {};
    if (!block) return;
    const next = normalizeConfig(this.#config);

    if (block.kind === 'list') {
      const rows = [...asList(next[block.key])];
      const entry = { ...this.#draft };
      // Jede Zeile bekommt eine stabile Kennung, damit eine Wallbox ihr
      // Fahrzeug behält, auch wenn davor eines gelöscht wird.
      if (!entry.id) entry.id = `${block.key}_${Date.now().toString(36)}`;
      if (index < 0) rows.push(entry);
      else rows[index] = entry;
      next[block.key] = rows;
    } else {
      next[block.key] = { ...this.#draft };
    }

    this.#config = next;
    this.#closeDialog();
    this.#render();
    await saveConfig(this.#hass, next);
  }

  async #remove(block, index) {
    const next = normalizeConfig(this.#config);
    const rows = [...asList(next[block.key])];
    const removed = rows.splice(index, 1)[0];
    next[block.key] = rows;

    // Verweise auf ein gelöschtes Fahrzeug aufräumen, sonst zeigt eine
    // Wallbox auf etwas, das es nicht mehr gibt.
    if (block.key === 'cars' && removed?.id) {
      next.wallboxes = asList(next.wallboxes).map((wb) => (
        wb.car === removed.id ? { ...wb, car: '' } : wb
      ));
    }

    this.#config = next;
    this.#render();
    await saveConfig(this.#hass, next);
  }

  /* ------------------------------ Vorlage --------------------------- */

  async #applyPreset() {
    const preset = PRESETS[this.#els.preset.value];
    if (!preset) {
      this.#els.report.textContent = 'Bitte zuerst eine Vorlage auswählen.';
      return;
    }

    const states = this.#hass.states;
    const next = normalizeConfig(this.#config);
    let filled = 0;
    const missing = [];

    const resolve = (parts) => {
      const found = asList(parts).map((p) => findEntity(states, p)).filter(Boolean);
      return found;
    };

    for (const [key, spec] of Object.entries(preset)) {
      if (key === 'label' || key === 'hint') continue;

      if (Array.isArray(spec)) {
        // Listenblöcke: nur anlegen, wenn noch nichts drinsteht.
        if (asList(next[key]).length) continue;
        const rows = [];
        for (const template of spec) {
          const row = { id: `${key}_${Date.now().toString(36)}` };
          for (const [field, parts] of Object.entries(template)) {
            if (field === 'name') { row.name = parts; continue; }
            const found = resolve(parts);
            if (found.length) { row[field] = found[0]; filled += 1; }
            else missing.push(`${key}.${field}`);
          }
          if (Object.keys(row).length > 2) rows.push(row);
        }
        if (rows.length) next[key] = rows;
        continue;
      }

      const target = { ...(next[key] ?? {}) };
      for (const [field, parts] of Object.entries(spec)) {
        const current = target[field];
        if (Array.isArray(current) ? current.length : current) continue;
        const found = resolve(parts);
        if (!found.length) { missing.push(`${key}.${field}`); continue; }
        // Felder, die mehrere Entitäten aufnehmen, bekommen die Liste.
        // Felder, die mehrere Entitäten aufnehmen, bekommen die ganze Liste.
        const multi = ['import_total', 'export_total', 'energy_total', 'forecast',
          'temperatures', 'extra_entities'];
        target[field] = multi.includes(field) ? found : found[0];
        filled += 1;
      }
      next[key] = target;
    }

    this.#config = next;
    this.#render();
    await saveConfig(this.#hass, next);

    this.#els.report.innerHTML = filled
      ? `<strong>${filled} Felder gefüllt.</strong>`
        + (missing.length ? ` Nicht gefunden: ${esc(missing.join(', '))}.` : '')
        + (preset.hint ? `<br>${preset.hint}` : '')
      : 'Keine passenden Sensoren gefunden. Läuft die Integration, und heißen die '
        + 'Sensoren wie üblich? Sonst bleibt die Auswahl von Hand.';
  }
}

class WueflEnergyConfigCardEditor extends WueflFormEditor {
  schema = [{ name: 'note', selector: sel.text() }];
  labels = { note: 'Diese Karte hat keine Einstellungen.' };
}

customElements.define('wuefl-energy-config-card', WueflEnergyConfigCard);
customElements.define('wuefl-energy-config-card-editor', WueflEnergyConfigCardEditor);

registerCard({
  type: 'wuefl-energy-config-card',
  name: 'wuefl Zuordnung',
  description: 'Welche Entität wofür steht — Netz, Solar, Speicher, Wallboxen, Fahrzeuge.',
});
