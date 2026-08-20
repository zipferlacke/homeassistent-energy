/**
 * wuefl-energy-panel
 * Eigene Seite in der Seitenleiste: alle Entitäten für die drei Ansichten
 * an einer Stelle, bedient wie die Energie-Konfiguration von Home Assistant.
 */

const WS_GET = 'wuefl_energy/get';
const WS_SAVE = 'wuefl_energy/save';

/* Die Formularelemente von Home Assistant werden erst geladen, wenn eine
   Karte sie braucht. Auf einer eigenen Seite muss man das anstoßen. */
async function ensureHaForm() {
  if (customElements.get('ha-form')) return;
  const helpers = await window.loadCardHelpers();
  const card = await helpers.createCardElement({ type: 'entities', entities: [] });
  if (card.constructor.getConfigElement) await card.constructor.getConfigElement();
  await customElements.whenDefined('ha-form');
}

const entity = (domain = 'sensor') => ({ entity: { filter: { domain } } });
const entities = (domain = 'sensor') => ({ entity: { filter: { domain }, multiple: true } });
const pick = (domains) => ({ entity: { filter: domains.map((d) => ({ domain: d })) } });
const number = (min, max, step = 1) => ({ number: { min, max, step, mode: 'box' } });
const text = () => ({ text: {} });
const bool = () => ({ boolean: {} });

/* Ein Wallbox-Block – dreimal identisch, nur mit anderem Namen. */
const wallboxSection = (n) => ({
  type: 'expandable',
  name: `wallbox_${n}`,
  title: `Wallbox ${n}`,
  schema: [
    { name: 'name', selector: text() },
    { name: 'car_soc_entity', selector: entity() },
    { name: 'target_soc_entity', selector: pick(['number', 'input_number']) },
    { name: 'capacity', selector: number(10, 200, 1) },
    { name: 'mode_entity', selector: pick(['select', 'input_select']) },
    { name: 'current_entity', selector: pick(['number', 'input_number']) },
    { name: 'price_limit_entity', selector: pick(['number', 'input_number']) },
    { name: 'max_power', selector: number(1000, 30000, 100) },
    { name: 'power_entity', selector: entity() },
    { name: 'session_energy_entity', selector: entity() },
    { name: 'today_energy_entity', selector: entity() },
    { name: 'total_energy_entity', selector: entity() },
    { name: 'battery_use_entity', selector: pick(['switch', 'input_boolean']) },
    { name: 'battery_reserve_entity', selector: pick(['number', 'input_number']) },
    { name: 'priority_entity', selector: pick(['select', 'input_select']) },
  ],
});

const SCHEMA = [
  {
    type: 'expandable',
    name: 'live',
    title: 'Live-Ansicht',
    icon: 'mdi:home-lightning-bolt',
    schema: [
      { name: 'title', selector: text() },
      { name: 'weather_entity', selector: entity('weather') },
      { name: 'show_totals', selector: bool() },
      {
        type: 'expandable', name: '', title: 'Photovoltaik',
        schema: [
          { name: 'pv_power_total', selector: entity() },
          { name: 'pv_power', selector: entities() },
          { name: 'pv_energy', selector: entities() },
          { name: 'pv_forecast_entities', selector: entities() },
          { name: 'pv_module_columns', selector: number(2, 8) },
          { name: 'pv_module_rows', selector: number(1, 6) },
        ],
      },
      {
        type: 'expandable', name: '', title: 'Netz',
        schema: [
          { name: 'grid_power', selector: entity() },
          { name: 'invert_grid', selector: bool() },
          { name: 'grid_import_energy', selector: entities() },
          { name: 'grid_export_energy', selector: entities() },
        ],
      },
      {
        type: 'expandable', name: '', title: 'Speicher',
        schema: [
          { name: 'battery_power', selector: entities() },
          { name: 'invert_battery', selector: bool() },
          { name: 'battery_soc', selector: entities() },
          { name: 'battery_in_energy', selector: entities() },
          { name: 'battery_out_energy', selector: entities() },
        ],
      },
      {
        type: 'expandable', name: '', title: 'Verbraucher',
        schema: [
          { name: 'house_power', selector: entity() },
          { name: 'house_energy', selector: entity() },
          { name: 'wallbox_power', selector: entities() },
          { name: 'wallbox_energy', selector: entities() },
          { name: 'heatpump_power', selector: entities() },
          { name: 'heatpump_energy', selector: entities() },
        ],
      },
    ],
  },
  {
    type: 'expandable',
    name: 'history',
    title: 'Energie-Ansicht',
    icon: 'mdi:chart-areaspline',
    schema: [
      { name: 'title', selector: text() },
      {
        name: 'default_period',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'day', label: 'Tag' },
              { value: 'week', label: 'Woche' },
              { value: 'month', label: 'Monat' },
              { value: 'year', label: 'Jahr' },
            ],
          },
        },
      },
      { name: 'pv_energy', selector: entities() },
      { name: 'grid_import', selector: entities() },
      { name: 'grid_export', selector: entities() },
      { name: 'battery_in', selector: entities() },
      { name: 'battery_out', selector: entities() },
      { name: 'battery_soc', selector: entities() },
      { name: 'house_energy', selector: entities() },
      { name: 'wallbox_energy', selector: entities() },
      { name: 'heatpump_energy', selector: entities() },
    ],
  },
  {
    type: 'expandable',
    name: 'price',
    title: 'Strompreis',
    icon: 'mdi:cash',
    schema: [
      { name: 'price_entity', selector: entity() },
      { name: 'price_export_entity', selector: entity() },
      { name: 'price_import_fixed', selector: number(0, 200, 0.1) },
      { name: 'price_export_fixed', selector: number(0, 200, 0.1) },
      { name: 'price_forecast_attribute', selector: text() },
      { name: 'price_reference', selector: number(0, 200, 0.1) },
      { name: 'house_base_load', selector: number(0, 5000, 50) },
    ],
  },
  wallboxSection(1),
  wallboxSection(2),
  wallboxSection(3),
];

