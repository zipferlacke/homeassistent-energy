/**
 * wuefl-energy-settings-card
 * Die Regeln, die für die ganze Anlage gelten — nicht je Wallbox.
 *
 * Hausakku-Freigabe, Speicherreserve, Priorität bei Überschuss und die
 * Preisgrenze für Netzstrom standen vorher in jeder Wallbox-Karte. Bei
 * zwei Fahrzeugen gab es sie dann doppelt, obwohl es nur einen Hausakku
 * gibt. Hier stehen sie einmal.
 */

import {
  adoptSheet, num, icon, esc,
  registerCard, centralConfig, mergeConfig, entityIds, statesChanged,
  COLORS, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

const CSS = `
.card { display: flex; flex-direction: column; gap: .2rem; }

.group {
  margin-top: 1.3rem;

  &:first-of-type { margin-top: .4rem; }
  & > h3 { color: var(--w-text-soft); font-size: var(--w-fs-sm); font-weight: 600;
           letter-spacing: .06em; margin-bottom: .7rem; text-transform: uppercase; }
}

.row {
  & + .row { margin-top: 1.1rem; }
  & .head { align-items: center; display: flex; gap: .75rem; justify-content: space-between; }
  & .label { font-weight: 500; }
  & .sublabel { display: block; font-size: var(--w-fs-sm); font-weight: 500; margin: .8rem 0 0; }
  & .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); line-height: 1.45; }
}

/* Regler und Zahlenfeld nebeneinander: ziehen für ungefähr, tippen für genau. */
.control {
  align-items: center;
  display: flex;
  gap: .75rem;
  margin-top: .5rem;

  & input[type="range"] { accent-color: var(--w-accent); flex: 1 1 auto; min-width: 5rem; }
  & .num {
    align-items: center; background: var(--w-bg-soft); border-radius: var(--w-radius);
    display: flex; flex: 0 0 auto; gap: .2rem; padding: 0 .55rem;

    & input {
      background: none; border: 0; color: inherit; font: inherit; font-weight: 600;
      font-variant-numeric: tabular-nums; height: var(--w-input-h); padding: 0;
      text-align: right; width: 3rem;
      &:focus { outline: none; }
      &::-webkit-outer-spin-button, &::-webkit-inner-spin-button {
        appearance: none; margin: 0;
      }
      appearance: textfield;
    }
    & span { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
    &:focus-within { outline: 2px solid var(--w-accent); outline-offset: 1px; }
  }
}

.switch {
  background: var(--w-line); border: 0; border-radius: 999px; cursor: pointer;
  flex: 0 0 auto; height: 1.6rem; padding: .15rem; width: 2.9rem;

  & span { background: #fff; border-radius: 50%; display: block; height: 1.3rem;
           transition: transform .2s ease; width: 1.3rem; }
  &:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 2px; }
  &[aria-checked="true"] { background: ${COLORS.battery_out}; & span { transform: translateX(1.3rem); } }
}

/* Auswahl im Stil der Home-Assistant-Bedienelemente. */
.choice {
  background: var(--w-bg-soft);
  border-radius: var(--w-radius);
  display: grid; gap: 3px;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  margin-top: .5rem; padding: 3px;

  & .btn {
    background: transparent; border-radius: calc(var(--w-radius) - 3px);
    font-size: var(--w-fs-sm); height: auto; padding: .55rem .5rem; text-align: center;

    &:hover { background: var(--w-bg-hover); }
    &[aria-pressed="true"] {
      background: var(--w-accent); box-shadow: 0 1px 3px rgb(0 0 0 / .2);
      color: var(--w-on-accent);
    }
  }
}

.link {
  align-items: center; display: flex; gap: .5rem; justify-content: space-between;
  width: 100%;
  & ha-icon { --mdc-icon-size: 20px; }
}

.hint { color: var(--w-text-soft); font-size: var(--w-fs-sm); line-height: 1.5; margin: 0; }
`;


class WueflEnergySettingsCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #watch = [];
  #drag = null;
  #els = {};

  static getConfigElement() { return document.createElement('wuefl-energy-settings-card-editor'); }
  static getStubConfig() { return { title: 'Einstellungen' }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#apply();
  }

  set hass(hass) {
    const first = !this.#hass;
    const prev = this.#hass;
    this.#hass = hass;
    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
    }
    if (first || statesChanged(prev, hass, this.#watch)) this.#update();
  }

  getCardSize() { return 6; }

  async #loadCentral() {
    const all = await centralConfig(this.#hass);
    // Die Regeln stehen im Abschnitt "Anlage", der Preis beim Strompreis.
    this.#central = {
      ...(all.rules ?? {}),
      wallbox_count: (all.wallboxes ?? []).length,
    };
    this.#apply();
    this.#update();
  }

  #apply() {
    this.#config = { title: 'Einstellungen', ...mergeConfig(this.#central, this.#own) };
    this.#watch = entityIds(this.#config);
    this.#built = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
  }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'settings');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2></h2>

      <div class="group wallbox" hidden>
        <h3>Laderegeln Wallbox</h3>

        <div class="row use" hidden>
          <div class="head">
            <span class="label">Hausakku fürs Auto nutzen</span>
            <button class="switch" role="switch" aria-checked="false" type="button"><span></span></button>
          </div>
          <span class="note">Ohne Freigabe zieht das Auto nur Sonne und Netzstrom,
            der Speicher bleibt dem Haus vorbehalten.</span>
          <div class="reserve-block" hidden>
            <span class="sublabel">Akku nutzen bis</span>
            <div class="control reserve">
              <input type="range" min="0" max="100" step="5">
              <label class="num"><input type="number" min="0" max="100" step="5"><span>%</span></label>
            </div>
            <span class="note">Darunter bleibt der Hausakku fürs Haus reserviert.</span>
          </div>
        </div>

        <div class="row limit" hidden>
          <div class="head"><span class="label">Netzstrom nutzen bis</span></div>
          <div class="control">
            <input type="range" min="0" max="60" step="1">
            <label class="num"><input type="number" min="0" max="60" step="0.1"><span>ct</span></label>
          </div>
          <span class="note">Gilt im Lademodus mit günstigem Strom. Liegt der Börsenpreis
            darüber, wartet die Wallbox auf Sonne.</span>
        </div>
      </div>

      <div class="group general" hidden>
        <h3>Allgemeine Laderegeln</h3>
        <div class="row prio">
          <div class="head"><span class="label">Hausakku zuerst oder Auto zuerst</span></div>
          <div class="choice"></div>
          <span class="note">Wohin der Sonnenüberschuss zuerst geht, wenn Speicher und
            Auto beide Bedarf haben.</span>
        </div>
      </div>

      <div class="group">
        <h3>Home Assistant Entitäten zuordnen</h3>
        <button type="button" class="btn open-config">
          <span class="link">
            <span>Zuordnung öffnen</span>
            ${icon('mdi:chevron-right')}
          </span>
        </button>
        <p class="hint" style="margin-top:.6rem">Welche Entität wofür steht — Netz,
          Solaranlage, Speicher, Wallboxen und Fahrzeuge.</p>
      </div>

      <p class="hint empty" hidden>Sobald du in der Zuordnung eine Wallbox anlegst,
        erscheinen hier automatisch die Laderegler — die Helfer dafür legt die
        Integration selbst an, ohne dass du etwas zuordnen musst.</p>
    `;
    root.appendChild(card);

    const q = (x) => card.querySelector(x);
    this.#els = {
      card,
      title: q('h2'),
      wallbox: q('.group.wallbox'), general: q('.group.general'),
      use: q('.row.use'), useSwitch: q('.switch'),
      reserveBlock: q('.reserve-block'),
      reserveRange: q('.control.reserve input[type="range"]'),
      reserveNum: q('.control.reserve input[type="number"]'),
      limit: q('.row.limit'),
      limitRange: q('.row.limit input[type="range"]'),
      limitNum: q('.row.limit input[type="number"]'),
      prio: q('.row.prio'), choice: q('.choice'),
      empty: q('.hint.empty'),
    };

    this.#els.useSwitch.addEventListener('click', () => {
      const on = this.#els.useSwitch.getAttribute('aria-checked') === 'true';
      this.#toggle(this.#config.battery_use_entity, !on);
    });

    // Regler und Zahlenfeld halten sich gegenseitig aktuell. Gesendet wird
    // beim Loslassen beziehungsweise beim Verlassen des Feldes.
    for (const [key, cfgKey] of [
      ['reserve', 'battery_reserve_entity'],
      ['limit', 'price_limit_entity'],
    ]) {
      const range = this.#els[`${key}Range`];
      const numIn = this.#els[`${key}Num`];

      range.addEventListener('input', () => {
        this.#drag = key;
        numIn.value = range.value;
      });
      range.addEventListener('change', () => {
        this.#drag = null;
        this.#setNumber(this.#config[cfgKey], Number(range.value));
      });
      numIn.addEventListener('input', () => { this.#drag = key; });
      numIn.addEventListener('change', () => {
        this.#drag = null;
        const v = Math.min(Number(numIn.max), Math.max(Number(numIn.min), Number(numIn.value)));
        numIn.value = v;
        range.value = v;
        this.#setNumber(this.#config[cfgKey], v);
      });
    }

    q('.open-config').addEventListener('click', () => {
      // Eigenes Ereignis zuerst: darauf kann jede Umgebung reagieren, auch
      // eine, in der history.pushState blockiert ist (z. B. eine
      // sandboxte Vorschau).
      this.dispatchEvent(new CustomEvent('wuefl-open-config', { bubbles: true, composed: true }));
      try {
        const base = window.location.pathname.split('/').slice(0, 2).join('/');
        history.pushState(null, '', `${base}/zuordnung`);
        window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
      } catch {
        // Sandboxte Umgebungen verweigern die History-API mit einem
        // SecurityError – das eigene Ereignis oben deckt diesen Fall ab.
      }
    });

    this.#built = true;
    this.#update();
  }

  /* ------------------------------ Dienste --------------------------- */

  #domain(e) { return e ? e.split('.')[0] : null; }

  #setNumber(id, value) {
    const d = this.#domain(id);
    if (!d) return;
    this.#hass.callService(d === 'number' ? 'number' : 'input_number', 'set_value', {
      entity_id: id, value,
    });
  }

  #toggle(id, on) {
    const d = this.#domain(id);
    if (!d) return;
    this.#hass.callService(d, on ? 'turn_on' : 'turn_off', { entity_id: id });
  }

  #setOption(id, option) {
    const d = this.#domain(id);
    if (!d) return;
    this.#hass.callService(d === 'select' ? 'select' : 'input_select', 'select_option', {
      entity_id: id, option,
    });
  }

  /* ------------------------------ Anzeige --------------------------- */

  #has(key) {
    const id = this.#config[key];
    return !!id && !!this.#hass.states[id];
  }

  #update() {
    if (!this.#built) { this.#build(); return; }
    if (!this.#hass) return;
    const c = this.#config;
    const h = this.#hass;

    this.#els.title.textContent = c.title ?? 'Einstellungen';

    // Gibt es keine Wallbox, ergeben Laderegeln keinen Sinn — dann bleibt
    // der ganze Block weg statt tote Regler zu zeigen.
    const hasWallbox = (c.wallbox_count ?? 0) > 0;
    const hasUse = hasWallbox && this.#has('battery_use_entity');
    const hasReserve = hasWallbox && this.#has('battery_reserve_entity');
    const hasLimit = hasWallbox && this.#has('price_limit_entity');
    const hasPrio = hasWallbox && this.#has('priority_entity');

    this.#els.use.hidden = !hasUse;
    let useOn = false;
    if (hasUse) {
      useOn = h.states[c.battery_use_entity].state === 'on';
      this.#els.useSwitch.setAttribute('aria-checked', String(useOn));
    }

    // Die Reserve steuert nur etwas, solange das Auto an den Speicher darf.
    const showReserve = hasReserve && useOn;
    this.#els.reserveBlock.hidden = !showReserve;
    if (showReserve && this.#drag !== 'reserve') {
      const v = num(h, c.battery_reserve_entity) ?? 0;
      this.#els.reserveRange.value = v;
      this.#els.reserveNum.value = v;
    }

    this.#els.limit.hidden = !hasLimit;
    if (hasLimit && this.#drag !== 'limit') {
      const v = num(h, c.price_limit_entity) ?? 0;
      this.#els.limitRange.value = v;
      this.#els.limitNum.value = v;
    }

    this.#els.wallbox.hidden = !hasUse && !hasLimit;
    this.#els.general.hidden = !hasPrio;
    if (hasPrio) this.#renderChoice(h.states[c.priority_entity]);

    this.#els.empty.hidden = hasUse || hasLimit || hasPrio;
  }

  #renderChoice(state) {
    const options = state.attributes.options ?? [];
    const sig = options.join('|');
    const box = this.#els.choice;

    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.replaceChildren();
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.dataset.option = opt;
        btn.textContent = esc(opt);
        btn.addEventListener('click', () => this.#setOption(this.#config.priority_entity, opt));
        box.appendChild(btn);
      }
    }
    for (const btn of box.children) {
      btn.setAttribute('aria-pressed', String(btn.dataset.option === state.state));
    }
  }
}

/* -------------------------------------------------------------------- */

const SCHEMA = [
  { name: 'title', selector: sel.text() },
  {
    type: 'expandable', name: '', title: 'Abweichend von der zentralen Zuordnung',
    schema: [
      { name: 'battery_use_entity', selector: sel.pick(['switch', 'input_boolean']) },
      { name: 'battery_reserve_entity', selector: sel.pick(['number', 'input_number']) },
      { name: 'priority_entity', selector: sel.pick(['select', 'input_select']) },
      { name: 'price_limit_entity', selector: sel.pick(['number', 'input_number']) },
    ],
  },
];

const LABELS = {
  title: 'Überschrift',
  battery_use_entity: 'Freigabe: aus Hausakku laden',
  battery_reserve_entity: 'Speicher nutzen bis … %',
  priority_entity: 'Priorität bei Überschuss',
  price_limit_entity: 'Preisgrenze fürs Laden',
};

class WueflEnergySettingsCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-energy-settings-card', WueflEnergySettingsCard);
customElements.define('wuefl-energy-settings-card-editor', WueflEnergySettingsCardEditor);

registerCard({
  type: 'wuefl-energy-settings-card',
  name: 'wuefl Einstellungen',
  description: 'Laderegeln für alle Wallboxen und der Weg zur Zuordnung.',
});
