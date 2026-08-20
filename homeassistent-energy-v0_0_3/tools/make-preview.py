#!/usr/bin/env python3
"""Baut aus den echten Kartendateien eine eigenstaendige Vorschau-HTML.

Die Quelldateien werden nicht veraendert: die Import-Zeilen fliegen raus,
das export-Schluesselwort ebenso, dann wandert alles in ein <script>.
Damit zeigt die Vorschau immer den tatsaechlichen Stand.
"""

import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "www" / "wuefl_energy"
OUT = ROOT / "preview.html"

IMPORT_RE = re.compile(r"import\s*\{[^}]*\}\s*from\s*'\./wuefl-energy-shared\.js';\s*", re.S)


def strip(path, drop_imports=False):
    text = path.read_text(encoding="utf-8")
    if drop_imports:
        text = IMPORT_RE.sub("", text)
    text = re.sub(r"^export (async function|const|function|class|let)\b", r"\1", text, flags=re.M)
    return text


shared = strip(SRC / "wuefl-energy-shared.js")
# Jede Karte kommt in einen eigenen Block: die Dateien deklarieren alle
# ein CSS, SCHEMA und LABELS auf oberster Ebene, das kollidiert sonst.
cards = "\n".join(
    "(function () {\n" + strip(SRC / name, drop_imports=True) + "\n})();"
    for name in (
        "wuefl-energy-live-card.js",
        "wuefl-energy-history-card.js",
        "wuefl-wallbox-card.js",
    )
)

svg_b64 = base64.b64encode((SRC / "energieflow.svg").read_bytes()).decode()

HTML = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wuefl Energie – Layout-Vorschau</title>
<style>
  /* Nachbau der Home-Assistant-Umgebung. Genau die Variablen, die die
     Karten lesen – mehr braucht es nicht, um das Layout zu beurteilen. */
  :root {
    color-scheme: light;
    --primary-color: #03a9f4;
    --text-primary-color: #fff;
    --primary-text-color: #212121;
    --secondary-text-color: #727272;
    --card-background-color: #fff;
    --secondary-background-color: #e5e5e5;
    --divider-color: rgba(0,0,0,.12);
    --error-color: #db4437;
    --ha-card-border-radius: 12px;
    --ha-card-box-shadow: 0 2px 6px rgba(0,0,0,.12);
    --energy-solar-color: #ff9800;
    --energy-grid-consumption-color: #488fc2;
    --energy-grid-return-color: #8353d1;
    --energy-battery-in-color: #f6c34c;
    --energy-battery-out-color: #4db0a2;
    --app-bg: #f2f4f6;
  }
  html.dark {
    color-scheme: dark;
    --primary-text-color: #e1e1e1;
    --secondary-text-color: #9b9b9b;
    --card-background-color: #1c1c1c;
    --secondary-background-color: #2c2c2c;
    --divider-color: rgba(255,255,255,.12);
    --app-bg: #111213;
  }

  * { box-sizing: border-box; }
  body {
    background: var(--app-bg);
    color: var(--primary-text-color);
    font-family: Roboto, "Helvetica Neue", system-ui, sans-serif;
    margin: 0;
    padding: 0 0 4rem;
  }

  .bar {
    align-items: center;
    background: var(--card-background-color);
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    padding: .6rem 1rem;
    position: sticky;
    top: 0;
    z-index: 10;

    & strong { margin-right: auto; }
    & button {
      background: var(--secondary-background-color);
      border: 0; border-radius: 999px; color: inherit; cursor: pointer;
      font: inherit; font-size: .85rem; padding: .35rem .9rem;
    }
    & button.on { background: var(--primary-color); color: var(--text-primary-color); }
  }

  .views { display: grid; gap: 1.5rem; padding: 1.25rem; }
  .view > h2 {
    color: var(--secondary-text-color);
    font-size: .8rem; font-weight: 600; letter-spacing: .08em;
    margin: 0 0 .6rem; text-transform: uppercase;
  }
  .view { margin-inline: auto; width: 100%; }
  .grid { display: grid; gap: 1rem; }

  /* Breite wie eine HA-Sections-Spalte, damit die Beurteilung stimmt. */
  body[data-width="narrow"] .view { max-width: 420px; }
  body[data-width="column"] .view { max-width: 620px; }
  body[data-width="wide"] .view { max-width: 1100px; }
  body[data-width="wide"] .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  .note {
    background: var(--card-background-color);
    border-left: 3px solid var(--primary-color);
    border-radius: 6px;
    color: var(--secondary-text-color);
    font-size: .82rem;
    margin: 0 1.25rem;
    padding: .6rem .8rem;
  }
