/**
 * wuefl-energy-period-card
 * Eigener, kleiner Abschnitt: nur Tag/Woche/Monat/Jahr plus freier
 * Zeitraum. Ändert nichts selbst an Diagrammen — meldet den neuen
 * Zeitraum nur über wuefl-energy-shared.js::setPeriod() an alle anderen
 * Energie-Karten, die in eigenen Abschnitten daneben oder darunter stehen.
 */
import { registerCard, getPeriod, setPeriod, WueflFormEditor, sel, GRID_CSS } from './wuefl-energy-shared.js';

const PERIODS = [
  { id: 'day', label: 'Tag' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
  { id: 'year', label: 'Jahr' },
];

const CSS = `
:host { display: block; }
.card {
  ${GRID_CSS}
  align-items: center;
  justify-content: center;
}
.energy-toolbar {
  align-items: center; display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;
}
.time-buttons {
  background: var(--secondary-background-color, rgba(127, 127, 127, .12));
  border-radius: 12px; display: inline-flex; gap: 2px; padding: 3px;
}
.time-btn {
  background: transparent; border: none; border-radius: 9px;
  color: var(--secondary-text-color, #727272); cursor: pointer; font-family: inherit;
  font-size: 13px; font-weight: 500; padding: 6px 14px; transition: all .2s ease;
}
.time-btn:hover { color: var(--primary-text-color, #212121); }
.time-btn.active {
  background: var(--card-background-color, #fff); box-shadow: 0 1px 3px rgba(0,0,0,.12);
  color: var(--primary-text-color, #212121); font-weight: 600;
}
.icon-btn ha-icon { --mdc-icon-size: 20px; display: flex; }
.date-popup {
  background: var(--card-background-color, #fff); border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,.2); display: flex; gap: 8px; padding: 10px;
  position: absolute; z-index: 5;
}
.date-popup.hidden { display: none; }
.date-popup input {
  background: var(--secondary-background-color); border: 0; border-radius: 8px;
  color: inherit; font: inherit; height: 34px; padding: 0 8px;
}
`;

class WueflEnergyPeriodCard extends HTMLElement {
  #built = false;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-period-card-editor'); }
  static getStubConfig() { return {}; }

  setConfig() {}
  set hass(hass) { this.#hass = hass; if (!this.#built) this.#build(); }
  #hass = null;
  getCardSize() { return 1; }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="energy-toolbar">
        <div class="time-buttons period-selector"></div>
        <div class="time-buttons">
          <button type="button" class="time-btn icon-btn custom-picker-btn" title="Eigener Zeitraum">
            <ha-icon icon="mdi:calendar-range"></ha-icon>
          </button>
        </div>
        <div class="date-popup hidden">
          <input type="date" class="from">
          <span>–</span>
          <input type="date" class="to">
        </div>
      </div>
    `;
    root.replaceChildren(card);

    this.#els = {
      selector: card.querySelector('.period-selector'),
      popup: card.querySelector('.date-popup'),
      from: card.querySelector('.from'),
      to: card.querySelector('.to'),
    };

    const current = getPeriod();
    this.#els.selector.innerHTML = PERIODS.map((p) => `<button type="button" class="time-btn"
      data-id="${p.id}">${p.label}</button>`).join('');

    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.addEventListener('click', () => {
        const now = new Date();
        const start = new Date(now);
        if (btn.dataset.id === 'day') start.setHours(0, 0, 0, 0);
        else if (btn.dataset.id === 'week') { start.setDate(now.getDate() - now.getDay() + 1); start.setHours(0, 0, 0, 0); }
        else if (btn.dataset.id === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
        else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
        this.#els.popup.classList.add('hidden');
        setPeriod({ period: btn.dataset.id, start, end: now });
        this.#syncButtons();
      });
    }

    card.querySelector('.custom-picker-btn').addEventListener('click', () => {
      this.#els.popup.classList.toggle('hidden');
    });
    const applyCustom = () => {
      const from = this.#els.from.value;
      const to = this.#els.to.value;
      if (!from || !to) return;
      setPeriod({ period: 'custom', start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`) });
      this.#syncButtons();
    };
    this.#els.from.addEventListener('change', applyCustom);
    this.#els.to.addEventListener('change', applyCustom);

    this.#syncButtons();
    this.#built = true;
  }

  #syncButtons() {
    const p = getPeriod().period;
    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.classList.toggle('active', btn.dataset.id === p);
    }
    const pickBtn = this.shadowRoot.querySelector('.custom-picker-btn');
    if (pickBtn) pickBtn.classList.toggle('active', p === 'custom');
  }
}

const SCHEMA = [];
const LABELS = {};
class WueflEnergyPeriodCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-energy-period-card', WueflEnergyPeriodCard);
customElements.define('wuefl-energy-period-card-editor', WueflEnergyPeriodCardEditor);

registerCard({
  type: 'wuefl-energy-period-card',
  name: 'wuefl Zeitraum',
  description: 'Tag/Woche/Monat/Jahr plus freier Zeitraum für die Energie-Ansicht.',
});
