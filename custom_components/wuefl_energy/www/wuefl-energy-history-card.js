/**
 * wuefl-energy-history-card
 * Rahmen um die Energie-Ansicht: Zeitraum-Auswahl, Diagramme, HA-Tile-Kacheln.
 */

import {
  asList, fmtEnergy, esc, registerCard, centralConfig, WueflFormEditor, sel
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

const SERIES = [
  { key: 'pv_energy', label: 'Solar', legendName: 'Solar', sign: 1, color: '--energy-solar-color', fallbackColor: '#ff9800' },
  { key: 'battery_out', label: 'Speicher', legendName: 'Batterie', sign: 1, color: '--energy-battery-out-color', fallbackColor: '#4db0a2', pair: 'battery', short: 'entladen' },
  { key: 'battery_in', label: 'Speicher', legendName: 'Batterie', sign: -1, color: '--energy-battery-in-color', fallbackColor: '#f6c34c', pair: 'battery', short: 'geladen' },
  { key: 'grid_import', label: 'Netz', legendName: 'Netz', sign: -1, color: '--energy-grid-consumption-color', fallbackColor: '#488fc2', pair: 'grid', short: 'Bezug' },
  { key: 'grid_export', label: 'Netz', legendName: 'Netz', sign: -1, color: '--energy-grid-return-color', fallbackColor: '#8353d1', pair: 'grid', short: 'Einspeisung' },
  { key: 'house_energy', label: 'Haushalt', legendName: 'Haushalt', sign: -1, color: '--wuefl-house-color', fallbackColor: '#e57373' },
  { key: 'wallbox_energy', label: 'Wallbox', legendName: 'Wallbox', sign: -1, color: '--wuefl-wallbox-color', fallbackColor: '#ba68c8' },
];

const PAIR_NAMES = { grid: 'Netz', battery: 'Speicher' };
const ICONS = {
  pv_energy: 'mdi:solar-power',
  battery: 'mdi:battery-high',
  grid: 'mdi:transmission-tower',
  house_energy: 'mdi:home',
  wallbox_energy: 'mdi:ev-station'
};

function resolveColor(el, varName, fallback) {
  if (!varName) return fallback;
  const cleanVar = varName.startsWith('var(') ? varName.slice(4, -1).trim() : varName;
  if (cleanVar.startsWith('--')) {
    const computed = getComputedStyle(el).getPropertyValue(cleanVar).trim();
    if (computed) return computed;
  }
  return cleanVar.startsWith('--') ? fallback : cleanVar;
}

const CSS = `
:host { 
  display: block; 
}
[hidden] { 
  display: none !important; 
}

.root-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.main-header-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--primary-text-color);
  padding: 4px 0 8px;
}

.energy-toolbar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  margin-bottom: 8px;
}

.toolbar-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-bottom {
  display: flex;
  justify-content: center;
  width: 100%;
}

.time-buttons {
  background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
  border-radius: 12px;
  display: inline-flex;
  padding: 3px;
  gap: 2px;
}

.time-btn {
  background: transparent;
  border: none;
  border-radius: 9px;
  color: var(--secondary-text-color, #727272);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  transition: all 0.2s ease;
}

.time-btn:hover { color: var(--primary-text-color, #212121); }
.time-btn.active {
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #212121);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
}

.date-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 500;
  color: var(--primary-text-color);
  justify-content: center;
  min-width: 200px;
}

.nav-btn {
  background: transparent;
  border: none;
  color: var(--secondary-text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.nav-btn:hover {
  background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
  color: var(--primary-text-color);
}

.nav-label {
  min-width: 160px;
  text-align: center;
  white-space: nowrap;
}

.date-picker-wrapper {
  position: relative;
  display: inline-block;
}

.date-popup {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 8px;
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
}

.date-popup.hidden {
  opacity: 0;
  transform: translateY(-10px);
  visibility: hidden;
  pointer-events: none;
}

.date-field {
  display: flex;
  flex-direction: column;
  background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
  border-radius: 4px 4px 0 0;
  border-bottom: 2px solid var(--primary-color, #03a9f4);
  padding: 4px 12px;
  transition: background 0.2s;
}
.date-field:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); }
.date-field label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 2px; }
.date-field input {
  background: transparent; border: none; outline: none;
  color: var(--primary-text-color); font-size: 14px; font-family: inherit;
  padding: 0; cursor: pointer;
}
@media (prefers-color-scheme: dark) {
  .date-field input::-webkit-calendar-picker-indicator { filter: invert(0.8); }
}
.picker-sep { color: var(--secondary-text-color); font-weight: bold; }

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr 0.5fr;
    align-items: start;
  }
}

.left-column, .right-column { display: flex; flex-direction: column; gap: 16px; }

.chart-wrapper .card-header {
  display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 0;
}
.chart-wrapper .card-header .name {
  color: var(--ha-card-header-color, var(--primary-text-color));
  font-size: var(--ha-card-header-font-size, 18px); font-weight: 500;
}
.chart-slot > * {
  --ha-card-border-width: 0 !important; --ha-card-box-shadow: none !important;
  --ha-card-background: transparent !important; --ha-card-border-radius: 0 !important;
}

.chip {
  align-items: center; border-radius: 16px; display: inline-flex;
  font-size: 13px; font-weight: 600; padding: 4px 12px;
}
.solar-chip {
  background: color-mix(in srgb, var(--energy-solar-color, #ff9800) 18%, transparent);
  color: var(--energy-solar-color, #ff9800);
}
.battery-chip {
  background: color-mix(in srgb, var(--energy-battery-out-color, #4db0a2) 18%, transparent);
  color: var(--energy-battery-out-color, #4db0a2);
}

.ha-tile-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.ha-tile {
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  background: var(--ha-card-background, var(--card-background-color, #fff));
  padding: 12px; display: flex; align-items: center; min-height: 100%; box-sizing: border-box;
}
.tile-content { display: flex; align-items: center; gap: 12px; width: 100%; }
.tile-icon-container {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--icon-bg); color: var(--icon-color);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.tile-icon-container ha-icon { display: flex; align-items: center; justify-content: center; }
.tile-info { display: flex; flex-direction: column; justify-content: center; flex: 1; overflow: hidden; }
.tile-title { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.tile-value { font-size: 16px; font-weight: 600; color: var(--primary-text-color); margin-top: 1px; }
.tile-subtitle { font-size: 11px; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; }
.sub-item { display: flex; align-items: center; gap: 2px; }
.discharge-text { color: var(--energy-battery-out-color, #4db0a2); }
.charge-text { color: var(--energy-battery-in-color, #f6c34c); }
.import-text { color: var(--energy-grid-consumption-color, #488fc2); }
.export-text { color: var(--energy-grid-return-color, #8353d1); }

.missing {
  padding: 16px;
  & h3 { margin: 0 0 8px; }
  & p { color: var(--secondary-text-color); line-height: 1.5; margin: 0 0 12px; }
  & a { color: var(--primary-color); }
  & .links { display: flex; flex-wrap: wrap; gap: 12px; }
}
.state { color: var(--secondary-text-color); padding: 24px 0; text-align: center; }
`;

class WueflEnergyHistoryCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #period = 'day';
  #range = { start: new Date(), end: new Date() };
  #els = {};
  #mainChartCard = null;
  #batteryChartCard = null;
  #solarChartCard = null;
  #stats = {};
  #pickerAbort = null;

  static getConfigElement() { return document.createElement('wuefl-energy-history-card-editor'); }
  static getStubConfig() { return { title: 'Energie' }; }

  constructor() {
    super();
    this.#range = this.#getDefaultRange('day', new Date());
  }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Energie', ...this.#central, ...this.#own };
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (this.#mainChartCard) this.#mainChartCard.hass = hass;
    if (this.#batteryChartCard) this.#batteryChartCard.hass = hass;
    if (this.#solarChartCard) this.#solarChartCard.hass = hass;

    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
    }
    if (!this.#built) this.#build();
  }

  getCardSize() { return 12; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Energie', ...this.#central, ...this.#own };
    this.#refresh();
  }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }

    const container = document.createElement('div');
    container.className = 'root-container';
    container.innerHTML = `
      <div class="main-header-title">${esc(this.#config.title || 'Energie')}</div>

      <div class="energy-toolbar-container">
        <div class="toolbar-top">
          <div class="time-buttons period-selector"></div>
          
          <div class="range-picker-container">
            <div class="date-picker-wrapper">
              <div class="time-buttons">
                <button class="time-btn icon-btn custom-picker-btn" title="Eigenen Zeitraum wählen">
                  <ha-icon icon="mdi:calendar-range"></ha-icon>
                </button>
              </div>
              <div class="date-popup hidden">
                <div class="date-field">
                  <label>Von</label>
                  <input type="date" class="date-inp start">
                </div>
                <span class="picker-sep">-</span>
                <div class="date-field">
                  <label>Bis</label>
                  <input type="date" class="date-inp end">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="toolbar-bottom">
          <div class="date-nav">
            <button class="nav-btn prev"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <span class="nav-label">--</span>
            <button class="nav-btn next"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
          </div>
        </div>
      </div>
      
      <div class="dashboard-grid">
        <div class="left-column">
          <ha-card class="chart-wrapper">
            <div class="chart-slot main-chart"></div>
          </ha-card>

          <ha-card class="chart-wrapper battery-section" hidden>
            <div class="card-header">
              <div class="name">Speicher</div>
              <div class="chip battery-chip">-- %</div>
            </div>
            <div class="chart-slot battery-chart"></div>
          </ha-card>
        </div>
        <div class="right-column">
          <div class="ha-tile-grid tiles"></div>
        </div>
      </div>

      <ha-card class="chart-wrapper solar-section">
        <div class="card-header">
          <div class="name">Solarproduktion</div>
          <div class="chip solar-chip">0 kWh</div>
        </div>
        <div class="chart-slot solar-chart"></div>
      </ha-card>
    `;
    root.replaceChildren(container);

    this.#els = {
      container,
      periodSelector: container.querySelector('.period-selector'),
      navPrev: container.querySelector('.nav-btn.prev'),
      navNext: container.querySelector('.nav-btn.next'),
      navLabel: container.querySelector('.nav-label'),
      pickerBtn: container.querySelector('.custom-picker-btn'),
      pickerPopup: container.querySelector('.date-popup'),
      startInp: container.querySelector('.date-inp.start'),
      endInp: container.querySelector('.date-inp.end'),
      mainChartSlot: container.querySelector('.main-chart'),
      batterySection: container.querySelector('.battery-section'),
      batteryChartSlot: container.querySelector('.battery-chart'),
      batteryChip: container.querySelector('.battery-chip'),
      tiles: container.querySelector('.tiles'),
      solarChip: container.querySelector('.solar-chip'),
      solarChartSlot: container.querySelector('.solar-chart'),
    };

    this.#setupEvents();
    this.#built = true;
    this.#updateUI();
    this.#refresh();
  }

  #setupEvents() {
    this.#els.periodSelector.replaceChildren();
    for (const p of PERIODS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `time-btn`;
      btn.dataset.id = p.id;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        this.#period = p.id;
        this.#range = this.#getDefaultRange(p.id, new Date());
        this.#updateUI();
        this.#refresh();
      });
      this.#els.periodSelector.appendChild(btn);
    }

    this.#els.navPrev.addEventListener('click', () => this.#shiftRange(-1));
    this.#els.navNext.addEventListener('click', () => this.#shiftRange(1));

    this.#els.pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#els.pickerPopup.classList.toggle('hidden');
    });

    if (this.#pickerAbort) this.#pickerAbort.abort();
    this.#pickerAbort = new AbortController();
    window.addEventListener('click', (e) => {
      const wrap = this.#els.container.querySelector('.date-picker-wrapper');
      if (wrap && !e.composedPath().includes(wrap)) {
        this.#els.pickerPopup.classList.add('hidden');
      }
    }, { signal: this.#pickerAbort.signal });

    const onCustomDateChange = () => {
      if (this.#els.startInp.value && this.#els.endInp.value) {
        const s = new Date(this.#els.startInp.value);
        s.setHours(0, 0, 0, 0);
        const e = new Date(this.#els.endInp.value);
        e.setHours(23, 59, 59, 999);
        this.#range = { start: s, end: e };
        this.#period = 'custom';
        this.#updateUI();
        this.#refresh();
      }
    };
    this.#els.startInp.addEventListener('change', onCustomDateChange);
    this.#els.endInp.addEventListener('change', onCustomDateChange);
  }

  #getDefaultRange(period, baseDate) {
    const start = new Date(baseDate);
    const end = new Date(baseDate);

    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  }

  #shiftRange(dir) {
    const s = new Date(this.#range.start);
    const e = new Date(this.#range.end);

    if (this.#period === 'day') {
      s.setDate(s.getDate() + dir);
      e.setDate(e.getDate() + dir);
    } else if (this.#period === 'week') {
      s.setDate(s.getDate() + (dir * 7));
      e.setDate(e.getDate() + (dir * 7));
    } else if (this.#period === 'month') {
      s.setMonth(s.getMonth() + dir);
      e.setTime(s.getTime());
      e.setMonth(e.getMonth() + 1, 0);
      e.setHours(23, 59, 59, 999);
    } else if (this.#period === 'year') {
      s.setFullYear(s.getFullYear() + dir);
      e.setFullYear(e.getFullYear() + dir);
    } else {
      const diffMs = e.getTime() - s.getTime() + 1;
      s.setTime(s.getTime() + (dir * diffMs));
      e.setTime(e.getTime() + (dir * diffMs));
    }
    
    this.#range = { start: s, end: e };
    this.#updateUI();
    this.#refresh();
  }

  #toIsoDateString(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
  }

  #updateUI() {
    this.#els.periodSelector.querySelectorAll('.time-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === this.#period);
    });
    this.#els.pickerBtn.classList.toggle('active', this.#period === 'custom');

    const s = this.#range.start;
    const e = this.#range.end;
    let label = '';
    
    if (this.#period === 'day') {
      label = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'short' }).format(s);
    } else if (this.#period === 'month') {
      label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(s);
    } else if (this.#period === 'year') {
      label = new Intl.DateTimeFormat('de-DE', { year: 'numeric' }).format(s);
    } else {
      const fmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });
      label = `${fmt.format(s)} - ${fmt.format(e)}`;
    }
    this.#els.navLabel.textContent = label;

    this.#els.startInp.value = this.#toIsoDateString(s);
    this.#els.endInp.value = this.#toIsoDateString(e);
  }

  #isLineChart() {
    if (this.#period === 'day' || this.#period === 'week') return true;
    if (this.#period === 'month' || this.#period === 'year') return false;
    const diffDays = (this.#range.end - this.#range.start) / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }

  #mainChartConfig() {
    const isLine = this.#isLineChart();
    const isOneDay = (this.#range.end - this.#range.start) <= 86400000; // max 24h
    const chartType = isLine ? 'line' : 'bar';
    const series = [];
    const seenLegends = new Set(); 

    for (const s of this.#used()) {
      for (const id of asList(this.#config[s.key])) {
        const legendName = s.legendName || s.label;
        const isDuplicate = seenLegends.has(legendName);
        seenLegends.add(legendName);

        series.push({
          statistic_id: id,
          name: legendName,
          stat_type: 'change',
          chart_type: chartType,
          fill: isLine,
          gradient_fill: isLine,
          color: resolveColor(this, s.color, s.fallbackColor),
          unit: 'kWh',
          stack: 'total',
          show_legend: !isDuplicate, 
          hide_legend: isDuplicate, 
          ...(s.sign < 0 ? { multiply: -1 } : {}),
        });
      }
    }
    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '350px',
      y_axes: [{ id: 'left', fit_y_data: true, unit: 'kWh', center_zero: false }],
      period: isOneDay ? '5minute' : undefined,
      timespan: { mode: 'fixed', start: this.#range.start.toISOString(), end: this.#range.end.toISOString() },
      series,
    };
  }

  #batteryChartConfig() {
    // Neu: Prüfe, ob die ausgewählte Zeitspanne maximal 24h (86.400.000 ms) beträgt
    const isOneDay = (this.#range.end - this.#range.start) <= 86400000;
    if (!isOneDay) return null;

    const socIds = asList(this.#config.battery_soc);
    if (!socIds.length) return null;

    const isLine = this.#isLineChart();
    const chartType = isLine ? 'line' : 'bar';
    
    const series = socIds.map((id, i) => ({
      statistic_id: id,
      name: socIds.length > 1 ? `Speicher ${i + 1} SOC` : 'Ladestand',
      stat_type: 'mean',
      chart_type: chartType,
      fill: isLine,
      gradient_fill: isLine,
      color: resolveColor(this, '--energy-battery-out-color', '#4db0a2'),
      unit: '%',
    }));

    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '180px',
      show_legend: false,
      legend: { show: false },
      y_axes: [{ id: 'left', fit_y_data: true, unit: '%', center_zero: false }],
      period: '5minute',
      timespan: { mode: 'fixed', start: this.#range.start.toISOString(), end: this.#range.end.toISOString() },
      series,
    };
  }

  #solarChartConfig() {
    const isLine = this.#isLineChart();
    const isOneDay = (this.#range.end - this.#range.start) <= 86400000; // max 24h
    const chartType = isLine ? 'line' : 'bar';
    const series = [];

    for (const id of asList(this.#config.pv_energy)) {
      series.push({
        statistic_id: id,
        name: 'Gesamtproduktion',
        stat_type: 'change',
        chart_type: chartType,
        fill: isLine,
        gradient_fill: isLine,
        color: resolveColor(this, '--energy-solar-color', '#ff9800'),
        unit: 'kWh',
        stack: 'total',
      });
    }

    const strings = this.#central?.raw?.strings ?? [];
    for (const str of strings) {
      const entity = str.power || str.energy_total;
      if (entity && !series.some((s) => s.statistic_id === entity)) {
        series.push({
          statistic_id: entity, name: str.name || 'Dachfläche', stat_type: 'change',
          chart_type: chartType, fill: isLine, gradient_fill: isLine, unit: 'kWh', stack: 'total',
        });
      }
    }

    return {
      type: 'custom:energy-custom-graph-card',
      chart_height: '180px', show_legend: false, legend: { show: false },
      y_axes: [{ id: 'left', fit_y_data: true, unit: 'kWh', center_zero: false }],
      period: isOneDay ? '5minute' : undefined,
      timespan: { mode: 'fixed', start: this.#range.start.toISOString(), end: this.#range.end.toISOString() },
      series,
    };
  }

  async #createOrUpdateCard(existingCard, slotEl, config) {
    if (!customElements.get('energy-custom-graph-card')) {
      slotEl.innerHTML = `<ha-card><div class="missing"><h3>Diagramm-Karte fehlt</h3><div class="links"><a href="${HACS_URL}" target="_blank">In HACS öffnen</a></div></div></ha-card>`;
      return null;
    }
    if (!config || !config.series.length) {
      slotEl.innerHTML = '<div class="state">Keine Daten vorhanden.</div>';
      return null;
    }

    let card = existingCard;
    if (!card) {
      const helpers = await window.loadCardHelpers?.();
      card = helpers ? helpers.createCardElement(config) : document.createElement('energy-custom-graph-card');
      if (!helpers) card.setConfig?.(config);
      card.hass = this.#hass;
      slotEl.replaceChildren(card);
    } else {
      card.setConfig?.(config);
      card.hass = this.#hass;
    }
    return card;
  }

  #used() { return SERIES.filter((s) => asList(this.#config[s.key]).length); }

  async #refresh() {
    if (!this.#built || !this.#hass) return;

    const used = this.#used();
    this.#mainChartCard = await this.#createOrUpdateCard(this.#mainChartCard, this.#els.mainChartSlot, this.#mainChartConfig());

    const batCfg = this.#batteryChartConfig();
    if (batCfg) {
      this.#els.batterySection.hidden = false;
      this.#batteryChartCard = await this.#createOrUpdateCard(this.#batteryChartCard, this.#els.batteryChartSlot, batCfg);
      const socIds = asList(this.#config.battery_soc);
      if (this.#els.batteryChip && socIds.length > 0) {
        const socState = this.#hass.states[socIds[0]];
        this.#els.batteryChip.textContent = socState ? `${Number(socState.state).toFixed(0)} %` : '-- %';
      }
    } else {
      this.#els.batterySection.hidden = true;
    }

    this.#solarChartCard = await this.#createOrUpdateCard(this.#solarChartCard, this.#els.solarChartSlot, this.#solarChartConfig());

    const idsToFetch = [...used.flatMap((s) => asList(this.#config[s.key])), ...asList(this.#config.pv_energy)];
    
    const diffDays = (this.#range.end - this.#range.start) / (1000 * 60 * 60 * 24);
    const statPeriod = diffDays <= 1 ? '5minute' : (diffDays <= 31 ? 'hour' : 'day');

    try {
      this.#stats = await this.#hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: this.#range.start.toISOString(),
        end_time: this.#range.end.toISOString(),
        statistic_ids: [...new Set(idsToFetch)],
        period: statPeriod,
        types: ['change'],
      });
    } catch {
      this.#stats = {};
    }

    this.#renderTiles(used);

    const totalSolar = asList(this.#config.pv_energy).reduce((a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0);
    if (this.#els.solarChip) this.#els.solarChip.textContent = fmtEnergy(totalSolar);
  }

  #total(series) {
    return asList(this.#config[series.key]).reduce((a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0);
  }

  #renderTiles(used) {
    const html = [];
    const seen = new Set();

    for (const s of used) {
      const tileIcon = ICONS[s.pair || s.key] || 'mdi:flash';
      const resolvedCssColor = resolveColor(this, s.color, s.fallbackColor);

      if (s.pair) {
        if (seen.has(s.pair)) continue;
        seen.add(s.pair);
        const both = used.filter((x) => x.pair === s.pair);
        const total = both.reduce((a, x) => a + this.#total(x), 0);
        
        const subs = both.map((x) => {
          const cls = x.short === 'entladen' ? 'discharge-text' : x.short === 'geladen' ? 'charge-text' : x.short === 'Bezug' ? 'import-text' : 'export-text';
          return `<span class="sub-item ${cls}">${fmtEnergy(this.#total(x))} ${esc(x.short)}</span>`;
        }).join('');

        html.push(`
        <ha-card class="ha-tile">
          <div class="tile-content">
            <div class="tile-icon-container" style="--icon-color: ${resolvedCssColor}; --icon-bg: color-mix(in srgb, ${resolvedCssColor} 18%, transparent);">
              <ha-icon icon="${tileIcon}"></ha-icon>
            </div>
            <div class="tile-info">
              <div class="tile-title">${esc(PAIR_NAMES[s.pair])}</div>
              <div class="tile-value">${fmtEnergy(total)}</div>
              <div class="tile-subtitle">${subs}</div>
            </div>
          </div>
        </ha-card>`);
        continue;
      }

      html.push(`
      <ha-card class="ha-tile">
        <div class="tile-content">
          <div class="tile-icon-container" style="--icon-color: ${resolvedCssColor}; --icon-bg: color-mix(in srgb, ${resolvedCssColor} 18%, transparent);">
            <ha-icon icon="${tileIcon}"></ha-icon>
          </div>
          <div class="tile-info">
            <div class="tile-title">${esc(s.label)}</div>
            <div class="tile-value">${fmtEnergy(this.#total(s))}</div>
          </div>
        </div>
      </ha-card>`);
    }
    this.#els.tiles.innerHTML = html.join('');
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };

class WueflEnergyHistoryCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('wuefl-energy-history-card', WueflEnergyHistoryCard);
customElements.define('wuefl-energy-history-card-editor', WueflEnergyHistoryCardEditor);

registerCard({
  type: 'wuefl-energy-history-card', name: 'wuefl Energie', description: 'Zeitraum-Auswahl, Diagramme und Kennzahlen im Tile-Design.',
});