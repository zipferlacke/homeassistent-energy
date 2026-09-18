/**
 * wuefl-wallbox-card.js
 * Eine Karte je Fahrzeug. Über `slot` wird bestimmt, welche der Wallboxen
 * aus der zentralen Zuordnung (we-config-card / specs.py) gezogen wird.
 */

import {
  adoptSheet, asList, power, energy, num, sum,
  fmtPower, fmtEnergy, fmtPercent, fmtPrice, fmtDuration, moreInfo,
  registerCard, priceInfo, centralConfig, mergeConfig, entityIds, statesChanged, pvOutlook, solarEta, fmtWhen,
  chargeState, CHARGE_STATES,
  esc, icon, COLORS, WueflFormEditor, sel, cssColor, TILE_CSS, tileHtml, GRID_CSS,
  applyColorVars, colorOf, navigateToView, TOGGLE_CSS,
} from './we-shared.js';
import './we-chart.js';

const PERIODS = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
];

/** Kalenderzeitraum, in dem "jetzt" liegt. */
function periodRange(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (key === 'week') {
    const monday = d - ((now.getDay() + 6) % 7);
    return [new Date(y, m, monday), new Date(y, m, monday + 6, 23, 59, 59, 999)];
  }
  if (key === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59, 999)];
  if (key === 'year') return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59, 999)];
  return [new Date(y, m, d), new Date(y, m, d, 23, 59, 59, 999)];
}

const MODE_KINDS = [
  { match: /aus|off|stop/i, icon: 'mdi:power', kind: 'off' },
  { match: /günstig|guenstig|preis|price|börse|boerse/i, icon: 'mdi:cash-clock', kind: 'mix' },
  { match: /solar|pv|überschuss|uberschuss/i, icon: 'mdi:white-balance-sunny', kind: 'solar' },
  { match: /schnell|fast|voll|boost/i, icon: 'mdi:flash', kind: 'fast' },
];

const modeInfo = (label) => MODE_KINDS.find((m) => m.match.test(label)) ?? { icon: 'mdi:tune', kind: 'other' };

function getEntity(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.entity) return val.entity;
  return null;
}

const CSS = `
${TILE_CSS}
${TOGGLE_CSS}
.history {
  margin-top: 1rem;
  & .hhead { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between; }
  & .htitle { font-weight: 600; }
  & .plot { height: 230px; margin: .3rem -8px 0; }
  /* Das Diagramm bringt ein eigenes ha-card mit – hier ohne zweiten Rahmen */
  & we-chart {
    --ha-card-background: transparent; --ha-card-border-width: 0; --ha-card-box-shadow: none;
    display: block; height: 100%;
  }
}
.card {
  ${GRID_CSS}
}
.top {
  & .head { align-items: center; display: flex; flex-wrap: wrap; gap: .6rem; }
  & .name { font-size: 1.35rem; font-weight: 600; line-height: 1.25; }
  & .badge {
    align-items: center;
    background: color-mix(in srgb, var(--badge-color, var(--w-text-soft)) 16%, transparent);
    border-radius: 999px;
    color: var(--badge-color, var(--w-text-soft));
    display: inline-flex; font-size: var(--w-fs-sm); font-weight: 600;
    gap: .3rem; padding: .2rem .6rem .2rem .45rem;
    & ha-icon { --mdc-icon-size: 16px; }
  }
  & .state { color: var(--w-text-soft); font-size: var(--w-fs-sm); margin-top: .1rem; }
}

.goalrow {
  align-items: baseline;
  display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between;
  margin-top: .85rem;

  & .left { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
  & .right { font-weight: 600; margin-left: auto; }
}

.track {
  background: var(--w-line);
  border-radius: 999px;
  height: .6rem;
  margin: .45rem 0 .3rem;
  position: relative;

  & .fill { background: ${COLORS.wallbox}; border-radius: 999px; height: 100%; transition: width .6s ease; }
  & .mark { background: var(--w-text); bottom: -.25rem; position: absolute; top: -.25rem; width: 2px; }
  & .mark.old { background: none; border-left: 2px dashed var(--w-text-soft); }
}

.scale {
  & .note { color: var(--w-text-soft); font-size: var(--w-fs-sm); line-height: 1.45; }
}

.modes {
  background: var(--secondary-background-color, rgba(127, 127, 127, .12));
  border-radius: 12px;
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  margin: .8rem 0;
  padding: 3px;

  & .btn {
    background: transparent;
    border-radius: 999px;
    color: var(--secondary-text-color, #727272);
    flex-direction: column; gap: .2rem; height: auto; padding: .6rem .4rem;
    transition: all .2s ease;

    & ha-icon { --mdc-icon-size: 22px; }
    & .txt { font-size: var(--w-fs-sm); font-weight: 500; line-height: 1.2; text-align: center; }
    &:hover { color: var(--primary-text-color, #212121); }
    &[aria-pressed="true"] {
      background: var(--card-background-color, #fff);
      box-shadow: 0 1px 3px rgb(0 0 0 / .12);
      color: var(--primary-text-color, #212121);
      font-weight: 600;
    }
  }
}

.target {
  align-items: center; display: flex; flex-wrap: wrap; gap: .6rem;

  & label { flex: 0 0 auto; font-size: var(--w-fs-sm); }
  & input[type="range"] { accent-color: var(--w-accent); flex: 1 1 6rem; }
  & output { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 3rem; text-align: right; }
  & .full { flex: 0 0 auto; font-size: var(--w-fs-sm); height: auto; padding: .4rem .8rem; }
}

/* Aufklapper und Hinweis kommen aus BASE_CSS (details.fold, .info) */
.card > .info { margin-top: .8rem; }

.slider {
  & + .slider { margin-top: .8rem; }
  & .line { display: flex; font-size: var(--w-fs-sm); justify-content: space-between; }
  & input[type="range"] { accent-color: var(--w-accent); margin-top: .25rem; width: 100%; }
  & output { font-variant-numeric: tabular-nums; font-weight: 600; }
  & .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); line-height: 1.45; }
}

.stats {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-top: .75rem;
}
`;

class WueflWallboxCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #built = false;
  #els = {};
  #watch = [];
  #drag = null;
  #period = 'day';
  #historyKey = '';

  static getConfigElement() { return document.createElement('wuefl-wallbox-card-editor'); }
  static getStubConfig() { return { wallbox: 1 }; }

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
      window.addEventListener('we-config-changed', () => this.#loadCentral());
    }
    if (first || statesChanged(prev, hass, this.#watch)) this.#update();
  }

  getCardSize() { return 9; }

  async #loadCentral() {
    const all = await centralConfig(this.#hass);
    // Welche Wallbox: "wallbox" (1-basiert) aus der Strategy, sonst ein
    // numerischer "slot" aus älteren, von Hand angelegten Karten.
    const index = Number(this.#own.wallbox ?? this.#own.slot) || 1;
    const wb = (all.wallboxes ?? [])[index - 1] ?? {};
    const rules = all.wallboxes_config ?? {};
    const more = wb.more ?? {};
    // Farben der Zuordnung, die Wallbox-Farbe von genau dieser Wallbox
    applyColorVars(this, all);
    this.style.setProperty('--w-wallbox', colorOf('wallboxes', wb, index - 1));
    this.#central = {
      ...wb,
      battery: all.battery,
      grid: all.grid,
      max_power: more.max_power_value,
      phases: more.phases_value,
      house_base_load: all.systemdata?.house_base_load,
      pv_forecast_entities: asList(all.solar).flatMap((s) => asList(s.forecast)),
      price_entity: all.grid?.price_import,
      price_limit_entity: rules.price_limit_charging,
    };
    this.#apply();
    this.#update();
  }

  #apply() {
    const merged = mergeConfig(this.#central, this.#own);

    // Kartenoptionen (…_entity) gewinnen, sonst die Felder der Zuordnung
    const car_soc = getEntity(merged.car_soc_entity ?? merged.car_percent);
    const target_soc = getEntity(merged.target_soc_entity ?? merged.charge_percent_limit);
    const mode = getEntity(merged.mode_entity ?? merged.charge_type);
    const power_ent = getEntity(merged.power_entity ?? merged.live);
    const status = getEntity(merged.status_entity ?? merged.status);
    const today = getEntity(merged.today_energy_entity ?? merged.total_session);
    const total = getEntity(merged.total_energy_entity ?? merged.total);
    // Ein Stromregler (A) nur, wenn die Karte ausdrücklich einen bekommt –
    // die Ladeleistung setzt sonst die Automation über send_power.
    const current = getEntity(merged.current_entity);
    const current_actual = getEntity(merged.current_actual_entity ?? merged.current_actual);
    const ignore_limit = getEntity(merged.ignore_percent_limit_entity ?? merged.ignore_percent_limit);

    this.#config = {
      name: 'Wallbox',
      capacity: 58,
      max_power: 11000,
      house_base_load: 400,
      ...merged,
      car_soc_entity: car_soc,
      target_soc_entity: target_soc,
      mode_entity: mode,
      power_entity: power_ent,
      status_entity: status,
      today_energy_entity: today,
      total_energy_entity: total,
      current_entity: current,
      current_actual_entity: current_actual,
      ignore_percent_limit_entity: ignore_limit,
    };
    this.#watch = entityIds(this.#config);
    this.#built = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
    this.#build();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'wallbox');
    this.#historyKey = ''; // neues Diagramm-Element → neu konfigurieren

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="top">
        <div class="head">
          <div class="name"></div>
          <div class="badge" hidden><ha-icon></ha-icon><span></span></div>
        </div>
        <div class="state"></div>
      </div>

      <div class="goalrow" hidden>
        <span class="left"></span>
        <span class="right"></span>
      </div>

      <div class="track" hidden>
        <div class="fill"></div>
        <div class="mark target"></div>
        <div class="mark old" hidden></div>
      </div>
      <div class="scale" hidden><span class="note"></span></div>

      <div class="modes"></div>

      <div class="target" hidden>
        <label for="tgt">Ladeziel</label>
        <input type="range" id="tgt" min="20" max="100" step="5">
        <output>–</output>
        <button type="button" class="btn full" aria-pressed="false">Einmalig 100 %</button>
      </div>

      <div class="history" hidden>
        <div class="hhead">
          <span class="htitle">Verlauf</span>
          <div class="time-buttons">
            ${PERIODS.map((p) => `<button type="button" class="time-btn" data-period="${p.key}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div class="plot"><we-chart></we-chart></div>
      </div>

      <details class="fold adv" hidden>
        <summary>
          <span class="ico">${icon('mdi:tune-variant')}</span>
          <span>Mehr Optionen</span>
          ${icon('mdi:chevron-down', 'class="chev"')}
        </summary>
        <div class="body">
          <div class="slider cur" hidden>
            <div class="line"><span>Maximaler Ladestrom</span><output>–</output></div>
            <input type="range">
            <span class="note">Gilt nur für diese Wallbox. Begrenzt den Strom pro Phase.</span>
          </div>
        </div>
      </details>

      <div class="stats"></div>

      <div class="info">
        ${icon('mdi:information-outline')}
        <div class="txt">Hausakku-Freigabe, Reserve und Preisgrenze gelten für alle Wallboxen –
          <button type="button" class="link open-settings">in den Einstellungen</button>.</div>
      </div>
      <div class="stats"></div>
    `;
    root.appendChild(card);

    const q = (s) => card.querySelector(s);
    this.#els = {
      card,
      name: q('.name'), state: q('.state'),
      track: q('.track'), fill: q('.fill'),
      markTarget: q('.mark.target'), markOld: q('.mark.old'),
      scale: q('.scale'),
      head: q('.head'), badge: q('.badge'),
      badgeIcon: q('.badge ha-icon'), badgeText: q('.badge span'),
      goalRow: q('.goalrow'), goalLeft: q('.goalrow .left'), goalRight: q('.goalrow .right'),
      scaleNote: q('.scale .note'),
      modes: q('.modes'),
      target: q('.target'), targetInput: q('.target input'), targetOut: q('.target output'), full: q('.full'),
      cur: q('.slider.cur'),
      adv: q('details.adv'),
      history: q('.history'), chart: q('we-chart'),
      periodBtns: [...card.querySelectorAll('.time-btn')],
      openSettings: q('.open-settings'),
      stats: q('.stats'),
    };

    this.#els.openSettings.addEventListener('click', () => navigateToView('einstellungen'));
    for (const btn of this.#els.periodBtns) {
      btn.addEventListener('click', () => {
        this.#period = btn.dataset.period;
        this.#renderHistory();
      });
    }

    this.#els.targetInput.addEventListener('input', () => {
      this.#drag = 'target';
      this.#els.targetOut.textContent = fmtPercent(Number(this.#els.targetInput.value));
    });
    this.#els.targetInput.addEventListener('change', () => {
      this.#drag = null;
      this.#setTargetSoc(Number(this.#els.targetInput.value));
    });

    this.#els.full.addEventListener('click', () => {
      const isIgnored = this.#isLimitIgnored();
      this.#toggle(this.#config.ignore_percent_limit_entity, !isIgnored);
    });

    for (const [key, cfgKey] of [['cur', 'current_entity']]) {
      const box = this.#els[key];
      const input = box.querySelector('input');
      const out = box.querySelector('output');
      input.addEventListener('input', () => {
        this.#drag = key;
        out.textContent = this.#sliderText(key, Number(input.value));
      });
      input.addEventListener('change', () => {
        this.#drag = null;
        this.#setNumber(this.#config[cfgKey], Number(input.value));
      });
    }

    this.#built = true;
    this.#update();
  }

  /* ------------------------------ Dienste --------------------------- */

  #domain(e) { return e ? e.split('.')[0] : null; }

  #setOption(id, option) {
    const d = this.#domain(id);
    if (d) this.#hass.callService(d, 'select_option', { entity_id: id, option });
  }

  #setNumber(id, value) {
    const d = this.#domain(id);
    if (d) this.#hass.callService(d, 'set_value', { entity_id: id, value });
  }

  #toggle(id, on) {
    const d = this.#domain(id);
    if (d) this.#hass.callService(d, on ? 'turn_on' : 'turn_off', { entity_id: id });
  }

  #isLimitIgnored() {
    const id = this.#config.ignore_percent_limit_entity;
    if (!id || !this.#hass?.states[id]) return false;
    return this.#hass.states[id].state === 'on';
  }

  #getTargetSoc() {
    const id = this.#config.target_soc_entity;
    if (!id) return null;
    const val = num(this.#hass, id);
    if (val === null) return null;
    const attr = this.#hass?.states?.[id]?.attributes;
    return (attr?.max <= 1 || val <= 1.0) ? Math.round(val * 100) : val;
  }

  #setTargetSoc(pctVal) {
    const id = this.#config.target_soc_entity;
    if (!id) return;
    const attr = this.#hass?.states?.[id]?.attributes;
    const sendVal = (attr?.max <= 1) ? pctVal / 100 : pctVal;
    this.#setNumber(id, sendVal);
  }

  #sliderText(key, v) {
    if (key === 'cur') {
      const u = this.#hass?.states?.[this.#config.current_entity]?.attributes?.unit_of_measurement ?? 'A';
      return `${v} ${u}`;
    }
    return fmtPercent(v);
  }

  /* ------------------------------ Prognose -------------------------- */

  #solarOutlook() {
    return pvOutlook(
      this.#hass,
      this.#config.pv_forecast_entities,
      this.#config.pv_forecast_attribute,
    );
  }

  #estimate(kind, needed, goal) {
    const c = this.#config;
    if (needed <= 0) return { main: `Ladeziel ${fmtPercent(goal)} erreicht`, left: '', note: '' };
    if (kind === 'off') return { main: '', left: '', note: '' };

    const at = (date, note) => ({
      main: `Ladeziel ${fmtPercent(goal)} ${fmtWhen(date)}`,
      left: `noch ${fmtDuration((date - Date.now()) / 3_600_000)}`,
      note,
    });
    const inHours = (hours, note) => {
      if (!Number.isFinite(hours) || hours <= 0) return { main: 'wird berechnet', left: '', note };
      return at(new Date(Date.now() + hours * 3_600_000), note);
    };

    const full = (c.max_power ?? 11000) / 1000;
    if (kind === 'fast') {
      return inHours(needed / full, `Zeit ist eine Prognose · volle Leistung, ${fmtPower(c.max_power ?? 11000)}`);
    }

    const baseW = typeof c.house_base_load === 'string'
      ? power(this.#hass, c.house_base_load)
      : c.house_base_load;
    const base = (baseW ?? 400) / 1000;

    const solar = () => solarEta(
      this.#hass, c.pv_forecast_entities, c.pv_forecast_attribute, base, needed,
    );
    const solarNote = 'Zeit ist eine Prognose aus Wetter und PV-Vorhersage';

    if (kind === 'mix') {
      const price = priceInfo(this.#hass, c, 'import').now;
      const limit = num(this.#hass, c.price_limit_entity);
      if (price !== null && limit !== null && price <= limit) {
        return inHours(needed / full, 'Zeit ist eine Prognose · lädt gerade mit Netzstrom');
      }
      const eta = solar();
      if (eta) return at(eta, `${solarNote} · Netzstrom ist gerade zu teuer`);
      return {
        main: `wartet auf ${limit !== null ? `${fmtPrice(limit)}/kWh` : 'günstigen Strom'}`,
        left: '',
        note: price !== null ? `aktuell ${fmtPrice(price)}/kWh, und die Sonne reicht nicht` : '',
      };
    }

    const eta = solar();
    if (eta) return at(eta, solarNote);

    const { rest, hours } = this.#solarOutlook();
    const surplus = hours ? rest / hours - base : 0;
    if (surplus > 0.2) {
      return {
        main: `heute etwa ${fmtEnergy(surplus * hours)}`,
        left: '',
        note: `${solarNote} — für das Ladeziel reicht die Vorhersage nicht weit genug`,
      };
    }
    return {
      main: 'kein Zeitpunkt absehbar',
      left: '',
      note: 'die Vorhersage deckt kaum mehr als den Grundverbrauch',
    };
  }

  /* ------------------------------ Anzeige --------------------------- */

  #update() {
    if (!this.#built || !this.#hass) return;
    const c = this.#config;
    const h = this.#hass;

    const soc = num(h, c.car_soc_entity);
    const isIgnored = this.#isLimitIgnored();
    const baseTarget = this.#getTargetSoc();
    const goal = isIgnored ? 100 : (baseTarget ?? 100);
    const pw = power(h, c.power_entity) ?? 0;

    const modeState = c.mode_entity ? h.states[c.mode_entity] : null;
    const kind = modeState ? modeInfo(modeState.state).kind : 'other';

    const state = chargeState(h, c.status_entity, c.status_map);
    this.#els.badge.hidden = state === null;
    if (state) {
      const info = CHARGE_STATES[state];
      this.#els.badge.style.setProperty('--badge-color', info.color);
      this.#els.badgeIcon.setAttribute('icon', info.icon);
      this.#els.badgeText.textContent = info.label;
    }

    this.#els.name.textContent =
      (c.name ?? 'Wallbox') + (soc === null ? '' : `, ${fmtPercent(soc)}`);

    const charging = state ? state === 'laedt' : pw > 50;

    /* Direkte Status-Text-Anzeige aus der Status-Entität */
    const rawStatusObj = c.status_entity ? h.states[c.status_entity] : null;
    const rawStatus = (rawStatusObj && rawStatusObj.state !== 'unknown' && rawStatusObj.state !== 'unavailable')
      ? rawStatusObj.state
      : null;

    let label;
    if (rawStatus) {
      // Text der Wallbox selbst (z. B. "Laden pausiert, durch HA"); "Alt: …"
      // heißt: Register gerade nicht lesbar, letzter bekannter Zustand
      label = rawStatus;
    } else if (c.status_entity && !rawStatusObj) {
      label = `Status-Sensor ${c.status_entity} nicht gefunden`;
    } else if (c.status_entity) {
      label = 'Status der Wallbox gerade nicht verfügbar';
    } else if (state === 'frei') label = 'kein Fahrzeug angeschlossen';
    else if (kind === 'off') label = 'Laden aus';
    else if (charging) label = 'lädt';
    else if (soc !== null && soc >= goal) label = 'Ladeziel erreicht';
    else if (state === 'fehler') label = 'Störung an der Wallbox';
    else label = 'angeschlossen, lädt nicht';

    const amps = this.#amps(pw);
    const today = energy(h, c.today_energy_entity);
    // Beim Laden Strom und Leistung zusätzlich zum Status der Wallbox
    this.#els.state.textContent = [
      rawStatus ?? (charging ? null : label),
      charging ? (amps !== null ? `${amps} · ${fmtPower(pw)}` : fmtPower(pw)) : null,
      today !== null ? `heute ${fmtEnergy(today)}` : null,
    ].filter(Boolean).join(' · ');

    const needed = soc === null ? 0 : ((goal - soc) / 100) * (c.capacity ?? 58);
    const est = (soc === null || state === 'frei')
      ? { main: '', left: '', note: '' }
      : this.#estimate(kind, needed, goal);
    this.#els.goalRow.hidden = !est.main && !est.left;
    this.#els.goalLeft.textContent = est.left ?? '';
    this.#els.goalRight.textContent = est.main ?? '';

    this.#els.track.hidden = soc === null || state === 'frei';
    this.#els.scale.hidden = soc === null || !est.note;
    if (soc !== null) {
      this.#els.fill.style.width = `${Math.max(0, Math.min(100, soc))}%`;
      this.#els.markTarget.style.left = `${Math.max(0, Math.min(100, goal))}%`;
      this.#els.markOld.hidden = !isIgnored || baseTarget === null;
      if (isIgnored && baseTarget !== null) {
        this.#els.markOld.style.left = `${baseTarget}%`;
      }
      this.#els.scaleNote.textContent = est.note ?? '';
    }

    this.#renderModes(this.#els.modes, c.mode_entity);

    const hasTarget = !!c.target_soc_entity && !!h.states[c.target_soc_entity];
    this.#els.target.hidden = !hasTarget;
    this.#els.full.setAttribute('aria-pressed', String(isIgnored));
    this.#els.full.textContent = isIgnored
      ? `Einmalig 100 % · zurück auf ${baseTarget !== null ? fmtPercent(baseTarget) : 'alt'}`
      : 'Einmalig 100 %';
    this.#els.targetInput.disabled = isIgnored;
    if (hasTarget && this.#drag !== 'target') {
      const shown = baseTarget ?? 100;
      this.#els.targetInput.value = shown;
      this.#els.targetOut.textContent = fmtPercent(shown);
    }

    this.#syncSlider('cur', c.current_entity, { min: 6, max: 16, step: 1 });
    // Aufklapper nur zeigen, wenn es darin etwas einzustellen gibt
    this.#els.adv.hidden = this.#els.cur.hidden;

    this.#renderStats();
    this.#renderHistory();
  }

  /**
   * Verlauf: am Tag die Ladeleistung als Kurve, in Woche/Monat die geladene
   * Energie je Tag, im Jahr je Monat – aus dem Gesamtzähler der Wallbox.
   * Der Chip zeigt die Summe im Zeitraum. Nur neu konfigurieren, wenn sich
   * Zeitraum oder Entitäten ändern; die Daten lädt we-chart selbst nach.
   */
  #renderHistory() {
    const c = this.#config;
    const live = c.power_entity;
    const total = c.total_energy_entity;
    const box = this.#els.history;
    if (!box) return;
    box.hidden = !live && !total;
    if (box.hidden) return;

    for (const btn of this.#els.periodBtns) {
      btn.classList.toggle('active', btn.dataset.period === this.#period);
    }

    const [start, end] = periodRange(this.#period);
    const color = cssColor(this, '--w-wallbox', '#22C3D6');
    const key = [this.#period, live, total, color, start.getTime()].join('|');
    if (key !== this.#historyKey) {
      this.#historyKey = key;
      const power = (this.#period === 'day' && live) || !total;
      const chartCfg = power
        ? {
            series: [{ entity: live, name: 'Ladeleistung', color, stat_type: 'mean', fill: 'gradient', type: 'line' }],
            y_axes: [{ unit: 'kW', min: 0 }],
            aggregation: { day: '5min', week: '1h', month: '1d', year: '1m' }[this.#period],
          }
        : {
            series: [{ entity: total, name: 'Geladen', color, stat_type: 'change', type: 'bar' }],
            y_axes: [{ unit: 'kWh', min: 0 }],
            aggregation: { day: '1h', week: '1d', month: '1d', year: '1m' }[this.#period],
          };
      this.#els.chart.setConfig({
        title: '',
        start: start.toISOString(),
        end: end.toISOString(),
        legend: { hidden: true },
        ...chartCfg,
        ...(total ? { chip: { entity: total, unit: 'kWh', stat_type: 'change', calc_type: 'sum', color } } : {}),
      });
    }
    this.#els.chart.hass = this.#hass;
  }

  #amps(watt) {
    const direct = num(this.#hass, this.#config.current_actual_entity);
    if (direct !== null) return `${direct.toFixed(1).replace('.', ',')} A`;
    if (!watt || watt < 50) return null;
    const phases = Number(this.#config.phases) || 3;
    const a = watt / (phases * 230);
    return `${a.toFixed(1).replace('.', ',')} A`;
  }

  #renderModes(container, entityId) {
    if (!entityId || !this.#hass.states[entityId]) {
      container.replaceChildren();
      return;
    }
    const st = this.#hass.states[entityId];
    const options = st.attributes.options ?? [];
    const sig = `${entityId}|${options.join('|')}`;

    if (container.dataset.sig !== sig) {
      container.dataset.sig = sig;
      container.replaceChildren();
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.dataset.option = opt;
        btn.innerHTML = `${icon(modeInfo(opt).icon)}<span class="txt">${esc(opt)}</span>`;
        btn.addEventListener('click', () => this.#setOption(entityId, opt));
        container.appendChild(btn);
      }
    }
    for (const btn of container.children) {
      btn.setAttribute('aria-pressed', String(btn.dataset.option === st.state));
    }
  }

  #syncSlider(key, entityId, fallback) {
    const box = this.#els[key];
    const st = entityId ? this.#hass.states[entityId] : null;
    if (!st) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const input = box.querySelector('input');
    input.min = st.attributes.min ?? fallback.min;
    input.max = st.attributes.max ?? fallback.max;
    input.step = st.attributes.step ?? fallback.step;
    if (this.#drag === key) return;
    const v = Number(st.state);
    if (!Number.isFinite(v)) return;
    input.value = v;
    box.querySelector('output').textContent = this.#sliderText(key, v);
  }

  #renderStats() {
    const c = this.#config;
    const h = this.#hass;
    const items = [];

    const wbColor = cssColor(this, '--w-wallbox', '#7f77dd');
    const today = energy(h, c.today_energy_entity);
    if (today !== null) items.push({ e: c.today_energy_entity, icon: 'mdi:calendar-today', color: wbColor, k: 'Heute geladen', v: fmtEnergy(today) });
    const total = energy(h, c.total_energy_entity);
    if (total !== null) items.push({ e: c.total_energy_entity, icon: 'mdi:counter', color: wbColor, k: 'Gesamt', v: fmtEnergy(total) });

    const batteryEntities = [];
    if (c.battery_soc_entity) {
      batteryEntities.push(...asList(c.battery_soc_entity));
    } else if (c.battery) {
      c.battery.forEach((b) => {
        const ent = getEntity(b.percent);
        if (ent) batteryEntities.push(ent);
      });
    }
    const batt = batteryEntities.length ? sum(h, batteryEntities, num) : null;
    if (batt !== null) items.push({ e: batteryEntities[0], icon: 'mdi:home-battery', color: cssColor(this, '--w-batt-out', '#2BB673'), k: 'Hausakku', v: fmtPercent(batt / batteryEntities.length) });

    const price = priceInfo(h, c, 'import').now;
    if (price !== null) items.push({ e: c.price_entity, icon: 'mdi:currency-eur', color: cssColor(this, '--w-price', '#fbaa00'), k: 'Strompreis', v: `${fmtPrice(price)}/kWh` });

    this.#els.stats.innerHTML = items
      .map((i) => tileHtml({ icon: i.icon, color: i.color, title: i.k, value: i.v, entity: i.e ?? '' }))
      .join('');
    for (const btn of this.#els.stats.querySelectorAll('[data-entity]')) {
      btn.addEventListener('click', () => moreInfo(this, btn.dataset.entity));
    }
  }
}

const SCHEMA = [
  {
    name: 'wallbox',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 1, label: 'Wallbox 1' },
          { value: 2, label: 'Wallbox 2' },
          { value: 3, label: 'Wallbox 3' },
        ],
      },
    },
  },
  {
    type: 'expandable', name: '', title: 'Optionale Anpassungen',
    schema: [
      { name: 'name', selector: sel.text() },
      { name: 'capacity', selector: sel.number(10, 200, 1) },
      { name: 'max_power', selector: sel.number(1000, 30000, 100) },
    ],
  },
];

const LABELS = {
  wallbox: 'Welche Wallbox aus der zentralen Zuordnung',
  name: 'Name des Fahrzeugs',
  capacity: 'Akkukapazität in kWh',
  max_power: 'Maximale Ladeleistung in W',
};

class WueflWallboxCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS;
}

customElements.define('wuefl-wallbox-card', WueflWallboxCard);
customElements.define('wuefl-wallbox-card-editor', WueflWallboxCardEditor);

registerCard({
  type: 'wuefl-wallbox-card',
  name: 'wuefl Wallbox',
  description: 'Lademodus, Ladeziel und Zeitprognose je Fahrzeug.',
});