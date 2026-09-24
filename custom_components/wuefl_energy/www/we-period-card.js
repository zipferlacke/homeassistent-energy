/**
 * we-period-card.js
 * Zeitraumauswahl (Tag, Woche, Monat, Jahr) mit vollständigen Zeitspannen,
 * Vor/Zurück-Navigation ohne Zukunfts-Navigation und integriertem Kalender-Button.
 * 
 * NEU: Beim Wechsel der Granularität wird der letzte Zeitraum im zuvor 
 * gewählten Zeitraum beibehalten (z.B. Wechsel von Jahr 2025 auf Monat -> Dezember 2025).
 */
import { registerCard, getPeriod, setPeriod, WueflFormEditor, sel, GRID_CSS,
  addSheet, centralConfig, asList } from './we-shared.js';
import { DatePicker } from './datepicker_v2.1.1/datepicker_v2_1_1.js';

/**
 * Der Kalender kommt aus datepicker_v2.1.1 im selben Ordner.
 *
 * Vorher lag hier der Wähler von Home Assistant. Der ist kein offizieller
 * Baustein für eigene Karten: Auf dem Handy ging er auf, am Rechner blieb
 * vom Aufklapp-Fenster nur ein Scrollbalken übrig – sein Anker steckt in
 * unserem Schatten-Baum, und daran kommt sein Fenster nicht heran. Ohne
 * laufendes Home Assistant lässt sich das auch nicht nachstellen, also
 * jedes Mal Raten.
 *
 * Dieser Kalender hängt an zwei normalen Datumsfeldern und zeichnet sich
 * in die oberste Ebene (Popover).
 *
 * Er sitzt samt Feldern in unserem Schatten-Baum, und sein Stilblatt wird
 * dort ausdrücklich dazugeladen. Der erste Anlauf legte die Felder in den
 * hellen Baum der Karte – im Test am Dokument hing das Stilblatt richtig,
 * in Home Assistant steckt die Karte aber selbst mehrere Schatten-Bäume
 * tief, und CSS aus dem Dokument kommt dort nicht an: Der Kalender stand
 * unformatiert da, mit "chevron_left" als Text.
 *
 * Positioniert wird ausdrücklich per JavaScript (forceJsPosition): Die
 * Anker-Positionierung von CSS über Baumgrenzen hinweg ist nichts, worauf
 * man sich hier verlassen möchte.
 *
 * Wählbar sind nur Tage, für die es Daten gibt (min/max), und über dem
 * Kalender stehen die Schnellwahl-Knöpfe aus SCHNELLWAHL.
 *
 * Lädt er nicht, bleiben die beiden Datumsfelder sichtbar und bedienbar.
 */
let dpSingleton = null;
let dpZaehler = 0;

/**
 * Eine Instanz für die ganze Seite. Das Modul legt beim Laden selbst eine an,
 * gibt sie aber nicht heraus – und ohne Instanz kein create() und kein
 * Nachziehen des Zeitraums. Deshalb hier eine eigene, aber nur eine.
 */
function datePicker() {
  if (!dpSingleton) dpSingleton = new DatePicker({ lang: 'de', locale: 'de-DE' });
  return dpSingleton;
}

/** Das Stilblatt des Kalenders – einmal geholt, von allen Karten benutzt. */
let dpCss = null;
function datePickerCss() {
  if (!dpCss) {
    dpCss = fetch(new URL('./datepicker_v2.1.1/datepicker_v2_1_1.css', import.meta.url))
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
  }
  return dpCss;
}

/**
 * Schnellwahl im Kalender. Beim Daten-Ansehen sind das andere Vorschläge als
 * beim Buchen – der Kalender kennt sie deshalb nicht selbst, sie kommen hier
 * als Liste. Der Zeitraum wird dabei auf die vorhandenen Daten beschnitten.
 */
const SCHNELLWAHL = [
  { name: 'Heute', rule: 'today' },
  { name: 'Gestern', rule: 'yesterday' },
  { name: 'Letzte 7 Tage', rule: 'last7' },
  { name: 'Letzte 30 Tage', rule: 'last30' },
  { name: 'Dieser Monat', rule: 'thisMonth' },
  { name: 'Letzter Monat', rule: 'lastMonth' },
  { name: 'Dieses Jahr', rule: 'thisYear' },
  { name: 'Alles', rule: 'all' },
];

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
/* Der Auslöser des Kalenders liegt deckungsgleich und unsichtbar über dem
   Knopf. Sichtbar ist unser Knopf mit dem Zeitraum; der Auslöser behält
   aber seine volle Größe, denn daran richtet der Kalender sein Fenster aus.
   Das Fenster selbst steckt in der obersten Ebene (Popover) und wird davon
   nicht verdeckt. */