const LABELS = {
  live: 'Live-Ansicht',
  history: 'Energie-Ansicht',
  price: 'Strompreis',
  wallbox_1: 'Wallbox 1',
  wallbox_2: 'Wallbox 2',
  wallbox_3: 'Wallbox 3',

  title: 'Überschrift',
  weather_entity: 'Wetter',
  show_totals: 'Gesamtwerte im Bild anzeigen',

  pv_power_total: 'PV-Leistung gesamt (maßgeblich)',
  pv_power: 'PV-Leistung je Strang (Näherung)',
  pv_energy: 'PV-Ertrag heute',
  pv_forecast_entities: 'PV-Prognose',
  pv_module_columns: 'Module je Dachreihe',
  pv_module_rows: 'Modulreihen',

  grid_power: 'Netzleistung (positiv = Bezug)',
  invert_grid: 'Vorzeichen Netz umkehren',
  grid_import_energy: 'Netzbezug heute',
  grid_export_energy: 'Einspeisung heute',

  battery_power: 'Leistung je Speicher (positiv = entladen)',
  invert_battery: 'Vorzeichen Speicher umkehren',
  battery_soc: 'Ladestand je Speicher',
  battery_in_energy: 'Geladen heute',
  battery_out_energy: 'Entladen heute',

  house_power: 'Hausverbrauch (leer = wird berechnet)',
  house_energy: 'Hausverbrauch heute',
  wallbox_power: 'Ladeleistung je Wallbox',
  wallbox_energy: 'Geladen heute je Wallbox',
  heatpump_power: 'Leistung je Wärmepumpe',
  heatpump_energy: 'Verbrauch heute je Wärmepumpe',

  default_period: 'Zeitraum beim Öffnen',
  grid_import: 'Netzbezug gesamt (kWh)',
  grid_export: 'Einspeisung gesamt (kWh)',
  battery_in: 'Speicher geladen gesamt (kWh)',
  battery_out: 'Speicher entladen gesamt (kWh)',

  price_entity: 'Preis-Sensor Bezug',
  price_export_entity: 'Preis-Sensor Einspeisung',
  price_import_fixed: 'Festpreis Bezug in ct/kWh',
  price_export_fixed: 'Festpreis Einspeisung in ct/kWh',
  price_forecast_attribute: 'Attribut mit der Preisliste',
  price_reference: 'Vergleichspreis für die PV-Ersparnis in ct/kWh',
  house_base_load: 'Grundlast des Haushalts in W',

  name: 'Name des Fahrzeugs',
  car_soc_entity: 'Ladestand Auto',
  target_soc_entity: 'Ziel-Ladestand',
  capacity: 'Akkukapazität in kWh',
  mode_entity: 'Lademodus',
  current_entity: 'Maximaler Ladestrom',
  price_limit_entity: 'Preisgrenze fürs Laden',
  max_power: 'Maximale Ladeleistung in W',
  power_entity: 'Ladeleistung',
  session_energy_entity: 'Aktuelle Ladung',
  today_energy_entity: 'Heute geladen',
  total_energy_entity: 'Gesamt geladen',
  battery_use_entity: 'Freigabe: aus Hausakku laden',
  battery_reserve_entity: 'Speicher nutzen bis … %',
  priority_entity: 'Priorität',
};