</style>
</head>
<body data-width="column">

<div class="bar">
  <strong>wuefl Energie – Layout-Vorschau</strong>
  <button data-theme="light" class="on">Hell</button>
  <button data-theme="dark">Dunkel</button>
  <span style="width:1rem"></span>
  <button data-width="narrow">Handy</button>
  <button data-width="column" class="on">Eine Spalte</button>
  <button data-width="wide">Zwei Spalten</button>
</div>

<p class="note">
  Erfundene Sensorwerte, echter Kartencode. Icons sind vereinfachte Platzhalter
  in der richtigen Groesse – in Home Assistant zeichnet <code>ha-icon</code> die
  Material-Design-Icons.
</p>

<div class="views">
  <section class="view"><h2>Ansicht: Live</h2><div class="grid" id="v-live"></div></section>
  <section class="view"><h2>Ansicht: Energie</h2><div class="grid" id="v-history"></div></section>
  <section class="view"><h2>Ansicht: Wallbox</h2><div class="grid" id="v-wallbox"></div></section>
</div>

<script id="svg-data" type="text/plain">__SVG_B64__</script>

<script type="module">
/* ================================================================== *
 * 1. Home-Assistant-Ersatz
 * ================================================================== */

/** ha-icon: einfache Platzhalter in korrekter Groesse. */
const GLYPHS = {
  'mdi:close': 'M6 6 L18 18 M18 6 L6 18',
  'mdi:tune': 'M4 7h10 M18 7h2 M4 12h4 M12 12h8 M4 17h12 M20 17h0',
  'mdi:power': 'M12 4v8 M7.5 6.5a7 7 0 1 0 9 0',
  'mdi:flash': 'M13 3 L6 13h5l-1 8 7-10h-5z',
  'mdi:white-balance-sunny': 'M12 8a4 4 0 1 0 .01 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M19 5l-1.5 1.5 M6.5 17.5L5 19',
  'mdi:cash-clock': 'M3 7h12v8H3z M17 12a5 5 0 1 0 .01 0 M19 14v2h2',
  'mdi:calendar-month': 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  'mdi:home-battery': 'M3 11 L11 4 l8 7 M5 11v9h12v-9 M9 14h4v4H9z',
  'mdi:thermometer': 'M12 3a2 2 0 0 1 2 2v8a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z',
  'default': 'M5 5h14v14H5z',
};

class HaIcon extends HTMLElement {
  static observedAttributes = ['icon'];
  connectedCallback() { this.#draw(); }
  attributeChangedCallback() { this.#draw(); }
  #draw() {
    const d = GLYPHS[this.getAttribute('icon')] ?? GLYPHS.default;
    this.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    this.style.cssText =
      'display:inline-grid;place-items:center;flex:none;' +
      'width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);';
    this.querySelector('svg').style.cssText = 'width:100%;height:100%;';
  }
}
customElements.define('ha-icon', HaIcon);

/* --- Erfundene Zustaende ------------------------------------------- */

const now = new Date();
const iso = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).toISOString();

const st = (state, attributes = {}) => ({ state: String(state), attributes });

const PV_CURVE = [0,0,0,0,0,.05,.4,1.2,2.4,3.6,4.5,5.1,5.3,5.0,4.2,3.1,1.9,.9,.3,.02,0,0,0,0];
const PRICE_CURVE = [22,20,19,18,18,21,27,34,31,26,21,17,14,13,16,21,29,38,41,36,31,27,25,23];

