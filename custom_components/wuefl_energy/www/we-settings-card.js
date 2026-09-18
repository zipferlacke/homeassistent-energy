/**
 * we-settings-card.js
 * Die Regeln, die für die ganze Anlage gelten — nicht je Wallbox.
 */

import {
  adoptSheet, num, icon, esc,
  registerCard, centralConfig, mergeConfig, entityIds, statesChanged,
  isReadOnly, applyReadOnly, rawConfig, saveConfig,
  COLORS, WueflFormEditor, sel, GRID_CSS,
} from './we-shared.js';

const CSS = `
.card {
  ${GRID_CSS}
  gap: .2rem;
}

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
      text-align: right; width: 3.2rem;
      &:focus { outline: none; }
      &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { appearance: none; margin: 0; }
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

.choice {
  background: var(--w-bg-soft); border-radius: var(--w-radius); display: grid; gap: 3px;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); margin-top: .5rem; padding: 3px;
  & .btn {
    background: transparent; border-radius: calc(var(--w-radius) - 3px);
    font-size: var(--w-fs-sm); height: auto; padding: .55rem .5rem; text-align: center;
    &:hover { background: var(--w-bg-hover); }
    &[aria-pressed="true"] { background: var(--w-accent); box-shadow: 0 1px 3px rgb(0 0 0 / .2); color: var(--w-on-accent); }
  }
}

.link {
  align-items: center; display: flex; gap: .5rem; justify-content: space-between; width: 100%;
  & ha-icon { --mdc-icon-size: 20px; }
}

.hint { color: var(--w-text-soft); font-size: var(--w-fs-sm); line-height: 1.5; margin: 0; }

.error-box { background: var(--error-color, #ff5252); color: #fff; padding: 1rem; border-radius: 8px; font-family: monospace; }
`;

function getEntity(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.entity) return val.entity;
  return null;
}

class WueflEnergySettingsCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #watch = [];
  #drag = null;
  #els = {};

  static getConfigElement() { return document.createElement('we-settings-card-editor'); }
  static getStubConfig() { return { }; }

  setConfig(config) {
    try {
      this.#own = config ?? {};
      this.#apply();
    } catch (err) {
      this.#renderError('setConfig', err);
    }
  }

  set hass(hass) {
    try {
      const first = !this.#hass;
      const prev = this.#hass;
      this.#hass = hass;
      if (first) {
        this.#loadCentral();
        window.addEventListener('we-config-changed', () => this.#loadCentral());
      }
      if (first || statesChanged(prev, hass, this.#watch)) this.#update();
    } catch (err) {
      this.#renderError('set hass', err);
    }
  }

  getCardSize() { return 6; }

  #renderError(step, err) {
    console.error(`🚨 [we-settings-card] Crash in ${step}:`, err);
    this.innerHTML = `<div class="error-box">
      <strong>🚨 Systemabsturz in we-settings-card (${step})</strong><br><br>
      <div style="white-space: pre-wrap; font-size: 12px;">${err.stack || err.message || err}</div>
    </div>`;
  }

  async #loadCentral() {
    try {
      const all = await centralConfig(this.#hass);
      // Pfade wie in specs.py (config_path) – dort steht entweder der Helfer
      // der Integration oder die Entität, die der Nutzer stattdessen gewählt hat.
      const rules = all.wallboxes_config ?? {};
      // Preise nur als Regler zeigen, wenn es ein einstellbarer Festpreis ist –
      // ein echter Tarif-Sensor lässt sich nicht verstellen.
      const adjustable = (id) => (/^(number|input_number)\./.test(id ?? '') ? id : null);

      this.#central = {
        battery_use_entity: getEntity(rules.battery_ussage_charging),
        battery_reserve_entity: getEntity(rules.battery_ussage_limit_charging),
        battery_bad_weather_entity: getEntity(rules.charge_battery_bad_weather),
        priority_entity: getEntity(rules.priority_charging),
        price_limit_entity: getEntity(rules.price_limit_charging),
        price_import_entity: adjustable(getEntity(all.grid?.price_import)),
        price_export_entity: adjustable(getEntity(all.grid?.price_export)),
        wallbox_count: (all.wallboxes ?? []).length,
        read_only: !!all.settings?.read_only,
      };

      this.#apply();
      this.#update();
    } catch (err) {
      this.#renderError('loadCentral', err);
    }
  }

  #apply() {
    this.#config = { ... mergeConfig(this.#central, this.#own) };
    this.#watch = entityIds(this.#config);
    this.#built = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
    this.#build();
  }

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'settings');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2></h2>

      <div class="group grid-prices" hidden>
        <h3>Stromtarife</h3>
        <div class="row priceImport" hidden>
          <div class="head"><span class="label">Strompreis Bezug (Fix)</span></div>
          <div class="control priceImport">
            <input type="range" min="0" max="100" step="1">
            <label class="num"><input type="number" min="0" max="100" step="1"><span>ct</span></label>
          </div>
        </div>
        <div class="row priceExport" hidden>
          <div class="head"><span class="label">Einspeisevergütung (Fix)</span></div>
          <div class="control priceExport">
            <input type="range" min="0" max="100" step="1">
            <label class="num"><input type="number" min="0" max="100" step="1"><span>ct</span></label>
          </div>
        </div>
      </div>

      <div class="group wallbox" hidden>
        <h3>Laderegeln Wallbox & Hausakku</h3>

        <div class="row use" hidden>
          <div class="head">
            <span class="label">Hausakku fürs Auto nutzen</span>
            <button class="switch switch-use" role="switch" aria-checked="false" type="button"><span></span></button>
          </div>
          <span class="note">Ohne Freigabe zieht das Auto nur Sonne und Netzstrom, die Batterie bleibt dem Haus vorbehalten.</span>
          <div class="reserve-block" hidden>
            <span class="sublabel">Akku nutzen bis</span>
            <div class="control reserve">
              <input type="range" min="0" max="100" step="5">
              <label class="num"><input type="number" min="0" max="100" step="5"><span>%</span></label>
            </div>
            <span class="note">Darunter bleibt der Hausakku fürs Haus reserviert.</span>
          </div>
        </div>

        <div class="row bad-weather" hidden>
          <div class="head">
            <span class="label">Hausakku Netzladung (Schlechtwetter & Billigstrom)</span>
            <button class="switch switch-bad-weather" role="switch" aria-checked="false" type="button"><span></span></button>
          </div>
          <span class="note">Erlaubt das Netzladen des Hausakkus, wenn der Strompreis günstig und die Solarprognose niedrig ist.</span>
        </div>

        <div class="row limit" hidden>
          <div class="head"><span class="label">Netzstrom nutzen bis</span></div>
          <div class="control limit">
            <input type="range" min="0" max="100" step="1">
            <label class="num"><input type="number" min="0" max="100" step="1"><span>ct</span></label>
          </div>
          <span class="note">Gilt im Lademodus mit günstigem Strom. Liegt der Börsenpreis darüber, wartet die Wallbox auf Sonne.</span>
        </div>
      </div>

      <div class="group general" hidden>
        <h3>Allgemeine Laderegeln</h3>
        <div class="row prio">
          <div class="head"><span class="label">Hausakku zuerst oder Auto zuerst</span></div>
          <div class="choice"></div>
          <span class="note">Wohin der Sonnenüberschuss zuerst geht, wenn Batterie und Auto beide Bedarf haben.</span>
        </div>
      </div>

      <div class="group access">
        <h3>Zugriff</h3>
        <div class="row">
          <div class="head">
            <span class="label">Nur lesen</span>
            <button class="switch switch-ro" role="switch" aria-checked="false" type="button"><span></span></button>
          </div>
          <span class="note ro-note">Sperrt alle Regler, Schalter und die Zuordnung in diesem Dashboard – zum Weitergeben an andere. Die Automation regelt weiter.</span>
        </div>
      </div>

      <div class="group">
        <h3>Home Assistant Entitäten zuordnen</h3>
        <button type="button" class="btn open-config">
          <span class="link"><span>Zuordnung öffnen</span>${icon('mdi:chevron-right')}</span>
        </button>
        <p class="hint" style="margin-top:.6rem">Welche Entität wofür steht — Netz, Solaranlage, Batterie, Wallboxen und Fahrzeuge.</p>
      </div>

      <p class="hint empty" hidden>Sobald du in der Zuordnung eine Wallbox anlegst, erscheinen hier automatisch die Laderegler — die Helfer dafür legt die Integration selbst an, ohne dass du etwas zuordnen musst.</p>
    `;
    root.appendChild(card);

    const q = (x) => card.querySelector(x);
    this.#els = {
      card,
      title: q('h2'),
      gridPrices: q('.group.grid-prices'),
      priceImportRow: q('.row.priceImport'),
      priceImportRange: q('.control.priceImport input[type="range"]'),
      priceImportNum: q('.control.priceImport input[type="number"]'),
      priceExportRow: q('.row.priceExport'),
      priceExportRange: q('.control.priceExport input[type="range"]'),
      priceExportNum: q('.control.priceExport input[type="number"]'),
      wallbox: q('.group.wallbox'), general: q('.group.general'),
      use: q('.row.use'), useSwitch: q('.switch-use'),
      badWeatherRow: q('.row.bad-weather'), badWeatherSwitch: q('.switch-bad-weather'),
      reserveBlock: q('.reserve-block'),
      reserveRange: q('.control.reserve input[type="range"]'),
      reserveNum: q('.control.reserve input[type="number"]'),
      limit: q('.row.limit'),
      limitRange: q('.control.limit input[type="range"]'),
      limitNum: q('.control.limit input[type="number"]'),
      prio: q('.row.prio'), choice: q('.choice'),
      empty: q('.hint.empty'),
    };

    this.#els.roSwitch = q('.switch-ro');
    this.#els.roNote = q('.ro-note');
    this.#els.roSwitch.addEventListener('click', () => {
      this.#setReadOnly(this.#els.roSwitch.getAttribute('aria-checked') !== 'true');
    });

    this.#els.useSwitch?.addEventListener('click', () => {
      const on = this.#els.useSwitch.getAttribute('aria-checked') === 'true';
      this.#toggle(this.#config.battery_use_entity, !on);
    });

    this.#els.badWeatherSwitch?.addEventListener('click', () => {
      const on = this.#els.badWeatherSwitch.getAttribute('aria-checked') === 'true';
      this.#toggle(this.#config.battery_bad_weather_entity, !on);
    });

    for (const [key, cfgKey] of [
      ['reserve', 'battery_reserve_entity'],
      ['limit', 'price_limit_entity'],
      ['priceImport', 'price_import_entity'],
      ['priceExport', 'price_export_entity']
    ]) {
      const range = this.#els[`${key}Range`];
      const numIn = this.#els[`${key}Num`];

      if(range && numIn) {
        range.addEventListener('input', () => { this.#drag = key; numIn.value = range.value; });
        range.addEventListener('change', () => { this.#drag = null; this.#setNumber(this.#config[cfgKey], Number(range.value)); });
        numIn.addEventListener('input', () => { this.#drag = key; });
        numIn.addEventListener('change', () => {
          this.#drag = null;
          const v = Math.min(Number(numIn.max), Math.max(Number(numIn.min), Number(numIn.value)));
          numIn.value = v; range.value = v; this.#setNumber(this.#config[cfgKey], v);
        });
      }
    }

    const cfgBtn = q('.open-config');
    if (cfgBtn) {
      cfgBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('wuefl-open-config', { bubbles: true, composed: true }));
        try {
          const base = window.location.pathname.split('/').slice(0, 2).join('/');
          history.pushState(null, '', `${base}/zuordnung`);
          window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
        } catch { }
      });
    }

    this.#built = true;
    this.#update();
  }

  #domain(e) { return e ? e.split('.')[0] : null; }
  #setNumber(id, value) { const d = this.#domain(id); if (d && !isReadOnly()) this.#hass.callService(d, 'set_value', { entity_id: id, value }); }
  #toggle(id, on) { const d = this.#domain(id); if (d && !isReadOnly()) this.#hass.callService(d, on ? 'turn_on' : 'turn_off', { entity_id: id }); }
  #setOption(id, option) { const d = this.#domain(id); if (d && !isReadOnly()) this.#hass.callService(d, 'select_option', { entity_id: id, option }); }

  /** Nur-Lesen-Modus umschalten – landet in der Zuordnung, also nur für Admins. */
  async #setReadOnly(on) {
    if (!this.#hass?.user?.is_admin) return;
    const raw = await rawConfig(this.#hass);
    await saveConfig(this.#hass, { ...raw, settings: { ...(raw.settings ?? {}), read_only: on } });
  }

  #has(key) { return !!this.#config[key] && !!this.#hass.states[this.#config[key]]; }

  #syncControl(key, entityId, fallback) {
    const st = entityId ? this.#hass.states[entityId] : null;
    if (!st) return;

    const range = this.#els[`${key}Range`];
    const numIn = this.#els[`${key}Num`];
    if (!range || !numIn) return;

    const min = st.attributes.min ?? fallback.min;
    const max = st.attributes.max ?? fallback.max;
    const step = st.attributes.step ?? fallback.step;

    range.min = min; range.max = max; range.step = step;
    numIn.min = min; numIn.max = max; numIn.step = step;

    if (this.#drag !== key) {
      const v = num(this.#hass, entityId) ?? fallback.default;
      range.value = v; numIn.value = v;
    }
  }

  #update() {
    try {
      if (!this.#built) { this.#build(); return; }
      if (!this.#hass) return;
      const c = this.#config;
      const h = this.#hass;

      applyReadOnly(this);
      const admin = !!h.user?.is_admin;
      this.#els.roSwitch.setAttribute('aria-checked', String(!!c.read_only));
      this.#els.roSwitch.disabled = !admin;
      this.#els.roSwitch.style.opacity = admin ? '' : '.55';
      this.#els.roNote.textContent = admin
        ? 'Sperrt alle Regler, Schalter und die Zuordnung in diesem Dashboard – zum Weitergeben an andere. Die Automation regelt weiter.'
        : 'Nur Administratoren können den Nur-Lese-Modus ändern.';

      const hasWallbox = (c.wallbox_count ?? 0) > 0;
      const hasUse = hasWallbox && this.#has('battery_use_entity');
      const hasReserve = hasWallbox && this.#has('battery_reserve_entity');
      const hasBadWeather = this.#has('battery_bad_weather_entity');
      const hasLimit = hasWallbox && this.#has('price_limit_entity');
      const hasPrio = hasWallbox && this.#has('priority_entity');
      
      const hasPriceImport = this.#has('price_import_entity');
      const hasPriceExport = this.#has('price_export_entity');

      if (this.#els.gridPrices) this.#els.gridPrices.hidden = !hasPriceImport && !hasPriceExport;
      if (this.#els.priceImportRow) this.#els.priceImportRow.hidden = !hasPriceImport;
      if (hasPriceImport) this.#syncControl('priceImport', c.price_import_entity, { min: 0, max: 100, step: 1, default: 33 });

      if (this.#els.priceExportRow) this.#els.priceExportRow.hidden = !hasPriceExport;
      if (hasPriceExport) this.#syncControl('priceExport', c.price_export_entity, { min: 0, max: 100, step: 1, default: 8 });

      if (this.#els.use) this.#els.use.hidden = !hasUse;
      let useOn = false;
      if (hasUse) {
        useOn = h.states[c.battery_use_entity].state === 'on';
        if (this.#els.useSwitch) this.#els.useSwitch.setAttribute('aria-checked', String(useOn));
      }

      const showReserve = hasReserve && useOn;
      if (this.#els.reserveBlock) this.#els.reserveBlock.hidden = !showReserve;
      if (showReserve) this.#syncControl('reserve', c.battery_reserve_entity, { min: 0, max: 100, step: 5, default: 20 });

      if (this.#els.badWeatherRow) this.#els.badWeatherRow.hidden = !hasBadWeather;
      if (hasBadWeather) {
        const bwOn = h.states[c.battery_bad_weather_entity].state === 'on';
        if (this.#els.badWeatherSwitch) this.#els.badWeatherSwitch.setAttribute('aria-checked', String(bwOn));
      }

      if (this.#els.limit) this.#els.limit.hidden = !hasLimit;
      if (hasLimit) this.#syncControl('limit', c.price_limit_entity, { min: 0, max: 100, step: 1, default: 30 });

      if (this.#els.wallbox) this.#els.wallbox.hidden = !hasUse && !hasLimit && !hasBadWeather;
      if (this.#els.general) this.#els.general.hidden = !hasPrio;
      if (hasPrio) this.#renderChoice(h.states[c.priority_entity]);

      if (this.#els.empty) this.#els.empty.hidden = hasUse || hasLimit || hasPrio || hasPriceImport || hasPriceExport || hasBadWeather;
    } catch (err) {
      this.#renderError('update', err);
    }
  }

  #renderChoice(state) {
    if (!state) return;
    const options = state.attributes.options ?? [];
    const sig = options.join('|');
    const box = this.#els.choice;
    if (!box) return;

    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.replaceChildren();
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn'; btn.dataset.option = opt; btn.textContent = esc(opt);
        btn.addEventListener('click', () => this.#setOption(this.#config.priority_entity, opt));
        box.appendChild(btn);
      }
    }
    for (const btn of box.children) {
      btn.setAttribute('aria-pressed', String(btn.dataset.option === state.state));
    }
  }
}

const SCHEMA = [];
const LABELS = {};

class WueflEnergySettingsCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('we-settings-card', WueflEnergySettingsCard);
customElements.define('we-settings-card-editor', WueflEnergySettingsCardEditor);

registerCard({
  type: 'we-settings-card',
  name: 'WEnergy Einstellungen',
  description: 'Laderegeln für alle Wallboxen und der Weg zur Zuordnung.',
});