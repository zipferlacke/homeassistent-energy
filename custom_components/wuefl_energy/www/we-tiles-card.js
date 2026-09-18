/**
 * we-tiles-card
 * Nur die HA-Tile-Kacheln (Erzeugung/Batterie/Netz/Haushalt/Wallbox) —
 * eigener Abschnitt neben dem Hauptdiagramm, hört auf Zeitraum-Änderungen
 * von we-period-card, ohne diese Karte selbst zu kennen.
 */
import {
  asList, fmtEnergy, esc, registerCard, centralConfig, WueflFormEditor, sel,
  TILE_CSS, GRID_CSS, getPeriod, onPeriodChange, fetchStats, colorOf,
} from './we-shared.js';

const SERIES = [
  { key: 'pv_energy', label: 'Solar', color: (c) => colorOf('solar', asList(c.solar)[0]), icon: 'mdi:solar-power',
    getIds: (c) => asList(c.solar).map(s => s.total).filter(Boolean) },
  { key: 'battery_out', label: 'Batterie', color: (c) => colorOf('battery', asList(c.battery)[0]), icon: 'mdi:battery-high', pair: 'battery', short: 'entladen',
    getIds: (c) => asList(c.battery).map(b => b.out_total).filter(Boolean) },
  { key: 'battery_in', label: 'Batterie', color: (c) => colorOf('battery', asList(c.battery)[0], 0, 'color_in'), icon: 'mdi:battery-high', pair: 'battery', short: 'geladen',
    getIds: (c) => asList(c.battery).map(b => b.in_total).filter(Boolean) },
  { key: 'grid_import', label: 'Netz', color: (c) => colorOf('grid', c.grid), icon: 'mdi:transmission-tower', pair: 'grid', short: 'Bezug',
    getIds: (c) => asList(c.grid?.import_total).filter(Boolean) },
  { key: 'grid_export', label: 'Netz', color: (c) => colorOf('grid', c.grid, 0, 'color_export'), icon: 'mdi:transmission-tower', pair: 'grid', short: 'Einspeisung',
    getIds: (c) => asList(c.grid?.export_total).filter(Boolean) },
  { key: 'house_energy', label: 'Haushalt', color: (c) => colorOf('consumers', c.consumers), icon: 'mdi:home',
    getIds: (c) => asList(c.consumers?.total).filter(Boolean) },
  { key: 'wallbox_energy', label: 'Wallbox', color: (c) => colorOf('wallboxes', asList(c.wallboxes)[0]), icon: 'mdi:ev-station',
    getIds: (c) => asList(c.wallboxes).map(w => w.total).filter(Boolean) },
];
const PAIR_NAMES = { grid: 'Netz', battery: 'Batterie' };

const CSS = `
:host { display: block; }
.card { ${GRID_CSS} }
${TILE_CSS}
.ha-tile { min-height: auto; }
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

  static getConfigElement() { return document.createElement('we-tiles-card-editor'); }
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
      window.addEventListener('we-config-changed', () => this.#loadCentral());
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
    return SERIES.filter((s) => s.getIds(this.#config).length > 0);
  }

  async #refresh() {
    if (!this.#built || !this.#hass) return;
    const used = this.#used();
    if (!used.length) {
      this.#els.grid.innerHTML = '<div class="state">Noch keine Gesamtzähler zugeordnet.</div>';
      return;
    }
    const ids = used.flatMap((s) => s.getIds(this.#config));
    this.#stats = await fetchStats(this.#hass, ids, getPeriod(), ['change']);
    this.#render(used);
  }

  #stats = {};

  #total(s) {
    return s.getIds(this.#config).reduce(
      (a, id) => a + (this.#stats[id] ?? []).reduce((b, r) => b + (Number(r.change) || 0), 0), 0,
    );
  }

  #render(used) {
    const html = [];
    const seen = new Set();

    for (const s of used) {
      const color = s.color(this.#config);
      if (s.pair) {
        if (seen.has(s.pair)) continue;
        seen.add(s.pair);
        const both = used.filter((x) => x.pair === s.pair);
        const total = both.reduce((a, x) => a + this.#total(x), 0);
        const subs = both.map((x) => {
          const c = x.color(this.#config);
          return `<span class="sub-item" style="color: ${c}">${fmtEnergy(this.#total(x))} ${esc(x.short)}</span>`;
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

customElements.define('we-tiles-card', WueflEnergyTilesCard);
customElements.define('we-tiles-card-editor', WueflEnergyTilesCardEditor);

registerCard({
  type: 'we-tiles-card',
  name: 'wuefl Kennzahlen',
  description: 'Tageswerte als HA-Kacheln — folgt dem Zeitraum der Energie-Ansicht.',
});