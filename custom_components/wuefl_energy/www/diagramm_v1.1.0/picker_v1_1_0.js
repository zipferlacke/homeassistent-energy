/**
 * picker.js – Zeitraumauswahl für ein oder mehrere Diagramme
 * ============================================================================
 *
 * Tag / Woche / Monat / Jahr, vor und zurück, dazu ein Feld für den freien
 * Zeitraum. Wer den DatePicker aus wuefl-libs übergibt, bekommt darauf den
 * Kalender; ohne ihn bleiben es zwei gewöhnliche <input type="date"> – die
 * tun es auch, sie sehen nur schlichter aus.
 *
 * ── Verknüpfung ─────────────────────────────────────────────────────────────
 * Jeder Picker hat eine id. Ein Diagramm hängt sich mit `picker: '<id>'` daran
 * und bekommt von da an seinen Zeitraum von ihm. So steuert ein Picker drei
 * Diagramme und ein zweiter die übrigen zwei – ohne dass die Diagramme
 * voneinander wissen müssen.
 *
 *   const p = new Zeitpicker(box, { id: 'oben', datePicker: DatePicker });
 *   d.setConfig({ picker: 'oben', series: [...] });
 *
 * Die Reihenfolge ist egal: Ein Diagramm, das sich an eine noch nicht
 * gebaute id hängt, wird benachrichtigt, sobald es sie gibt.
 *
 * ── Übersicht ───────────────────────────────────────────────────────────────
 * Mit `overview` zeichnet der Picker zusätzlich den ganzen Zeitraum grob als
 * kleine Kurve und legt den aktuellen Ausschnitt als Fenster darüber. Das
 * Fenster lässt sich ziehen und an den Rändern aufziehen; beim Loslassen
 * folgen alle angehängten Diagramme.
 */

import { getData } from './diagramm_v1_1_0.js';

/* ══════════════════════════════════════════════════════════════════════════
   Verzeichnis: wer hört auf welche id
   ══════════════════════════════════════════════════════════════════════════ */

const REGISTER = new Map();   // id -> Zeitpicker
const WARTEND = new Map();    // id -> Set<callback>, für Hörer vor dem Picker

/** Picker zu einer id, oder null. */
export function getPicker(id) { return REGISTER.get(id) ?? null; }

/**
 * Auf einen Picker hören – auch wenn es ihn noch nicht gibt.
 * Gibt eine Funktion zum Abmelden zurück.
 */