const states = {
  'weather.home': st('partlycloudy', { temperature: 19, friendly_name: 'Zuhause' }),

  'sensor.pv_power': st(4180, { unit_of_measurement: 'W', friendly_name: 'PV Leistung' }),
  'sensor.pv_string_1': st(2380, { unit_of_measurement: 'W', friendly_name: 'PV Sued' }),
  'sensor.pv_string_2': st(1800, { unit_of_measurement: 'W', friendly_name: 'PV Ost' }),
  'sensor.pv_energy_today': st(23.7, { unit_of_measurement: 'kWh', friendly_name: 'PV heute' }),
  'sensor.solcast_today': st(31.2, {
    unit_of_measurement: 'kWh',
    friendly_name: 'Solcast Prognose heute',
    watt_hours_period: Object.fromEntries(PV_CURVE.map((v, h) => [iso(h), v * 1000])),
  }),

  'sensor.grid_power': st(-1240, { unit_of_measurement: 'W', friendly_name: 'Netz' }),
  'sensor.grid_import_today': st(6.8, { unit_of_measurement: 'kWh' }),
  'sensor.grid_export_today': st(9.4, { unit_of_measurement: 'kWh' }),

  'sensor.battery_power': st(-820, { unit_of_measurement: 'W', friendly_name: 'Speicher' }),
  'sensor.battery_soc': st(64, { unit_of_measurement: '%', friendly_name: 'Speicher Ladestand' }),
  'sensor.battery_in_today': st(7.9, { unit_of_measurement: 'kWh' }),
  'sensor.battery_out_today': st(5.2, { unit_of_measurement: 'kWh' }),

  'sensor.house_power': st(690, { unit_of_measurement: 'W', friendly_name: 'Haushalt' }),
  'sensor.house_energy_today': st(11.3, { unit_of_measurement: 'kWh' }),

  'sensor.heatpump_power': st(1150, { unit_of_measurement: 'W', friendly_name: 'Waermepumpe' }),
  'sensor.heatpump_energy_today': st(8.1, { unit_of_measurement: 'kWh' }),

  'sensor.strompreis': st(PRICE_CURVE[now.getHours()], {
    unit_of_measurement: 'ct/kWh',
    friendly_name: 'Strompreis',
    prices: PRICE_CURVE.map((p, h) => ({ start_time: iso(h), price: p })),
  }),

  /* Wallbox 1 */
  'sensor.wallbox_power': st(7200, { unit_of_measurement: 'W', friendly_name: 'Wallbox Carport' }),
  'sensor.ev6_soc': st(47, { unit_of_measurement: '%', friendly_name: 'EV6 Ladestand' }),
  'number.ev6_ziel': st(80, { unit_of_measurement: '%', min: 20, max: 100, step: 5 }),
  'sensor.wallbox_session': st(12.4, { unit_of_measurement: 'kWh' }),
  'sensor.wallbox_today': st(18.9, { unit_of_measurement: 'kWh' }),
  'sensor.wallbox_total': st(2431, { unit_of_measurement: 'kWh' }),
  'input_select.wallbox_modus': st('Solar + guenstig', {
    options: ['Aus', 'Solar', 'Solar + guenstig', 'Schnell'], friendly_name: 'Lademodus',
  }),
  'input_select.wallbox_prioritaet': st('Hausakku zuerst', {
    options: ['Hausakku zuerst', 'Auto zuerst'],
  }),
  'input_number.wallbox_ladestrom': st(16, { unit_of_measurement: 'A', min: 6, max: 16, step: 1 }),
  'input_number.wallbox_preisgrenze': st(24, { unit_of_measurement: 'ct', min: 0, max: 60, step: 1 }),
  'input_number.wallbox_reserve': st(30, { unit_of_measurement: '%', min: 0, max: 100, step: 5 }),
  'input_boolean.wallbox_hausakku': st('on'),

  /* Wallbox 2 */
  'sensor.wallbox2_power': st(0, { unit_of_measurement: 'W', friendly_name: 'Wallbox Garage' }),
  'sensor.zoe_soc': st(92, { unit_of_measurement: '%', friendly_name: 'Zoe Ladestand' }),
  'number.zoe_ziel': st(90, { unit_of_measurement: '%', min: 20, max: 100, step: 5 }),
  'sensor.wallbox2_today': st(0, { unit_of_measurement: 'kWh' }),
  'input_select.wallbox2_modus': st('Solar', { options: ['Aus', 'Solar', 'Solar + guenstig', 'Schnell'] }),
};

/* --- Zentrale Zuordnung, wie sie die Integration liefern wuerde ----- */