.datum-slot {
  inset: 0; position: absolute;
}
/* Gesperrte Tage bringt der Kalender selbst mit (min/max) */
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
  #von = null;
  #bis = null;

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
            <span class="datum-slot"></span>
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
      slot: card.querySelector('.datum-slot'),
    };
    this.#setupPicker();

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

    this.#els.dateBtn.addEventListener('click', (ev) => {
      // Im Schatten-Baum sieht der Kalender als Klick-Ziel nur die Karte und
      // hielte das für "irgendwo daneben" – er würde sofort wieder zumachen.
      // Deshalb hier selbst auf- und zuklappen und den Klick anhalten.
      if (!this.#els.dp) { this.#els.popup.classList.toggle('hidden'); return; }
      ev.stopPropagation();
      if (this.#els.dp.isOpen) this.#els.dp.close();
      else this.#els.dp.open();
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
   * Den Kalender an zwei Datumsfelder im hellen Baum hängen.
   *
   * Die Felder wandern per Slot an die Stelle des Kalender-Knopfs. Der
   * Kalender versteckt sie selbst und setzt seinen eigenen Auslöser
   * dorthin – den machen wir durchsichtig, sichtbar bleibt unser Knopf.
   */
  async #setupPicker() {
    // Erst nachsehen, wofür es überhaupt Daten gibt – der Kalender bekommt
    // die Grenzen gleich beim Erstellen mit.
    await this.#loadBounds();

    // Erst den Kalender wecken, dann die Felder einhängen: sein Bausatz
    // durchsucht beim Start das Dokument und würde sie sonst selbst
    // übernehmen – wir bekämen keinen Griff auf die Instanz.
    const dp = datePicker();
    const root = this.shadowRoot;
    addSheet(root, await datePickerCss(), 'datepicker');

    const box = this.#els.slot;
    const id = `we${(dpZaehler += 1)}`;
    box.innerHTML = `<input type="date" data-tp-picker="${id}+" data-tp-format="iso">`
      + `<input type="date" data-tp-picker="${id}-" data-tp-format="iso">`;

    const [von, bis] = box.querySelectorAll('input');
    this.#els.von = von;
    this.#els.bis = bis;

    const anwenden = () => {
      if (!von.value || !bis.value) return;
      const start = new Date(`${von.value}T00:00:00`);
      const end = new Date(`${bis.value}T23:59:59.999`);
      if (Number.isNaN(+start) || Number.isNaN(+end)) return;
      this.#granularity = 'custom';
      setPeriod({ period: 'custom', start, end });
      this.#syncButtons();
    };
    // Beim Speichern meldet sich erst das Von-Feld, dann das Bis-Feld. Ohne
    // kurzes Warten liefe dazwischen ein Zeitraum aus altem Ende und neuem
    // Anfang durch – alle Diagramme würden zweimal laden.
    let wartet = null;
    const uebernehmen = () => { clearTimeout(wartet); wartet = setTimeout(anwenden, 0); };
    von.addEventListener('change', uebernehmen);
    bis.addEventListener('change', uebernehmen);

    try {
      this.#els.dp = dp.create([von, bis], {
        outputFormat: 'iso', showDate: true, showTime: false, forceJsPosition: true,
        // Nur Tage, für die es Daten gibt: nicht in die Zukunft und nicht
        // vor den ersten Wert im Recorder. Das Blättern endet dort ebenfalls.
        min: this.#von, max: this.#bis,
        quick: SCHNELLWAHL,
      });
    } catch (err) {
      // Ohne Kalender bleiben die beiden Datumsfelder – sichtbar und nutzbar
      this.#els.dp = null;
    }
    if (this.#els.dp) {
      // Auslöser durchsichtig über den Knopf legen; seine Größe bleibt, denn
      // daran richtet sich das Kalender-Fenster aus.
      Object.assign(this.#els.dp.triggerElm.style, {
        boxSizing: 'border-box', height: '100%', inset: '0', margin: '0', minWidth: '0',
        opacity: '0', padding: '0', position: 'absolute', width: '100%',
      });
      // Unsere alten Datumsfelder werden nicht mehr gebraucht
      this.#els.popup.classList.add('hidden');
      this.#els.popup.hidden = true;
    }
    this.#syncButtons();
  }

  /**
   * Bis wann und ab wann es überhaupt Daten gibt.
   *
   * Heute ist das Ende – in die Zukunft gibt es nichts zu zeigen. Der Anfang
   * ist der erste Monat, für den der Recorder eine Statistik hat.
   */
  async #loadBounds() {
    this.#bis = new Date(); this.#bis.setHours(23, 59, 59, 999);
    try {
      const cfg = await centralConfig(this.#hass);
      const ids = [...new Set([
        ...asList(cfg.grid?.import_total), ...asList(cfg.grid?.export_total),
        ...asList(cfg.solar).map((x) => x?.total), ...asList(cfg.consumers?.total),
      ].map((v) => (typeof v === 'string' ? v : v?.entity)).filter(Boolean))];
      if (!ids.length) return;
      const res = await this.#hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(2000, 0, 1).toISOString(),
        statistic_ids: ids, period: 'month', types: ['sum'],
      });
      const erste = Object.values(res ?? {})
        .map((rows) => +new Date(rows?.[0]?.start ?? NaN))
        .filter(Number.isFinite);
      if (erste.length) { this.#von = new Date(Math.min(...erste)); this.#von.setHours(0, 0, 0, 0); }
    } catch {
      // Ohne Auskunft bleibt nur die Grenze nach vorn
    }
  }

  /** Den gerade gültigen Zeitraum in den Kalender schreiben. */
  #syncPicker(range) {
    const { von, bis, dp } = this.#els;
    if (!von || !bis) return;
    von.value = isoDate(new Date(range.start));
    bis.value = isoDate(new Date(range.end));
    // Der Kalender liest die Felder erst beim Schließen wieder ein – ist er
    // zu, wird sein Stand hier direkt nachgezogen, damit er beim nächsten
    // Öffnen den Zeitraum zeigt, der gerade gilt.
    if (!dp || dp.isOpen) return;
    dp.selectedFrom = new Date(range.start);
    dp.selectedTo = new Date(range.end);
    dp.viewYear = dp.selectedFrom.getFullYear();
    dp.viewMonth = dp.selectedFrom.getMonth();
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
    this.#syncPicker(range);
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