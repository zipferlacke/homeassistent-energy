/**
 * we-chart.js
 * Die Karte <we-chart> – eine Hülle um das Diagramm aus wuefl-libs.
 *
 * Hier steht nur noch, was Home Assistant von einer Karte erwartet: setConfig,
 * getCardSize, hass, Registrierung im Kartenkatalog. Alles Fachliche – Titel,
 * Chips, Legende, Vollbild, Auflösung, Töpfe, Einheiten, Tooltip – kommt aus
 * diagramm_v1.5.0 und ist Zeichen für Zeichen dasselbe wie in der Bibliothek.
 *
 * Vorher lagen dieselben 1000 Zeilen hier und nirgends sonst. Jede Korrektur
 * musste doppelt gemacht werden, sobald etwas davon auch auf einer Webseite
 * laufen sollte – und das Vollbild baute sich ein zweites Diagramm, dem Titel
 * und Chips fehlten und das seine Höhe nie neu maß.
 */
import { registerCard } from './we-shared.js';
import { Diagramm, setIcons } from './diagramm_v1.5.0/diagramm_v1_5_0.js';
import { haRenderer, haSource, HA_ICONS, toDiagrammConfig } from './we-chart-ha.js';

setIcons(HA_ICONS);

let cssPromise = null;
/** Das Stilblatt des Pakets einmal holen und in jeden Schatten-Baum legen. */
function diagrammCss() {
  if (!cssPromise) {
    cssPromise = fetch(new URL('./diagramm_v1.5.0/diagramm_v1_5_0.css', import.meta.url))
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
  }
  return cssPromise;
}

/* Der Rahmen der Karte. Das Paket bringt sein eigenes Aussehen mit; hier
   werden nur seine Variablen an die Themenfarben von HA gehängt. */
const CARD_CSS = `
:host { display: flex; flex-direction: column; height: 100%; }
ha-card { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.dg {
  /* Nicht der Systemeinstellung folgen, sondern dem Thema von Home Assistant:
     Wer dort dunkel wählt, soll das Diagramm dunkel sehen, auch wenn das
     Betriebssystem hell steht. Deshalb alle Farben aus HA-Variablen – dann
     kommt light-dark() gar nicht erst zum Zug. */
  color-scheme: inherit;
  --dg-text: var(--primary-text-color, light-dark(#000, #fff));
  --dg-text-soft: var(--secondary-text-color, light-dark(#5f6368, #a5a8ad));
  --dg-bg: var(--card-background-color, var(--primary-background-color));
  --dg-line: var(--divider-color, #e0e0e0);
  /* Das Gitter eine Spur blasser als die Trennlinien */
  --dg-grid: color-mix(in srgb, var(--divider-color, #e0e0e0) 55%, transparent);
  --dg-title-size: var(--ha-card-header-font-size, 20px);
}
.dg_fs { background: var(--card-background-color, var(--primary-background-color)); }
`;

class WueflEnergyChart extends HTMLElement {
  #cfg = {};
  #hass = null;
  #dg = null;
  #box = null;
  #letzterAbruf = 0;

  static getStubConfig() { return { title: 'Diagramm', series: [] }; }

  setConfig(config) {
    if (!config || !config.series) throw new Error("we-chart benötigt mindestens eine 'series'.");
    this.config = config;
  }

