/**
 * wuefl-energy-period-card
 * Eigener, kleiner Abschnitt: Tag/Woche/Monat/Jahr, Vor/Zurück-Navigation
 * innerhalb der gewählten Granularität, plus freier Zeitraum. Ändert
 * nichts selbst an Diagrammen — meldet den neuen Zeitraum nur über
 * wuefl-energy-shared.js::setPeriod() an alle anderen Energie-Karten, die
 * in eigenen Abschnitten daneben oder darunter stehen.
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
  align-items: center; display: flex; flex-direction: column; gap: 10px;
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
.row { align-items: center; display: flex; gap: 16px; }
.nav {
  align-items: center; display: flex; gap: 4px; justify-content: center;
}
.nav button {
  align-items: center; background: none; border: 0; border-radius: 50%;
  color: var(--primary-text-color); cursor: pointer; display: flex;
  height: 32px; justify-content: center; width: 32px;
}
.nav button:hover:not(:disabled) { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
.nav button:disabled { color: var(--disabled-text-color, #bdbdbd); cursor: default; }
.nav button ha-icon { --mdc-icon-size: 22px; }
.nav .label { font-size: 15px; font-weight: 600; min-width: 9rem; text-align: center; }
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

const WEEKDAY_MONTH = { weekday: 'long', day: 'numeric', month: 'long' };
const MONTH_YEAR = { month: 'long', year: 'numeric' };

class WueflEnergyPeriodCard extends HTMLElement {
  #built = false;
  #els = {};
  #hass = null;
  // Wie viele Perioden von "jetzt" zurück: 0 = aktueller Tag/Woche/Monat/
  // Jahr, 1 = einer davor, usw. — nie in die Zukunft, daher nie negativ.
  #offset = 0;
  #granularity = 'day';

  static getConfigElement() { return document.createElement('wuefl-energy-period-card-editor'); }
  static getStubConfig() { return {}; }

  setConfig() {}
  set hass(hass) { this.#hass = hass; if (!this.#built) this.#build(); }
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
        <div class="row">
          <div class="time-buttons period-selector"></div>
          <div class="time-buttons">
            <button type="button" class="time-btn icon-btn custom-picker-btn" title="Eigener Zeitraum">
              <ha-icon icon="mdi:calendar-range"></ha-icon>
            </button>
          </div>
        </div>
        <div class="nav">
          <button type="button" class="prev" title="Zurück"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <span class="label"></span>
          <button type="button" class="next" title="Vor"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
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
      nav: card.querySelector('.nav'),
      label: card.querySelector('.label'),
      prev: card.querySelector('.prev'),
      next: card.querySelector('.next'),
    };

    this.#granularity = getPeriod().period === 'custom' ? 'day' : getPeriod().period;
    this.#els.selector.innerHTML = PERIODS.map((p) => `<button type="button" class="time-btn"
      data-id="${p.id}">${p.label}</button>`).join('');

    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.addEventListener('click', () => {
        this.#granularity = btn.dataset.id;
        this.#offset = 0;
        this.#els.popup.classList.add('hidden');
        this.#apply();
      });
    }

    this.#els.prev.addEventListener('click', () => { this.#offset += 1; this.#apply(); });
    this.#els.next.addEventListener('click', () => { this.#offset = Math.max(0, this.#offset - 1); this.#apply(); });

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

    this.#apply();
    this.#built = true;
  }

  /** Start/Ende aus Granularität + Offset berechnen und Zeitraum melden. */
  #apply() {
    const now = new Date();
    const start = new Date(now);
    let end = now;

    if (this.#granularity === 'day') {
      start.setDate(now.getDate() - this.#offset);
      start.setHours(0, 0, 0, 0);
      end = this.#offset === 0 ? now : new Date(start.getTime() + 86_400_000);
    } else if (this.#granularity === 'week') {
      start.setDate(now.getDate() - now.getDay() + 1 - this.#offset * 7);
      start.setHours(0, 0, 0, 0);
      end = this.#offset === 0 ? now : new Date(start.getTime() + 7 * 86_400_000);
    } else if (this.#granularity === 'month') {
      start.setMonth(now.getMonth() - this.#offset, 1);
      start.setHours(0, 0, 0, 0);
      end = this.#offset === 0 ? now : new Date(start.getFullYear(), start.getMonth() + 1, 1);
    } else {
      start.setFullYear(now.getFullYear() - this.#offset, 0, 1);
      start.setHours(0, 0, 0, 0);
      end = this.#offset === 0 ? now : new Date(start.getFullYear() + 1, 0, 1);
    }

    setPeriod({ period: this.#granularity, start, end });
    this.#syncButtons();
  }

  #formatLabel(range) {
    const { start } = range;
    if (this.#granularity === 'day') return start.toLocaleDateString('de-DE', WEEKDAY_MONTH);
    if (this.#granularity === 'week') {
      const end = new Date(start.getTime() + 6 * 86_400_000);
      return `${start.getDate()}.–${end.getDate()}. ${end.toLocaleDateString('de-DE', { month: 'long' })}`;
    }
    if (this.#granularity === 'month') return start.toLocaleDateString('de-DE', MONTH_YEAR);
    return String(start.getFullYear());
  }

  #syncButtons() {
    const range = getPeriod();
    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.classList.toggle('active', btn.dataset.id === this.#granularity);
    }
    const pickBtn = this.shadowRoot.querySelector('.custom-picker-btn');
    if (pickBtn) pickBtn.classList.toggle('active', range.period === 'custom');

    // Bei freiem Zeitraum ergibt Vor/Zurück nichts Sinnvolles — ausblenden.
    this.#els.nav.hidden = range.period === 'custom';
    if (range.period !== 'custom') {
      this.#els.label.textContent = this.#formatLabel(range);
      this.#els.next.disabled = this.#offset === 0;
    }
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
  description: 'Tag/Woche/Monat/Jahr, Vor/Zurück-Navigation, plus freier Zeitraum.',
});
