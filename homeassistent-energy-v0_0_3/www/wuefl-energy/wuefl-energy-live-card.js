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
  entityIds, statesChanged, COLORS, WueflFormEditor, sel,
} from './wuefl-energy-shared.js';

const SVG_URL = '/local/wuefl_energy/energieflow.svg';

/* Kabel sind im SVG alle vom Gerät zum Anschlusskasten gezeichnet.
   "inbound" heißt: Strom fließt in dieser Richtung, also normal abspielen. */
const PARTS = {
  solar:       { label: 'label-solar', cable: '#kabel-solar' },
  netz:        { label: 'label-netz', cable: '#label-netz .cable' },
  batterie:    { label: 'label-batterie', cable: '#label-batterie .cable' },
  wallbox:     { label: 'label-wallbox', cable: '#kabel-wallbox' },
  waermepumpe: { label: 'label-waermepumpe', cable: '#label-waermepumpe .cable' },
  haushalt:    { label: 'label-haushalt', cable: null },
};

const CSS = `
.card {
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

  /* Aktive Geräte: das blaue Icon atmet */
  & .device .icon { transition: opacity .3s ease; }
  & .device.is-active .icon { animation: breathe 1.9s ease-in-out infinite; }

  /* Solarfläche schimmert, solange erzeugt wird */
  & #solar-surface { fill: var(--c-panel); transition: fill .4s ease; }
  & #solar.is-active #solar-surface { fill: url(#grad-solar); }
  & #solar.is-active .panel { animation: breathe 2.6s ease-in-out infinite; }

  /* Fenster leuchten, wenn der Haushalt Strom zieht */
  & #window-big, & #window-small { transition: fill-opacity .4s ease; }
  & #house.is-active #window-big, & #house.is-active #window-small {
    animation: windows 3.4s ease-in-out infinite;
  }

  & .flow {
    animation: dash var(--dur, 1.4s) linear infinite;
    fill: none;
    stroke-dasharray: 3 12;
    stroke-linecap: round;
    stroke-width: 4;
  }
  & .flow-fat {
    animation: dash var(--dur, 1.4s) linear infinite;
    fill: none;
    opacity: .9;
    stroke-dasharray: 3 57;
    stroke-linecap: round;
    stroke-width: 7;
  }
  & .flow.rev, & .flow-fat.rev { animation-direction: reverse; }
}

@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@keyframes windows { 0%, 100% { fill-opacity: .95; } 50% { fill-opacity: .45; } }
@keyframes dash { to { stroke-dashoffset: -15; } }

@media (prefers-reduced-motion: reduce) {
  .scene .device.is-active .icon,
  .scene #solar.is-active .panel,
  .scene #house.is-active #window-big,
  .scene #house.is-active #window-small,
  .scene .flow, .scene .flow-fat { animation: none; }
}

.money {
  display: grid;
  gap: .55rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  margin-top: .75rem;
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

/* Farbverlauf für die Solarfläche – im SVG referenziert, aber nicht definiert.
   stop-color steht im style-Attribut, weil Browser var() in
   Präsentationsattributen nicht auswerten. */
const SOLAR_GRADIENT = `
<linearGradient id="grad-solar" gradientUnits="objectBoundingBox"
                x1="0" y1="0" x2="0.55" y2="0.55" spreadMethod="reflect">
  <stop offset="0" style="stop-color: var(--c-panel)"/>
  <stop offset="0.5" style="stop-color: var(--c-accent)"/>
  <stop offset="1" style="stop-color: var(--c-panel)"/>
  <animateTransform attributeName="gradientTransform" type="translate"
                    values="-0.55 -0.55; 0.55 0.55" dur="4.5s" repeatCount="indefinite"/>