const CENTRAL = {
  live: {
    title: 'Zuhause',
    weather_entity: 'weather.home',
    show_totals: true,
    pv_power_total: 'sensor.pv_power',
    pv_power: ['sensor.pv_string_1', 'sensor.pv_string_2'],
    pv_energy: ['sensor.pv_energy_today'],
    pv_forecast_entities: ['sensor.solcast_today'],
    grid_power: 'sensor.grid_power',
    grid_import_energy: ['sensor.grid_import_today'],
    grid_export_energy: ['sensor.grid_export_today'],
    battery_power: ['sensor.battery_power'],
    battery_soc: ['sensor.battery_soc'],
    battery_in_energy: ['sensor.battery_in_today'],
    battery_out_energy: ['sensor.battery_out_today'],
    house_power: 'sensor.house_power',
    house_energy: 'sensor.house_energy_today',
    heatpump_power: ['sensor.heatpump_power'],
    heatpump_energy: ['sensor.heatpump_energy_today'],
  },
  price: { price_entity: 'sensor.strompreis', price_export_fixed: 8.2 },
  history: {
    title: 'Energie',
    pv_energy: ['sensor.pv_energy_today'],
    grid_import: ['sensor.grid_import_today'],
    grid_export: ['sensor.grid_export_today'],
    battery_in: ['sensor.battery_in_today'],
    battery_out: ['sensor.battery_out_today'],
    house_energy: ['sensor.house_energy_today'],
    wallbox_energy: ['sensor.wallbox_today'],
    heatpump_energy: ['sensor.heatpump_energy_today'],
    battery_soc: ['sensor.battery_soc'],
  },
  wallbox_1: {
    name: 'Kia EV6',
    capacity: 77,
    max_power: 11000,
    car_soc_entity: 'sensor.ev6_soc',
    target_soc_entity: 'number.ev6_ziel',
    mode_entity: 'input_select.wallbox_modus',
    priority_entity: 'input_select.wallbox_prioritaet',
    current_entity: 'input_number.wallbox_ladestrom',
    price_limit_entity: 'input_number.wallbox_preisgrenze',
    battery_reserve_entity: 'input_number.wallbox_reserve',
    battery_use_entity: 'input_boolean.wallbox_hausakku',
    power_entity: 'sensor.wallbox_power',
    session_energy_entity: 'sensor.wallbox_session',
    today_energy_entity: 'sensor.wallbox_today',
    total_energy_entity: 'sensor.wallbox_total',
    battery_soc_entity: ['sensor.battery_soc'],
  },
  wallbox_2: {
    name: 'Renault Zoe',
    capacity: 52,
    max_power: 11000,
    car_soc_entity: 'sensor.zoe_soc',
    target_soc_entity: 'number.zoe_ziel',
    mode_entity: 'input_select.wallbox2_modus',
    power_entity: 'sensor.wallbox2_power',
    today_energy_entity: 'sensor.wallbox2_today',
  },
};

/* --- Statistiken fuer die Energie-Ansicht --------------------------- */

const SHAPE = {
  'sensor.pv_energy_today':      PV_CURVE.map((v) => v * 0.9),
  'sensor.grid_import_today':    PV_CURVE.map((v, h) => Math.max(0, 1.1 - v * 0.35) * (h > 5 ? 1 : .5)),
  'sensor.grid_export_today':    PV_CURVE.map((v) => Math.max(0, v - 1.6) * 0.7),
  'sensor.battery_in_today':     PV_CURVE.map((v) => Math.max(0, v - 2.4) * 0.55),
  'sensor.battery_out_today':    PV_CURVE.map((v, h) => (v < .3 && h > 16 ? 1.1 : 0)),
  'sensor.house_energy_today':   PV_CURVE.map((_, h) => .35 + (h > 6 && h < 9 ? .6 : 0) + (h > 17 && h < 22 ? .9 : 0)),
  'sensor.wallbox_energy':       [],
  'sensor.wallbox_today':        PV_CURVE.map((_, h) => (h >= 11 && h <= 15 ? 2.6 : 0)),
  'sensor.heatpump_energy_today':PV_CURVE.map((_, h) => (h < 8 || h > 19 ? .8 : .25)),
};

function statistics(ids) {
  const out = {};
  const hours = Math.max(1, now.getHours() + 1);
  for (const id of ids) {
    if (id === 'sensor.battery_soc') {
      out[id] = Array.from({ length: hours }, (_, h) => ({
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime(),
        mean: Math.max(8, Math.min(98, 22 + PV_CURVE.slice(0, h + 1).reduce((a, v) => a + v * 3.1, 0) - h * 1.6)),
      }));
      continue;
    }
    const shape = SHAPE[id];
    if (!shape || !shape.length) continue;
    out[id] = Array.from({ length: hours }, (_, h) => ({
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime(),
      change: Number(shape[h].toFixed(3)),
    }));
  }
  return out;
}

/* --- Das hass-Objekt ------------------------------------------------ */

