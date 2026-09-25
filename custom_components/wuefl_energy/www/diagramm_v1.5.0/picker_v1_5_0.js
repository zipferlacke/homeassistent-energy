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

import { getData, mitAlpha, getIcons } from './diagramm_v1_5_0.js';

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

/** Gesperrte Bereiche auf Tagesgrenzen normieren und sortieren. */
function normSperren(liste) {
  return (liste ?? [])
    .map((r) => ({ from: new Date(r.from ?? r.start), to: new Date(r.to ?? r.end ?? r.from ?? r.start) }))
    .filter((r) => !Number.isNaN(+r.from) && !Number.isNaN(+r.to))
    .map((r) => {
      const a = new Date(r.from); a.setHours(0, 0, 0, 0);
      const b = new Date(r.to); b.setHours(23, 59, 59, 999);
      return { from: a, to: b };
    })
    .sort((a, b) => a.from - b.from);
}

/**
 * Ist der ganze Zeitraum gesperrt?
 *
 * Nur dann wird er beim Blättern übersprungen. In der Tagesansicht reicht
 * dafür ein gesperrter Tag; in der Wochenansicht muss die ganze Woche
 * gesperrt sein, sonst gäbe es dort ja noch etwas zu sehen. Dasselbe für
 * Monat und Jahr – es ist immer dieselbe Frage, nur mit größerer Spanne.
 */
