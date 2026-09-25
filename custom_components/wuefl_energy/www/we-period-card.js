/**
 * we-period-card.js
 * Zeitraumauswahl – eine Hülle um den Zeitpicker aus wuefl-libs.
 *
 * Tag / Woche / Monat / Jahr, vor und zurück, Kalender und die kleine
 * Übersicht mit verschiebbarem Ausschnitt kommen aus dem Paket. Hier steht
 * nur, was Home Assistant davon wissen muss:
 *
 *   – der Kalender aus wuefl-libs wird hineingereicht, samt Schnellwahl
 *   – die Grenzen kommen aus der Statistik der Zähler
 *   – die Übersicht liest über dieselbe Quelle wie die Diagramme
 *   – nach außen wird weiter setPeriod() gerufen, damit alle vorhandenen
 *     Karten unverändert weiterlaufen
 *
 * Zusätzlich meldet sich der Picker unter einer id an (Vorgabe `we`). Karten,
 * die es können, hängen sich damit direkt daran – nötig ist das nicht.
 */
import { registerCard, setPeriod, WueflFormEditor, sel, GRID_CSS,
  addSheet, centralConfig, energyTargets } from './we-shared.js';
import { DatePicker } from './datepicker_v2.1.3/datepicker_v2_1_3.js';
import { Zeitpicker } from './diagramm_v1.5.0/picker_v1_5_0.js';
import { haRenderer, haSource, HA_ICONS } from './we-chart-ha.js';
import { setIcons } from './diagramm_v1.5.0/diagramm_v1_5_0.js';

setIcons(HA_ICONS);

let dpCss = null;
let dgCss = null;
const holen = (pfad, cache) => {
  if (!cache.p) {
    cache.p = fetch(new URL(pfad, import.meta.url))
      .then((r) => (r.ok ? r.text() : '')).catch(() => '');
  }
  return cache.p;
};
const datePickerCss = () => holen('./datepicker_v2.1.3/datepicker_v2_1_3.css', dpCss ??= {});
const diagrammCss = () => holen('./diagramm_v1.5.0/diagramm_v1_5_0.css', dgCss ??= {});

/**
 * Schnellwahl im Kalender. Beim Daten-Ansehen sind das andere Vorschläge als
 * beim Buchen – der Kalender kennt sie deshalb nicht selbst.
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

/* Nur der Rahmen der Karte und die Anbindung ans Thema von HA. Alles
   Aussehen des Pickers steht im Stilblatt des Pakets. */
