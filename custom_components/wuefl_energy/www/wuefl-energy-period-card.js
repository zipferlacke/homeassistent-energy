/**
 * wuefl-energy-period-card.js
 * Zeitraumauswahl (Tag, Woche, Monat, Jahr) mit vollständigen Zeitspannen,
 * Vor/Zurück-Navigation ohne Zukunfts-Navigation und integriertem Kalender-Button.
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
  align-items: center; display: flex; flex-direction: column; gap: 10px; position: relative;
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
.row { align-items: center; display: flex; gap: 16px; }
.nav {
  align-items: center; display: flex; gap: 6px; justify-content: center;
}
.nav button.arrow-btn {
  align-items: center; background: none; border: 0; border-radius: 50%;
  color: var(--primary-text-color); cursor: pointer; display: flex;
  height: 32px; justify-content: center; width: 32px;
}
.nav button.arrow-btn:hover:not(:disabled) { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
.nav button.arrow-btn:disabled { color: var(--disabled-text-color, #bdbdbd); cursor: default; }
.nav button.arrow-btn ha-icon { --mdc-icon-size: 22px; }

.date-trigger-btn {
  align-items: center;
  background: var(--secondary-background-color, rgba(127, 127, 127, .12));
  border: none;
  border-radius: 10px;
  color: var(--primary-text-color);
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.date-trigger-btn:hover {
  background: var(--divider-color, rgba(127, 127, 127, .25));
}
.date-trigger-btn.active {
  background: var(--card-background-color, #fff);
  box-shadow: 0 1px 3px rgba(0,0,0,.12);
}
.date-trigger-btn ha-icon {
  --mdc-icon-size: 18px;
  color: var(--secondary-text-color, #727272);
}

.date-popup {
  background: var(--card-background-color, #fff); border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,.15); display: flex; gap: 8px; padding: 10px;
  position: absolute; top: 100%; z-index: 10; margin-top: 6px;
  border: 1px solid var(--divider-color, #e0e0e0);
}
.date-popup.hidden { display: none; }
.date-popup input {
  background: var(--secondary-background-color, rgba(127, 127, 127, .12)); border: 0; border-radius: 8px;
  color: inherit; font: inherit; height: 34px; padding: 0 8px;
}
`;

const WEEKDAY_MONTH = { weekday: 'long', day: 'numeric', month: 'long' };
const MONTH_YEAR = { month: 'long', year: 'numeric' };

class WueflEnergyPeriodCard extends HTMLElement {
  #built = false;
  #els = {};
  #hass = null;
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
        </div>
        <div class="nav">
          <button type="button" class="arrow-btn prev" title="Zurück"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <button type="button" class="date-trigger-btn" title="Datum wählen">
            <ha-icon icon="mdi:calendar"></ha-icon>
            <span class="label"></span>
          </button>
          <button type="button" class="arrow-btn next" title="Vor"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
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
      dateBtn: card.querySelector('.date-trigger-btn'),
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
        this.#offset = 0; // Immer auf die aktuelle Periode zurücksetzen
        this.#els.popup.classList.add('hidden');
        this.#apply();
      });
    }

    this.#els.prev.addEventListener('click', () => { 
      this.#offset += 1; 
      this.#apply(); 
    });
    
    this.#els.next.addEventListener('click', () => { 
      // Nie in die Zukunft (offset darf nicht kleiner als 0 werden)
      this.#offset = Math.max(0, this.#offset - 1); 
      this.#apply(); 
    });

    this.#els.dateBtn.addEventListener('click', () => {
      this.#els.popup.classList.toggle('hidden');
    });

    const applyCustom = () => {
      const from = this.#els.from.value;
      const to = this.#els.to.value;
      if (!from || !to) return;
      setPeriod({ period: 'custom', start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59.999`) });
      this.#syncButtons();
    };

    this.#els.from.addEventListener('change', applyCustom);
    this.#els.to.addEventListener('change', applyCustom);

    this.#apply();
    this.#built = true;
  }

  /**
   * Berechnet Start & Ende kalendergenau für volle 24h/Woche/Monat/Jahr.
   */
  #apply() {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (this.#granularity === 'day') {
      start.setDate(now.getDate() - this.#offset);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    } else if (this.#granularity === 'week') {
      const currentDayOfWeek = now.getDay() || 7; // Montag = 1, Sonntag = 7
      start.setDate(now.getDate() - (currentDayOfWeek - 1) - (this.#offset * 7));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (this.#granularity === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() - this.#offset, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() - this.#offset + 1, 0, 23, 59, 59, 999);
    } else if (this.#granularity === 'year') {
      start = new Date(now.getFullYear() - this.#offset, 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear() - this.#offset, 11, 31, 23, 59, 59, 999);
    }

    setPeriod({ period: this.#granularity, start, end });
    this.#syncButtons();
  }

  #formatLabel(range) {
    const { start, end } = range;
    if (range.period === 'custom') {
      return `${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
    }
    if (this.#granularity === 'day') return start.toLocaleDateString('de-DE', WEEKDAY_MONTH);
    if (this.#granularity === 'week') {
      return `${start.getDate()}.–${end.getDate()}. ${end.toLocaleDateString('de-DE', { month: 'long' })}`;
    }
    if (this.#granularity === 'month') return start.toLocaleDateString('de-DE', MONTH_YEAR);
    return String(start.getFullYear());
  }

  #syncButtons() {
    const range = getPeriod();
    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.classList.toggle('active', btn.dataset.id === this.#granularity && range.period !== 'custom');
    }

    this.#els.dateBtn.classList.toggle('active', range.period === 'custom');
    this.#els.label.textContent = this.#formatLabel(range);

    // Vor-Button deaktivieren, wenn wir im aktuellen Zeitraum (#offset === 0) sind
    this.#els.next.disabled = this.#offset === 0 || range.period === 'custom';
    this.#els.prev.disabled = range.period === 'custom';
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
  description: 'Tag/Woche/Monat/Jahr, Vor/Zurück-Navigation, kalendergenaue Zeitspannen.',
});