export function ganzGesperrt(sperren, start, end) {
  if (!sperren?.length) return false;
  let lauf = +start;
  for (const r of sperren) {
    if (+r.to < lauf) continue;
    if (+r.from > lauf) return false;      // Lücke – hier ist etwas frei
    lauf = +r.to + 1;
    if (lauf > +end) return true;
  }
  return lauf > +end;
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
  /** Eine DatePicker-Instanz je Klasse, für alle Picker der Seite. */
  static #instanzen = new WeakMap();
  static #instanz(Klasse) {
    if (!Zeitpicker.#instanzen.has(Klasse)) {
      try { Zeitpicker.#instanzen.set(Klasse, new Klasse()); } catch { return null; }
    }
    return Zeitpicker.#instanzen.get(Klasse);
  }

  #host; #els = {}; #hoerer = new Set();
  #stufe = 'day'; #anker = new Date(); #start; #end;
  #min = null; #max = null; #sperren = []; #stufenListe = STUFEN_NAMEN;
  #fremdReihen = new Map(); #ovDaten = null; #ovSpanne = '';
  #grenzenFn = null; #grenzenAbstand = 0; #grenzenTimer = null;
  #dp = null; #datePicker = null; #dpOpts = null;
  #ov = null; #ovGriff = null; #ovCfg = null; #renderer = null; #source = null;
  #id = null; #seq = 0;

  /**
   * @param {Element} host
   * @param {object}  opts
   * @param {string}  opts.id                Name, unter dem Diagramme sich anhängen
   * @param {object}  [opts.datePicker]      DatePicker aus wuefl-libs (Klasse
   *        oder Instanz, optional)
   * @param {object}  [opts.datePickerOptions] wird an dessen create() gereicht –
   *        etwa eine eigene Schnellwahl (`quick`)
   * @param {string}  [opts.granularity]     day | week | month | year
   * @param {Date}    [opts.min] [opts.max]  Grenzen der Auswahl
   * @param {Array}   [opts.disabled]        gesperrte Bereiche [{from, to}]
   * @param {Array}   [opts.granularities]   welche Stufen zu sehen sind,
   *        z. B. ['day','month'] – Vorgabe alle vier
   * @param {object}  [opts.overview]        { keys, renderer, source, height, color }
   * @param {Function} [opts.bounds]         async () => ({ min, max }) – von
   *        wann bis wann es überhaupt Daten gibt. Wird einmal beim Start
   *        gefragt und danach in Abständen erneut, denn während man zusieht
   *        kommen neue dazu.
   * @param {number}  [opts.boundsInterval]  Abstand in ms, Vorgabe 5 Minuten,
   *        0 schaltet das Nachfragen ab
   */
  constructor(host, opts = {}) {
    if (!host) throw new Error('[picker] Ohne Host-Element geht es nicht.');
    this.#host = host;
    this.#id = opts.id ?? null;
    this.#datePicker = opts.datePicker ?? null;
    this.#dpOpts = opts.datePickerOptions ?? null;
    this.#stufe = opts.granularity ?? 'day';
    this.#min = opts.min ? new Date(opts.min) : null;
    this.#max = opts.max ? new Date(opts.max) : null;
    this.#sperren = normSperren(opts.disabled);
    this.#stufenListe = (opts.granularities?.length
      ? STUFEN_NAMEN.filter((x) => opts.granularities.includes(x.key))
      : STUFEN_NAMEN);
    this.#ovCfg = opts.overview ?? null;
    this.#grenzenFn = typeof opts.bounds === 'function' ? opts.bounds : null;
    this.#grenzenAbstand = opts.boundsInterval ?? 300_000;
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
    if (this.#grenzenFn) this.#grenzenHolen();
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

  /**
   * Reihen eines angehängten Diagramms melden.
   *
   * Die Übersicht zeigt damit von selbst alles, was dieser Picker steuert –
   * in denselben Farben wie unten im Großen. Ohne diese Meldung bliebe sie
   * auf die Bezeichner angewiesen, die beim Bauen bekannt waren.
   */
  meldeReihen(besitzer, liste) {
    if (!liste?.length) this.#fremdReihen.delete(besitzer);
    else this.#fremdReihen.set(besitzer, liste);
    if (this.#ovCfg && !this.#ovCfg.keys?.length) this.#uebersicht();
  }

  /** Hat sich schon ein Diagramm mit seinen Reihen gemeldet? */
  hatReihen() {
    return [...this.#fremdReihen.values()].some((l) => l?.length);
  }

  /**
   * Welche Reihen die Übersicht zeigt – nachreichbar.
   *
   * Oft steht erst nach einer Abfrage fest, welche Bezeichner es überhaupt
   * gibt. Ohne Übersicht in den Optionen tut die Methode nichts.
   */
  setOverviewKeys(keys) {
    if (!this.#ovCfg) return;
    this.#ovCfg = { ...this.#ovCfg, keys: [...(keys ?? [])] };
    this.#uebersicht();
  }

  /**
   * Gesperrte Bereiche nachreichen.
   *
   * Sie gelten für das Blättern (ganz gesperrte Zeiträume werden übersprungen)
   * und werden an den Kalender weitergereicht, der sie dort ausgraut.
   */
  setDisabled(liste) {
    this.#sperren = normSperren(liste);
    if (this.#dp) { try { this.#dp.disabled = this.#sperren; } catch { /* ältere Fassung */ } }
    this.#zeichnen();
  }

  /** Grenzen nachreichen, z. B. sobald bekannt ist, ab wann es Daten gibt. */
  setBounds(min, max) {
    this.#min = min ? new Date(min) : null;
    this.#max = max ? new Date(max) : null;
    // Der Kalender bekommt die Grenzen erst beim Erstellen mit – kommen sie
    // später, muss er sie nachgereicht bekommen.
    if (this.#dp) {
      try { this.#dp.min = this.#min; this.#dp.max = this.#max; } catch { /* ältere Fassung */ }
    }
    this.#klemmen();
    this.#zeichnen();
    if (this.#ovCfg) this.#uebersicht();
  }

  destroy() {
    clearTimeout(this.#grenzenTimer);
    this.#grenzenTimer = null;
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
        <div class="dgp_stufen" role="group" aria-label="Zeitraum"${this.#stufenListe.length < 2 ? ' hidden' : ''}>
          ${this.#stufenListe.map((s) => `<button type="button" class="dgp_stufe" data-stufe="${s.key}">${html(s.name)}</button>`).join('')}
        </div>
        <div class="dgp_nav">
          <button type="button" class="dgp_btn dgp_zurueck" aria-label="Zeitraum zurück"><span data-dg-ico="zurueck"></span></button>
          <span class="dgp_ausloeser">
            <button type="button" class="dgp_label" aria-label="Zeitraum wählen">
              <span class="dgp_glyph" data-dg-ico="kalender"></span><span class="dgp_text"></span>
            </button>
            <span class="dgp_felder"></span>
          </span>
          <button type="button" class="dgp_btn dgp_vor" aria-label="Zeitraum vor"><span data-dg-ico="vor"></span></button>
        </div>
      </div>
      <div class="dgp_ov" hidden></div>`;
    const q = (s) => el.querySelector(s);
    this.#els = { stufen: q('.dgp_stufen'), nav: q('.dgp_nav'), label: q('.dgp_label'),
      text: q('.dgp_text'), ausloeser: q('.dgp_ausloeser'),
      zurueck: q('.dgp_zurueck'), vor: q('.dgp_vor'), felder: q('.dgp_felder'), ov: q('.dgp_ov') };
    // Icons aus dem gemeinsamen Satz des Diagramms – setIcons() wirkt damit
    // auch hier, und HA kann mdi-Icons einsetzen.
    const ico = getIcons();
    for (const sp of el.querySelectorAll('[data-dg-ico]')) sp.innerHTML = ico[sp.dataset.dgIco] ?? '';

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

    // Übergeben werden darf beides: die Klasse DatePicker oder eine fertige
    // Instanz davon. create() ist eine Methode der Instanz, also wird die
    // Klasse hier einmal angelegt – eine pro Seite reicht.
    const bausatz = this.#datePicker?.create
      ? this.#datePicker
      : (typeof this.#datePicker === 'function' ? Zeitpicker.#instanz(this.#datePicker) : null);
    if (bausatz) {
      try {
        this.#dp = bausatz.create([von, zu], {
          outputFormat: 'iso', showDate: true, showTime: false,
          min: this.#min, max: this.#max,
          disabled: this.#sperren,
          ...this.#dpOpts,
        });
      } catch { this.#dp = null; }   // dann eben die Felder des Browsers
    }
    box.classList.toggle('dgp_schlicht', !this.#dp);
    // Der Kalender bringt seinen eigenen Auslöser mit. Er wird durchsichtig
    // über unseren Knopf gelegt – sichtbar bleibt unserer, angeklickt wird
    // seiner. Ohne das säße neben der Beschriftung ein zweites Bedienelement.
    if (this.#dp?.triggerElm) {
      Object.assign(this.#dp.triggerElm.style, {
        boxSizing: 'border-box', cursor: 'pointer', height: '100%', inset: '0',
        margin: '0', minWidth: '0', opacity: '0', padding: '0', position: 'absolute', width: '100%',
      });
      this.#els.ausloeser.appendChild(box);
    }
  }

  /* ── Bewegen ────────────────────────────────────────────────────────────── */

  /**
   * Einen Zeitraum weiter – über vollständig gesperrte hinweg.
   *
   * Ist der nächste Zeitraum ganz gesperrt, wird der übernächste genommen und
   * so fort, bis etwas Freies kommt oder die Grenze erreicht ist. Wer alles
   * sperrt, bekommt nichts – deshalb die Obergrenze an Versuchen.
   */
  #schritt(n) {
    const grenzeOben = this.#max ?? new Date();
    for (let i = 0; i < 400; i += 1) {
      if (this.#stufe === 'custom') {
        const laenge = +this.#end - +this.#start;
        this.#start = new Date(+this.#start + n * (laenge + 1));
        this.#end = new Date(+this.#end + n * (laenge + 1));
      } else {
        this.#anker = verschiebe(this.#stufe, this.#anker, n);
        ({ start: this.#start, end: this.#end } = spanne(this.#stufe, this.#anker));
      }
      if (this.#start > grenzeOben || (this.#min && this.#end < this.#min)) break;
      if (!ganzGesperrt(this.#sperren, this.#start, this.#end)) break;
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
    const { von, zu, stufen, vor, zurueck } = this.#els;
    this.#els.text.textContent = beschriftung(this.#stufe, this.#start, this.#end);
    if (von) von.value = iso(this.#start);
    if (zu) zu.value = iso(this.#end);
    for (const b of stufen.querySelectorAll('.dgp_stufe')) {
      b.setAttribute('aria-pressed', String(b.dataset.stufe === this.#stufe));
    }
    // Kein Blättern in die Zukunft und nicht vor den ersten Wert
    const obergrenze = this.#max ?? new Date();
    vor.disabled = this.#end >= obergrenze || !this.#gibtFreies(1);
    zurueck.disabled = (!!this.#min && this.#start <= this.#min) || !this.#gibtFreies(-1);
    this.#fenster();
  }

  /** Gibt es in dieser Richtung überhaupt noch einen freien Zeitraum? */
  #gibtFreies(n) {
    if (!this.#sperren.length || this.#stufe === 'custom') return true;
    const grenzeOben = this.#max ?? new Date();
    let anker = this.#anker;
    for (let i = 0; i < 400; i += 1) {
      anker = verschiebe(this.#stufe, anker, n);
      const { start, end } = spanne(this.#stufe, anker);
      if (start > grenzeOben || (this.#min && end < this.#min)) return false;
      if (!ganzGesperrt(this.#sperren, start, end)) return true;
    }
    return false;
  }

  #melden() {
    const r = this.range;
    for (const cb of this.#hoerer) { try { cb(r, this); } catch { /* ein Hörer darf nicht alle blockieren */ } }
  }

  /**
   * Die Grenzen beim Hintergrund erfragen – einmal und dann immer wieder.
   *
   * Alles auf einmal zu laden wäre bei Jahren an Daten unsinnig. Gefragt wird
   * nur, von wann bis wann es überhaupt etwas gibt; was davon gezeichnet
   * wird, entscheidet danach der Ausschnitt. Wer die Seite lange offen
   * lässt, bekommt neu hinzugekommene Daten so trotzdem mit – solange der
   * Tab sichtbar ist, sonst wäre es Arbeit für niemanden.
   */
  async #grenzenHolen() {
    clearTimeout(this.#grenzenTimer);
    if (!this.#grenzenFn || !this.#host.isConnected) return;
    try {
      if (document.visibilityState !== 'hidden') {
        const g = await this.#grenzenFn();
        const min = g?.min ? new Date(g.min) : null;
        const max = g?.max ? new Date(g.max) : null;
        const anders = +(min ?? 0) !== +(this.#min ?? 0) || +(max ?? 0) !== +(this.#max ?? 0);
        if (anders) this.setBounds(min, max);
      }
    } catch { /* beim nächsten Mal wieder */ }
    if (this.#grenzenAbstand > 0 && this.#host.isConnected) {
      this.#grenzenTimer = setTimeout(() => this.#grenzenHolen(), this.#grenzenAbstand);
    }
  }

  /* ── Übersicht ──────────────────────────────────────────────────────────── */

  /**
   * Die kleine Kurve über den ganzen Zeitraum, mit dem Ausschnitt als Fenster.
   *
   * Der Schieberegler von ECharts zeichnet die Kurve selbst als Schatten in
   * seinem Hintergrund – eine zweite Kurve darüber wäre dieselbe Linie
   * doppelt. Die eigentliche Reihe bleibt deshalb unsichtbar und liefert nur
   * die Zahlen für den Schatten. Der Regler füllt den ganzen Streifen; seine
   * Höhe kommt aus `overview.height`.
   */
  async #uebersicht() {
    const cfg = this.#ovCfg;
    if (!cfg || !this.#renderer || !this.#source) return;
    const seq = ++this.#seq;
    const von = this.#min ?? new Date(Date.now() - 365 * 86_400_000);
    const bis = this.#max ?? new Date();
    if (cfg.height) this.#els.ov.style.setProperty('--dgp-ov-height', `${cfg.height}px`);

    if (!this.#ovGriff) {
      this.#ovGriff = this.#renderer.mount(this.#els.ov);
      this.#renderer.on?.(this.#ovGriff, 'datazoom', () => this.#ausFenster());
    }
    // Entweder die fest angegebenen Bezeichner oder alles, was die
    // angehängten Diagramme gemeldet haben.
    const reihen = cfg.keys?.length
      ? cfg.keys.map((k) => ({ key: k, color: cfg.color ?? '#888' }))
      : [...this.#fremdReihen.values()].flat();
    const keys = [...new Set(reihen.map((r) => r.key))];
    if (!keys.length) { this.#els.ov.hidden = true; return; }

    // Nur neu holen, wenn sich Zeitraum oder Reihen geändert haben. Das
    // Verschieben des Fensters allein ändert an der groben Kurve nichts.
    const kennung = `${+von}|${+bis}|${keys.join(',')}`;
    if (kennung !== this.#ovSpanne) {
      const daten = await getData(this.#source, keys, von, bis, 86_400_000);
      if (seq !== this.#seq) return;
      this.#ovDaten = daten?.zeilen ?? {};
      this.#ovSpanne = kennung;
    }

    const linien = reihen.map((r) => {
      const punkte = [];
      for (const z of this.#ovDaten?.[r.key] ?? []) {
        const t = typeof z.start === 'number' ? z.start : Date.parse(z.start);
        const v = Number(z.change ?? z.mean);
        if (Number.isFinite(t) && Number.isFinite(v)) punkte.push([t, Math.abs(v)]);
      }
      punkte.sort((a, b) => a[0] - b[0]);
      return { name: r.name ?? r.key, farbe: r.color ?? cfg.color ?? '#888', punkte };
    }).filter((l) => l.punkte.length);
    if (!linien.length) { this.#els.ov.hidden = true; return; }
    this.#els.ov.hidden = false;

    const hoehe = cfg.height ?? 72;
    const f = linien[0].farbe;
    const achse = 16;                     // Platz für die Zeitskala unten
    const textFarbe = cfg.text_color ?? '#8a8f96';
    // Der Regler liegt über den Kurven, nicht daneben: So sieht man, welcher
    // Ausschnitt gerade unten im Großen steht, und kann ihn direkt darin
    // verschieben. Sein eigener Kurvenschatten wäre dann doppelt gemoppelt.
    this.#renderer.draw(this.#ovGriff, {
      animation: false,
      grid: { left: 0, right: 0, top: 2, bottom: achse },
      xAxis: [
        {
          // Die sichtbare Achse: fest auf den ganzen Zeitraum. Grob
          // beschriftet, damit man sieht, von wann bis wann es überhaupt
          // Daten gibt.
          type: 'time', min: +von, max: +bis,
          axisLine: { show: false }, axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: textFarbe, fontSize: 10, hideOverlap: true, margin: 6 },
        },
        {
          // Eine zweite Achse nur für den Regler. Ohne sie würde er die
          // sichtbare Achse mitzoomen – dann zeigt die Übersicht genau den
          // Ausschnitt, den sie eigentlich einordnen soll.
          type: 'time', min: +von, max: +bis, show: false, gridIndex: 0,
        },
      ],
      yAxis: [{ type: 'value', show: false, min: 0 }],
      tooltip: { show: false },
      dataZoom: [{
        type: 'slider', xAxisIndex: 1, showDetail: false, brushSelect: false,
        showDataShadow: false,
        top: 0, bottom: achse, borderColor: 'transparent', backgroundColor: 'transparent',
        fillerColor: mitAlpha(f, 0.18),
        handleStyle: { color: f, borderColor: f },
        moveHandleStyle: { color: f, opacity: .6 },
        emphasis: { handleStyle: { color: f, borderColor: f } },
        startValue: +this.#start, endValue: +this.#end,
      }],
      series: linien.map((l) => ({
        type: 'line', name: l.name, data: l.punkte, symbol: 'none', smooth: true, silent: true,
        xAxisIndex: 0,
        lineStyle: { width: 1, color: l.farbe },
        areaStyle: { color: mitAlpha(l.farbe, .18) },
      })),
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
