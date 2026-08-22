/**
 * wuefl-energy-live-card
 * Live-Ansicht auf Basis von energieflow.svg.
 *
 * Die Grafik wird geladen und beschriftet: Werte in die .val-Texte,
 * Ladestand über --soc, aktive Geräte pulsieren, Kabel bekommen eine
 * laufende Punktlinie in Flussrichtung. Bereiche ohne Entitäten
 * verschwinden komplett.
 */

import {
  adoptSheet, asList, power, energy, num, sum, breakdown,
  fmtPower, fmtEnergy, fmtPercent, fmtPrice, fmtEuro, esc, icon, registerCard,
  weatherIcon, WEEKDAYS, priceInfo, centralConfig, mergeConfig,
  entityIds, statesChanged, pvForecast, todayTotals, todaySum,
  COLORS, WueflFormEditor, sel, cssColor, TILE_CSS, tileHtml, GRID_CSS,
} from './wuefl-energy-shared.js';

// Wird von der Integration selbst ausgeliefert (siehe __init__.py,
// URL_BASE) — kein "/local/..." mehr, das www/ manuell kopiert werden müsste.
const SVG_URL = '/wuefl_energy_files/energieflow.svg';

/* Kabel sind im SVG alle vom Gerät zum Anschlusskasten gezeichnet.
   "inbound" heißt: Strom fließt in dieser Richtung, also normal abspielen. */
const PARTS = {
  solar:       { label: 'label-solar', cable: '#kabel-solar', device: '#solar' },
  netz:        { label: 'label-netz', cable: '#label-netz .cable', device: '#netz' },
  batterie:    { label: 'label-batterie', cable: '#label-batterie .cable', device: '#battery' },
  wallbox:     { label: 'label-wallbox', cable: '#kabel-wallbox', device: '#wallbox' },
  waermepumpe: { label: 'label-waermepumpe', cable: '#label-waermepumpe .cable', device: '#heatpump' },
  haushalt:    { label: 'label-haushalt', cable: null, device: '#house' },
};

const CSS = `
${TILE_CSS}
.card {
  ${GRID_CSS}
  & .head { align-items: start; display: flex; gap: .5rem; justify-content: space-between; }
}

.weather {
  align-items: center;
  background: var(--w-bg-soft);
  border: 0; border-radius: var(--w-radius); color: inherit; cursor: pointer;
  display: flex; font: inherit; gap: .4rem; padding: .3rem .65rem;

  &:hover { background: var(--w-bg-hover); }
  &:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 2px; }
  & ha-icon { --mdc-icon-size: 26px; }
  & .temp { font-variant-numeric: tabular-nums; font-weight: 600; }
}

.scene {
  margin-top: .35rem;

  & svg { display: block; height: auto; width: 100%; }

  /* Farbe läuft ausschließlich über --c-highlight: die SVG bezieht Icons,
     Ladestandsbalken und Netz-Symbol alle daraus. Die Karte setzt sie je
     Gerätegruppe, mehr braucht es nicht. */
  & .device .icon, & .device .fan {
    transition: stroke .25s ease, filter .25s ease;
  }

  /* Blinken UND ein Leuchten (drop-shadow) dazu – reines Ein/Aus der
     Deckkraft wirkte zu technisch, mit Schein sieht es nach Betrieb aus. */
  & .device.is-active .icon,
  & .device.is-active .fan {
    animation: blink var(--beat, 2.4s) ease-in-out infinite;
    filter: drop-shadow(0 0 5px var(--c-highlight));
  }
  & #house.is-active .window {
    animation: blink-fill var(--beat, 2.4s) ease-in-out infinite;
    fill: var(--c-highlight);
  }

  /* Solar: die Fläche ist dauerhaft orange (kein Blinken mehr) und schimmert
     über den in der SVG hinterlegten Verlauf "solar-shimmer" von selbst. */
  & #solar-surface { transition: opacity .3s ease; }

  /* Kabel: laufende Punkte, per pathLength auf ein sauberes Vielfaches der
     Musterlänge normiert (in JS gesetzt) – damit die Punktreihe exakt
     aufgeht, unabhängig von der tatsächlichen Pfadlänge, und nirgends ein
     Rest-Stück ohne Punkt oder ein sichtbarer Sprung beim Schleifen-Ende
     entsteht. Ein-/Ausblenden läuft über Deckkraft mit Übergang statt
     display:none, damit nichts abrupt abbricht.
  */
  & .flow, & .flow-fat {
    animation: dots var(--dur, 1.4s) linear infinite;
    fill: none;
    opacity: 0;
    stroke-linecap: round;
    transition: opacity .5s ease;
  }
  & .flow.on, & .flow-fat.on { opacity: var(--flow-op, 1); }
  & .flow { stroke-dasharray: 0 14; stroke-width: 4; }
  & .flow-fat { stroke-dasharray: 0 42; stroke-width: 7.5; }
  & .flow.rev, & .flow-fat.rev { animation-direction: reverse; }
}

@keyframes blink {
  0%, 8% { opacity: .15; }
  22%, 76% { opacity: 1; }
  92%, 100% { opacity: .15; }
}
@keyframes blink-fill {
  0%, 8% { fill-opacity: .15; }
  22%, 76% { fill-opacity: 1; }
  92%, 100% { fill-opacity: .15; }
}
@keyframes dots { to { stroke-dashoffset: -14; } }

@media (prefers-reduced-motion: reduce) {
  .scene .device.is-active .icon,
  .scene .device.is-active .fan,
  .scene #house.is-active .window,
  .scene .flow, .scene .flow-fat { animation: none; }
}

.money {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-top: .75rem;
}

.explain {
  background: var(--w-bg-soft);
  border-left: 3px solid var(--w-accent);
  border-radius: var(--w-radius);
  color: var(--w-text-soft);
  font-size: var(--w-fs-sm);
  line-height: 1.5;
  margin-top: .55rem;
  padding: .6rem .75rem;

  & p { margin: 0 0 .4rem; }
  & p:last-child { margin: 0; }
}

.forecast {
  background: var(--w-bg-soft);
  border-radius: var(--w-radius);
  margin-top: .6rem;
  padding: .6rem .75rem;

  & .fhead {
    align-items: baseline; color: var(--w-text-soft);
    display: flex; flex-wrap: wrap; font-size: var(--w-fs-sm);
    gap: .5rem; justify-content: space-between;
  }
}

dialog.fc {
  max-width: min(28rem, 92vw);

  & .row {
    align-items: center; border-top: 1px solid var(--w-line);
    display: grid; gap: .5rem; grid-template-columns: 3.2rem 2rem 1fr auto; padding: .45rem 0;

    & .day { font-weight: 600; }
    & ha-icon { --mdc-icon-size: 24px; }
    & .temps { font-variant-numeric: tabular-nums; text-align: right; }
  }
  & .extra {
    border-top: 1px solid var(--w-line); display: flex;
    gap: 1rem; justify-content: space-between; padding: .45rem 0;
  }
}
`;