</linearGradient>`;

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
    this.#central = { ...(all.live ?? {}), ...(all.price ?? {}) };
    this.#central.wallboxes = [all.wallbox_1, all.wallbox_2, all.wallbox_3].filter(
      (w) => w && Object.keys(w).length,
    );
    this.#apply();
    this.#render();
    // Erst jetzt steht fest, welche Wetter-Entität gilt.
    this.#loadForecast();
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

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.prepend(defs);
    }
    defs.insertAdjacentHTML('beforeend', SOLAR_GRADIENT);

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
      for (const el of [thin, fat]) {
        el.style.opacity = '0';
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

    const T = (selector, value) => {
      const el = svg.querySelector(selector);
      if (!el) return;
      // Der <title> im Text ist die Beschreibung – nur den Textknoten ändern
      const node = [...el.childNodes].find((n) => n.nodeType === 3);
      if (node) node.nodeValue = value;
      else el.append(value);
    };

    /* --- Solar --- */
    if (has.solar) {
      const strings = breakdown(h, c.pv_power);
      T('#label-solar-text .val', fmtPower(p.pv));
      T('#label-solar-text .cap', tot ? `(${fmtEnergy(sum(h, c.pv_energy, energy) ?? 0)})` : '');
      this.#extraLine(
        svg, '#label-solar-text', 'wuefl-strings',
        strings.length > 1
          ? `≈ ${strings.map((s) => `${this.#short(s.name)} ${fmtPower(s.value)}`).join(' · ')}`
          : '',
      );
      svg.querySelector('#solar')?.classList.toggle('is-active', p.pv >= 20);
    }

    /* --- Netz --- */
    if (has.netz) {
      const imp = sum(h, c.grid_import_energy, energy);
      const exp = sum(h, c.grid_export_energy, energy);
      T('#label-netz-text .val',
        `${p.grid >= 0 ? 'beziehen' : 'einspeisen'} ${fmtPower(Math.abs(p.grid))}`);
      // Beide Summenzeilen über die Liste ansprechen. Ein Selektor mit
      // :nth-of-type greift hier nicht, weil er die <text>-Geschwister
      // zählt und nicht die mit der Klasse .sum-out.
      const sums = svg.querySelectorAll('#label-netz-text .sum-out');
      if (sums[0]) sums[0].textContent = tot && imp !== null ? `bezogen ${fmtEnergy(imp)}` : '';
      if (sums[1]) sums[1].textContent = tot && exp !== null ? `eingespeist ${fmtEnergy(exp)}` : '';
    }

    /* --- Batterie --- */
    if (has.batterie) {
      const socs = breakdown(h, c.battery_soc, num);
      const soc = socs.length ? socs.reduce((a, s) => a + s.value, 0) / socs.length : null;
      T('#label-batterie-text .name', soc === null ? 'Batterie' : `Batterie ${fmtPercent(soc)}`);
      T('#label-batterie-text .val',
        `${p.battery > 0 ? 'entlädt' : p.battery < 0 ? 'lädt' : 'bereit'} ${fmtPower(Math.abs(p.battery))}`);
      const outE = sum(h, c.battery_out_energy, energy);
      const inE = sum(h, c.battery_in_energy, energy);
      T('#label-batterie-text .sum-out', tot && outE !== null ? `entladen ${fmtEnergy(outE)}` : '');
      T('#label-batterie-text .sum-in', tot && inE !== null ? `geladen ${fmtEnergy(inE)}` : '');
      if (soc !== null) {
        svg.style.setProperty('--soc', (Math.max(0, Math.min(100, soc)) / 100).toFixed(3));
      }
      svg.querySelector('#battery')?.classList.toggle('is-active', Math.abs(p.battery) >= 20);
    }

    /* --- Wallboxen: eine Zeile je Fahrzeug --- */
    if (has.wallbox) {
      const list = this.#wallboxes();
      const rows = this.#wallboxRows(svg);
      rows.forEach((row, i) => {
        const wb = list[i];
        const show = !!wb;
        for (const el of row) el.style.display = show ? '' : 'none';
        if (!show) return;
        const pw = Math.abs(power(h, wb.power_entity) ?? 0);
        const soc = num(h, wb.car_soc_entity);
        row.forEach((el) => {
          const cls = el.getAttribute('class');
          if (cls === 'car') el.textContent = wb.name ?? `Auto ${i + 1}`;
          else if (cls === 'car-val' || cls === 'car-sum') {
            el.textContent = soc === null ? '' : fmtPercent(soc);
          } else if (cls === 'val') el.textContent = fmtPower(pw);
          else if (cls === 'sum') {
            const e = energy(h, wb.today_energy_entity);
            el.textContent = tot && e !== null ? `(${fmtEnergy(e)})` : '';
          }
        });
      });
      svg.querySelector('#wallbox')?.classList.toggle('is-active', p.wallbox >= 20);
    }

    /* --- Wärmepumpe --- */
    if (has.waermepumpe) {
      T('#label-waermepumpe-text .val', fmtPower(p.heatpump));
      const e = sum(h, c.heatpump_energy, energy);
      T('#label-waermepumpe-text .sum', tot && e !== null ? `(${fmtEnergy(e)})` : '');
      svg.querySelector('#heatpump')?.classList.toggle('is-active', p.heatpump >= 20);
    }

    /* --- Haushalt --- */
    T('#label-haushalt .val', fmtPower(p.house));
    const he = energy(h, c.house_energy);
    T('#label-haushalt .sum', tot && he !== null ? `(${fmtEnergy(he)})` : '');
    svg.querySelector('#house')?.classList.toggle('is-active', p.house >= 20);

    /* --- Flüsse --- */
    this.#flow('solar', p.pv, false, COLORS.pv);
    this.#flow('netz', Math.abs(p.grid), p.grid < 0,
      p.grid >= 0 ? COLORS.grid_import : COLORS.grid_export);
    this.#flow('batterie', Math.abs(p.battery), p.battery < 0,
      p.battery > 0 ? COLORS.battery_out : COLORS.battery_in);
    this.#flow('wallbox', p.wallbox, true, COLORS.wallbox);
    this.#flow('waermepumpe', p.heatpump, true, COLORS.heatpump);
  }

  /** Alle Textzeilen der Wallbox-Gruppe nach Zeile sortiert. */
  #wallboxRows(svg) {
    const texts = [...svg.querySelectorAll('#label-wallbox-text text')].filter(
      (t) => t.getAttribute('class') !== 'name',
    );
    const byY = new Map();
    for (const t of texts) {
      const y = t.getAttribute('y');
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(t);
    }
    return [...byY.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, els]) => els);
  }

  /** Zusatzzeile unter einem Textblock, etwa die Strang-Näherung. */
  #extraLine(svg, groupSel, id, value) {
    const group = svg.querySelector(groupSel);
    if (!group) return;
    let el = group.querySelector(`#${id}`);
    if (!value) {
      if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      const ref = group.querySelector('.val');
      if (!ref) return;
      el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('id', id);
      el.setAttribute('class', 'sum');
      el.setAttribute('x', ref.getAttribute('x'));
      el.setAttribute('y', String(Number(ref.getAttribute('y')) + 26));
      group.appendChild(el);
    }
    el.style.display = '';
    el.textContent = value;
  }

  #short(name) {
    return name.replace(/(PV|Solar|Leistung|Power)/gi, '').replace(/\s+/g, ' ').trim() || name;
  }

  #flow(key, watt, reverse, color) {
    const pair = this.#els.flows?.[key];
    if (!pair) return;
    const on = Math.abs(watt) >= 20;
    const dur = Math.max(0.4, Math.min(2.4, 2200 / Math.max(1, Math.abs(watt))));
    for (const el of [pair.thin, pair.fat]) {
      el.style.opacity = on ? '' : '0';
      el.style.stroke = color;
      el.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      el.classList.toggle('rev', !!reverse);
    }
  }

  /* ------------------------------ Geld ------------------------------ */

  #renderMoney() {
    const c = this.#config;
    const h = this.#hass;
    const imp = sum(h, c.grid_import_energy, energy);
    const exp = sum(h, c.grid_export_energy, energy);
    const pv = sum(h, c.pv_energy, energy);
    const pImp = priceInfo(h, c, 'import').now;
    const pExp = priceInfo(h, c, 'export').now;
    const ref = c.price_reference ?? pImp;

    const items = [];
    if (exp !== null && pExp !== null) {
      items.push({ k: 'Einspeisung heute', v: fmtEuro((exp * pExp) / 100) });
    }
    if (imp !== null && pImp !== null) {
      items.push({ k: 'Netzbezug heute', v: fmtEuro(-(imp * pImp) / 100) });
    }
    if (items.length === 2) {
      items.push({ k: 'Bilanz', v: fmtEuro((exp * pExp - imp * pImp) / 100) });
    }
    if (pv !== null && ref !== null) {
      const own = Math.max(0, pv - (exp ?? 0));
      items.push({ k: 'Durch PV gespart', v: fmtEuro((own * ref) / 100, { signed: false }) });
    }

    this.#els.money.innerHTML = items
      .map((i) => `<div class="tile"><span class="k">${i.k}</span><span class="v">${i.v}</span></div>`)
      .join('');
  }

  /* --------------------- Preis und Prognose in einem ---------------- */

  #pvCurve() {
    const ids = asList(this.#config.pv_forecast_entities);
    const attr = this.#config.pv_forecast_attribute ?? 'watt_hours_period';
    const byHour = new Map();
    let total = 0;
    for (const id of ids) {
      const st = this.#hass.states[id];
      if (!st) continue;
      const v = energy(this.#hass, id);
      if (v !== null) total += v;
      const raw = st.attributes[attr];
      if (raw && typeof raw === 'object') {
        for (const [t, wh] of Object.entries(raw)) {
          const d = new Date(t);
          if (d.toDateString() !== new Date().toDateString()) continue;
          byHour.set(d.getHours(), (byHour.get(d.getHours()) ?? 0) + Number(wh) / 1000);
        }
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
