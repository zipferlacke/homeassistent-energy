/**
 * we-grid-container
 * Light-DOM Version (KEIN Shadow-DOM). 
 * Nutzt das normale DOM, damit HA-Themes und Styles automatisch vererbt werden.
 */
class WueflEnergyGridContainer extends HTMLElement {
  #hass = null;
  #cardElements = [];
  #config = {};
  #rendered = false;

  setConfig(config) {
    this.#config = config || {};
    this.#buildCards();
  }

  async #buildCards() {
    const rawCards = this.#config.cards || [];
    const helpers = await window.loadCardHelpers?.();

    this.#cardElements = rawCards.map((c) => {
      let el;
      if (helpers) {
        el = helpers.createCardElement(c);
      } else {
        const tag = c.type?.startsWith('custom:') ? c.type.slice(7) : `hui-${c.type}-card`;
        el = document.createElement(tag);
        el.setConfig?.(c);
      }
      return { el, slot: c.slot || 'default' };
    });

    // 1. Zuerst das normale DOM aufbauen
    this.#render();

    // 2. Jetzt, wo sie auf der Seite existieren, die Daten (hass) weitergeben
    if (this.#hass) {
      this.#cardElements.forEach(({ el }) => {
        el.hass = this.#hass;
      });
    }
  }

  set hass(hass) {
    this.#hass = hass;
    this.#cardElements.forEach(({ el }) => { el.hass = hass; });
  }

  #render() {
    // Verhindert, dass das Grid bei jedem Update neu gezeichnet wird
    if (this.#rendered) return; 

    const gap = this.#config.gap || '16px';
    const maxWidth = this.#config.maxWidth || '1400px';
    const views = this.#config.views || [];

    const mediaQueriesCss = views.map((v) => {
      const conditions = [];
      if (v.min) conditions.push(`(min-width: ${typeof v.min === 'number' ? v.min + 'px' : v.min})`);
      if (v.max) conditions.push(`(max-width: ${typeof v.max === 'number' ? v.max + 'px' : v.max})`);

      const queryHeader = conditions.length ? `@media ${conditions.join(' and ')}` : '';
      const cleanAreas = v.areas ? v.areas.trim().split('\n').map(line => line.trim()).join(' ') : '';

      // WICHTIG: Das CSS ist jetzt auf das Tag beschränkt, damit es global nichts zerstört
      const rules = `
        we-grid-container .grid-container {
          ${v.columns ? `grid-template-columns: ${v.columns};` : ''}
          ${v.rows ? `grid-template-rows: ${v.rows};` : ''}
          ${cleanAreas ? `grid-template-areas: ${cleanAreas};` : ''}
        }
      `;

      return queryHeader ? `${queryHeader} {\n${rules}\n}` : rules;
    }).join('\n');

    // DIREKT in this.innerHTML schreiben (kein attachShadow mehr!)
    this.innerHTML = `
      <style>
        we-grid-container {
          display: block;
          width: 100%;
          box-sizing: border-box;
        }
        we-grid-container .grid-wrapper {
          width: 100%;
          max-width: ${maxWidth};
          margin: 0 auto;
          padding: 0 16px;
          box-sizing: border-box;
        }
        we-grid-container .grid-container {
          display: grid;
          gap: ${gap};
          grid-template-columns: 1fr;
        }
        we-grid-container .area-group {
          display: flex;
          flex-direction: column;
          gap: ${gap};
        }
        we-grid-container .area-group > * {
          display: block;
          width: 100%;
          box-sizing: border-box;
        }
        ${mediaQueriesCss}
      </style>

      <div class="grid-wrapper">
        <div class="grid-container"></div>
      </div>
    `;

    // Jetzt nutzen wir querySelector auf 'this', da es im normalen DOM liegt
    const container = this.querySelector('.grid-container');

    const slots = {};
    this.#cardElements.forEach(({ el, slot }) => {
      if (!slots[slot]) slots[slot] = [];
      slots[slot].push(el);
    });

    Object.entries(slots).forEach(([slotName, elements]) => {
      const group = document.createElement('div');
      group.className = 'area-group';
      group.style.gridArea = slotName;
      elements.forEach((el) => group.appendChild(el));
      container.appendChild(group);
    });

    this.#rendered = true;
  }

  getCardSize() { return 3; }
}

if (!customElements.get('we-grid-container')) {
  customElements.define('we-grid-container', WueflEnergyGridContainer);
}