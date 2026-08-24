/**
 * wuefl-energy-tiles-card
 * Nur die HA-Tile-Kacheln (Erzeugung/Batterie/Netz/Haushalt/Wallbox) —
 * eigener Abschnitt neben dem Hauptdiagramm, hört auf Zeitraum-Änderungen
 * von wuefl-energy-period-card, ohne diese Karte selbst zu kennen.
 */
import {
  asList, fmtEnergy, esc, registerCard, centralConfig, WueflFormEditor, sel,
  cssColor, TILE_CSS, GRID_CSS, getPeriod, onPeriodChange, fetchStats,
} from './wuefl-energy-shared.js';

const SERIES = [
  { key: 'pv_energy', label: 'Solar', color: '--energy-solar-color', fallback: '#ff9800', icon: 'mdi:solar-power' },
  { key: 'battery_out', label: 'Batterie', color: '--energy-battery-out-color', fallback: '#4db0a2', icon: 'mdi:battery-high', pair: 'battery', short: 'entladen' },
  { key: 'battery_in', label: 'Batterie', color: '--energy-battery-in-color', fallback: '#f6c34c', icon: 'mdi:battery-high', pair: 'battery', short: 'geladen' },
  { key: 'grid_import', label: 'Netz', color: '--energy-grid-consumption-color', fallback: '#488fc2', icon: 'mdi:transmission-tower', pair: 'grid', short: 'Bezug' },
  { key: 'grid_export', label: 'Netz', color: '--energy-grid-return-color', fallback: '#8353d1', icon: 'mdi:transmission-tower', pair: 'grid', short: 'Einspeisung' },
  { key: 'house_energy', label: 'Haushalt', color: '--wuefl-house-color', fallback: '#e57373', icon: 'mdi:home' },
  { key: 'wallbox_energy', label: 'Wallbox', color: '--wuefl-wallbox-color', fallback: '#ba68c8', icon: 'mdi:ev-station' },
];
const PAIR_NAMES = { grid: 'Netz', battery: 'Batterie' };

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${TILE_CSS}
.ha-tile { min-height: auto; }
.discharge-text { color: var(--energy-battery-out-color, #4db0a2); }
.charge-text { color: var(--energy-battery-in-color, #f6c34c); }
.import-text { color: var(--energy-grid-consumption-color, #488fc2); }
.export-text { color: var(--energy-grid-return-color, #8353d1); }
.state { color: var(--secondary-text-color); padding: 24px 0; text-align: center; }
`;

class WueflEnergyTilesCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #stopPeriod = null;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-tiles-card-editor'); }
  static getStubConfig() { return { title: 'Kennzahlen' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#config = { title: 'Kennzahlen', ...this.#central, ...this.#own };
  }

  set hass(hass) {
    const first = !this.#hass;
    this.#hass = hass;
    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
      this.#stopPeriod = onPeriodChange(() => this.#refresh());
    }
    if (!this.#built) this.#build();
  }

  disconnectedCallback() { this.#stopPeriod?.(); }
  getCardSize() { return 3; }

  async #loadCentral() {
    this.#central = await centralConfig(this.#hass, 'history');
    this.#config = { title: 'Kennzahlen', ...this.#central, ...this.#own };
    this.#refresh();
  }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.adoptedStyleSheets?.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
    const card = document.createElement('div');
    card.className = 'card ha-tile-grid';
    root.replaceChildren(card);
    this.#els = { grid: card };
    this.#built = true;
    this.#refresh();
  }

  #used() {
    return SERIES.filter((s) => asList(this.#config[s.key]).length);
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const used = this.#used();
    if (!used.length) {
      this.#els.grid.innerHTML = '<div class="state">Noch keine Gesamtzähler zugeordnet.</div>';
      return;
    }
    const ids = used.flatMap((s) => asList(this.#config[s.key]));
    this.#stats = await fetchStats(this.#hass, ids, getPeriod(), ['change']);
    this.#render(used);
  }

  #stats = {};

  #total(s) {
    return asList(this.#config[s.key]).reduce(
      (a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0,
    );
  }

  #render(used) {
    const html = [];
    const seen = new Set();

    for (const s of used) {
      const color = cssColor(this, s.color, s.fallback);
      if (s.pair) {
        if (seen.has(s.pair)) continue;
        seen.add(s.pair);
        const both = used.filter((x) => x.pair === s.pair);
        const total = both.reduce((a, x) => a + this.#total(x), 0);
        const subs = both.map((x) => {
          const cls = x.short === 'entladen' ? 'discharge-text' : x.short === 'geladen' ? 'charge-text' : x.short === 'Bezug' ? 'import-text' : 'export-text';
          return `<span class="sub-item ${cls}">${fmtEnergy(this.#total(x))} ${esc(x.short)}</span>`;
        }).join('');
        html.push(`<ha-card class="ha-tile"><div class="tile-content">
          <div class="tile-icon-container" style="--icon-color: ${color}; --icon-bg: color-mix(in srgb, ${color} 18%, transparent);">
            <ha-icon icon="${s.icon}"></ha-icon>
          </div>
          <div class="tile-info">
            <div class="tile-title">${esc(PAIR_NAMES[s.pair])}</div>
            <div class="tile-value">${fmtEnergy(total)}</div>
            <div class="tile-subtitle">${subs}</div>
          </div>
        </div></ha-card>`);
        continue;
      }
      html.push(`<ha-card class="ha-tile"><div class="tile-content">
        <div class="tile-icon-container" style="--icon-color: ${color}; --icon-bg: color-mix(in srgb, ${color} 18%, transparent);">
          <ha-icon icon="${s.icon}"></ha-icon>
        </div>
        <div class="tile-info">
          <div class="tile-title">${esc(s.label)}</div>
          <div class="tile-value">${fmtEnergy(this.#total(s))}</div>
        </div>
      </div></ha-card>`);
    }
    this.#els.grid.innerHTML = html.join('');
  }
}

const SCHEMA = [{ name: 'title', selector: sel.text() }];
const LABELS = { title: 'Überschrift' };
class WueflEnergyTilesCardEditor extends WueflFormEditor { schema = SCHEMA; labels = LABELS; }

customElements.define('wuefl-energy-tiles-card', WueflEnergyTilesCard);
customElements.define('wuefl-energy-tiles-card-editor', WueflEnergyTilesCardEditor);

registerCard({
  type: 'wuefl-energy-tiles-card',
  name: 'wuefl Kennzahlen',
  description: 'Tageswerte als HA-Kacheln — folgt dem Zeitraum der Energie-Ansicht.',
});