const hass = {
  states,
  themes: { darkMode: false },
  connection: { subscribeEvents: async () => () => {} },
  async callWS(msg) {
    if (msg.type === 'wuefl_energy/get') return CENTRAL;
    if (msg.type === 'recorder/statistics_during_period') return statistics(msg.statistic_ids);
    return {};
  },
  async callService(domain, service, data, target) {
    if (service === 'get_forecasts') {
      const entity = target?.entity_id;
      return {
        response: {
          [entity]: {
            forecast: [
              { datetime: iso(12), condition: 'partlycloudy', temperature: 21, templow: 11 },
              { datetime: new Date(+now + 864e5).toISOString(), condition: 'sunny', temperature: 24, templow: 12 },
              { datetime: new Date(+now + 1728e5).toISOString(), condition: 'rainy', temperature: 18, templow: 10 },
              { datetime: new Date(+now + 2592e5).toISOString(), condition: 'cloudy', temperature: 17, templow: 9 },
              { datetime: new Date(+now + 3456e5).toISOString(), condition: 'windy', temperature: 19, templow: 8 },
            ],
          },
        },
      };
    }
    // Bedienelemente in der Vorschau: Wert lokal uebernehmen, neu zeichnen.
    const id = data?.entity_id;
    if (id && states[id]) {
      if (service === 'select_option') states[id] = st(data.option, states[id].attributes);
      else if (service === 'set_value') states[id] = st(data.value, states[id].attributes);
      else if (service === 'turn_on') states[id] = st('on', states[id].attributes);
      else if (service === 'turn_off') states[id] = st('off', states[id].attributes);
      push();
    }
    return {};
  },
};

/* Die SVG-Datei liegt eingebettet im Dokument. */
const SVG_TEXT = new TextDecoder().decode(
  Uint8Array.from(atob(document.getElementById('svg-data').textContent.trim()), (c) => c.charCodeAt(0)),
);
const realFetch = window.fetch.bind(window);
window.fetch = (url, ...rest) =>
  String(url).endsWith('energieflow.svg')
    ? Promise.resolve(new Response(SVG_TEXT, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }))
    : realFetch(url, ...rest);

/* ================================================================== *
 * 2. Der echte Kartencode
 * ================================================================== */

__SHARED__

__CARDS__

/* ================================================================== *
 * 3. Karten einhaengen
 * ================================================================== */

const mounted = [];

function add(target, tag, config) {
  const el = document.createElement(tag);
  el.setConfig(config);
  document.getElementById(target).appendChild(el);
  mounted.push(el);
  return el;
}

function push() {
  // Neues Objekt, damit die Karten die Aenderung bemerken.
  const snapshot = { ...hass, states: { ...hass.states } };
  for (const el of mounted) el.hass = snapshot;
}

add('v-live', 'wuefl-energy-live-card', { title: 'Zuhause', show_totals: true });
add('v-history', 'wuefl-energy-history-card', { title: 'Energie', default_period: 'day' });
add('v-wallbox', 'wuefl-wallbox-card', { slot: 1 });
add('v-wallbox', 'wuefl-wallbox-card', { slot: 2 });
push();

/* Leichte Bewegung, damit die laufenden Kabel und Werte lebendig wirken. */
setInterval(() => {
  const jitter = (id, base, spread) => {
    if (!states[id]) return;
    states[id] = st(Math.round(base + (Math.random() - .5) * spread), states[id].attributes);
  };
  jitter('sensor.pv_power', 4180, 900);
  jitter('sensor.grid_power', -1240, 1400);
  jitter('sensor.battery_power', -820, 700);
  jitter('sensor.house_power', 690, 300);
  jitter('sensor.wallbox_power', 7200, 800);
  push();
}, 2500);

/* ================================================================== *
 * 4. Schalter in der Kopfleiste
 * ================================================================== */

for (const btn of document.querySelectorAll('.bar button')) {
  btn.addEventListener('click', () => {
    const group = btn.dataset.theme ? 'theme' : 'width';
    for (const b of document.querySelectorAll(`.bar button[data-${group}]`)) b.classList.remove('on');
    btn.classList.add('on');

    if (group === 'theme') {
      const dark = btn.dataset.theme === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      hass.themes = { darkMode: dark };
      for (const el of mounted) {
        const svg = el.shadowRoot?.querySelector('.scene svg');
        if (svg) svg.style.colorScheme = dark ? 'dark' : 'light';
      }
      push();
    } else {
      document.body.dataset.width = btn.dataset.width;
    }
  });
}
</script>
</body>
</html>
"""

OUT.write_text(
    HTML.replace("__SVG_B64__", svg_b64)
        .replace("__SHARED__", shared)
        .replace("__CARDS__", cards),
    encoding="utf-8",
)
print(f"{OUT} geschrieben, {OUT.stat().st_size // 1024} KB")