export function onPicker(id, cb) {
  const da = REGISTER.get(id);
  if (da) { da.on(cb); cb(da.range, da); return () => da.off(cb); }
  if (!WARTEND.has(id)) WARTEND.set(id, new Set());
  WARTEND.get(id).add(cb);
  return () => {
    WARTEND.get(id)?.delete(cb);
    REGISTER.get(id)?.off(cb);
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Kalenderrechnung
   ══════════════════════════════════════════════════════════════════════════ */

export const STUFEN_NAMEN = [
  { key: 'day', name: 'Tag' },
  { key: 'week', name: 'Woche' },
  { key: 'month', name: 'Monat' },
  { key: 'year', name: 'Jahr' },
];

const ende = (d) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };

/** Vollständiger Kalenderzeitraum der Stufe, in dem `datum` liegt. */
export function spanne(stufe, datum) {
  const d = new Date(datum);
  if (stufe === 'week') {
    const wt = d.getDay() || 7;                       // Montag = 1
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (wt - 1));
    return { start: s, end: ende(new Date(+s + 6 * 86_400_000)) };
  }
  if (stufe === 'month') {
    return { start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: ende(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  if (stufe === 'year') {
    return { start: new Date(d.getFullYear(), 0, 1), end: ende(new Date(d.getFullYear(), 11, 31)) };
  }
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { start: s, end: ende(s) };
}

/** `n` Stufen weiter (negativ: zurück). */
export function verschiebe(stufe, datum, n) {
  const d = new Date(datum);
  if (stufe === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
  if (stufe === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1);
  if (stufe === 'year') return new Date(d.getFullYear() + n, 0, 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Beschriftung des aktuellen Zeitraums. */
export function beschriftung(stufe, start, end) {
  const o = { day: { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' },
    month: { month: 'long', year: 'numeric' }, year: { year: 'numeric' } };
  if (stufe === 'week') {
    return `${start.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} – `
      + `${end.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  if (stufe === 'custom') {
    return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }
  return start.toLocaleDateString(undefined, o[stufe] ?? o.day);
}

/* ══════════════════════════════════════════════════════════════════════════
   Der Picker
   ══════════════════════════════════════════════════════════════════════════ */

const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Zeitpicker {
  #host; #els = {}; #hoerer = new Set();
  #stufe = 'day'; #anker = new Date(); #start; #end;
  #min = null; #max = null;
  #dp = null; #datePicker = null;
  #ov = null; #ovGriff = null; #ovCfg = null; #renderer = null; #source = null;
  #id = null; #seq = 0;

  /**
   * @param {Element} host
   * @param {object}  opts
   * @param {string}  opts.id                Name, unter dem Diagramme sich anhängen
   * @param {object}  [opts.datePicker]      DatePicker aus wuefl-libs (optional)
   * @param {string}  [opts.granularity]     day | week | month | year
   * @param {Date}    [opts.min] [opts.max]  Grenzen der Auswahl
   * @param {object}  [opts.overview]        { keys, renderer, source, height, color }
   */
  constructor(host, opts = {}) {
    if (!host) throw new Error('[picker] Ohne Host-Element geht es nicht.');
    this.#host = host;
    this.#id = opts.id ?? null;
    this.#datePicker = opts.datePicker ?? null;
    this.#stufe = opts.granularity ?? 'day';
    this.#min = opts.min ? new Date(opts.min) : null;
    this.#max = opts.max ? new Date(opts.max) : null;
    this.#ovCfg = opts.overview ?? null;
    this.#renderer = opts.overview?.renderer ?? null;
    this.#source = opts.overview?.source ?? null;

    ({ start: this.#start, end: this.#end } = spanne(this.#stufe, this.#anker));
    this.#bauen();
    if (this.#id) {
      REGISTER.set(this.#id, this);
      // Diagramme, die sich vor dem Picker angemeldet haben, nachziehen
      for (const cb of WARTEND.get(this.#id) ?? []) { this.#hoerer.add(cb); cb(this.range, this); }
      WARTEND.delete(this.#id);
    }
    if (this.#ovCfg) this.#uebersicht();
  }

  /* ── Schnittstelle ──────────────────────────────────────────────────────── */

  get id() { return this.#id; }
  get range() { return { start: new Date(this.#start), end: new Date(this.#end) }; }
  get granularity() { return this.#stufe; }

  on(cb) { this.#hoerer.add(cb); return () => this.#hoerer.delete(cb); }
  off(cb) { this.#hoerer.delete(cb); }

  /** Zeitraum von außen setzen. `stufe` optional, sonst "custom". */
  setRange(start, end, stufe = 'custom') {
    this.#start = new Date(start);
    this.#end = new Date(end);
    this.#stufe = stufe;
    this.#anker = new Date(this.#start);
    this.#zeichnen();
    this.#melden();
  }

  /** Auf eine Stufe wechseln – der bisherige Anker bleibt erhalten. */
  setGranularity(stufe) {
    this.#stufe = stufe;
    ({ start: this.#start, end: this.#end } = spanne(stufe, this.#anker));
    this.#klemmen();
    this.#zeichnen();
    this.#melden();
  }

  /** Grenzen nachreichen, z. B. sobald bekannt ist, ab wann es Daten gibt. */
  setBounds(min, max) {
    this.#min = min ? new Date(min) : null;
    this.#max = max ? new Date(max) : null;
    this.#klemmen();
    this.#zeichnen();
    if (this.#ovCfg) this.#uebersicht();
  }

  destroy() {
    if (this.#id && REGISTER.get(this.#id) === this) REGISTER.delete(this.#id);
    this.#hoerer.clear();
    if (this.#ovGriff) this.#renderer?.destroy?.(this.#ovGriff);
    this.#host.replaceChildren();
    this.#host.classList.remove('dgp');
  }

  /* ── Aufbau ─────────────────────────────────────────────────────────────── */

  #bauen() {
    const el = this.#host;
    el.classList.add('dgp');
    el.innerHTML = `
      <div class="dgp_leiste">
        <div class="dgp_stufen" role="group" aria-label="Zeitraum">
          ${STUFEN_NAMEN.map((s) => `<button type="button" class="dgp_stufe" data-stufe="${s.key}">${html(s.name)}</button>`).join('')}
        </div>
        <div class="dgp_nav">
          <button type="button" class="dgp_btn dgp_zurueck" aria-label="Zeitraum zurück">‹</button>
          <button type="button" class="dgp_label" aria-label="Zeitraum wählen"></button>
          <button type="button" class="dgp_btn dgp_vor" aria-label="Zeitraum vor">›</button>
        </div>
        <div class="dgp_felder"></div>
      </div>
      <div class="dgp_ov" hidden></div>`;
    const q = (s) => el.querySelector(s);
    this.#els = { stufen: q('.dgp_stufen'), nav: q('.dgp_nav'), label: q('.dgp_label'),
      zurueck: q('.dgp_zurueck'), vor: q('.dgp_vor'), felder: q('.dgp_felder'), ov: q('.dgp_ov') };

    this.#els.stufen.addEventListener('click', (e) => {
      const b = e.target.closest('.dgp_stufe');
      if (b) this.setGranularity(b.dataset.stufe);
    });
    this.#els.zurueck.addEventListener('click', () => this.#schritt(-1));
    this.#els.vor.addEventListener('click', () => this.#schritt(1));
    this.#els.label.addEventListener('click', () => this.#els.von?.showPicker?.() ?? this.#els.von?.focus());

    this.#felder();
    this.#zeichnen();
  }

  /**
   * Zwei Datumsfelder. Ist der DatePicker da, hängt er sich darauf und
   * übernimmt die Bedienung; ohne ihn bleiben es die Felder des Browsers.
   */
  #felder() {
    const box = this.#els.felder;
    const gruppe = `dgp${(Zeitpicker.zaehler = (Zeitpicker.zaehler ?? 0) + 1)}`;
    box.innerHTML = `<input type="date" class="dgp_von" aria-label="Von">`
      + `<span class="dgp_bis">–</span><input type="date" class="dgp_zu" aria-label="Bis">`;
    const [von, zu] = box.querySelectorAll('input');
    this.#els.von = von; this.#els.zu = zu;

    // Beim Speichern meldet sich erst das eine, dann das andere Feld. Ohne
    // kurzes Warten liefe dazwischen ein Zeitraum aus altem Ende und neuem
    // Anfang durch – alle Diagramme würden zweimal laden.
    let wartet = null;
    const uebernehmen = () => {
      clearTimeout(wartet);
      wartet = setTimeout(() => {
        if (!von.value || !zu.value) return;
        const a = new Date(`${von.value}T00:00:00`);
        const b = new Date(`${zu.value}T23:59:59.999`);
        if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return;
        this.setRange(a, b, 'custom');
      }, 0);
    };
    von.addEventListener('change', uebernehmen);
    zu.addEventListener('change', uebernehmen);

    if (this.#datePicker?.create) {
      try {
        this.#dp = this.#datePicker.create([von, zu], {
          outputFormat: 'iso', showDate: true, showTime: false,
          min: this.#min, max: this.#max,
        });
      } catch { this.#dp = null; }   // dann eben die Felder des Browsers
    }
    box.classList.toggle('dgp_schlicht', !this.#dp);
  }

  /* ── Bewegen ────────────────────────────────────────────────────────────── */

  #schritt(n) {
    if (this.#stufe === 'custom') {
      // Freier Zeitraum: um die eigene Länge weiterschieben
      const laenge = +this.#end - +this.#start;
      this.#start = new Date(+this.#start + n * (laenge + 1));
      this.#end = new Date(+this.#end + n * (laenge + 1));
    } else {
      this.#anker = verschiebe(this.#stufe, this.#anker, n);
      ({ start: this.#start, end: this.#end } = spanne(this.#stufe, this.#anker));
    }
    this.#klemmen();
    this.#zeichnen();
    this.#melden();
  }

  /** Nicht über die Grenzen hinaus – und nie in die Zukunft. */
  #klemmen() {
    const obergrenze = this.#max ?? new Date();
    if (this.#start > obergrenze) {
      ({ start: this.#start, end: this.#end } = spanne(
        this.#stufe === 'custom' ? 'day' : this.#stufe, obergrenze));
      this.#anker = new Date(this.#start);
    }
    if (this.#min && this.#end < this.#min) {
      ({ start: this.#start, end: this.#end } = spanne(
        this.#stufe === 'custom' ? 'day' : this.#stufe, this.#min));
      this.#anker = new Date(this.#start);
    }
  }

  #zeichnen() {
    const { label, von, zu, stufen, vor, zurueck } = this.#els;
    label.textContent = beschriftung(this.#stufe, this.#start, this.#end);
    if (von) von.value = iso(this.#start);
    if (zu) zu.value = iso(this.#end);
    for (const b of stufen.querySelectorAll('.dgp_stufe')) {
      b.setAttribute('aria-pressed', String(b.dataset.stufe === this.#stufe));
    }
    // Kein Blättern in die Zukunft und nicht vor den ersten Wert
    const obergrenze = this.#max ?? new Date();
    vor.disabled = this.#end >= obergrenze;
    zurueck.disabled = !!this.#min && this.#start <= this.#min;
    this.#fenster();
  }

  #melden() {
    const r = this.range;
    for (const cb of this.#hoerer) { try { cb(r, this); } catch { /* ein Hörer darf nicht alle blockieren */ } }
  }

  /* ── Übersicht ──────────────────────────────────────────────────────────── */

  /**
   * Die kleine Kurve über den ganzen Zeitraum, mit dem Ausschnitt als Fenster.
   *
   * Gezeichnet wird mit demselben Renderer wie die großen Diagramme – das
   * Fenster ist ECharts' Schieberegler, der kann ziehen und aufziehen von
   * Haus aus. Was er meldet, geht als neuer Zeitraum an alle Hörer.
   */
  async #uebersicht() {
    const cfg = this.#ovCfg;
    if (!cfg || !this.#renderer || !this.#source) return;
    const seq = ++this.#seq;
    const von = this.#min ?? new Date(Date.now() - 365 * 86_400_000);
    const bis = this.#max ?? new Date();
    this.#els.ov.hidden = false;
    if (cfg.height) this.#els.ov.style.setProperty('--dgp-ov-height', `${cfg.height}px`);

    if (!this.#ovGriff) {
      this.#ovGriff = this.#renderer.mount(this.#els.ov);
      this.#renderer.on?.(this.#ovGriff, 'datazoom', () => this.#ausFenster());
    }
    const keys = cfg.keys ?? [];
    const daten = await getData(this.#source, keys, von, bis, 86_400_000);
    if (seq !== this.#seq) return;

    const punkte = [];
    for (const k of keys) {
      for (const r of daten?.zeilen?.[k] ?? []) {
        const t = typeof r.start === 'number' ? r.start : Date.parse(r.start);
        const v = Number(r.change ?? r.mean);
        if (Number.isFinite(t) && Number.isFinite(v)) punkte.push([t, v]);
      }
    }
    punkte.sort((a, b) => a[0] - b[0]);

    this.#renderer.draw(this.#ovGriff, {
      animation: false,
      grid: { left: 2, right: 2, top: 4, bottom: 20 },
      xAxis: [{ type: 'time', min: +von, max: +bis, axisLabel: { show: false },
        axisTick: { show: false }, axisLine: { show: false } }],
      yAxis: [{ type: 'value', show: false, min: 0 }],
      tooltip: { show: false },
      dataZoom: [{
        type: 'slider', xAxisIndex: 0, showDetail: false, brushSelect: false,
        height: 18, bottom: 0, borderColor: 'transparent',
        startValue: +this.#start, endValue: +this.#end,
      }],
      series: [{ type: 'line', data: punkte, symbol: 'none', smooth: true,
        lineStyle: { width: 1, color: cfg.color ?? '#888' },
        areaStyle: { color: cfg.color ?? '#888', opacity: 0.2 } }],
    });
    this.#renderer.resize?.(this.#ovGriff);
  }

  /** Der Nutzer hat das Fenster geschoben – Zeitraum übernehmen. */
  #ausFenster() {
    const ec = this.#renderer?.instance?.(this.#ovGriff);
    const z = ec?.getOption?.()?.dataZoom?.[0];
    if (!z) return;
    const a = z.startValue ?? null, b = z.endValue ?? null;
    if (a === null || b === null) return;
    const neu = { a: Math.round(a), b: Math.round(b) };
    if (Math.abs(neu.a - +this.#start) < 60_000 && Math.abs(neu.b - +this.#end) < 60_000) return;
    this.#start = new Date(neu.a);
    this.#end = new Date(neu.b);
    this.#stufe = 'custom';
    this.#anker = new Date(this.#start);
    this.#els.label.textContent = beschriftung('custom', this.#start, this.#end);
    if (this.#els.von) this.#els.von.value = iso(this.#start);
    if (this.#els.zu) this.#els.zu.value = iso(this.#end);
    for (const b2 of this.#els.stufen.querySelectorAll('.dgp_stufe')) b2.setAttribute('aria-pressed', 'false');
    this.#melden();
  }

  /** Fenster der Übersicht auf den aktuellen Zeitraum stellen. */
  #fenster() {
    if (!this.#ovGriff) return;
    const ec = this.#renderer?.instance?.(this.#ovGriff);
    ec?.setOption?.({ dataZoom: [{ startValue: +this.#start, endValue: +this.#end }] });
  }
}

export default Zeitpicker;
