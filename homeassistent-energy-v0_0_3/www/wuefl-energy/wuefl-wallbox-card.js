/**
 * wuefl-wallbox-card
 * Eine Karte je Fahrzeug. Über `slot` wird bestimmt, welche der drei
 * Wallboxen aus der zentralen Zuordnung gezogen wird.
 */

import {
  adoptSheet, asList, power, energy, num, sum,
  fmtPower, fmtEnergy, fmtPercent, fmtPrice, fmtClock, fmtDuration, moreInfo,
  registerCard, priceInfo, centralConfig, mergeConfig, entityIds, statesChanged,
  esc, icon, COLORS, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

/* Der Modus wird am Namen der Option erkannt – eigene Bezeichnungen im
   Helfer bleiben damit möglich. */
const MODE_KINDS = [
  { match: /aus|off|stop/i, icon: 'mdi:power', kind: 'off' },
  { match: /günstig|guenstig|preis|price|börse|boerse/i, icon: 'mdi:cash-clock', kind: 'mix' },
  { match: /solar|pv|überschuss|uberschuss/i, icon: 'mdi:white-balance-sunny', kind: 'solar' },
  { match: /schnell|fast|voll|boost/i, icon: 'mdi:flash', kind: 'fast' },
];

const modeInfo = (label) => MODE_KINDS.find((m) => m.match.test(label)) ?? { icon: 'mdi:tune', kind: 'other' };

const CSS = `
.top {
  align-items: start; display: flex; flex-wrap: wrap; gap: .75rem; justify-content: space-between;

  & .name { font-size: var(--w-fs-lg); font-weight: 600; line-height: 1.25; }
  & .state { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
  & .goal { font-weight: 600; text-align: right; }
  & .goal small { color: var(--w-text-soft); display: block; font-weight: 400; }
}

.track {
  background: var(--w-line);
  border-radius: 999px;
  height: .6rem;
  margin: .7rem 0 .3rem;
  position: relative;

  & .fill { background: ${COLORS.wallbox}; border-radius: 999px; height: 100%; transition: width .6s ease; }
  & .mark { background: var(--w-text); bottom: -.25rem; position: absolute; top: -.25rem; width: 2px; }
  & .mark.old { background: none; border-left: 2px dashed var(--w-text-soft); }
}

.scale {
  color: var(--w-text-soft);
  display: flex; font-size: var(--w-fs-sm); justify-content: space-between;
}

.once {
  align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .6rem;

  & .badge {
    background: var(--w-accent); border-radius: var(--w-radius);
    color: var(--w-on-accent); font-size: var(--w-fs-sm); padding: .2rem .6rem;
  }
  & .undo { font-size: var(--w-fs-sm); height: auto; padding: .35rem .7rem; }
  & .hint { color: var(--w-text-soft); font-size: var(--w-fs-sm); }
}

.modes {
  display: grid; gap: .4rem; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); margin: .75rem 0;

  & .btn {
    border: 2px solid transparent;
    flex-direction: column; gap: .15rem; height: auto; padding: .5rem .4rem;

    & ha-icon { --mdc-icon-size: 22px; }
    & .txt { font-size: var(--w-fs-sm); text-align: center; }
    &[aria-pressed="true"] { border-color: var(--w-accent); }
  }
}

.target {
  align-items: center; display: flex; flex-wrap: wrap; gap: .6rem;

  & label { flex: 0 0 auto; font-size: var(--w-fs-sm); }
  & input[type="range"] { accent-color: var(--w-accent); flex: 1 1 6rem; }
  & output { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 3rem; text-align: right; }
  & .full { flex: 0 0 auto; font-size: var(--w-fs-sm); height: auto; padding: .35rem .7rem; }
}

details {
  margin-top: .6rem;

  & summary {
    align-items: center; cursor: pointer; display: flex; font-size: var(--w-fs-sm);
    gap: .4rem; padding: .35rem 0; user-select: none;
  }
  & .body { background: var(--w-bg-soft); border-radius: var(--w-radius); padding: .65rem .75rem; }
}

.slider {
  & + .slider { margin-top: .8rem; }
  & .line { display: flex; font-size: var(--w-fs-sm); justify-content: space-between; }
  & input[type="range"] { accent-color: var(--w-accent); margin-top: .25rem; width: 100%; }
  & output { font-variant-numeric: tabular-nums; font-weight: 600; }
  & .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); }
}

.switchrow {
  align-items: center; display: flex; gap: .75rem; justify-content: space-between;

  & .switch {
    background: var(--w-line); border: 0; border-radius: 999px; cursor: pointer;
    flex: 0 0 auto; height: 1.6rem; padding: .15rem; width: 2.9rem;

    & span { background: #fff; border-radius: 50%; display: block; height: 1.3rem;
             transition: transform .2s ease; width: 1.3rem; }
    &[aria-checked="true"] { background: ${COLORS.battery_out}; & span { transform: translateX(1.3rem); } }
  }
  & .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); }
}

.stats {
  display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); margin-top: .75rem;

  & .tile .v { font-size: 1.05rem; }
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
  #once = false;
  #savedTarget = null;

  static getConfigElement() { return document.createElement('wuefl-wallbox-card-editor'); }
  static getStubConfig() { return { slot: 1 }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#apply();
  }

  /**
   * hass wird bei jeder Zustandsänderung im ganzen System gesetzt. Neu
   * gezeichnet wird nur, wenn eine der benutzten Entitäten betroffen ist.
   */
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

  getCardSize() { return 9; }

  async #loadCentral() {
    const all = await centralConfig(this.#hass);
    const slot = this.#own.slot ?? 1;
    this.#central = { ...(all[`wallbox_${slot}`] ?? {}), ...(all.price ?? {}) };
    if (all.live?.pv_forecast_entities) this.#central.pv_forecast_entities = all.live.pv_forecast_entities;
    this.#apply();
    this.#update();
  }

  #apply() {
    const merged = mergeConfig(this.#central, this.#own);
    this.#config = { name: 'Wallbox', capacity: 58, max_power: 11000, house_base_load: 400, ...merged };
    this.#watch = entityIds(this.#config);
    this.#built = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
    this.#build();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'wallbox');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="top">
        <div><div class="name"></div><div class="state"></div></div>
        <div class="goal"><span class="goal-main"></span><small class="goal-note"></small></div>
      </div>

      <div class="track" hidden>
        <div class="fill"></div>
        <div class="mark target"></div>
        <div class="mark old" hidden></div>
      </div>
      <div class="scale" hidden><span class="soc-now"></span><span class="soc-goal"></span></div>

      <div class="once" hidden>
        <span class="badge">Einmalig 100 % aktiv</span>
        <button type="button" class="btn undo">Zurücknehmen</button>
        <span class="hint"></span>
      </div>

      <div class="modes"></div>

      <div class="target" hidden>
        <label for="tgt">Ladeziel</label>
        <input type="range" id="tgt" min="20" max="100" step="5">
        <output>–</output>
        <button type="button" class="btn full">Einmalig 100 %</button>
      </div>

      <details class="adv">
        <summary>${icon('mdi:tune')}Mehr Optionen</summary>
        <div class="body">
          <div class="slider limit" hidden>
            <div class="line"><span>Netzstrom nutzen bis</span><output>–</output></div>
            <input type="range">
            <span class="note">Gilt im Modus mit günstigem Strom. Liegt der Preis darüber, wartet die Wallbox auf Sonne.</span>
          </div>
          <div class="slider cur" hidden>
            <div class="line"><span>Maximaler Ladestrom</span><output>–</output></div>
            <input type="range">
            <span class="note">Begrenzt den Strom pro Phase. 16 A sind rund 11 kW, 6 A rund 4 kW. Nur nötig, wenn Hausanschluss oder Leitung das verlangen — im Solarbetrieb regelt die Automatik den Wert selbst.</span>
          </div>
        </div>
      </details>

      <details class="batt">
        <summary>${icon('mdi:home-battery')}Hausakku</summary>
        <div class="body">
          <div class="switchrow use" hidden>
            <span>Aus Hausakku laden<span class="note">Erlaubt dem Auto, Strom aus den Speichern zu ziehen.</span></span>
            <button class="switch" role="switch" aria-checked="false" type="button"><span></span></button>
          </div>
          <div class="slider reserve" hidden>
            <div class="line"><span>Speicher nutzen bis</span><output>–</output></div>
            <input type="range" min="0" max="100" step="5">
            <span class="note">Darunter bleiben die Speicher fürs Haus reserviert.</span>
          </div>
          <div class="modes prio" hidden></div>
        </div>
      </details>

      <div class="stats"></div>
    `;
    root.appendChild(card);

    const q = (s) => card.querySelector(s);
    this.#els = {
      card,
      name: q('.name'), state: q('.state'),
      goalMain: q('.goal-main'), goalNote: q('.goal-note'),
      track: q('.track'), fill: q('.fill'),
      markTarget: q('.mark.target'), markOld: q('.mark.old'),
      scale: q('.scale'), socNow: q('.soc-now'), socGoal: q('.soc-goal'),
      once: q('.once'), undo: q('.undo'), onceHint: q('.once .hint'),
      modes: q('.modes'), prio: q('.modes.prio'),
      target: q('.target'), targetInput: q('.target input'), targetOut: q('.target output'), full: q('.full'),
      limit: q('.slider.limit'), cur: q('.slider.cur'), reserve: q('.slider.reserve'),
      use: q('.switchrow.use'), useSwitch: q('.switchrow.use .switch'),
      adv: q('details.adv'), batt: q('details.batt'),
      stats: q('.stats'),
    };

    this.#els.targetInput.addEventListener('input', () => {
      this.#drag = 'target';
      this.#els.targetOut.textContent = fmtPercent(Number(this.#els.targetInput.value));
    });
    this.#els.targetInput.addEventListener('change', () => {
      this.#drag = null;
      this.#setNumber(this.#config.target_soc_entity, Number(this.#els.targetInput.value));
    });

    this.#els.full.addEventListener('click', () => {
      this.#savedTarget = num(this.#hass, this.#config.target_soc_entity);
      this.#once = true;
      this.#setNumber(this.#config.target_soc_entity, 100);
      this.#update();
    });
    this.#els.undo.addEventListener('click', () => {
      this.#once = false;
      if (this.#savedTarget !== null) this.#setNumber(this.#config.target_soc_entity, this.#savedTarget);
      this.#update();
    });

    for (const [key, cfgKey] of [
      ['limit', 'price_limit_entity'],
      ['cur', 'current_entity'],
      ['reserve', 'battery_reserve_entity'],
    ]) {
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

    this.#els.useSwitch.addEventListener('click', () => {
      const on = this.#els.useSwitch.getAttribute('aria-checked') === 'true';
      this.#toggle(this.#config.battery_use_entity, !on);
    });

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

  #sliderText(key, v) {
    if (key === 'cur') {
      const u = this.#hass?.states?.[this.#config.current_entity]?.attributes?.unit_of_measurement ?? 'A';
      return `${v} ${u}`;
    }
    if (key === 'limit') return `${fmtPrice(v)}/kWh`;
    return fmtPercent(v);
  }

  /* ------------------------------ Prognose -------------------------- */

  #solarOutlook() {
    const ids = asList(this.#config.pv_forecast_entities);
    const attr = this.#config.pv_forecast_attribute ?? 'watt_hours_period';
    const now = new Date();
    let rest = 0;
    let lastHour = now.getHours();

    for (const id of ids) {
      const st = this.#hass.states[id];
      if (!st) continue;
      const raw = st.attributes[attr];
      if (raw && typeof raw === 'object') {
        for (const [t, wh] of Object.entries(raw)) {
          const d = new Date(t);
          if (d > now && d.toDateString() === now.toDateString()) {
            rest += Number(wh) / 1000;
            lastHour = Math.max(lastHour, d.getHours());
          }
        }
      } else {
        const v = energy(this.#hass, id);
        if (v !== null) rest += v * 0.5;
      }
    }
    return { rest, hours: Math.max(0, lastHour - now.getHours()) };
  }

  /** Ergebnis: was oben rechts steht, plus die Zeile darunter. */
  #estimate(kind, needed, goal) {
    const c = this.#config;
    if (needed <= 0) return { main: `Ladeziel ${fmtPercent(goal)} erreicht`, note: '' };
    if (kind === 'off') return { main: 'Laden aus', note: '' };

    const done = (hours, note) => {
      if (!Number.isFinite(hours) || hours <= 0) return { main: 'wird berechnet', note };
      if (hours > 24) return { main: 'heute nicht mehr erreichbar', note };
      return {
        main: `Ladeziel ${fmtPercent(goal)} um ${fmtClock(new Date(Date.now() + hours * 3_600_000))}`,
        note: `noch ${fmtDuration(hours)}${note ? ` · ${note}` : ''}`,
      };
    };

    const full = (c.max_power ?? 11000) / 1000;
    if (kind === 'fast') return done(needed / full, `volle Leistung, ${fmtPower(c.max_power ?? 11000)}`);

    const { rest, hours } = this.#solarOutlook();
    const base = (c.house_base_load ?? 400) / 1000;
    const surplus = hours ? rest / hours - base : 0;

    if (kind === 'mix') {
      const price = priceInfo(this.#hass, c, 'import').now;
      const limit = num(this.#hass, c.price_limit_entity);
      if (price !== null && limit !== null && price <= limit) {
        return done(needed / full, `Netzstrom bei ${fmtPrice(price)}/kWh, unter der Grenze von ${fmtPrice(limit)}`);
      }
      if (surplus > 0.2) {
        return done(needed / surplus, 'aus Sonne geschätzt — Netzstrom ist gerade zu teuer');
      }
      return {
        main: `wartet auf ${limit !== null ? `${fmtPrice(limit)}/kWh` : 'günstigen Strom'}`,
        note: price !== null ? `aktuell ${fmtPrice(price)}/kWh, und die Sonne reicht nicht` : '',
      };
    }

    // Reiner Solarbetrieb
    if (!hours || rest <= 0) return { main: 'heute nicht mehr erreichbar', note: 'keine nennenswerte Erzeugung mehr erwartet' };
    if (surplus <= 0.2) return { main: 'heute nicht mehr erreichbar', note: 'die Prognose deckt kaum mehr als den Grundverbrauch' };
    if (needed / surplus > hours) {
      return {
        main: `heute etwa ${fmtEnergy(surplus * hours)}`,
        note: 'geschätzt aus PV-Prognose abzüglich Grundlast — schwankt mit Wetter und Verbrauch',
      };
    }
    return done(needed / surplus, 'geschätzt aus PV-Prognose abzüglich Grundlast — schwankt mit Wetter und Verbrauch');
  }

  /* ------------------------------ Anzeige --------------------------- */

  #update() {
    if (!this.#built || !this.#hass) return;
    const c = this.#config;
    const h = this.#hass;

    this.#els.name.textContent = c.name ?? 'Wallbox';

    const soc = num(h, c.car_soc_entity);
    const target = num(h, c.target_soc_entity);
    const goal = target ?? 100;
    const pw = power(h, c.power_entity) ?? 0;
    const charging = pw > 50;

    const modeState = c.mode_entity ? h.states[c.mode_entity] : null;
    const kind = modeState ? modeInfo(modeState.state).kind : 'other';

    // Erreicht das Fahrzeug sein Ziel, ist die Einmal-Ladung erledigt
    if (this.#once && soc !== null && soc >= 100) this.#once = false;

    let label;
    if (kind === 'off') label = 'Laden aus';
    else if (charging) label = 'lädt';
    else if (soc !== null && soc >= goal) label = 'Ladeziel erreicht';
    else label = 'angeschlossen, lädt nicht';

    const session = energy(h, c.session_energy_entity);
    this.#els.state.textContent =
      (soc === null ? label : `${label} · ${fmtPercent(soc)}`) +
      (charging ? ` · ${fmtPower(pw)}${session !== null ? ` · ${fmtEnergy(session)}` : ''}` : '');

    // Balken mit Ladestand, Zielmarke und altem Ziel
    this.#els.track.hidden = soc === null;
    this.#els.scale.hidden = soc === null;
    if (soc !== null) {
      this.#els.fill.style.width = `${Math.max(0, Math.min(100, soc))}%`;
      this.#els.markTarget.style.left = `${Math.max(0, Math.min(100, goal))}%`;
      const showOld = this.#once && this.#savedTarget !== null;
      this.#els.markOld.hidden = !showOld;
      if (showOld) this.#els.markOld.style.left = `${this.#savedTarget}%`;
      this.#els.socNow.textContent = `Ladestand ${fmtPercent(soc)}`;
      this.#els.socGoal.textContent = `Ladeziel ${fmtPercent(goal)}`;
    }

    this.#els.once.hidden = !this.#once;
    this.#els.onceHint.textContent =
      this.#savedTarget !== null ? `danach wieder ${fmtPercent(this.#savedTarget)}` : '';

    const needed = soc === null ? 0 : ((goal - soc) / 100) * (c.capacity ?? 58);
    const est = this.#estimate(kind, needed, goal);
    this.#els.goalMain.textContent = est.main;
    this.#els.goalNote.textContent = est.note;

    this.#renderModes(this.#els.modes, c.mode_entity);
    this.#renderModes(this.#els.prio, c.priority_entity);
    this.#els.prio.hidden = !c.priority_entity;

    const hasTarget = !!c.target_soc_entity && !!h.states[c.target_soc_entity];
    this.#els.target.hidden = !hasTarget;
    this.#els.full.hidden = this.#once;
    this.#els.targetInput.disabled = this.#once;
    if (hasTarget && this.#drag !== 'target') {
      const shown = this.#once && this.#savedTarget !== null ? this.#savedTarget : goal;
      this.#els.targetInput.value = shown;
      this.#els.targetOut.textContent = fmtPercent(shown);
    }

    this.#syncSlider('limit', c.price_limit_entity, { min: 0, max: 60, step: 1 });
    this.#syncSlider('cur', c.current_entity, { min: 6, max: 16, step: 1 });
    this.#syncSlider('reserve', c.battery_reserve_entity, { min: 0, max: 100, step: 5 });
    this.#els.adv.hidden = this.#els.limit.hidden && this.#els.cur.hidden;

    const hasUse = !!c.battery_use_entity && !!h.states[c.battery_use_entity];
    this.#els.use.hidden = !hasUse;
    if (hasUse) {
      const on = h.states[c.battery_use_entity].state === 'on';
      this.#els.useSwitch.setAttribute('aria-checked', String(on));
      if (!on) this.#els.reserve.hidden = true;
    }
    this.#els.batt.hidden = !hasUse && !c.battery_reserve_entity && !c.priority_entity;

    this.#renderStats();
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

    const today = energy(h, c.today_energy_entity);
    if (today !== null) items.push({ e: c.today_energy_entity, k: 'Heute geladen', v: fmtEnergy(today) });
    const total = energy(h, c.total_energy_entity);
    if (total !== null) items.push({ e: c.total_energy_entity, k: 'Gesamt', v: fmtEnergy(total) });
    const socs = asList(c.battery_soc_entity);
    const batt = sum(h, socs, num);
    if (batt !== null) items.push({ e: socs[0], k: 'Hausakku', v: fmtPercent(batt / socs.length) });
    const price = priceInfo(h, c, 'import').now;
    if (price !== null) items.push({ e: c.price_entity, k: 'Strompreis', v: `${fmtPrice(price)}/kWh` });

    this.#els.stats.innerHTML = items
      .map((i) => `<button type="button" class="tile" data-entity="${esc(i.e ?? '')}">
          <span class="k">${i.k}</span><span class="v">${i.v}</span></button>`)
      .join('');
    for (const btn of this.#els.stats.querySelectorAll('[data-entity]')) {
      btn.addEventListener('click', () => moreInfo(this, btn.dataset.entity));
    }
  }
}

/* -------------------------------------------------------------------- */

const SCHEMA = [
  {
    name: 'slot',
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
    type: 'expandable', name: '', title: 'Abweichend von der zentralen Zuordnung',
    schema: [
      { name: 'name', selector: sel.text() },
      { name: 'car_soc_entity', selector: sel.entity() },
      { name: 'target_soc_entity', selector: sel.pick(['number', 'input_number']) },
      { name: 'mode_entity', selector: sel.pick(['select', 'input_select']) },
      { name: 'power_entity', selector: sel.entity() },
      { name: 'capacity', selector: sel.number(10, 200, 1) },
      { name: 'max_power', selector: sel.number(1000, 30000, 100) },
    ],
  },
];

const LABELS = {
  slot: 'Welche Wallbox aus der zentralen Zuordnung',
  name: 'Name des Fahrzeugs',
  car_soc_entity: 'Ladestand Auto',
  target_soc_entity: 'Ladeziel',
  mode_entity: 'Lademodus',
  power_entity: 'Ladeleistung',
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