  getCardSize() { return this.#cfg.card_size || 4; }

  set config(config) {
    this.#cfg = config;
    this.#anwenden();
  }

  /**
   * HA setzt hass bei jeder Zustandsänderung irgendeiner Entität neu. Die
   * Statistik ändert sich aber höchstens alle fünf Minuten – deshalb nur dann
   * neu abfragen. Zeitraum- und Konfigurationswechsel laden sofort.
   */
  set hass(hass) {
    const ersteMal = !this.#hass;
    this.#hass = hass;
    if (!this.#dg) this.#bauen();
    if (ersteMal) { this.#anwenden(); return; }
    if (this.#cfg?.series && Date.now() - this.#letzterAbruf > 300_000) {
      this.#letzterAbruf = Date.now();
      this.#dg?.refresh();
    }
  }

  #bauen() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const card = document.createElement('ha-card');
    this.#box = document.createElement('div');
    card.append(this.#box);
    const style = document.createElement('style');
    style.textContent = CARD_CSS;
    root.replaceChildren(style, card);
    // Das Stilblatt des Pakets kommt asynchron; bis dahin steht das Diagramm
    // schon, es sieht nur eine Zehntelsekunde nackt aus.
    diagrammCss().then((css) => {
      const s = new CSSStyleSheet();
      s.replaceSync(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, s];
    });

    this.#dg = new Diagramm(this.#box, {
      renderer: haRenderer(() => this.#hass),
      source: haSource(() => this.#hass),
    });
  }

  #anwenden() {
    if (!this.#dg || !this.#hass || !this.#cfg?.series) return;
    this.#letzterAbruf = Date.now();
    // Die Kachel ist in Home Assistant die ha-card drumherum. Das Diagramm
    // soll darin keinen zweiten Rahmen zeichnen – es sei denn, jemand will
    // es ausdrücklich anders.
    this.#dg.setConfig({ card: false, ...toDiagrammConfig(this.#cfg, this.#hass) });
  }

  disconnectedCallback() {
    this.#dg?.destroy();
    this.#dg = null;
  }
}

customElements.define('we-chart', WueflEnergyChart);

/* ------------------------------------------------------------------ *
 * Diagramm in einem Fenster
 * ------------------------------------------------------------------ */

const POPUP_CSS = `
dialog.we-chart-popup {
  background: var(--card-background-color, #fff); border: 0; border-radius: 16px;
  box-sizing: border-box; color: var(--primary-text-color); display: none;
  flex-direction: column; gap: 4px; height: min(70dvh, 560px); max-height: none;
  max-width: none; padding: 8px; width: min(96vw, 900px);
}
dialog.we-chart-popup[open] { display: flex; }
dialog.we-chart-popup::backdrop { background: rgba(0, 0, 0, .5); }
dialog.we-chart-popup .close {
  align-items: center; align-self: flex-end; background: none; border: 0; border-radius: 50%;
  color: var(--secondary-text-color); cursor: pointer; display: inline-flex; height: 32px;
  justify-content: center; padding: 0; width: 32px;
}
dialog.we-chart-popup .close:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
dialog.we-chart-popup .body { display: flex; flex: 1; min-height: 0; }
dialog.we-chart-popup .body we-chart { display: block; flex: 1; min-height: 0; }
`;

/**
 * Ein Diagramm groß in einem Fenster – benutzt von den Kacheln.
 *
 * @param {object} o
 * @param {Node}   o.root   Schatten-Baum oder Element, in das der Dialog kommt
 * @param {object} o.hass
 * @param {string} o.title      Überschrift, auch im Vollbild sichtbar
 * @param {object} o.config     Diagramm-Konfiguration (ohne title)
 * @param {boolean} [o.fullscreen=true]  Vollbild-Knopf anbieten
 */
export function openChartPopup({ root, hass, title, config, fullscreen = true }) {
  if (!root || !config?.series?.length) return null;

  const dlg = document.createElement('dialog');
  dlg.className = 'we-chart-popup';
  const style = document.createElement('style');
  style.textContent = POPUP_CSS;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.setAttribute('aria-label', 'Schließen');
  close.innerHTML = '<ha-icon icon="mdi:close"></ha-icon>';
  close.addEventListener('click', () => dlg.close());

  const body = document.createElement('div');
  body.className = 'body';
  const chart = document.createElement('we-chart');
  chart.setConfig({ ...config, title, fullscreen });
  chart.hass = hass;
  body.append(chart);

  dlg.append(style, close, body);
  dlg.addEventListener('close', () => dlg.remove());
  root.append(dlg);
  dlg.showModal();
  return dlg;
}

registerCard({
  type: 'we-chart',
  name: 'we-chart',
  description: 'Erweitertes Energie-Diagramm mit flexibler Zeitraumauswahl.',
});