class WueflEnergyLiveCard extends HTMLElement {
  #own = {};
  #central = {};
  #config = {};
  #hass = null;
  #prevHass = null;
  #built = false;
  #svgReady = false;
  #els = {};
  #forecast = null;
  #watch = [];
  #watchPlot = [];
  #plotDirty = true;
  #explain = null;
  #today = {};
  #todayTimer = null;

  static getConfigElement() { return document.createElement('wuefl-energy-live-card-editor'); }
  static getStubConfig() { return { title: 'Zuhause', show_totals: true }; }

  setConfig(config) {
    this.#own = config ?? {};
    this.#apply();
  }

  /**
   * Home Assistant setzt hass bei *jeder* Zustandsänderung im ganzen System.
   * Ohne Filter würde die Karte mehrmals pro Sekunde komplett neu aufbauen,
   * deshalb hier der Vergleich gegen die tatsächlich benutzten Entitäten.
   */
  set hass(hass) {
    const first = !this.#hass;
    this.#prevHass = this.#hass;
    this.#hass = hass;

    if (first) {
      this.#loadCentral();
      window.addEventListener('wuefl-energy-config-changed', () => this.#loadCentral());
    }
    if (first || statesChanged(this.#prevHass, hass, this.#watch)) this.#render();
  }

  getCardSize() { return 13; }

  async #loadCentral() {
    const all = await centralConfig(this.#hass);
    this.#central = { ...(all.live ?? {}), wallboxes: all.wallboxes ?? [] };
    this.#apply();
    this.#render();
    // Erst jetzt steht fest, welche Wetter-Entität gilt.
    this.#loadForecast();
    this.#loadToday();
  }

  /**
   * Was ist seit Mitternacht zusammengekommen? Kommt aus der Statistik, nicht
   * aus eigenen Tagessensoren — deshalb muss in der Zuordnung nur der
   * Gesamtzähler stehen. Stündlich reicht als Takt völlig.
   */
  async #loadToday() {
    const c = this.#config;
    this.#today = await todayTotals(this.#hass, [
      ...asList(c.pv_energy_total), ...asList(c.grid_import_total),
      ...asList(c.grid_export_total), ...asList(c.battery_in_total),
      ...asList(c.battery_out_total), ...asList(c.house_energy_total),
      ...asList(c.heatpump_energy_total), ...asList(c.wallbox_energy_total),
    ]);
    this.#render();

    clearTimeout(this.#todayTimer);
    this.#todayTimer = setTimeout(() => this.#loadToday(), 300_000);
  }

  disconnectedCallback() {
    clearTimeout(this.#todayTimer);
  }

  #apply() {
    const merged = mergeConfig(this.#central, this.#own);
    this.#config = { title: 'Zuhause', show_totals: true, ...merged };
    this.#watch = entityIds(this.#config);
    this.#watchPlot = [
      this.#config.price_entity,
      ...asList(this.#config.pv_forecast_entities),
    ].filter(Boolean);
    this.#plotDirty = true;
    this.#built = false;
    this.#svgReady = false;
    if (this.shadowRoot) this.shadowRoot.replaceChildren();
  }

  /* ------------------------------ Aufbau ---------------------------- */

  #build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptSheet(root, CSS, 'live');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="head">
        <h2></h2>
        <button class="weather" type="button" hidden>
          ${icon('mdi:thermometer')}<span class="temp">–</span>
        </button>
      </div>
      <div class="scene"><div class="state">Grafik wird geladen …</div></div>
      <div class="money"></div>
      <div class="explain" hidden></div>
      <div class="forecast" hidden>
        <div class="fhead"><span>Heute: Strompreis und PV-Prognose</span><span class="legend"></span></div>
        <div class="plot plotbox"></div>
      </div>
      <dialog class="fc">
        <header><h3>Wettervorhersage</h3>
          <button class="close" type="button" aria-label="Schließen">${icon('mdi:close')}</button>
        </header>
        <div class="fc-body"></div>
      </dialog>
    `;
    root.appendChild(card);

    this.#els = {
      card,
      title: card.querySelector('h2'),
      weather: card.querySelector('.weather'),
      wIcon: card.querySelector('.weather ha-icon'),
      wTemp: card.querySelector('.weather .temp'),
      dialog: card.querySelector('dialog.fc'),
      fcBody: card.querySelector('.fc-body'),
      scene: card.querySelector('.scene'),
      money: card.querySelector('.money'),
      explainBox: card.querySelector('.explain'),
      forecast: card.querySelector('.forecast'),
      plot: card.querySelector('.plot'),
      legend: card.querySelector('.legend'),
    };

    this.#els.weather.addEventListener('click', () => {
      this.#renderForecast();
      this.#els.dialog.showModal();
    });
    card.querySelector('.close').addEventListener('click', () => this.#els.dialog.close());

    this.#built = true;
    this.#loadSvg();
  }

  async #loadSvg() {
    const url = this.#config.svg_url ?? SVG_URL;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      this.#els.scene.innerHTML = await res.text();
    } catch (err) {
      this.#els.scene.innerHTML =
        `<div class="state">Die Grafik unter ${esc(url)} wurde nicht gefunden.</div>`;
      console.error('[wuefl-energy] energieflow.svg', err);
      return;
    }

    const svg = this.#els.scene.querySelector('svg');
    if (!svg) return;
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Das SVG arbeitet mit light-dark(). Damit es dem HA-Theme folgt und
    // nicht der Systemeinstellung, wird das Farbschema hier gesetzt.
    svg.style.colorScheme = this.#hass?.themes?.darkMode ? 'dark' : 'light';

    this.#els.svg = svg;
    this.#prepareFlows();
    this.#svgReady = true;
    this.#render();
  }

  /** Legt über jedes Kabel zwei laufende Punktlinien. */
  #prepareFlows() {
    const svg = this.#els.svg;
    this.#els.flows = {};

    for (const [key, part] of Object.entries(PARTS)) {
      if (!part.cable) continue;
      const cable = svg.querySelector(part.cable);
      if (!cable) continue;

      const thin = cable.cloneNode(false);
      const fat = cable.cloneNode(false);
      thin.removeAttribute('id');
      fat.removeAttribute('id');
      thin.setAttribute('class', 'flow');
      fat.setAttribute('class', 'flow-fat');
      // pathLength normiert die Musterlänge auf ein Vielfaches von 14 bzw. 42
      // Einheiten, unabhängig von der tatsächlichen geometrischen Länge des
      // Pfads. Ohne das ginge das Punktmuster an einer zufälligen Stelle
      // nicht auf – sichtbar als Lücke oder ein Ruckler beim Schleifenende.
      thin.setAttribute('pathLength', '140');
      fat.setAttribute('pathLength', '126');
      for (const el of [thin, fat]) {
        cable.parentNode.insertBefore(el, cable.nextSibling);
      }
      this.#els.flows[key] = { thin, fat };
    }
  }

  /* ------------------------------ Werte ----------------------------- */

  #wallboxes() {
    const c = this.#config;
    if (c.wallboxes?.length) return c.wallboxes;
    // Ohne zentrale Zuordnung: Leistungen aus der Liste, Namen aus HA
    return asList(c.wallbox_power).map((id, i) => ({
      power_entity: id,
      today_energy_entity: asList(c.wallbox_energy)[i],
      name: this.#hass?.states?.[id]?.attributes?.friendly_name ?? `Auto ${i + 1}`,
    }));
  }

  #present() {
    const c = this.#config;
    return {
      solar: !!c.pv_power_total || asList(c.pv_power).length > 0,
      netz: !!c.grid_power,
      batterie: asList(c.battery_power).length > 0 || asList(c.battery_soc).length > 0,
      wallbox: this.#wallboxes().length > 0,
      waermepumpe: asList(c.heatpump_power).length > 0,
      haushalt: true,
    };
  }

  #readPowers() {
    const c = this.#config;
    const h = this.#hass;
    const pv = power(h, c.pv_power_total) ?? sum(h, c.pv_power) ?? 0;
    const grid = power(h, c.grid_power, { invert: !!c.invert_grid }) ?? 0;
    const battery = sum(h, c.battery_power, power, { invert: !!c.invert_battery }) ?? 0;
    const wallbox = this.#wallboxes().reduce(
      (a, wb) => a + Math.abs(power(h, wb.power_entity) ?? 0), 0,
    );
    const heatpump = Math.abs(sum(h, c.heatpump_power) ?? 0);
    let house = power(h, c.house_power);
    if (house === null) house = pv + grid + battery - wallbox - heatpump;
    return { pv, grid, battery, wallbox, heatpump, house: Math.max(0, house) };
  }

  #render() {
    if (!this.#config) return;
    if (!this.#built) this.#build();
    if (!this.#hass) return;
    this.#els.title.textContent = this.#config.title ?? '';
    this.#renderWeather();
    this.#renderMoney();
    // Preis und Prognose ändern sich stündlich – nicht bei jedem Zustand neu bauen.
    if (this.#plotDirty || statesChanged(this.#prevHass, this.#hass, this.#watchPlot)) {
      this.#renderPlot();
      this.#plotDirty = false;
    }
    if (!this.#svgReady) return;

    const c = this.#config;
    const h = this.#hass;
    const p = this.#readPowers();
    const svg = this.#els.svg;
    const has = this.#present();
    const tot = c.show_totals;

    // Nicht konfigurierte Bereiche ausblenden
    for (const [key, part] of Object.entries(PARTS)) {
      const g = svg.querySelector(`#${part.label}`);
      if (g) g.style.display = has[key] ? '' : 'none';
    }

    /**
     * Werte stehen direkt als <tspan class="…"> in der Grafik, sequenziell
     * hintereinander (kein Grid, kein foreignObject) — Zeilenumbruch und
     * Abstand kommen über "white-space: pre-line" und dy-Versätze, die
     * bereits im SVG selbst stehen. Diese Funktion setzt nur Werte, keine
     * Struktur.
     */
    const T = (groupSel, cls, value, index = 0) => {
      const el = svg.querySelectorAll(`${groupSel} .${cls}`)[index];
      if (el) el.textContent = value ?? '';
    };

    /** Gerät aktiv schalten und seine Farbe setzen. */
    const dev = (selector, active, color) => {
      const el = svg.querySelector(selector);
      if (!el) return;
      el.classList.toggle('is-active', active);
      el.style.setProperty('--c-highlight', color);
    };

    /**
     * Klont eine Vorlagen-Gruppe (z. B. eine Wallbox-Zeile) so oft wie
     * nötig und befüllt jede Kopie über "fill". Die erste vorhandene
     * Instanz im SVG dient als Vorlage; überzählige Kopien werden entfernt,
     * fehlende ergänzt — "die Klassen suchen und das Format da einsetzen",
     * dynamisch statt fest auf zwei Einträge.
     */
    /**
     * Klont eine Vorlagen-Zeile (z. B. eine Wallbox) so oft wie nötig.
     *
     * Die Zeilenumbrüche in der Grafik sind ECHTE Zeilenumbrüche im XML,
     * sichtbar gemacht durch "white-space: pre" — nicht durch dy. Deshalb
     * muss zwischen den Zeilen jeweils ein Text-Knoten mit "\\n" plus der
     * Original-Einrückung stehen; ein dy setzt die Funktion bewusst nicht,
     * den Abstand macht die umgebende .t-box allein.
     *
     * Vorlage, Einrückung und Abschluss werden beim ersten Durchlauf am
     * Container zwischengespeichert — sonst wären sie beim nächsten Aufruf
     * verloren, weil der Container ja komplett geleert wird (besonders,
     * wenn die Liste einmal leer ist).
     */
    const repeat = (container, templateSelector, items, fill) => {
      if (!container) return;

      if (!container.__wueflTpl) {
        const first = container.querySelector(templateSelector);
        if (!first) return;
        const before = first.previousSibling;
        const last = container.lastChild;
        container.__wueflTpl = {
          node: first.cloneNode(true),
          indent: before && before.nodeType === 3 ? before.nodeValue : '\n          ',
          tail: last && last.nodeType === 3 ? last.nodeValue : '\n          ',
        };
        // Abstand macht die .t-box, nicht die einzelne Zeile.
        container.__wueflTpl.node.removeAttribute('dy');
      }
      const tpl = container.__wueflTpl;

      // textContent = '' entfernt Elemente UND die Text-Knoten dazwischen —
      // sonst blieben die alten Umbrüche als zusätzliche Leerzeilen stehen.
      container.textContent = '';
      items.forEach((item, i) => {
        container.appendChild(document.createTextNode(tpl.indent));
        const node = tpl.node.cloneNode(true);
        fill(node, item, i);
        container.appendChild(node);
      });
      container.appendChild(document.createTextNode(tpl.tail));
    };

    /**
     * Wie repeat(), aber für Paare aus zwei tspans (Name + Wert), die in
     * der Vorlage nebeneinander stehen statt in einer gemeinsamen Hülle —
     * so sind die Dachflächen aufgebaut.
     */
    const repeatPair = (container, nameSel, valueSel, items, fill) => {
      if (!container) return;

      if (!container.__wueflPair) {
        const name = container.querySelector(nameSel);
        const value = container.querySelector(valueSel);
        if (!name || !value) return;
        const before = name.previousSibling;
        const between = name.nextSibling;
        const last = container.lastChild;
        container.__wueflPair = {
          name: name.cloneNode(true),
          value: value.cloneNode(true),
          indent: before && before.nodeType === 3 ? before.nodeValue : '\n          \t',
          sep: between && between.nodeType === 3 ? between.nodeValue : ' ',
          tail: last && last.nodeType === 3 ? last.nodeValue : '\n          ',
        };
      }
      const tpl = container.__wueflPair;

      container.textContent = '';
      items.forEach((item, i) => {
        container.appendChild(document.createTextNode(tpl.indent));
        const name = tpl.name.cloneNode(true);
        const value = tpl.value.cloneNode(true);
        fill(name, value, item, i);
        container.appendChild(name);
        container.appendChild(document.createTextNode(tpl.sep));
        container.appendChild(value);
      });
      container.appendChild(document.createTextNode(tpl.tail));
    };

    /* --- Solar --- */
    if (has.solar) {
      // Namen kommen aus der Zuordnung — dort trägt man sie ja gerade
      // deshalb ein. Nur wenn nichts hinterlegt ist (oder die Karte ohne
      // zentrale Zuordnung läuft), greift der friendly_name des Sensors.
      const strings = asList(c.pv_strings).length
        ? asList(c.pv_strings).map((s2) => ({
            name: s2.name,
            value: power(h, s2.entity),
          })).filter((s2) => s2.value !== null)
        : breakdown(h, c.pv_power);
      const pvDay = todaySum(this.#today, c.pv_energy_total);
      T('#label-solar-text', 't-header', 'Solar');
      T('#label-solar-text', 'v_live', fmtPower(p.pv));
      T('#label-solar-text', 'v_total', tot && pvDay !== null ? fmtEnergy(pvDay) : '');

      // Dachflächen: Name und Wert stehen als Paar nebeneinander, jede
      // Fläche in einer eigenen Zeile.
      const hasOwnNames = asList(c.pv_strings).length > 0;
      repeatPair(
        svg.querySelector('#label-solar-text .t-box'),
        '.t-sub', '.v_sub_live', strings,
        (name, value, s2) => {
          // Selbst vergebene Namen bleiben unangetastet — gekürzt wird nur
          // ein aus dem Sensor übernommener friendly_name.
          name.textContent = hasOwnNames ? s2.name : this.#short(s2.name);
          value.textContent = fmtPower(s2.value);
        },
      );

      // Solar ist grau, solange nichts erzeugt wird, und bekommt erst bei
      // Ertrag den orangenen Schimmer-Verlauf ("Glow").
      const surface = svg.querySelector('#solar-surface');
      if (surface) surface.style.fill = p.pv >= 20 ? 'url(#solar-shimmer)' : '';
    }

    /* --- Netz --- */
    if (has.netz) {
      const imp = todaySum(this.#today, c.grid_import_total);
      const exp = todaySum(this.#today, c.grid_export_total);
      T('#label-netz-text', 't-header', 'Netz');
      T('#label-netz-text', 'v_live', `${p.grid >= 0 ? '−' : '+'}${fmtPower(Math.abs(p.grid))}`);
      T('#label-netz-text', 'v_total', tot ? fmtEnergy((imp ?? 0) - (exp ?? 0)) : '');
      T('#label-netz-text', 'v_in', tot && imp !== null ? fmtEnergy(imp) : '');
      T('#label-netz-text', 'v_out', tot && exp !== null ? fmtEnergy(exp) : '');
      dev('#netz', Math.abs(p.grid) >= 20,
        p.grid >= 0 ? COLORS.grid_import : COLORS.grid_export);
    }

    /* --- Batterie --- */
    if (has.batterie) {
      const socs = breakdown(h, c.battery_soc, num);
      const soc = socs.length ? socs.reduce((a, s2) => a + s2.value, 0) / socs.length : null;
      T('#label-batterie-text', 't-header', soc === null ? 'Batterie' : `Batterie ${fmtPercent(soc)}`);
      T('#label-batterie-text', 'v_live', `${p.battery > 0 ? '−' : '+'}${fmtPower(Math.abs(p.battery))}`);
      const outE = todaySum(this.#today, c.battery_out_total);
      const inE = todaySum(this.#today, c.battery_in_total);
      T('#label-batterie-text', 'v_total', tot ? fmtEnergy((inE ?? 0) - (outE ?? 0)) : '');
      // Im SVG des Nutzers steht "Geladen" vor "Entladen" (v_in vor v_out).
      T('#label-batterie-text', 'v_in', tot && inE !== null ? fmtEnergy(inE) : '');
      T('#label-batterie-text', 'v_out', tot && outE !== null ? fmtEnergy(outE) : '');
      if (soc !== null) {
        const frac = (Math.max(0, Math.min(100, soc)) / 100).toFixed(3);
        svg.style.setProperty('--soc', frac);
        svg.style.setProperty('--c-soc', frac);
      }
      dev('#battery', Math.abs(p.battery) >= 20,
        p.battery > 0 ? COLORS.battery_out : COLORS.battery_in);
    }

    /* --- Wallboxen: eine .wstation-Zeile je Fahrzeug, dynamisch geklont --- */
    if (has.wallbox) {
      const list = this.#wallboxes();
      T('#label-wallbox-text', 't-header', 'Wallbox');
      const box = svg.querySelector('#label-wallbox-text .t-box');
      repeat(box, '.wstation', list, (node, wb, i) => {
        const pw = Math.abs(power(h, wb.power_entity) ?? 0);
        const soc = num(h, wb.car_soc_entity);
        const day = todaySum(this.#today, wb.energy_total);
        const name = node.querySelector('.t-sub');
        const cap = node.querySelector('.v_cap');
        const live = node.querySelector('.v_live');
        const total = node.querySelector('.v_total');
        if (name) name.textContent = wb.name ?? `Auto ${i + 1}`;
        if (cap) cap.textContent = soc === null ? '' : fmtPercent(soc);
        if (live) live.textContent = fmtPower(pw);
        if (total) total.textContent = tot && day !== null ? fmtEnergy(day) : '';
      });
      dev('#wallbox', p.wallbox >= 20, COLORS.wallbox);
    }

    /* --- Wärmepumpe --- */
    if (has.waermepumpe) {
      const e = todaySum(this.#today, c.heatpump_energy_total);
      T('#label-waermepumpe-text', 't-header', 'Wärmepumpe');
      T('#label-waermepumpe-text', 'v_live', fmtPower(p.heatpump));
      T('#label-waermepumpe-text', 'v_total', tot && e !== null ? fmtEnergy(e) : '');
      dev('#heatpump', p.heatpump >= 20, COLORS.heatpump);
    }

    /* --- Haushalt --- */
    const he = todaySum(this.#today, c.house_energy_total);
    T('#label-haushalt', 't-header', 'Haushalt');
    T('#label-haushalt', 'v_live', fmtPower(p.house));
    T('#label-haushalt', 'v_total', tot && he !== null ? fmtEnergy(he) : '');
    dev('#house', p.house >= 20, COLORS.house);

    /* --- Flüsse --- */
    this.#flow('solar', p.pv, false, COLORS.pv);
    this.#flow('netz', Math.abs(p.grid), p.grid < 0,
      p.grid >= 0 ? COLORS.grid_import : COLORS.grid_export);
    this.#flow('batterie', Math.abs(p.battery), p.battery < 0,
      p.battery > 0 ? COLORS.battery_out : COLORS.battery_in);
    this.#flow('wallbox', p.wallbox, true, COLORS.wallbox);
    this.#flow('waermepumpe', p.heatpump, true, COLORS.heatpump);

    // "Steuerelement" (#ha-box) ist keinem einzelnen Gerät zugeordnet,
    // sondern zeigt: passiert irgendwo im System gerade etwas nennenswertes?
    const anyActive = [p.pv, p.grid, p.battery, p.wallbox, p.heatpump]
      .some((w) => Math.abs(w) >= 20);
    dev('#ha-box', anyActive, 'var(--w-accent)');
  }

  #short(name) {
    return name.replace(/(PV|Solar|Leistung|Power)/gi, '').replace(/\s+/g, ' ').trim() || name;
  }

  #flow(key, watt, reverse, color) {
    const pair = this.#els.flows?.[key];
    if (!pair) return;
    const w = Math.abs(watt);
    const on = w >= 20;
    // Wenig Leistung: langsam und blass. Viel: schnell und kräftig.
    const dur = Math.max(0.45, Math.min(2.6, 2600 / Math.max(1, w)));
    const strength = 0.35 + Math.min(1, w / 4000) * 0.65;
    for (const el of [pair.thin, pair.fat]) {
      // "on" steuert nur die Deckkraft (mit CSS-Übergang) – die Animation
      // selbst läuft immer weiter, dadurch gibt es beim Wiedereinblenden
      // keinen Sprung zurück an den Bahnanfang.
      el.classList.toggle('on', on);
      el.style.stroke = color;
      el.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      el.style.setProperty('--flow-op', strength.toFixed(2));
      el.classList.toggle('rev', !!reverse);
    }
  }

  /* ------------------------------ Geld ------------------------------ */

  #renderMoney() {
    const c = this.#config;
    const h = this.#hass;
    const imp = todaySum(this.#today, c.grid_import_total);
    const exp = todaySum(this.#today, c.grid_export_total);
    const pv = todaySum(this.#today, c.pv_energy_total);
    const pImp = priceInfo(h, c, 'import').now;
    const pExp = priceInfo(h, c, 'export').now;
    const ref = c.price_reference ?? pImp;

    // Eigenverbrauch: was erzeugt und nicht eingespeist wurde.
    const own = pv !== null ? Math.max(0, pv - (exp ?? 0)) : null;
    const saved = own !== null && ref !== null ? (own * ref) / 100 : null;
    const earned = exp !== null && pExp !== null ? (exp * pExp) / 100 : null;
    const paid = imp !== null && pImp !== null ? (imp * pImp) / 100 : null;

    const tiles = [];

    if (earned !== null || paid !== null) {
      const balance = (earned ?? 0) - (paid ?? 0);
      const subtitle = `
        ${earned !== null ? `<span class="sub-item" style="color: var(--energy-battery-out-color, #4db0a2)">${esc(fmtEuro(earned))} eingespeist</span>` : ''}
        ${paid !== null ? `<span class="sub-item" style="color: var(--error-color, #db4437)">${esc(fmtEuro(-paid))} bezogen</span>` : ''}
      `;
      tiles.push(tileHtml({
        icon: 'mdi:cash-multiple', color: cssColor(this, '--primary-color', '#03a9f4'),
        title: 'Bilanz heute', value: fmtEuro(balance), subtitle,
      }));
    }

    if (saved !== null) {
      tiles.push(tileHtml({
        icon: 'mdi:solar-power', color: cssColor(this, '--energy-solar-color', '#ff9800'),
        title: 'Durch PV gespart', value: fmtEuro(saved, { signed: false }), click: 'saved',
      }));
    }

    // Amortisation: was der heutige Tag zu den Anschaffungskosten beiträgt.
    const cost = Number(c.system_cost);
    if (Number.isFinite(cost) && cost > 0 && (saved !== null || earned !== null)) {
      const today = (saved ?? 0) + (earned ?? 0);
      const percent = `${((today / cost) * 100).toFixed(3).replace('.', ',')} % der Anlage`;
      tiles.push(tileHtml({
        icon: 'mdi:cash-clock', color: cssColor(this, '--energy-battery-out-color', '#4db0a2'),
        title: 'Zur Amortisation', value: fmtEuro(today, { signed: false }),
        subtitle: `<span class="sub-item">${esc(percent)}</span>`, click: 'payback',
      }));
    }

    this.#els.money.innerHTML = tiles.join('');

    for (const btn of this.#els.money.querySelectorAll('[data-click]')) {
      btn.addEventListener('click', () => this.#toggleExplain(btn.dataset.click));
    }
    this.#renderExplain();
  }

  #toggleExplain(key) {
    this.#explain = this.#explain === key ? null : key;
    this.#renderExplain();
  }

  #renderExplain() {
    const cost = Number(this.#config.system_cost);
    const texts = {
      saved: `<p><strong>Durch PV gespart</strong> ist der Strom, den die Anlage heute erzeugt
        und den du <em>selbst verbraucht</em> hast — also Erzeugung minus Einspeisung.
        Bewertet wird er mit dem Preis, den du sonst fürs Einkaufen bezahlt hättest.</p>
        <p>Das ist echtes Geld, das nicht abgeflossen ist. Es taucht auf keiner Rechnung auf,
        deshalb steht es hier separat und nicht in der Bilanz.</p>`,
      payback: `<p>Was der heutige Tag zu den Anschaffungskosten beiträgt: die Ersparnis durch
        Eigenverbrauch plus die Einspeisevergütung.</p>
        <p>Gerechnet gegen ${Number.isFinite(cost) ? fmtEuro(cost, { signed: false }) : '–'}
        Gesamtkosten aus den Einstellungen unter <em>Anlage</em>.</p>`,
    };
    const el = this.#els.explainBox;
    if (!el) return;
    el.hidden = !this.#explain;
    el.innerHTML = this.#explain ? texts[this.#explain] ?? '' : '';
  }

  /* --------------------- Preis und Prognose in einem ---------------- */

  #pvCurve() {
    const today = new Date().toDateString();
    const byHour = new Map();
    let total = 0;

    for (const id of asList(this.#config.pv_forecast_entities)) {
      const st = this.#hass.states[id];
      if (!st) continue;
      const v = energy(this.#hass, id);
      if (v !== null) total += v;
      // Das Attribut wird erkannt, nicht vorausgesetzt – Forecast.Solar,
      // Solcast und Konsorten legen es jeweils anders ab.
      for (const e of pvForecast(st, this.#config.pv_forecast_attribute)) {
        if (e.time.toDateString() !== today) continue;
        const h = e.time.getHours();
        byHour.set(h, (byHour.get(h) ?? 0) + e.kwh);
      }
    }
    return { byHour, total };
  }

  #renderPlot() {
    const c = this.#config;
    const price = priceInfo(this.#hass, c, 'import');
    const { byHour, total } = this.#pvCurve();
    const hasPrice = price.forecast.length > 0;
    const hasPv = byHour.size > 0;

    if (!hasPrice && !hasPv) {
      this.#els.forecast.hidden = true;
      return;
    }
    this.#els.forecast.hidden = false;

    const W = 1000, H = 190, L = 52, R = 54, T = 10, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const X = (i) => L + (i / 23) * pw;
    const pvVals = Array.from({ length: 24 }, (_, i) => byHour.get(i) ?? 0);
    const pvMax = Math.max(...pvVals, 0.1);
    const today = new Date().toDateString();
    const prVals = Array.from({ length: 24 }, (_, i) => {
      const e = price.forecast.find(
        (f) => f.time.getHours() === i && f.time.toDateString() === today,
      );
      return e ? e.value : null;
    });
    const known = prVals.filter((v) => v !== null);
    const cMin = known.length ? Math.min(...known) : 0;
    const cMax = known.length ? Math.max(...known) : 1;

    const out = [`<defs><linearGradient id="pvg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: ${COLORS.pv}; stop-opacity: .6"/>
      <stop offset="1" style="stop-color: ${COLORS.pv}; stop-opacity: 0"/></linearGradient></defs>`];

    if (hasPv) {
      const pts = pvVals.map((v, i) => `${X(i).toFixed(1)} ${(T + ph - (v / pvMax) * ph).toFixed(1)}`);
      out.push(`<path d="M${pts.join(' L')} L${X(23).toFixed(1)} ${T + ph} L${L} ${T + ph} Z" fill="url(#pvg)"/>`);
      out.push(`<path d="M${pts.join(' L')}" fill="none" stroke-width="2.5" style="stroke: ${COLORS.pv}"/>`);
      out.push(`<text class="axis" x="${L - 8}" y="${T + 12}" text-anchor="end">${pvMax.toFixed(1).replace('.', ',')}</text>`);
    }
    if (hasPrice) {
      const seg = [];
      prVals.forEach((v, i) => {
        if (v === null) return;
        seg.push(`${X(i).toFixed(1)} ${(T + ph - ((v - cMin) / (cMax - cMin || 1)) * ph).toFixed(1)}`);
      });
      out.push(`<path d="M${seg.join(' L')}" fill="none" stroke-width="2.5" stroke-dasharray="6 4" style="stroke: ${COLORS.price}"/>`);
      out.push(`<text class="axis" x="${W - R + 8}" y="${T + 12}">${Math.round(cMax)}</text>`);
      out.push(`<text class="axis" x="${W - R + 8}" y="${T + ph}">${Math.round(cMin)}</text>`);
    }
    for (const i of [0, 6, 12, 18, 23]) {
      out.push(`<text class="axis" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(i).padStart(2, '0')}</text>`);
    }

    this.#els.plot.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Strompreis und PV-Prognose">${out.join('')}</svg>`;
    this.#els.legend.innerHTML =
      (hasPv ? `<span style="color:${COLORS.pv}">▬</span> Erzeugung kW${total ? ` (${fmtEnergy(total)})` : ''}` : '') +
      (hasPrice
        ? ` <span style="color:${COLORS.price}">▭</span> Preis ct/kWh`
        : price.now !== null ? ` Preis ${fmtPrice(price.now)}` : '');
  }

  /* ------------------------------ Wetter ---------------------------- */

  #renderWeather() {
    const e = this.#config.weather_entity;
    const st = e ? this.#hass.states[e] : null;
    this.#els.weather.hidden = !st;
    if (!st) return;
    this.#els.wIcon.setAttribute('icon', weatherIcon(st.state));
    const t = st.attributes.temperature;
    this.#els.wTemp.textContent = t === undefined ? '–' : `${Math.round(t)}°`;
  }

  async #loadForecast() {
    const e = this.#config.weather_entity;
    if (!e || !this.#hass) return;
    try {
      const res = await this.#hass.callService(
        'weather', 'get_forecasts', { type: 'daily' }, { entity_id: e }, false, true,
      );
      this.#forecast = res?.response?.[e]?.forecast ?? null;
    } catch {
      this.#forecast = this.#hass.states[e]?.attributes?.forecast ?? null;
    }
    this.#renderForecast();
  }

  #renderForecast() {
    if (!this.#els.fcBody) return;
    const rows = (this.#forecast ?? []).slice(0, 5).map((f) => {
      const d = new Date(f.datetime);
      return `<div class="row"><span class="day">${WEEKDAYS[d.getDay()]}</span>
        ${icon(weatherIcon(f.condition))}<span></span>
        <span class="temps"><b>${Math.round(f.temperature)}°</b>${
          f.templow !== undefined ? ` / ${Math.round(f.templow)}°` : ''
        }</span></div>`;
    });
    for (const id of asList(this.#config.pv_forecast_entities)) {
      const st = this.#hass?.states?.[id];
      if (!st) continue;
      rows.push(`<div class="extra"><span>${esc(st.attributes.friendly_name ?? id)}</span>
        <b>${esc(st.state)} ${esc(st.attributes.unit_of_measurement ?? '')}</b></div>`);
    }
    this.#els.fcBody.innerHTML = rows.length ? rows.join('') : '<p>Keine Vorhersage verfügbar.</p>';
  }
}

/* -------------------------------------------------------------------- */

const SCHEMA = [
  { name: 'title', selector: sel.text() },
  { name: 'show_totals', selector: sel.bool() },
  {
    type: 'expandable', name: '', title: 'Abweichend von der zentralen Zuordnung',
    schema: [
      { name: 'weather_entity', selector: sel.entity('weather') },
      { name: 'pv_power_total', selector: sel.entity() },
      { name: 'pv_power', selector: sel.entities() },
      { name: 'grid_power', selector: sel.entity() },
      { name: 'battery_power', selector: sel.entities() },
      { name: 'house_power', selector: sel.entity() },
      { name: 'heatpump_power', selector: sel.entities() },
      { name: 'svg_url', selector: sel.text() },
    ],
  },
];

const LABELS_EDIT = {
  title: 'Überschrift',
  show_totals: 'Gesamtwerte anzeigen',
  weather_entity: 'Wetter',
  pv_power_total: 'PV-Leistung gesamt',
  pv_power: 'PV-Leistung je Strang',
  grid_power: 'Netzleistung',
  battery_power: 'Leistung je Speicher',
  house_power: 'Hausverbrauch',
  heatpump_power: 'Leistung je Wärmepumpe',
  svg_url: 'Pfad zur Grafik',
};

class WueflEnergyLiveCardEditor extends WueflFormEditor {
  schema = SCHEMA;
  labels = LABELS_EDIT;
}

customElements.define('wuefl-energy-live-card', WueflEnergyLiveCard);
customElements.define('wuefl-energy-live-card-editor', WueflEnergyLiveCardEditor);

registerCard({
  type: 'wuefl-energy-live-card',
  name: 'wuefl Live-Energie',
  description: 'Energiefluss-Grafik mit Werten, Pulsieren und laufenden Kabeln.',
});
