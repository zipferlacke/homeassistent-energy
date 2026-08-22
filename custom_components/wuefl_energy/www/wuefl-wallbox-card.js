/**
 * wuefl-wallbox-card
 * Eine Karte je Fahrzeug. Über `slot` wird bestimmt, welche der drei
 * Wallboxen aus der zentralen Zuordnung gezogen wird.
 */

import {
  adoptSheet, asList, power, energy, num, sum,
  fmtPower, fmtEnergy, fmtPercent, fmtPrice, fmtDuration, moreInfo,
  registerCard, priceInfo, centralConfig, mergeConfig, entityIds, statesChanged, pvOutlook, solarEta, fmtWhen,
  chargeState, CHARGE_STATES,
  esc, icon, COLORS, WueflFormEditor, sel, cssColor, TILE_CSS, tileHtml,
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
${TILE_CSS}
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

/* Unter dem Balken steht, WORAUF die Schätzung beruht – Ladestand und Ziel
   stehen schon oben, die Wiederholung war überflüssig. */
.scale {
  & .note { color: var(--w-text-soft); font-size: var(--w-fs-sm); line-height: 1.45; }
}

/* Modus-Auswahl im selben Segmented-Control-Look wie Tag/Woche/Monat/Jahr
   in der Energie-Ansicht: heller Rahmen-Hintergrund, aktive Option als
   weiße, leicht erhabene Pille statt einer eingefärbten Fläche. */
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
    border-radius: 9px;
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

details {
  border-top: 1px solid var(--w-line);
  margin-top: .7rem;

  & summary {
    align-items: center; cursor: pointer; display: flex; font-size: var(--w-fs-sm);
    gap: .5rem; list-style: none; padding: .6rem 0; user-select: none;

    &::-webkit-details-marker { display: none; }
    & > span { flex: 1 1 auto; }
    /* Sichtbarer Hinweis, dass sich hier etwas aufklappt. */
    & .chev { --mdc-icon-size: 20px; color: var(--w-text-soft); transition: transform .2s ease; }
  }
  &[open] summary .chev { transform: rotate(180deg); }
  &:hover summary { color: var(--w-accent); }
  & .body { background: var(--w-bg-soft); border-radius: var(--w-radius); padding: .65rem .75rem; }
}

.ref {
  border-top: 1px solid var(--w-line);
  color: var(--w-text-soft);
  font-size: var(--w-fs-sm);
  line-height: 1.45;
  margin: .7rem 0 0;
  padding-top: .6rem;
}
.slider:first-child + .ref { margin-top: .7rem; }

.slider {
  & + .slider { margin-top: .8rem; }
  & .line { display: flex; font-size: var(--w-fs-sm); justify-content: space-between; }
  & input[type="range"] { accent-color: var(--w-accent); margin-top: .25rem; width: 100%; }
  & output { font-variant-numeric: tabular-nums; font-weight: 600; }
  & .note { color: var(--w-text-soft); display: block; font-size: var(--w-fs-sm); line-height: 1.45; }
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
  #once = false;
  #wasCharging = false;
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
    // slot ist die Position in der Wallbox-Liste. Gibt es sie nicht mehr,
    // bleibt die Karte leer statt falsche Werte einer anderen zu zeigen.
    this.#central = (all.wallboxes ?? [])[(this.#own.slot ?? 1) - 1] ?? {};
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

      <details class="adv">
        <summary>${icon('mdi:tune')}<span>Mehr Optionen</span>${icon('mdi:chevron-down', 'class="chev"')}</summary>
        <div class="body">
          <div class="slider cur" hidden>
            <div class="line"><span>Maximaler Ladestrom</span><output>–</output></div>
            <input type="range">
            <span class="note">Gilt nur für diese Wallbox. Begrenzt den Strom pro Phase: 16 A sind rund 11 kW, 6 A rund 4 kW. Nur nötig, wenn Hausanschluss oder Leitung das verlangen — im Solarbetrieb regelt die Automatik den Wert selbst.</span>
          </div>
          <p class="ref">Hausakku-Freigabe, Speicherreserve und die Preisgrenze für Netzstrom
            gelten für alle Wallboxen zusammen und stehen in der Ansicht
            <strong>Einstellungen</strong>.</p>
        </div>
      </details>

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

    // Ein Knopf, der an und aus geht. Aus geht er auch von selbst, sobald
    // der Ladevorgang endet – egal ob bei 100 % oder weil jemand absteckt.
    this.#els.full.addEventListener('click', () => {
      if (this.#once) {
        this.#endOnce();
      } else {
        this.#savedTarget = num(this.#hass, this.#config.target_soc_entity);
        this.#once = true;
        this.#setNumber(this.#config.target_soc_entity, 100);
      }
      this.#update();
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
    return pvOutlook(
      this.#hass,
      this.#config.pv_forecast_entities,
      this.#config.pv_forecast_attribute,
    );
  }

  /** Ergebnis: was oben rechts steht, plus die Zeile darunter. */
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

    const base = (c.house_base_load ?? 400) / 1000;

    /* Wann trägt die Sonne genug zusammen? Die Prognose läuft über den
       heutigen Tag hinaus, damit statt "heute nicht mehr erreichbar" ein
       konkreter Zeitpunkt an einem der Folgetage stehen kann. */
    const solar = () => solarEta(
      this.#hass, c.pv_forecast_entities, c.pv_forecast_attribute, base, needed,
    );
    const solarNote = 'Zeit ist eine Prognose aus Wetter und PV-Vorhersage, sie ändert sich im Lauf des Tages';

    if (kind === 'mix') {
      const price = priceInfo(this.#hass, c, 'import').now;
      const limit = num(this.#hass, c.price_limit_entity);
      if (price !== null && limit !== null && price <= limit) {
        return inHours(needed / full,
          'Zeit ist eine Prognose · lädt gerade mit Netzstrom, weil der Preis unter deiner Grenze liegt');
      }
      const eta = solar();
      if (eta) {
        return at(eta, `${solarNote} · Netzstrom ist gerade zu teuer`);
      }
      return {
        main: `wartet auf ${limit !== null ? `${fmtPrice(limit)}/kWh` : 'günstigen Strom'}`,
        left: '',
        note: price !== null ? `aktuell ${fmtPrice(price)}/kWh, und die Sonne reicht nicht` : '',
      };
    }

    // Reiner Solarbetrieb
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
      note: 'die Vorhersage deckt kaum mehr als den Grundverbrauch — reicht sie weiter, steht hier ein Tag und eine Uhrzeit',
    };
  }


  /* ------------------------------ Anzeige --------------------------- */

  #update() {
    if (!this.#built || !this.#hass) return;
    const c = this.#config;
    const h = this.#hass;

    const soc = num(h, c.car_soc_entity);
    const target = num(h, c.target_soc_entity);
    const goal = target ?? 100;
    const pw = power(h, c.power_entity) ?? 0;

    const modeState = c.mode_entity ? h.states[c.mode_entity] : null;
    const kind = modeState ? modeInfo(modeState.state).kind : 'other';

    // Ladezustand, den die Wallbox selbst meldet — herstellerneutral auf
    // sechs bekannte Zustände übersetzt.
    const state = chargeState(h, c.status_entity, c.status_map);
    const plugged = state !== null && state !== 'frei';
    this.#els.badge.hidden = state === null;
    if (state) {
      const info = CHARGE_STATES[state];
      this.#els.badge.style.setProperty('--badge-color', info.color);
      this.#els.badgeIcon.setAttribute('icon', info.icon);
      this.#els.badgeText.textContent = info.label;
    }

    // Ladestand hängt am Namen, nicht in einer eigenen Ecke.
    this.#els.name.textContent =
      (c.name ?? 'Wallbox') + (soc === null ? '' : `, ${fmtPercent(soc)}`);

    // Meldet die Wallbox ihren Zustand, gilt der — er ist verlässlicher als
    // aus der Leistung zu raten (kurze Pausen der Ladeelektronik sähen sonst
    // wie "fertig" aus).
    const charging = state ? state === 'laedt' : pw > 50;

    // Einmal-Ladung endet mit dem Ladevorgang: bei 100 %, beim Abstecken
    // und beim Umschalten auf Aus.
    if (this.#once) {
      const done = soc !== null && soc >= 100;
      const stopped = kind === 'off' || (this.#wasCharging && !charging);
      if (done || stopped) this.#endOnce();
    }
    this.#wasCharging = charging;

    let label;
    if (state === 'frei') label = 'kein Fahrzeug angeschlossen';
    else if (kind === 'off') label = 'Laden aus';
    else if (charging) label = 'lädt';
    else if (soc !== null && soc >= goal) label = 'Ladeziel erreicht';
    else if (state === 'fehler') label = 'Störung an der Wallbox';
    else label = 'angeschlossen, lädt nicht';

    // Statt Zustand, Ladestand und Sitzungsmenge stehen hier die zwei Zahlen,
    // die beim Laden wirklich interessieren: was fließt gerade, was heute schon.
    const amps = this.#amps(pw);
    const today = energy(h, c.today_energy_entity);
    this.#els.state.textContent = [
      charging ? (amps !== null ? `${amps} · ${fmtPower(pw)}` : fmtPower(pw)) : label,
      today !== null ? `heute ${fmtEnergy(today)}` : null,
    ].filter(Boolean).join(' · ');

    // Restdauer links, Zielzeit rechts. Der Grund der Schätzung steht
    // unter dem Balken, nicht hier oben. Ohne Ladestand-Entität gibt es
    // weder ein "Ziel erreicht" noch eine Zeitschätzung — die Grundlage
    // dafür (wo steht der Akku gerade?) fehlt schlicht.
    // Hängt gar kein Fahrzeug dran, ergeben Ladeziel und Restzeit keinen
    // Sinn — dann bleibt der ganze Bereich leer statt eine Zeit zu zeigen,
    // die niemanden betrifft.
    const needed = soc === null ? 0 : ((goal - soc) / 100) * (c.capacity ?? 58);
    const est = (soc === null || state === 'frei')
      ? { main: '', left: '', note: '' }
      : this.#estimate(kind, needed, goal);
    this.#els.goalRow.hidden = !est.main && !est.left;
    this.#els.goalLeft.textContent = est.left ?? '';
    this.#els.goalRight.textContent = est.main ?? '';

    // Balken mit Ladestand, Zielmarke und altem Ziel
    this.#els.track.hidden = soc === null || state === 'frei';
    this.#els.scale.hidden = soc === null || !est.note;
    if (soc !== null) {
      this.#els.fill.style.width = `${Math.max(0, Math.min(100, soc))}%`;
      this.#els.markTarget.style.left = `${Math.max(0, Math.min(100, goal))}%`;
      const showOld = this.#once && this.#savedTarget !== null;
      this.#els.markOld.hidden = !showOld;
      if (showOld) this.#els.markOld.style.left = `${this.#savedTarget}%`;
      this.#els.scaleNote.textContent = est.note ?? '';
    }

    this.#renderModes(this.#els.modes, c.mode_entity);

    // Ein Ladeziel in Prozent ergibt nur Sinn, wenn es auch einen echten
    // Ladestand gibt, an dem man den Fortschritt ablesen kann — sonst weiß
    // weder die Karte noch die Wallbox, wann "80 %" erreicht ist, weil der
    // Ladestand nirgends gemeldet wird.
    const hasSoc = !!c.car_soc_entity && !!h.states[c.car_soc_entity];
    const hasTarget = hasSoc && !!c.target_soc_entity && !!h.states[c.target_soc_entity];
    this.#els.target.hidden = !hasTarget;
    this.#els.full.setAttribute('aria-pressed', String(this.#once));
    this.#els.full.textContent = this.#once
      ? `Einmalig 100 % · zurück auf ${this.#savedTarget !== null ? fmtPercent(this.#savedTarget) : 'alt'}`
      : 'Einmalig 100 %';
    this.#els.targetInput.disabled = this.#once;
    if (hasTarget && this.#drag !== 'target') {
      const shown = this.#once && this.#savedTarget !== null ? this.#savedTarget : goal;
      this.#els.targetInput.value = shown;
      this.#els.targetOut.textContent = fmtPercent(shown);
    }

    this.#syncSlider('cur', c.current_entity, { min: 6, max: 16, step: 1 });

    this.#renderStats();
  }

  /**
   * Ladestrom je Phase. Gibt es einen echten Stromsensor, gilt der.
   * Sonst wird aus der Leistung gerechnet — dafür muss die Phasenzahl
   * stimmen, Voreinstellung ist dreiphasig.
   */
  #amps(watt) {
    const direct = num(this.#hass, this.#config.current_actual_entity);
    if (direct !== null) return `${direct.toFixed(1).replace('.', ',')} A`;
    if (!watt || watt < 50) return null;
    const phases = Number(this.#config.phases) || 3;
    const a = watt / (phases * 230);
    return `${a.toFixed(1).replace('.', ',')} A`;
  }

  /** Einmal-Ladung beenden und das alte Ziel wiederherstellen. */
  #endOnce() {
    this.#once = false;
    if (this.#savedTarget !== null) {
      this.#setNumber(this.#config.target_soc_entity, this.#savedTarget);
      this.#savedTarget = null;
    }
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
    const socs = asList(c.battery_soc_entity);
    const batt = sum(h, socs, num);
    if (batt !== null) items.push({ e: socs[0], icon: 'mdi:home-battery', color: cssColor(this, '--energy-battery-out-color', '#4db0a2'), k: 'Hausakku', v: fmtPercent(batt / socs.length) });
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
