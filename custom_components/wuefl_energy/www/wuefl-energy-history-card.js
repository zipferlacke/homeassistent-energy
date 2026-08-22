/**
 * wuefl-energy-history-card
 * Rahmen um die Energie-Ansicht: Zeitraum-Auswahl, Diagramm, Kennzahlen.
 *
 * Das Diagramm zeichnet diese Karte NICHT selbst. Sie bettet
 * "energy-custom-graph-card" von Thyraz ein (HACS), die Home Assistants
 * eigene ECharts-Instanz nutzt. Ist sie nicht installiert, erscheint an
 * ihrer Stelle ein Hinweis mit Link — bewusst ohne eigenes Ersatz-Diagramm,
 * damit es nur eine einzige Darstellung gibt und nicht zwei, die sich
 * unterscheiden.
 *
 * Bedienelemente und Kacheln sind Home-Assistant-Komponenten
 * (mwc-button, ha-date-range-picker, ha-card) statt selbstgebauter
 * Nachbauten — dadurch folgen sie Theme, Dark Mode und Schriftarten des
 * Nutzers von allein.
 */

import {
  asList, fmtEnergy, esc, registerCard, centralConfig, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

const REPO_URL = 'https://github.com/Thyraz/energy-custom-graph';
const HACS_URL = 'https://my.home-assistant.io/redirect/hacs_repository/'
  + '?owner=Thyraz&repository=energy-custom-graph&category=dashboard';

const PERIODS = [
  { id: 'day', label: 'Tag' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
  { id: 'year', label: 'Jahr' },
];

/* Erzeugung oberhalb der Nulllinie, Verbrauch unterhalb — wie in HA's
   eigener Energie-Ansicht. "pair" fasst Gegenstücke (Netz, Speicher) in
   einer gemeinsamen Kachel zusammen. Die Farben sind bewusst die
   HA-Energie-Variablen, damit alles zum Rest des Dashboards passt. */
const SERIES = [
  { key: 'pv_energy', label: 'Solar', sign: 1, color: '--energy-solar-color', cls: 'solar-border' },
  { key: 'battery_out', label: 'Speicher', sign: 1, color: '--energy-battery-out-color', cls: 'battery-border', pair: 'battery', short: 'entladen' },
  { key: 'battery_in', label: 'Speicher', sign: -1, color: '--energy-battery-in-color', cls: 'battery-border', pair: 'battery', short: 'geladen' },
  { key: 'grid_import', label: 'Netz', sign: -1, color: '--energy-grid-consumption-color', cls: 'grid-border', pair: 'grid', short: 'Bezug' },
  { key: 'grid_export', label: 'Netz', sign: -1, color: '--energy-grid-return-color', cls: 'grid-border', pair: 'grid', short: 'Einspeisung' },
  { key: 'house_energy', label: 'Haushalt', sign: -1, color: '--wuefl-house-color', cls: 'house-border' },
  { key: 'wallbox_energy', label: 'Wallbox', sign: -1, color: '--wuefl-wallbox-color', cls: 'wallbox-border' },
  { key: 'heatpump_energy', label: 'Wärmepumpe', sign: -1, color: '--wuefl-heatpump-color', cls: 'heatpump-border' },
];

const PAIR_NAMES = { grid: 'Netz', battery: 'Speicher' };

const CSS = `
:host { display: block; }

.energy-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding: 0 0 16px;
}
.time-buttons { display: flex; gap: 8px; }
mwc-button { --mdc-theme-primary: var(--primary-color); }
.range-picker-container { max-width: 320px; }

/* Notbehelf, falls ha-date-range-picker in dieser Umgebung fehlt
   (z. B. in der eigenständigen Vorschau ohne Home Assistant). */
.fallback-range { align-items: center; display: flex; gap: 8px; }
.fallback-range input {
  background: var(--secondary-background-color);
  border: 0; border-radius: 8px; color: var(--primary-text-color);
  font: inherit; height: 36px; padding: 0 8px;
}

.chart-slot { display: block; margin-bottom: 16px; }

.missing {
  padding: 16px;
  & h3 { margin: 0 0 8px; }
  & p { color: var(--secondary-text-color); line-height: 1.5; margin: 0 0 12px; }
  & a { color: var(--primary-color); }
  & .links { display: flex; flex-wrap: wrap; gap: 12px; }
}

.tiles {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.energy-value-card {
  border-left: 4px solid transparent;
  display: block;
  position: relative;
}
.solar-border { border-left-color: var(--energy-solar-color, #ff9800); }
.battery-border { border-left-color: var(--energy-battery-out-color, #4db0a2); }
.grid-border { border-left-color: var(--energy-grid-consumption-color, #488fc2); }
.house-border { border-left-color: var(--wuefl-house-color, #488fc2); }
.wallbox-border { border-left-color: var(--wuefl-wallbox-color, #7f77dd); }
.heatpump-border { border-left-color: var(--wuefl-heatpump-color, #d85a30); }

.card-content { padding: 16px; }
.card-title { color: var(--secondary-text-color); font-size: 14px; }
.main-value {
  color: var(--primary-text-color);
  font-size: 24px; font-weight: bold; margin: 4px 0;
}
.sub-values { display: flex; font-size: 12px; gap: 16px; margin-top: 8px; }
.sub-label { color: var(--secondary-text-color); display: block; }
.discharge-text { color: var(--energy-battery-out-color, #4db0a2); }
.charge-text { color: var(--energy-battery-in-color, #f6c34c); }
.import-text { color: var(--energy-grid-consumption-color, #488fc2); }
.export-text { color: var(--energy-grid-return-color, #8353d1); }

.state { color: var(--secondary-text-color); padding: 24px 0; text-align: center; }
`;

class WueflEnergyHistoryCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #period = 'day';
  #range = null;
  #els = {};
  #chartCard = null;
  #stats = {};

  static getConfigElement() { return document.createElement('wuefl-energy-history-card-editor'); }
  static getStubConfig() { return { title: 'Energie' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Energie', ...this.#central, ...this.#own };
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (this.#chartCard) this.#chartCard.hass = hass;
    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
    }
    if (!this.#built) this.#build();
  }

  getCardSize() { return 10; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Energie', ...this.#central, ...this.#own };
    this.#refresh();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }

    const card = document.createElement('ha-card');
    card.innerHTML = `
      <div class="card-content">
        <div class="energy-toolbar">
          <div class="time-buttons"></div>
          <div class="range-picker-container"></div>
        </div>
        <div class="chart-slot"></div>
        <div class="tiles"></div>
      </div>
    `;
    root.replaceChildren(card);

    this.#els = {
      card,
      buttons: card.querySelector('.time-buttons'),
      picker: card.querySelector('.range-picker-container'),
      chart: card.querySelector('.chart-slot'),
      tiles: card.querySelector('.tiles'),
    };

    this.#buildButtons();
    this.#buildPicker();
    this.#built = true;
    this.#refresh();
  }

  /** Zeitraum-Knöpfe als native mwc-button, nicht selbst nachgebaut. */
  #buildButtons() {
    this.#els.buttons.replaceChildren();
    for (const p of PERIODS) {
      const btn = document.createElement('mwc-button');
      btn.setAttribute('dense', '');
      if (p.id === this.#period) btn.setAttribute('raised', '');
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        this.#period = p.id;
        this.#range = null;
        this.#buildButtons();
        this.#refresh();
      });
      this.#els.buttons.appendChild(btn);
    }
  }

  /**
   * Bereichswähler von Home Assistant. Fehlt die Komponente (etwa in der
   * eigenständigen Vorschau), greift ein schlichter Notbehelf aus zwei
   * Datumsfeldern — sonst wäre der freie Zeitraum dort gar nicht bedienbar.
   */
  #buildPicker() {
    const box = this.#els.picker;
    box.replaceChildren();

    if (customElements.get('ha-date-range-picker')) {
      const picker = document.createElement('ha-date-range-picker');
      picker.hass = this.#hass;
      const { start, end } = this.#currentRange();
      picker.startDate = start;
      picker.endDate = end;
      picker.addEventListener('value-changed', (ev) => {
        const { startDate, endDate } = ev.detail ?? {};
        if (!startDate || !endDate) return;
        this.#range = { start: new Date(startDate), end: new Date(endDate) };
        this.#period = 'custom';
        this.#buildButtons();
        this.#refresh();
      });
      box.appendChild(picker);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'fallback-range';
    wrap.innerHTML = '<input type="date" class="from"><span>–</span><input type="date" class="to">';
    const apply = () => {
      const from = wrap.querySelector('.from').value;
      const to = wrap.querySelector('.to').value;
      if (!from || !to) return;
      this.#range = { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`) };
      this.#period = 'custom';
      this.#buildButtons();
      this.#refresh();
    };
    for (const input of wrap.querySelectorAll('input')) {
      input.addEventListener('change', apply);
    }
    box.appendChild(wrap);
  }

  /* ------------------------------ Zeitraum -------------------------- */

  #currentRange() {
    if (this.#range) return this.#range;
    const now = new Date();
    const start = new Date(now);
    if (this.#period === 'day') start.setHours(0, 0, 0, 0);
    else if (this.#period === 'week') { start.setDate(now.getDate() - now.getDay() + 1); start.setHours(0, 0, 0, 0); }
    else if (this.#period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
    else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
    return { start, end: now };
  }

  #used() {
    return SERIES.filter((s) => asList(this.#config[s.key]).length);
  }

  /* ------------------------------ Diagramm -------------------------- */

  /**
   * Baut die Konfiguration für die Thyraz-Karte, angelehnt an deren
   * eigenes Beispiel "Recreate the energy dashboard usage card": alle
   * Reihen als gestapelte Balken, Verbrauch mit multiply -1 unter die
   * Nulllinie, Farben aus der HA-Energie-Palette.
   */
  #chartConfig() {
    const { start, end } = this.#currentRange();
    const series = [];
    for (const s of this.#used()) {
      for (const id of asList(this.#config[s.key])) {
        series.push({
          statistic_id: id,
          name: s.pair ? `${PAIR_NAMES[s.pair]} ${s.short}` : s.label,
          stat_type: 'change',
          chart_type: 'bar',
          stack: 'energie',
          color: s.color,
          ...(s.sign < 0 ? { multiply: -1 } : {}),
        });
      }
    }
    return {
      type: 'custom:energy-custom-graph-card',
      timespan: { mode: 'fixed', start: start.toISOString(), end: end.toISOString() },
      series,
    };
  }

  async #renderChart() {
    const slot = this.#els.chart;
    if (!customElements.get('energy-custom-graph-card')) {
      this.#chartCard = null;
      slot.innerHTML = `
        <ha-card>
          <div class="missing">
            <h3>Diagramm-Karte fehlt</h3>
            <p>Die Energie-Ansicht nutzt <strong>Energy Custom Graph</strong> von Thyraz.
              Die Karte greift auf die ECharts-Instanz zu, die Home Assistant ohnehin
              mitbringt — dadurch sieht das Diagramm nativ aus, ohne dass eine zweite
              Diagramm-Bibliothek geladen werden muss.</p>
            <p>Einmal über HACS installieren (Kategorie <em>Dashboard</em>), Browser-Cache
              leeren, Seite neu laden — danach erscheint das Diagramm hier automatisch.</p>
            <div class="links">
              <a href="${HACS_URL}" target="_blank" rel="noreferrer">In HACS öffnen</a>
              <a href="${REPO_URL}" target="_blank" rel="noreferrer">Projektseite auf GitHub</a>
            </div>
          </div>
        </ha-card>`;
      return;
    }

    const config = this.#chartConfig();
    if (!config.series.length) {
      this.#chartCard = null;
      slot.innerHTML = '<div class="state">Noch keine Gesamtzähler zugeordnet.</div>';
      return;
    }

    // Über die Karten-Helfer erzeugen, damit die fremde Karte genauso
    // eingebunden wird wie von Lovelace selbst.
    if (!this.#chartCard) {
      const helpers = await window.loadCardHelpers?.();
      this.#chartCard = helpers
        ? helpers.createCardElement(config)
        : document.createElement('energy-custom-graph-card');
      if (!helpers) this.#chartCard.setConfig?.(config);
      this.#chartCard.hass = this.#hass;
      slot.replaceChildren(this.#chartCard);
    } else {
      this.#chartCard.setConfig?.(config);
      this.#chartCard.hass = this.#hass;
    }
  }

  /* ------------------------------ Daten ----------------------------- */

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    await this.#renderChart();

    const used = this.#used();
    if (!used.length) {
      this.#els.tiles.replaceChildren();
      return;
    }

    const { start, end } = this.#currentRange();
    const ids = used.flatMap((s) => asList(this.#config[s.key]));
    try {
      this.#stats = await this.#hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: ids,
        period: 'day',
        types: ['change'],
      });
    } catch {
      this.#stats = {};
    }
    this.#renderTiles(used);
  }

  #total(series) {
    return asList(this.#config[series.key]).reduce(
      (a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0,
    );
  }

  /* ------------------------------ Kacheln --------------------------- */

  #renderTiles(used) {
    const html = [];
    const seen = new Set();

    for (const s of used) {
      if (s.pair) {
        if (seen.has(s.pair)) continue;
        seen.add(s.pair);
        const both = used.filter((x) => x.pair === s.pair);
        const total = both.reduce((a, x) => a + this.#total(x), 0);
        const subs = both.map((x) => {
          const cls = x.short === 'entladen' ? 'discharge-text'
            : x.short === 'geladen' ? 'charge-text'
            : x.short === 'Bezug' ? 'import-text' : 'export-text';
          return `<div class="sub-item ${cls}">
            <span>${fmtEnergy(this.#total(x))}</span>
            <span class="sub-label">${esc(x.short)}</span>
          </div>`;
        }).join('');
        html.push(`<ha-card class="energy-value-card ${s.cls}">
          <div class="card-content">
            <div class="card-title">${esc(PAIR_NAMES[s.pair])}</div>
            <div class="main-value">${fmtEnergy(total)}</div>
            <div class="sub-values">${subs}</div>
          </div>
        </ha-card>`);
        continue;
      }
      html.push(`<ha-card class="energy-value-card ${s.cls}">
        <div class="card-content">
          <div class="card-title">${esc(s.label)}</div>
          <div class="main-value">${fmtEnergy(this.#total(s))}</div>
        </div>
      </ha-card>`);
    }
    this.#els.tiles.innerHTML = html.join('');
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };

class WueflEnergyHistoryCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-energy-history-card', WueflEnergyHistoryCard);
customElements.define('wuefl-energy-history-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'wuefl-energy-history-card',
  name: 'wuefl Energie',
  description: 'Zeitraum-Auswahl, Diagramm (Energy Custom Graph) und Kennzahlen.',
});