const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
.dgp {
  color-scheme: inherit;
  --dg-text: var(--primary-text-color, light-dark(#000, #fff));
  --dg-text-soft: var(--secondary-text-color, light-dark(#5f6368, #a5a8ad));
  --dg-bg: transparent;
  --dg-line: var(--divider-color, #e0e0e0);
  --dg-grid: color-mix(in srgb, var(--divider-color, #e0e0e0) 55%, transparent);
  --bg-input: var(--secondary-background-color, rgba(127,127,127,.12));
  --br-input: 10px;
  --fs-input: 13px;
  --clr-primary-100: var(--secondary-background-color, rgba(127,127,127,.2));
  --clr-primary-400: var(--card-background-color, #fff);
  --clr-primary-300: var(--card-background-color, #fff);
  padding: 0;
}
.dgp_stufe[aria-pressed="true"] { box-shadow: 0 1px 3px rgba(0,0,0,.12); }
`;

class WueflEnergyPeriodCard extends HTMLElement {
  #hass = null;
  #built = false;
  #picker = null;
  #box = null;
  #own = {};

  setConfig(config) { this.#own = config ?? {}; }
  getCardSize() { return 1; }

  set hass(hass) {
    this.#hass = hass;
    if (!this.#built) this.#build();
  }

  async #build() {
    this.#built = true;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    const card = document.createElement('div');
    card.className = 'card';
    this.#box = document.createElement('div');
    card.append(this.#box);
    root.append(card);

    // Beide Stilblätter in diesen Schatten-Baum: Der Kalender zeichnet sich
    // hierhin, und CSS aus dem Dokument kommt hier nicht an.
    addSheet(root, await datePickerCss(), 'datepicker');
    addSheet(root, await diagrammCss(), 'diagramm');

    this.#picker = new Zeitpicker(this.#box, {
      id: this.#own.picker_id ?? 'we',
      granularity: this.#own.granularity ?? 'day',
      granularities: this.#own.granularities,
      // Von wann bis wann es Daten gibt, fragt der Picker selbst – einmal
      // beim Start und danach in Abständen. Kommt über Nacht ein neuer Tag
      // dazu, merkt er das ohne Neuladen der Seite.
      bounds: () => this.#grenzen(),
      datePicker: DatePicker,
      datePickerOptions: { quick: SCHNELLWAHL, forceJsPosition: true },
      ...(this.#own.overview === false ? {} : {
        overview: {
          keys: [],                       // werden mit den Grenzen nachgereicht
          renderer: haRenderer(() => this.#hass),
          source: haSource(() => this.#hass, ['change']),
          color: this.#own.overview_color ?? 'var(--warning-color, #f5b301)',
          height: this.#own.overview_height ?? 64,
        },
      }),
    });

    // Nach außen unverändert: alle vorhandenen Karten hören auf setPeriod
    this.#picker.on(({ start, end }) => {
      setPeriod({ period: this.#picker.granularity, start, end });
    });
    setPeriod({ period: this.#picker.granularity, ...this.#picker.range });
  }

  /**
   * Bis wann und ab wann es überhaupt Daten gibt.
   *
   * Dieselben Zähler wie beim Import: Wer dort beschrieben wird, muss hier
   * auch gefunden werden – sonst reicht der Kalender nicht bis an importierte
   * Jahre heran.
   */
  async #grenzen() {
    let von = null;
    const bis = new Date();
    bis.setHours(23, 59, 59, 999);
    let ids = [];
    if (!this.#hass) return { min: null, max: bis };
    try {
      const cfg = await centralConfig(this.#hass);
      ids = [...new Set(energyTargets(cfg).map((t) => t.entity))];
      if (ids.length) {
        const res = await this.#hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(2000, 0, 1).toISOString(),
          statistic_ids: ids, period: 'month', types: ['sum'],
        });
        const erste = Object.values(res ?? {})
          .map((rows) => +new Date(rows?.[0]?.start ?? NaN)).filter(Number.isFinite);
        if (erste.length) { von = new Date(Math.min(...erste)); von.setHours(0, 0, 0, 0); }
      }
    } catch {
      // Ohne Auskunft bleibt nur die Grenze nach vorn
    }
    // Die Übersicht zeigt ohnehin, was die angehängten Diagramme melden –
    // ohne solche bleiben die Hauptzähler als Rückfall.
    if (!this.#picker?.hatReihen?.()) this.#picker?.setOverviewKeys?.(ids.slice(0, 3));
    return { min: von, max: bis };
  }

  disconnectedCallback() {
    this.#picker?.destroy();
    this.#picker = null;
    this.#built = false;
  }
}

customElements.define('we-period-card', WueflEnergyPeriodCard);

const SCHEMA = [
  { name: 'granularity', selector: { select: { mode: 'dropdown', options: [
    { value: 'day', label: 'Tag' }, { value: 'week', label: 'Woche' },
    { value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }] } } },
  { name: 'overview', selector: sel.bool() },
  { name: 'overview_height', selector: sel.number(32, 160, 4) },
  { name: 'granularities', selector: { select: { multiple: true, options: [
    { value: 'day', label: 'Tag' }, { value: 'week', label: 'Woche' },
    { value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }] } } },
];
const LABELS = { granularity: 'Stufe beim Laden', overview: 'Übersicht anzeigen', overview_height: 'Höhe der Übersicht (px)', granularities: 'Sichtbare Stufen' };
class WueflEnergyPeriodCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }
customElements.define('we-period-card-editor', WueflEnergyPeriodCardEditor);

registerCard({
  type: 'we-period-card',
  name: 'wuefl Zeitraum',
  description: 'Tag, Woche, Monat, Jahr und freier Zeitraum – steuert die Diagramme.',
});