const HELPERS = {
  pv_power_total: 'Wird für Summe und Fluss genutzt. Die Stränge darunter dienen nur der Aufschlüsselung.',
  pv_power: 'Erscheinen als Näherung über der Gesamtleistung.',
  price_reference: 'Womit die PV-Ersparnis verglichen wird, üblicherweise der reine Arbeitspreis.',
  battery_power: 'Positiv bedeutet entladen. Liefert der Wechselrichter es andersherum, den Schalter darunter setzen.',
};

const CSS = `
:host { display: block; }

.wrap {
  margin: 0 auto;
  max-width: 46rem;
  padding: 1rem 1rem 6rem;
}

.intro {
  background: var(--card-background-color);
  border-radius: 12px;
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;

  & h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
  & p { color: var(--secondary-text-color); line-height: 1.5; margin: 0; }
}

.form {
  background: var(--card-background-color);
  border-radius: 12px;
  padding: 1rem 1.15rem;
}

.bar {
  align-items: center;
  background: var(--card-background-color);
  border-top: 1px solid var(--divider-color);
  bottom: 0;
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  left: 0;
  padding: 0.75rem 1rem;
  position: fixed;
  right: 0;
  z-index: 2;

  & .status { color: var(--secondary-text-color); flex: 1 1 auto; font-size: 0.85rem; }
}

.loading { color: var(--secondary-text-color); padding: 2rem 1rem; text-align: center; }
`;

class WueflEnergyPanel extends HTMLElement {
  #hass = null;
  #config = null;
  #built = false;
  #dirty = false;
  #els = {};

  set hass(hass) {
    this.#hass = hass;
    if (this.#els.form) this.#els.form.hass = hass;
    if (!this.#built) this.#init();
  }

  set narrow(_) {}
  set route(_) {}
  set panel(_) {}

  async #init() {
    this.#built = true;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = '<div class="loading">Einstellungen werden geladen …</div>';
    root.appendChild(wrap);

    try {
      await ensureHaForm();
      this.#config = await this.#hass.callWS({ type: WS_GET });
    } catch (err) {
      wrap.innerHTML = `<div class="loading">Die Einstellungen konnten nicht geladen werden.<br>${err.message ?? err}</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="intro">
        <h1>Energie-Zuordnung</h1>
        <p>Hier stehen die Entitäten für alle drei Ansichten. Was hier eingetragen ist,
           gilt für jede Karte, die keinen eigenen Wert mitbringt — eine Einstellung
           in einer Karte hat also weiterhin Vorrang.</p>
      </div>
      <div class="form"></div>
    `;

    const form = document.createElement('ha-form');
    form.hass = this.#hass;
    form.schema = SCHEMA;
    form.data = this.#config ?? {};
    form.computeLabel = (s) => LABELS[s.name] ?? s.title ?? s.name;
    form.computeHelper = (s) => HELPERS[s.name] ?? '';
    form.addEventListener('value-changed', (ev) => {
      this.#config = ev.detail.value;
      this.#dirty = true;
      this.#renderBar();
    });
    wrap.querySelector('.form').appendChild(form);

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `
      <span class="status"></span>
      <mwc-button class="reset">Verwerfen</mwc-button>
      <mwc-button raised class="save">Speichern</mwc-button>
    `;
    wrap.appendChild(bar);

    this.#els = {
      form,
      bar,
      status: bar.querySelector('.status'),
      save: bar.querySelector('.save'),
      reset: bar.querySelector('.reset'),
    };

    this.#els.save.addEventListener('click', () => this.#save());
    this.#els.reset.addEventListener('click', () => this.#reload());
    this.#renderBar();
  }

  #renderBar() {
    if (!this.#els.status) return;
    this.#els.status.textContent = this.#dirty ? 'Nicht gespeicherte Änderungen' : '';
    this.#els.save.disabled = !this.#dirty;
    this.#els.reset.disabled = !this.#dirty;
  }

  async #save() {
    this.#els.status.textContent = 'Wird gespeichert …';
    try {
      await this.#hass.callWS({ type: WS_SAVE, config: this.#config ?? {} });
      this.#dirty = false;
      this.#renderBar();
      this.#els.status.textContent = 'Gespeichert';
      setTimeout(() => this.#renderBar(), 2500);
    } catch (err) {
      this.#els.status.textContent = `Fehler: ${err.message ?? err}`;
    }
  }

  async #reload() {
    this.#config = await this.#hass.callWS({ type: WS_GET });
    this.#els.form.data = this.#config ?? {};
    this.#dirty = false;
    this.#renderBar();
  }
}

customElements.define('wuefl-energy-panel', WueflEnergyPanel);
