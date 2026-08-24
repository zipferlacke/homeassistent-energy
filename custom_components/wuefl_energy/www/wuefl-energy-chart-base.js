/**
 * wuefl-energy-chart-base.js
 * Gemeinsames Gerüst der drei Diagramm-Karten der Energie-Ansicht.
 *
 * Die Karten zeichnen nichts mehr selbst: sie bauen aus der Zuordnung nur
 * noch eine Konfiguration und reichen sie an <wuefl-energy-chart> weiter.
 * Start und Ende kommen dabei immer aus dem geteilten Zeitraum
 * (wuefl-energy-shared.js), damit alle Diagramme dem Zeitraum-Picker
 * folgen — auch die, die in einem eigenen Abschnitt daneben stehen.
 */
import { centralConfig, getPeriod, onPeriodChange } from './wuefl-energy-shared.js';
import './wuefl-energy-chart.js';

export class WueflChartWrapper extends HTMLElement {
  _own = {};
  _central = {};
  _config = {};
  _hass = null;
  _built = false;
  _stopPeriod = null;
  _chart = null;

  /** Karten überschreiben das: liefert die Chart-Konfiguration oder null. */
  buildChartConfig() { return null; }

  get centralConfigType() { return 'history'; }

  /** Titel für den Fall, dass die Karte selbst keinen mitbringt. */
  get defaultTitle() { return ''; }

  setConfig(config) {
    this._own = config ?? {};
    this._config = { ...this._central, ...this._own };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._chart) this._chart.hass = hass;
    if (first) {
      this._loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this._loadCentral());
      this._stopPeriod = onPeriodChange(() => this._refresh());
    }
    if (!this._built) this._build();
  }

  disconnectedCallback() { this._stopPeriod?.(); }
  getCardSize() { return 4; }

  async _loadCentral() {
    // Hier nutzen wir jetzt den flexiblen Getter statt hart 'history'
    this._central = await centralConfig(this._hass, this.centralConfigType);
    this._config = { ...this._central, ...this._own };
    this._refresh();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      // Die Karte selbst füllt ihren Platz komplett aus — dadurch bestimmt
      // die Zeilenhöhe im Home-Assistant-Raster (grid_options.rows) die
      // Diagrammhöhe, statt einer festen Pixelzahl im Code.
      sheet.replaceSync(':host { display: block; height: 100%; }');
      root.adoptedStyleSheets = [sheet];
    }
    this._chart = document.createElement('wuefl-energy-chart');
    root.replaceChildren(this._chart);
    this._built = true;
    this._refresh();
  }

  _refresh() {
    if (!this._built || !this._hass) return;
    const range = getPeriod();
    let later = new Date(range.start);
    later.setMonth(later.getMonth() + 1);
    range.spanMonth = later <= range.end;
    later = new Date(range.start);
    later.setDate(later.getDate() + 7);
    range.spanWeek = later <= range.end;

    const config = this.buildChartConfig(range);
    if (!config) { this.hidden = true; return; }
    this.hidden = false;
    this._chart.setConfig({
      title: this._own.title ?? this.defaultTitle,
      // Fester Zeitraum aus dem gemeinsamen Picker statt eines eigenen
      // relativen Bereichs — sonst würde jede Karte ihren eigenen Ausschnitt
      // zeigen und die Vor/Zurück-Navigation ginge ins Leere.
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      ...config,
    });
    this._chart.hass = this._hass;
  }

  /** Aggregation passend zum Zeitraum, überschreibbar per Karten-Option. */
  _aggregation(range) {
    console.log(range)
    if (this._own.aggregation) return this._own.aggregation;
    if(range.overYear) return '1m';
    if(range.overMonth) return '1d';
    if(range.overWeek) return '2h';
    if(range.overDay) return '10min';
    return '5min';
  }
}
