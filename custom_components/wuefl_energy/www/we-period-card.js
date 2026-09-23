/**
 * we-period-card.js
 * Zeitraumauswahl (Tag, Woche, Monat, Jahr) mit vollständigen Zeitspannen,
 * Vor/Zurück-Navigation ohne Zukunfts-Navigation und integriertem Kalender-Button.
 * 
 * NEU: Beim Wechsel der Granularität wird der letzte Zeitraum im zuvor 
 * gewählten Zeitraum beibehalten (z.B. Wechsel von Jahr 2025 auf Monat -> Dezember 2025).
 */
import { registerCard, getPeriod, setPeriod, WueflFormEditor, sel, GRID_CSS } from './we-shared.js';

/**
 * Home Assistant bringt einen eigenen Zeitraum-Wähler mit (derselbe wie im
 * Verlauf: Kalender plus Schnellauswahl). Er ist kein offizieller Baustein
 * für eigene Karten, deshalb wird er nur benutzt, wenn er sich laden lässt –
 * sonst bleibt es bei den beiden Datumsfeldern.
 *
 * Angemeldet wird er beim Laden der Energie-Karte von HA; das stoßen wir
 * über die Karten-Helfer an.
 */
let haPickerReady = null;
function ensureHaPicker() {
  if (haPickerReady) return haPickerReady;
  haPickerReady = (async () => {
    if (customElements.get('ha-date-range-picker')) return true;
    try {
      const helpers = await window.loadCardHelpers?.();
      helpers?.createCardElement?.({ type: 'energy-date-selection' });
    } catch (err) {
      // Energie-Dashboard nicht eingerichtet o. ä. – dann eben ohne
    }
    await Promise.race([
      customElements.whenDefined('ha-date-range-picker'),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
    return !!customElements.get('ha-date-range-picker');
  })();
  return haPickerReady;
}

/** Schnellauswahl des HA-Wählers, in unseren Zeitraum-Begriffen. */
function quickRanges() {
  const day = (d) => [new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)];
  const now = new Date();
  const gestern = new Date(now); gestern.setDate(now.getDate() - 1);
  const wochenStart = new Date(now); wochenStart.setDate(now.getDate() - ((now.getDay() || 7) - 1));
  const vorTagen = (n) => { const d = new Date(now); d.setDate(now.getDate() - n + 1); return d; };
  const von = (d) => day(d)[0];
  const bis = (d) => day(d)[1];
  return {
    Heute: day(now),
    Gestern: day(gestern),
    'Diese Woche': [von(wochenStart), bis(now)],
    'Letzte 7 Tage': [von(vorTagen(7)), bis(now)],
    'Letzte 30 Tage': [von(vorTagen(30)), bis(now)],
    'Dieser Monat': [new Date(now.getFullYear(), now.getMonth(), 1), bis(now)],
    'Dieses Jahr': [new Date(now.getFullYear(), 0, 1), bis(now)],
  };
}

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

.date-trigger-btn { position: relative; }
/* Der HA-Kalender liegt deckungsgleich über dem Knopf: sein Bedienfeld ist
   durchsichtig, behält aber die Größe des Knopfs. Nur so weiß sein
   Aufklapp-Fenster, wie breit und wie hoch es werden darf. */
.ha-picker {
  inset: 0; pointer-events: none; position: absolute;
}
.ha-picker ha-date-range-picker { display: block; height: 100%; width: 100%; }
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

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const WEEKDAY_MONTH = { weekday: 'long', day: 'numeric', month: 'long' };
const MONTH_YEAR = { month: 'long', year: 'numeric' };

class WueflEnergyPeriodCard extends HTMLElement {
  #built = false;
  #els = {};
  #hass = null;
  #offset = 0;
  #granularity = 'day';

  static getConfigElement() { return document.createElement('we-period-card-editor'); }
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
            <span class="ha-picker"></span>
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
      haBox: card.querySelector('.ha-picker'),
    };
    this.#setupHaPicker();

    this.#els.selector.innerHTML = PERIODS.map((p) => `<button type="button" class="time-btn"
      data-id="${p.id}">${p.label}</button>`).join('');

    // Beim Wechsel der Granularität den zuletzt gewählten Zeitraum beibehalten
    for (const btn of this.#els.selector.querySelectorAll('[data-id]')) {
      btn.addEventListener('click', () => {
        const range = getPeriod();
        this.#granularity = btn.dataset.id;
        this.#offset = this.#offsetFor(this.#granularity, range?.end ? new Date(range.end) : new Date());
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
      // Mit dem Kalender von HA öffnet der Knopf diesen, sonst die Felder
      if (this.#openHaPicker()) return;
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

    // Den Zeitraum übernehmen, der schon gilt (z. B. von einer anderen Seite),
    // statt beim Aufbau wieder auf "heute" zu springen.
    const range = getPeriod();
    if (range.period === 'custom') {
      this.#els.from.value = isoDate(new Date(range.start));
      this.#els.to.value = isoDate(new Date(range.end));
      this.#syncButtons();
    } else {
      this.#granularity = range.period;
      this.#offset = this.#offsetFor(range.period, new Date(range.start));
      this.#apply();
    }
    this.#built = true;
  }

  /**
   * Den Wähler von HA hinter unseren Kalender-Knopf legen.
   *
   * Er bleibt unsichtbar (nur sein Anker wird gebraucht, damit der Kalender
   * an der richtigen Stelle aufgeht) und wird über seine open()-Methode
   * geöffnet. Angezeigt wird weiter unser Knopf mit dem Zeitraum.
   */
  async #setupHaPicker() {
    if (!(await ensureHaPicker()) || !this.#els.haBox) return;
    const picker = document.createElement('ha-date-range-picker');
    picker.hass = this.#hass;
    picker.ranges = quickRanges();
    picker.minimal = true;      // nur ein Symbol statt Textfeld und Pfeilen
    picker.autoApply = true;
    picker.addEventListener('value-changed', (ev) => {
      // HA schickt { value: { startDate, endDate } }, ältere Fassungen flach
      const { startDate, endDate } = ev.detail?.value ?? ev.detail ?? {};
      if (!startDate || !endDate) return;
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Ganze Tage, wie bei unseren eigenen Zeiträumen
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      this.#granularity = 'custom';
      setPeriod({ period: 'custom', start, end });
      this.#syncButtons();
    });
    this.#els.haPicker = picker;
    this.#els.haBox.replaceChildren(picker);
    await picker.updateComplete?.catch?.(() => {});
    this.#hideHaField();
    // Eigene Datumsfelder werden nicht mehr gebraucht
    this.#els.popup.classList.add('hidden');
    this.#els.popup.hidden = true;
    this.#syncButtons();
  }

  /**
   * Nur das Bedienfeld des HA-Wählers verstecken (sein Symbol bzw. Textfeld).
   * Es bleibt als Anker im Baum, das Aufklapp-Fenster bleibt sichtbar.
   */
  #hideHaField() {
    const field = this.#els.haPicker?.shadowRoot?.querySelector('#field');
    if (!field) return;
    Object.assign(field.style, {
      height: '100%', inset: '0', margin: '0', opacity: '0',
      pointerEvents: 'none', position: 'absolute', width: '100%',
    });
  }

  /** Kalender öffnen: bevorzugt über open(), sonst per Klick auf sein Feld. */
  #openHaPicker() {
    const picker = this.#els.haPicker;
    if (!picker) return false;
    this.#hideHaField();
    if (typeof picker.open === 'function') {
      picker.open();
      return true;
    }
    const field = picker.shadowRoot?.querySelector('#field');
    if (field) {
      // Versteckt reagiert es nicht auf Klicks – kurz freigeben
      field.style.pointerEvents = 'auto';
      field.click();
      field.style.pointerEvents = 'none';
      return true;
    }
    return false;
  }

  /** Wie viele Zeiträume der Granularität liegt `date` vor heute? */
  #offsetFor(granularity, date) {
    const now = new Date();
    if (granularity === 'day') {
      const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      // Math.round fängt Sommer-/Winterzeit-Übergänge auf
      return Math.max(0, Math.round((nowDay - day) / 86400000));
    }
    if (granularity === 'week') {
      const weekStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() || 7) + 1);
      return Math.max(0, Math.round((weekStart(now) - weekStart(date)) / 604800000));
    }
    if (granularity === 'month') {
      return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth());
    }
    return Math.max(0, now.getFullYear() - date.getFullYear());
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
      const month = (d) => d.toLocaleDateString('de-DE', { month: 'long' });
      // Über den Monatswechsel: "27. Juli – 2. August"
      return start.getMonth() === end.getMonth()
        ? `${start.getDate()}.–${end.getDate()}. ${month(end)}`
        : `${start.getDate()}. ${month(start)} – ${end.getDate()}. ${month(end)}`;
    }
    if (this.#granularity === 'month') return start.toLocaleDateString('de-DE', MONTH_YEAR);
    return String(start.getFullYear());
  }

  #syncButtons() {
    const range = getPeriod();
    if (this.#els.haPicker) {
      this.#els.haPicker.hass = this.#hass;
      this.#els.haPicker.startDate = new Date(range.start);
      this.#els.haPicker.endDate = new Date(range.end);
    }
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

customElements.define('we-period-card', WueflEnergyPeriodCard);
customElements.define('we-period-card-editor', WueflEnergyPeriodCardEditor);

registerCard({
  type: 'we-period-card',
  name: 'wuefl Zeitraum',
  description: 'Tag/Woche/Monat/Jahr, Vor/Zurück-Navigation, kalendergenaue Zeitspannen.',
});