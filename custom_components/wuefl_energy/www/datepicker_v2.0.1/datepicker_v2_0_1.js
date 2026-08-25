/**
 * @typedef {Object} TranslationSet
 * @property {string} [de] - Deutscher Text
 * @property {string} [en] - Englischer Text
 */

/**
 * @typedef {Object} BaseConfig
 * @property {string}                          [lang]         - Initial-Sprache. Default: Auto-Detect.
 * @property {string}                          [locale]       - Locale für toLocaleDateString.
 * @property {Object.<string, TranslationSet>} [translations] - Eigene Übersetzungen.
 */

/**
 * BASIS KLASSE
 */
class PickerBase {
    constructor(config = {}) {
        this.translations = config.translations || {
            de: { save: 'Speichern', reset: 'Zurücksetzen', from: 'Von', to: 'Bis', placeholder: 'Datum wählen' },
            en: { save: 'Save',      reset: 'Reset',        from: 'From', to: 'To', placeholder: 'Pick a date'  },
        };

        const browserLang = navigator.language.split('-')[0];
        this.lang   = config.lang   || (this.translations[browserLang] ? browserLang : 'en');
        this.locale = config.locale || navigator.language;
        this.txt    = this.translations[this.lang] || this.translations['en'];

        this.injectCss();
    }

    t(key) { return this.txt[key] ?? key; }

    resolveLangString(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input === 'object') {
            return input[this.lang] || input.en || Object.values(input)[0] || '';
        }
        return '';
    }

    injectCss() {
        const url = new URL('./datepicker_v2_0_1.css', import.meta.url);
        if (document.querySelector(`link[href="${url.href}"]`)) return;
        document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${url.href}">`);
    }
}

/**
 * @typedef {Object} DatePickerOptions
 * @property {boolean} [showDate]              - Kalender anzeigen. Default: auto aus input type.
 * @property {boolean} [showTime]              - Zeit-Picker anzeigen. Default: auto aus input type.
 * @property {'native'|'locale'|'ms'|'iso'} [outputFormat='native']
 *                                              - 'native' = "2026-03-13T14:30" default
 *                                                'locale' = "13.03.2026" / "13.03.2026, 14:30"
 *                                                'ms'     = Unix-Millisekunden
 *                                                'iso'    = "2026-03-13" / "2026-03-13T14:30" (lokal)
 * @property {boolean} [forceJsPosition=false] - Immer per JS positionieren.
 * @property {boolean} [allowSameDay=true]     - Range: gleicher Tag als Start+Ende erlaubt.
 */

/**
 * DatePicker
 *
 * Auto-Init: Inputs mit [data-tp-picker] werden automatisch erkannt.
 *   <input type="datetime-local" data-tp-picker="1">  → Single datetime
 *   <input type="date" data-tp-picker="1">             → Single date
 *   <input type="time" data-tp-picker="1">             → Single time
 *   <input type="datetime-local" data-tp-picker="1">   → Range: erster = from
 *   <input type="datetime-local" data-tp-picker="1">   → Range: zweiter = to
 *
 * Explizite Rollen:
 *   <input data-tp-picker="1+"> → from (Start)
 *   <input data-tp-picker="1-"> → to (Ende)
 *
 * Data-Attribute:
 *   data-tp-picker="id"          → Gruppen-ID (gleiche ID = zusammen)
 *   data-tp-format="native|iso|ms|locale" → Output-Format
 *   data-tp-same-day="false"     → allowSameDay deaktivieren
 *   data-tp-position="js"        → JS-Positionierung erzwingen
 *
 * showDate / showTime wird automatisch aus dem input type erkannt:
 *   type="date"           → showDate=true,  showTime=false
 *   type="time"           → showDate=false, showTime=true
 *   type="datetime-local" → showDate=true,  showTime=true
 *
 * Manuell: dp.create(input) / dp.create([from, to], options)
 */

const MONTHS = {
    de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
};
const WEEKDAYS = {
    de: ['Mo','Di','Mi','Do','Fr','Sa','So'],
    en: ['Mo','Tu','We','Th','Fr','Sa','Su'],
};

const pad     = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class DatePicker extends PickerBase {
    /** @type {DateInstance[]} */
    activePickers;

    globalConfig = {
        showDate:        undefined, // auto aus input type
        showTime:        undefined, // auto aus input type
        outputFormat:    undefined, // auto: 'native'
        forceJsPosition: false,
        allowSameDay:    true,
    };

    constructor(config = {}) {
        super(config);
        this.activePickers = [];
        this.globalConfig  = { ...this.globalConfig, ...(config.options || {}) };
        document.addEventListener('click', e => this.#handleGlobalClick(e));

        // Auto-Init
        this.#autoInit();

        // MutationObserver für dynamisch hinzugefügte Inputs
        new MutationObserver(() => this.#autoInit()).observe(
            document.body, { childList: true, subtree: true }
        );
    }

    // ── Auto-Init ──────────────────────────────────────────────────────────────

    #autoInit() {
        const groups = {};

        document.querySelectorAll('[data-tp-picker]').forEach(el => {
            // Bereits initialisiert?
            if (this.activePickers.some(p => p.fromInput === el || p.toInput === el)) return;

            const raw = el.getAttribute('data-tp-picker');
            const { id, role } = this.#parsePickerId(raw);

            if (!groups[id]) groups[id] = [];
            groups[id].push({ el, role });
        });

        for (const entries of Object.values(groups)) {
            this.#initGroup(entries);
        }
    }

    /**
     * Parsed "1+" → { id: "1", role: "from" }
     * Parsed "1-" → { id: "1", role: "to" }
     * Parsed "1"  → { id: "1", role: null }
     */
    #parsePickerId(raw) {
        raw = (raw || '').trim();
        if (raw.endsWith('+')) return { id: raw.slice(0, -1), role: 'from' };
        if (raw.endsWith('-')) return { id: raw.slice(0, -1), role: 'to'   };
        return { id: raw || '_default', role: null };
    }

    #initGroup(entries) {
        let fromInput, toInput;

        // Explizite Rollen?
        const fromEntry = entries.find(e => e.role === 'from');
        const toEntry   = entries.find(e => e.role === 'to');

        if (fromEntry || toEntry) {
            fromInput = fromEntry?.el || entries.find(e => e.role !== 'to')?.el;
            toInput   = toEntry?.el   || null;
        } else {
            // DOM-Reihenfolge
            fromInput = entries[0]?.el;
            toInput   = entries[1]?.el || null;
        }

        if (!fromInput) return;

        // showDate / showTime aus allen Input-Types ableiten
        const types = [fromInput.type, toInput?.type].filter(Boolean);
        const hasDate = types.some(t => ['date', 'datetime-local', 'datetime'].includes(t));
        const hasTime = types.some(t => ['time', 'datetime-local', 'datetime'].includes(t));

        const options = {
            showDate: hasDate || (!hasDate && !hasTime), // Default: date
            showTime: hasTime,
            outputFormat:    fromInput.dataset.tpFormat || 'native',
            allowSameDay:    fromInput.dataset.tpSameDay !== 'false',
            forceJsPosition: fromInput.hasAttribute('data-tp-position'),
        };

        this.create(toInput ? [fromInput, toInput] : fromInput, options);
    }

    // ── Type Detection ─────────────────────────────────────────────────────────

    /**
     * Erkennt showDate/showTime aus dem input type.
     */
    #detectFromType(fromInput, toInput) {
        const types = [fromInput?.type, toInput?.type].filter(Boolean);
        const hasDate = types.some(t => ['date', 'datetime-local', 'datetime'].includes(t));
        const hasTime = types.some(t => ['time', 'datetime-local', 'datetime'].includes(t));

        return {
            showDate: hasDate || (!hasDate && !hasTime),
            showTime: hasTime,
        };
    }

    // ── Create ─────────────────────────────────────────────────────────────────

    create(inputConfig, options = {}) {
        if (!inputConfig) return null;

        let fromInput, toInput;
        if (Array.isArray(inputConfig)) {
            fromInput = inputConfig[0] ?? null;
            toInput   = inputConfig.length >= 2 ? inputConfig[1] : null;
        } else {
            fromInput = inputConfig;
            toInput   = null;
        }
        if (!fromInput) return null;
        if(fromInput.hasAttribute("data-dp-input")) return null;
        if(toInput && toInput.hasAttribute("data-dp-input")) return null;
        // Bereits initialisiert?
        if (this.activePickers.some(p => p.fromInput === fromInput)) return null;

        const opts = { ...this.globalConfig, ...options };

        // Auto-Detect wenn nicht explizit gesetzt
        const detected = this.#detectFromType(fromInput, toInput);
        const showDate = opts.showDate ?? detected.showDate;
        const showTime = opts.showTime ?? detected.showTime;
        const outputFormat = opts.outputFormat ?? 'native';

        const isRange  = toInput !== null;
        const needSave = isRange || showTime;
        const now      = new Date();

        const instance = {
            id:              'dp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            fromInput, toInput, isRange, showDate, showTime, needSave,
            outputFormat,
            forceJsPosition: opts.forceJsPosition === true,
            allowSameDay:    opts.allowSameDay !== false,
            viewYear:        now.getFullYear(),
            viewMonth:       now.getMonth(),
            showYearPanel:   false,
            selectedFrom:    showDate ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            selectedTo:      null,
            fromTime:        { h: 0,  m: 0  },
            toTime:          { h: 23, m: 59 },
            hoverDate:       null,
            triggerElm:      null,
            popover:         null,
            isOpen:          false,
            editMode:        false,
            activeSide:      'from',
            _reposition:     null,
            _scrollParents:  null,

            open:         () => this.#open(instance),
            close:        () => this.#close(instance),
            saveAndClose: () => this.#save(instance),
            reset:        () => this.#reset(instance),
        };
        fromInput.setAttribute("data-dp-input", instance.id);
        if(toInput) toInput.setAttribute("data-dp-input", instance.id);
        
        // Existierende Werte einlesen
        if (fromInput?.value) {
            const parsed = this.#parseInput(fromInput.value);
            if (parsed) {
                instance.selectedFrom = parsed;
                instance.viewYear     = parsed.getFullYear();
                instance.viewMonth    = parsed.getMonth();
                instance.fromTime     = { h: parsed.getHours(), m: parsed.getMinutes() };
            }
        }
        if (toInput?.value) {
            const parsed = this.#parseInput(toInput.value);
            if (parsed) {
                instance.selectedTo = parsed;
                instance.toTime     = { h: parsed.getHours(), m: parsed.getMinutes() };
            }
        }

        // Original-Inputs verstecken
        Object.assign(fromInput.style, {
                position: 'absolute',
                width: '0', height: '0', padding:'0', border:'none', margin:'0',
                overflow: 'hidden',
                opacity: '0',
                pointerEvents: 'none',
            });
        if (toInput) Object.assign(toInput.style, {
                position: 'absolute',
                width: '0', height: '0', padding:'0', border:'none', margin:'0',
                overflow: 'hidden',
                opacity: '0',
                pointerEvents: 'none',
            });
        

        // Trigger bauen
        instance.triggerElm = this.#buildTrigger(instance);
        
        const wrapper = document.createElement('dp-picker');
        fromInput.replaceWith(wrapper);
        fromInput.replaceWith(wrapper);
        wrapper.append(fromInput);
        if (toInput) wrapper.append(toInput);
        wrapper.append(instance.triggerElm);

        // Popover vorbereiten
        instance.popover = document.createElement('div');
        instance.popover.className = 'dp_popover';
        instance.popover.setAttribute('popover', 'manual');
        instance.popover.addEventListener('click',    e => e.stopPropagation());
        instance.popover.addEventListener('touchend', e => e.stopPropagation());

        this.activePickers.push(instance);
        return instance;
    }

    // ── Eingabe parsen ─────────────────────────────────────────────────────────

    #parseInput(val) {
        if (!val) return null;

        // Zeit (HH:MM)
        const timeMatch = val.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                parseInt(timeMatch[1]), parseInt(timeMatch[2]));
        }

        // Datum (YYYY-MM-DD) — als lokal parsen, nicht UTC
        const dateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
            return new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
        }

        // Datetime-local (YYYY-MM-DDTHH:MM)
        const dtMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (dtMatch) {
            return new Date(parseInt(dtMatch[1]), parseInt(dtMatch[2]) - 1, parseInt(dtMatch[3]),
                parseInt(dtMatch[4]), parseInt(dtMatch[5]));
        }

        // Unix-Millisekunden
        const ms = Number(val);
        if (!isNaN(ms) && val.trim() !== '') return new Date(ms);

        // Fallback
        const d = new Date(val);
        if (!isNaN(d)) return d;
        return null;
    }

    // ── Formatierung ───────────────────────────────────────────────────────────

    #formatDisplay(instance) {
        if (!instance.showDate && instance.showTime) {
            return `${pad(instance.fromTime.h)}:${pad(instance.fromTime.m)}`;
        }
        if (!instance.selectedFrom) return null;
        const d       = instance.selectedFrom;
        const dateStr = d.toLocaleDateString(this.locale);
        if (instance.showTime) {
            return `${dateStr}, ${pad(instance.fromTime.h)}:${pad(instance.fromTime.m)}`;
        }
        return dateStr;
    }

    #formatDisplayTo(instance) {
        if (!instance.selectedTo) return null;
        const d       = instance.selectedTo;
        const dateStr = d.toLocaleDateString(this.locale);
        if (instance.showTime) {
            return `${dateStr}, ${pad(instance.toTime.h)}:${pad(instance.toTime.m)}`;
        }
        return dateStr;
    }

    /**
     * Formatiert den Output-Wert fürs hidden Input.
     * 'native' gibt das Format passend zum input type zurück.
     */
    #formatOutput(d, timeObj, instance, targetInput) {
        if (!instance.showDate && instance.showTime) {
            return `${pad(timeObj.h)}:${pad(timeObj.m)}`;
        }

        const yr  = d.getFullYear();
        const mo  = d.getMonth();
        const day = d.getDate();
        const h   = timeObj.h;
        const m   = timeObj.m;

        const dt = instance.showTime
            ? new Date(yr, mo, day, h, m, 0, 0)
            : new Date(yr, mo, day);

        const format = instance.outputFormat;

        if (format === 'native') {
            // Format basierend auf input type
            const type = (targetInput || instance.fromInput)?.type || 'text';
            switch (type) {
                case 'date':
                    return `${yr}-${pad(mo + 1)}-${pad(day)}`;
                case 'time':
                    return `${pad(h)}:${pad(m)}`;
                case 'datetime-local':
                case 'datetime':
                    return `${yr}-${pad(mo + 1)}-${pad(day)}T${pad(h)}:${pad(m)}`;
                default:
                    // text, hidden etc. → locale
                    return instance.showTime
                        ? dt.toLocaleString(this.locale)
                        : dt.toLocaleDateString(this.locale);
            }
        }

        if (format === 'ms') return String(dt.getTime());

        if (format === 'iso') {
            // Lokal, nicht UTC
            if (instance.showTime) {
                return `${yr}-${pad(mo + 1)}-${pad(day)}T${pad(h)}:${pad(m)}`;
            }
            return `${yr}-${pad(mo + 1)}-${pad(day)}`;
        }

        // locale
        if (instance.showTime) {
            return dt.toLocaleString(this.locale, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            });
        }
        return dt.toLocaleDateString(this.locale);
    }

    // ── Edit-Mode Parser ───────────────────────────────────────────────────────

    #parseEditEntry(str, instance) {
        str = (str ?? '').trim();
        if (!str) return { valid: true, empty: true };

        let datePart = str, timePart = null;
        const timeMatch = str.match(/(\d{1,2}):(\d{2})\s*$/);
        if (timeMatch) {
            const h = parseInt(timeMatch[1], 10);
            const m = parseInt(timeMatch[2], 10);
            if (h < 0 || h > 23 || m < 0 || m > 59) return { valid: false };
            timePart = { h, m };
            datePart = str.substring(0, str.length - timeMatch[0].length).replace(/[,\s]+$/, '').trim();
        } else if (/:/.test(str)) {
            const partial = str.match(/(\d{1,2}):\s*(\d?)\s*$/);
            if (partial) return { valid: false };
            return { valid: false };
        }

        if (!instance.showDate) {
            if (!timePart) return { valid: false };
            return { valid: true, time: timePart };
        }

        if (!datePart) return { valid: true, partial: true, time: timePart };

        const sep   = this.lang === 'de' ? '.' : '/';
        const parts = datePart.split(sep);
        if (parts.length > 3) return { valid: false };

        let dStr, mStr, yStr;
        if (this.lang === 'de') {
            [dStr, mStr, yStr] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
        } else {
            [mStr, dStr, yStr] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
        }

        const day   = dStr ? parseInt(dStr, 10) : null;
        const month = mStr ? parseInt(mStr, 10) : null;
        const year  = yStr ? parseInt(yStr, 10) : null;

        if (day   !== null && (isNaN(day)   || day   < 1 || day   > 31))   return { valid: false };
        if (month !== null && (isNaN(month) || month < 1 || month > 12))   return { valid: false };
        if (year  !== null && (isNaN(year)  || year  < 1900 || year > 9999)) return { valid: false };

        if (day !== null && month !== null && year !== null) {
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
                return { valid: false };
            }
            if (instance.showTime && !timePart) {
                return { valid: true, date, time: null };
            }
            return { valid: true, date, time: timePart };
        }

        return {
            valid: true, partial: true,
            view: { year, month: month !== null ? month - 1 : null, day },
            time: timePart,
        };
    }

    #normalizeRange(instance) {
        if (!instance.isRange) return;
        if (!instance.selectedFrom || !instance.selectedTo) return;
        if (instance.selectedFrom <= instance.selectedTo) return;
        [instance.selectedFrom, instance.selectedTo] = [instance.selectedTo, instance.selectedFrom];
        [instance.fromTime,     instance.toTime]     = [instance.toTime,     instance.fromTime];
    }

    // ── Trigger ────────────────────────────────────────────────────────────────

    #buildTrigger(instance) {
        const el = document.createElement('div');
        el.className = 'dp_trigger';
        el.tabIndex  = 0;
        el.style.setProperty('anchor-name', `--${instance.id}`);
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); instance.open(); }
        });
        el.addEventListener('dblclick', e => {
            if (instance.editMode) return;
            e.preventDefault();
            this.#enterEditMode(instance);
        });
        this.#updateTrigger(instance, el);
        return el;
    }

    #updateTrigger(instance, el = instance.triggerElm) {
        if (!el) return;

        if (instance.editMode) {
            el.classList.add('dp_trigger_edit');
            this.#renderEditInput(instance, el);
            this.#prependEditIcon(instance, el);
            return;
        }
        el.classList.remove('dp_trigger_edit');

        const from = this.#formatDisplay(instance);
        const to   = this.#formatDisplayTo(instance);

        if (instance.isRange) {
            el.innerHTML = `
                <span class="dp_trigger_seg">${from ?? this.t('from')}</span>
                <span class="dp_trigger_arrow">→</span>
                <span class="dp_trigger_seg">${to ?? this.t('to')}</span>
            `;
        } else {
            el.innerHTML = `<span class="dp_trigger_seg">${from ?? this.t('placeholder')}</span>`;
        }
        this.#prependEditIcon(instance, el);
    }

    #prependEditIcon(instance, el) {
        const icon = document.createElement('span');
        icon.className = 'dp_trigger_edit_icon';
        icon.setAttribute('role', 'button');
        icon.setAttribute('aria-label', this.lang === 'de' ? 'Bearbeiten' : 'Edit');
        icon.tabIndex = 0;
        icon.innerHTML = `
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
</svg>`.trim();

        const activate = e => {
            e.stopPropagation();
            e.preventDefault();
            if (instance.editMode) this.#exitEditMode(instance);
            else                   this.#enterEditMode(instance);
        };
        icon.addEventListener('click', activate);
        icon.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') activate(e);
        });
        el.prepend(icon);
    }

    // ── Edit-Mode ──────────────────────────────────────────────────────────────

    #enterEditMode(instance, side = null) {
        instance.editMode   = true;
        instance.activeSide = side || 'from';
        if (!instance.isOpen) instance.open();
        this.#updateTrigger(instance);
        requestAnimationFrame(() => {
            const inp = instance.triggerElm?.querySelector(`.dp_input[data-side="${instance.activeSide}"]`);
            if (inp) this.#focusContentEditable(inp, 'end');
        });
    }

    #exitEditMode(instance) {
        if (!instance.editMode) return;
        instance.editMode = false;
        this.#updateTrigger(instance);
    }

    #renderEditInput(instance, el) {
        el.replaceChildren();
        if (instance.isRange) {
            const fromInp = this.#makeEditInput(instance, 'from');
            const toInp   = this.#makeEditInput(instance, 'to');
            const sep = document.createElement('span');
            sep.className   = 'dp_trigger_arrow';
            sep.textContent = '→';
            el.append(fromInp, sep, toInp);
        } else {
            el.append(this.#makeEditInput(instance, 'from'));
        }
        this.#applyActiveSideClass(instance);
    }

    #makeEditInput(instance, side) {
        const value = side === 'from'
            ? (this.#formatDisplay(instance) ?? '')
            : (this.#formatDisplayTo(instance) ?? '');

        const inp = document.createElement('span');
        inp.className       = 'dp_input';
        inp.dataset.side    = side;
        inp.contentEditable = 'plaintext-only';
        inp.spellcheck      = false;
        inp.role            = 'textbox';
        inp.setAttribute('aria-label', side === 'from' ? this.t('from') : this.t('to'));
        inp.textContent = value;

        inp.addEventListener('click',     e => e.stopPropagation());
        inp.addEventListener('mousedown', e => e.stopPropagation());

        inp.addEventListener('focus', () => {
            instance.activeSide = side;
            this.#applyActiveSideClass(instance);
        });

        inp.addEventListener('input', () => {
            instance.activeSide = side;
            this.#applyActiveSideClass(instance);
            this.#handleEditInputSide(instance, inp, side);
        });

        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.#allInputsValid(instance)) instance.saveAndClose();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.#exitEditMode(instance);
            } else if (e.key === 'ArrowRight' && side === 'from' && instance.isRange) {
                if (this.#isCaretAtEnd(inp)) {
                    e.preventDefault();
                    const toInp = instance.triggerElm.querySelector('.dp_input[data-side="to"]');
                    if (toInp) this.#focusContentEditable(toInp, 'start');
                }
            } else if (e.key === 'ArrowLeft' && side === 'to' && instance.isRange) {
                if (this.#isCaretAtStart(inp)) {
                    e.preventDefault();
                    const fromInp = instance.triggerElm.querySelector('.dp_input[data-side="from"]');
                    if (fromInp) this.#focusContentEditable(fromInp, 'end');
                }
            }
        });

        return inp;
    }

    #isCaretAtStart(el) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return true;
        const r = sel.getRangeAt(0);
        return r.collapsed && r.startOffset === 0;
    }

    #isCaretAtEnd(el) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return true;
        const r = sel.getRangeAt(0);
        return r.collapsed && r.startOffset === el.textContent.length;
    }

    #focusContentEditable(el, where = 'end') {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(where === 'start');
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    #applyActiveSideClass(instance) {
        instance.triggerElm?.querySelectorAll('.dp_input').forEach(inp => {
            inp.classList.toggle('dp_input_active', inp.dataset.side === instance.activeSide);
        });
    }

    #allInputsValid(instance) {
        return ![...(instance.triggerElm?.querySelectorAll('.dp_input') || [])]
            .some(i => i.classList.contains('dp_input_invalid'));
    }

    #handleEditInputSide(instance, inp, side) {
        const parsed = this.#parseEditEntry(inp.textContent, instance);

        if (!parsed.valid) { inp.classList.add('dp_input_invalid'); return; }
        inp.classList.remove('dp_input_invalid');

        const prevDate = side === 'from' ? instance.selectedFrom : instance.selectedTo;

        if (parsed.empty) {
            if (side === 'to') instance.selectedTo = null;
        } else if (parsed.date) {
            if (side === 'from') {
                instance.selectedFrom = parsed.date;
                if (parsed.time) instance.fromTime = parsed.time;
            } else {
                instance.selectedTo = parsed.date;
                if (parsed.time) instance.toTime = parsed.time;
            }
            instance.viewYear  = parsed.date.getFullYear();
            instance.viewMonth = parsed.date.getMonth();

            if (instance.isRange && prevDate) {
                const tagChanged   = prevDate.getDate()     !== parsed.date.getDate();
                const monthChanged = prevDate.getMonth()    !== parsed.date.getMonth();
                const yearChanged  = prevDate.getFullYear() !== parsed.date.getFullYear();

                if (monthChanged || yearChanged) instance.activeSide = side;
                else if (tagChanged) instance.activeSide = side === 'from' ? 'to' : 'from';
                this.#applyActiveSideClass(instance);
            }
        } else if (parsed.partial && parsed.view) {
            const v = parsed.view;
            if (v.year  !== null) instance.viewYear  = v.year;
            if (v.month !== null) instance.viewMonth = v.month;
        }

        if (instance.isRange && parsed.date && instance.selectedFrom && instance.selectedTo) {
            const wasSwapped = instance.selectedFrom > instance.selectedTo;
            this.#normalizeRange(instance);
            if (wasSwapped) {
                this.#syncEditInputValues(instance);
                instance.activeSide = instance.activeSide === 'from' ? 'to' : 'from';
                this.#applyActiveSideClass(instance);
            }
        }

        this.#refreshDays(instance);
        this.#syncHeader(instance);
    }

    #syncEditInputValues(instance) {
        if (!instance.triggerElm) return;
        const active = document.activeElement;
        instance.triggerElm.querySelectorAll('.dp_input').forEach(inp => {
            if (inp === active) return;
            const v = inp.dataset.side === 'from'
                ? (this.#formatDisplay(instance) ?? '')
                : (this.#formatDisplayTo(instance) ?? '');
            inp.textContent = v;
        });
    }

    #syncHeader(instance) {
        const lbl    = instance.popover?.querySelector('.dp_month_lbl');
        const yr     = instance.popover?.querySelector('.dp_btn_year');
        const months = MONTHS[this.lang] ?? MONTHS['en'];
        if (lbl) lbl.textContent = months[instance.viewMonth];
        if (yr)  yr.textContent  = String(instance.viewYear);
    }

    // ── Popover ────────────────────────────────────────────────────────────────

    #renderPopover(instance) {
        const pop      = instance.popover;
        const months   = MONTHS[this.lang]   ?? MONTHS['en'];
        const weekdays = WEEKDAYS[this.lang] ?? WEEKDAYS['en'];
        pop.style.setProperty('position-anchor', `--${instance.id}`);

        pop.innerHTML = `
            <div class="dp_header">
                ${instance.showDate ? `
                    <button class="dp_btn dp_btn_prev" type="button" aria-label="Vorheriger Monat">
                        <span class="dp_msr">chevron_left</span>
                    </button>
                    <div class="dp_month_year">
                        <span class="dp_month_lbl">${months[instance.viewMonth]}</span>
                        <button class="dp_btn dp_btn_year" type="button">${instance.viewYear}</button>
                    </div>
                    <button class="dp_btn dp_btn_next" type="button" aria-label="Nächster Monat">
                        <span class="dp_msr">chevron_right</span>
                    </button>
                ` : '<div></div>'}
                <div class="dp_header_actions">
                    <button class="dp_btn dp_btn_reset" type="button" title="${this.t('reset')}">
                        <span class="dp_msr">refresh</span>
                    </button>
                    <button class="dp_btn dp_btn_close" type="button" aria-label="Schließen">
                        <span class="dp_msr">close</span>
                    </button>
                </div>
            </div>

            ${instance.showDate && instance.showYearPanel ? `
                <div class="dp_year_panel">
                    <div class="dp_year_list">${this.#buildYearList(instance)}</div>
                </div>
            ` : ''}

            ${instance.showDate && !instance.showYearPanel ? `
                <div class="dp_weekdays">
                    ${weekdays.map(d => `<span>${d}</span>`).join('')}
                </div>
                <div class="dp_days">${this.#buildDayGrid(instance)}</div>
            ` : ''}

            ${instance.showTime ? this.#buildTimePicker(instance) : ''}

            ${instance.needSave ? `
                <div class="dp_footer">
                    <button class="dp_btn dp_btn_save" type="button">${this.t('save')}</button>
                </div>
            ` : ''}
        `;

        this.#attachEvents(instance);
    }

    // ── Year / Day Grid ────────────────────────────────────────────────────────

    #buildYearList(instance) {
        const cur = instance.viewYear;
        const years = [];
        for (let y = cur - 80; y <= cur + 20; y++) {
            const active = y === cur ? ' dp_year_active' : '';
            years.push(`<button class="dp_btn dp_btn_year_item${active}" data-year="${y}" type="button">${y}</button>`);
        }
        return years.join('');
    }

    #buildDayGrid(instance) {
        const { viewYear: yr, viewMonth: mo } = instance;
        const today    = new Date(); today.setHours(0, 0, 0, 0);
        const firstDay = new Date(yr, mo, 1);
        const lastDay  = new Date(yr, mo + 1, 0);
        const offset   = (firstDay.getDay() + 6) % 7;

        const cells = [];
        for (let i = 0; i < offset; i++)
            cells.push(this.#dayCell(new Date(yr, mo, i - offset + 1), instance, today, true));
        for (let d = 1; d <= lastDay.getDate(); d++)
            cells.push(this.#dayCell(new Date(yr, mo, d), instance, today, false));
        const rem = 42 - cells.length;
        for (let d = 1; d <= rem; d++)
            cells.push(this.#dayCell(new Date(yr, mo + 1, d), instance, today, true));

        return cells.join('');
    }

    #dayCell(date, instance, today, faded) {
        const ts      = date.getTime();
        const todayTs = today.getTime();
        const fromTs  = instance.selectedFrom ? new Date(dateKey(instance.selectedFrom) + 'T00:00:00').getTime() : null;
        const toTs    = instance.selectedTo   ? new Date(dateKey(instance.selectedTo)   + 'T00:00:00').getTime() : null;
        const hovTs   = instance.hoverDate    ? new Date(dateKey(instance.hoverDate)    + 'T00:00:00').getTime() : null;

        const isToday   = ts === todayTs;
        const isSelFrom = fromTs !== null && ts === fromTs;
        const isSelTo   = toTs   !== null && ts === toTs;

        const classes = [];

        if (instance.isRange && fromTs !== null && toTs !== null) {
            const lo = Math.min(fromTs, toTs);
            const hi = Math.max(fromTs, toTs);
            if      (ts === lo && ts === hi) classes.push('dp_range_start', 'dp_range_end');
            else if (ts === lo)              classes.push('dp_range_start');
            else if (ts === hi)              classes.push('dp_range_end');
            else if (ts > lo && ts < hi)     classes.push('dp_in_range');
        } else if (instance.isRange && isSelFrom) {
            classes.push('dp_range_start');
        }

        if (instance.isRange && hovTs !== null) {
            const anchorTs = instance.activeSide === 'from' ? toTs : fromTs;
            if (anchorTs !== null) {
                const lo = Math.min(anchorTs, hovTs);
                const hi = Math.max(anchorTs, hovTs);
                if      (ts === lo && ts === hi) classes.push('dp_hover_start', 'dp_hover_end');
                else if (ts === lo)              classes.push('dp_hover_start');
                else if (ts === hi)              classes.push('dp_hover_end');
                else if (ts > lo && ts < hi)     classes.push('dp_hover_in');
            }
        }

        const cls = [
            'dp_day', faded ? 'dp_faded' : '', isToday ? 'dp_today' : '',
            isSelFrom ? 'dp_sel_from' : '', isSelTo ? 'dp_sel_to' : '',
            ...classes,
        ].filter(Boolean).join(' ');

        return `<button class="${cls}" data-date="${dateKey(date)}" type="button"><span>${date.getDate()}</span></button>`;
    }

    // ── Time-Picker ────────────────────────────────────────────────────────────

    #buildTimePicker(instance) {
        const field = (hKey, mKey, timeObj) => `
            <div class="dp_time_fields">
                <input class="dp_t" type="text" inputmode="numeric" maxlength="2"
                    value="${pad(timeObj.h)}" data-t="${hKey}" data-max="23" placeholder="hh">
                <span class="dp_time_sep">:</span>
                <input class="dp_t" type="text" inputmode="numeric" maxlength="2"
                    value="${pad(timeObj.m)}" data-t="${mKey}" data-max="59" placeholder="mm">
            </div>
        `;

        if (instance.isRange) {
            return `
                <div class="dp_time dp_time_range">
                    <div class="dp_time_col">
                        <span class="dp_time_label">${this.t('from')}</span>
                        ${field('fh', 'fm', instance.fromTime)}
                    </div>
                    <div class="dp_time_col">
                        <span class="dp_time_label">${this.t('to')}</span>
                        ${field('th', 'tm', instance.toTime)}
                    </div>
                </div>
            `;
        }
        return `<div class="dp_time">${field('fh', 'fm', instance.fromTime)}</div>`;
    }

    // ── Events ─────────────────────────────────────────────────────────────────

    #attachEvents(instance) {
        const pop = instance.popover;

        pop.querySelector('.dp_btn_prev')?.addEventListener('click', () => {
            if (--instance.viewMonth < 0) { instance.viewMonth = 11; instance.viewYear--; }
            this.#renderPopover(instance);
        });
        pop.querySelector('.dp_btn_next')?.addEventListener('click', () => {
            if (++instance.viewMonth > 11) { instance.viewMonth = 0; instance.viewYear++; }
            this.#renderPopover(instance);
        });

        pop.querySelector('.dp_btn_year')?.addEventListener('click', () => {
            instance.showYearPanel = !instance.showYearPanel;
            this.#renderPopover(instance);
            if (instance.showYearPanel) {
                requestAnimationFrame(() => pop.querySelector('.dp_year_active')?.scrollIntoView({ block: 'center' }));
            }
        });
        pop.querySelectorAll('.dp_btn_year_item').forEach(btn =>
            btn.addEventListener('click', () => {
                instance.viewYear      = parseInt(btn.dataset.year);
                instance.showYearPanel = false;
                this.#renderPopover(instance);
            })
        );

        this.#attachDayEvents(instance);

        pop.querySelectorAll('.dp_t').forEach(inp => {
            inp.addEventListener('focus', () => inp.select());
            inp.addEventListener('input', () => {
                inp.value = inp.value.replace(/\D/g, '').slice(0, 2);
                const v   = parseInt(inp.value) || 0;
                const max = parseInt(inp.dataset.max);
                const key = inp.dataset.t;
                const val = clamp(v, 0, max);

                switch (key) {
                    case 'fh': instance.fromTime.h = val; break;
                    case 'fm': instance.fromTime.m = val; break;
                    case 'th': instance.toTime.h   = val; break;
                    case 'tm': instance.toTime.m   = val; break;
                }

                if (inp.value.length === 2) {
                    const nextKey = { fh: 'fm', th: 'tm' }[key];
                    if (nextKey) {
                        const next = inp.closest('.dp_time_fields')?.querySelector(`[data-t="${nextKey}"]`);
                        if (next) { next.focus(); next.select(); }
                    }
                }
            });
            inp.addEventListener('blur', () => {
                inp.value = pad(clamp(parseInt(inp.value) || 0, 0, parseInt(inp.dataset.max)));
            });
        });

        pop.querySelector('.dp_btn_save')?.addEventListener('click',  () => instance.saveAndClose());
        pop.querySelector('.dp_btn_close')?.addEventListener('click', () => instance.close());
        pop.querySelector('.dp_btn_reset')?.addEventListener('click', () => instance.reset());
    }

    // ── Day Events ─────────────────────────────────────────────────────────────

    #attachDayEvents(instance) {
        const days = instance.popover?.querySelector('.dp_days');
        if (!days || days.dataset.bound === '1') return;
        days.dataset.bound = '1';

        const dayFromEvent = e => {
            const btn = e.target.closest('.dp_day');
            if (!btn || !days.contains(btn)) return null;
            return { btn, date: new Date(btn.dataset.date + 'T00:00:00') };
        };

        days.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const hit = dayFromEvent(e);
            if (hit) this.#handleDayClick(instance, hit.date);
        });

        days.addEventListener('touchstart', e => {
            if (e.target.closest('.dp_day')) e.preventDefault();
        }, { passive: false });

        days.addEventListener('touchend', e => {
            const hit = dayFromEvent(e);
            if (!hit) return;
            e.preventDefault(); e.stopPropagation();
            this.#handleDayClick(instance, hit.date);
        }, { passive: false });

        days.addEventListener('mouseover', e => {
            if (!instance.isRange) return;
            const hit = dayFromEvent(e);
            if (!hit) return;
            const anchor = instance.activeSide === 'from' ? instance.selectedTo : instance.selectedFrom;
            if (!anchor) return;
            instance.hoverDate = hit.date;
            this.#applyHoverClasses(instance);
        });

        days.addEventListener('mouseleave', () => {
            if (!instance.hoverDate) return;
            instance.hoverDate = null;
            this.#applyHoverClasses(instance);
        });
    }

    #applyHoverClasses(instance) {
        const days = instance.popover?.querySelector('.dp_days');
        if (!days) return;

        const anchor = instance.activeSide === 'from' ? instance.selectedTo : instance.selectedFrom;
        const hov    = instance.hoverDate;
        let lo = null, hi = null;
        if (anchor && hov) {
            const a = anchor.getTime();
            const h = hov.getTime();
            lo = Math.min(a, h);
            hi = Math.max(a, h);
        }

        days.querySelectorAll('.dp_day').forEach(btn => {
            const ts = new Date(btn.dataset.date + 'T00:00:00').getTime();
            btn.classList.remove('dp_hover_start', 'dp_hover_end', 'dp_hover_in');
            if (lo === null) return;
            if (ts === lo && ts === hi) btn.classList.add('dp_hover_start', 'dp_hover_end');
            else if (ts === lo)         btn.classList.add('dp_hover_start');
            else if (ts === hi)         btn.classList.add('dp_hover_end');
            else if (ts > lo && ts < hi) btn.classList.add('dp_hover_in');
        });
    }

    #refreshDays(instance) {
        const days = instance.popover?.querySelector('.dp_days');
        if (!days) return;
        days.innerHTML = this.#buildDayGrid(instance);
        this.#attachDayEvents(instance);
    }

    #handleDayClick(instance, date) {
        if (!instance.isRange) {
            instance.selectedFrom = date;
            if (!instance.needSave) {
                instance.viewYear  = date.getFullYear();
                instance.viewMonth = date.getMonth();
                this.#syncHeader(instance);
            }
            this.#refreshDays(instance);
            this.#updateTrigger(instance);
            if (instance.editMode) this.#exitEditMode(instance);
            if (!instance.needSave) setTimeout(() => instance.saveAndClose(), 150);
            return;
        }

        const side = instance.activeSide;

        if (!instance.allowSameDay) {
            const otherDate = side === 'from' ? instance.selectedTo : instance.selectedFrom;
            if (otherDate && date.getTime() === otherDate.getTime()) return;
        }

        if (side === 'from') instance.selectedFrom = date;
        else                 instance.selectedTo   = date;

        instance.hoverDate = null;

        if (!instance.editMode) {
            instance.activeSide = side === 'from' ? 'to' : 'from';
        }

        this.#normalizeRange(instance);
        this.#refreshDays(instance);
        this.#updateTrigger(instance);

        if (instance.editMode) this.#exitEditMode(instance);
    }

    // ── Open / Close / Save / Reset ────────────────────────────────────────────

    #open(instance) {
        if (instance.isOpen) return;

        this.#renderPopover(instance);
        instance.triggerElm.insertAdjacentElement('afterend', instance.popover);
        instance.popover.showPopover();
        instance.isOpen = true;
        instance.triggerElm.classList.add('dp_trigger_open');

        const useJs = instance.forceJsPosition || !CSS.supports('anchor-name', '--test');
        if (useJs) {
            instance.popover.setAttribute('data-jsposition', '');
            this.#positionWithJs(instance);
            instance._reposition    = () => this.#positionWithJs(instance);
            instance._scrollParents = this.#getScrollParents(instance.triggerElm);
            instance._scrollParents.forEach(target =>
                target.addEventListener('scroll', instance._reposition, { passive: true })
            );
            window.addEventListener('resize', instance._reposition, { passive: true });
        } else {
            instance.popover.removeAttribute('data-jsposition');
        }
    }

    #close(instance) {
        if (!instance.isOpen) return;

        if (instance._reposition) {
            instance._scrollParents?.forEach(target =>
                target.removeEventListener('scroll', instance._reposition)
            );
            window.removeEventListener('resize', instance._reposition);
            instance._reposition    = null;
            instance._scrollParents = null;
        }

        instance.popover.removeAttribute('data-jsposition');
        instance.popover.style.cssText = '';
        instance.popover.remove();
        instance.isOpen        = false;
        instance.showYearPanel = false;
        instance.triggerElm?.classList.remove('dp_trigger_open');

        if (instance.editMode) instance.editMode = false;
        this.#revertToCommitted(instance);
    }

    #revertToCommitted(instance) {
        const fromVal    = instance.fromInput?.value ?? '';
        const fromParsed = fromVal ? this.#parseInput(fromVal) : null;
        instance.selectedFrom = fromParsed;
        if (fromParsed) {
            instance.fromTime  = { h: fromParsed.getHours(), m: fromParsed.getMinutes() };
            instance.viewYear  = fromParsed.getFullYear();
            instance.viewMonth = fromParsed.getMonth();
        } else {
            instance.fromTime = { h: 0, m: 0 };
        }

        if (instance.isRange) {
            const toVal    = instance.toInput?.value ?? '';
            const toParsed = toVal ? this.#parseInput(toVal) : null;
            instance.selectedTo = toParsed;
            instance.toTime     = toParsed
                ? { h: toParsed.getHours(), m: toParsed.getMinutes() }
                : { h: 23, m: 59 };
        }

        instance.hoverDate  = null;
        instance.activeSide = 'from';
        this.#updateTrigger(instance);
    }

    #save(instance) {
        this.#normalizeRange(instance);

        const fromDate = instance.selectedFrom ?? new Date();
        instance.fromInput.value = this.#formatOutput(fromDate, instance.fromTime, instance, instance.fromInput);
        instance.fromInput.dispatchEvent(new Event('change', { bubbles: true }));

        if (instance.isRange && instance.selectedTo && instance.toInput) {
            instance.toInput.value = this.#formatOutput(instance.selectedTo, instance.toTime, instance, instance.toInput);
            instance.toInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        instance.editMode = false;
        this.#updateTrigger(instance);
        this.#close(instance);
    }

    #reset(instance) {
        const now = new Date();
        instance.selectedFrom = instance.showDate
            ? null
            : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        instance.selectedTo   = null;
        instance.hoverDate    = null;
        instance.activeSide   = 'from';
        instance.fromTime     = { h: 0,  m: 0  };
        instance.toTime       = { h: 23, m: 59 };

        instance.fromInput.value = '';
        instance.fromInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (instance.toInput) {
            instance.toInput.value = '';
            instance.toInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        this.#updateTrigger(instance);
        this.#renderPopover(instance);
    }

    // ── Global Click ───────────────────────────────────────────────────────────

    #handleGlobalClick(e) {
        for (const inst of this.activePickers) {
            const inPop     = inst.popover?.isConnected && e.composedPath().includes(inst.popover);
            const inTrigger = inst.triggerElm?.contains(e.target);
            const inFrom    = inst.fromInput?.contains(e.target);
            const inTo      = inst.toInput?.contains(e.target);

            if (!inPop && !inTrigger && !inFrom && !inTo) {
                if (inst.isOpen) inst.close();
            } else if ((inTrigger || inFrom || inTo) && !inst.isOpen) {
                inst.open();
            }
        }
    }

    // ── JS-Positionierung ──────────────────────────────────────────────────────

    #positionWithJs(instance) {
        const pop = instance.popover;
        if (!pop || !instance.triggerElm) return;

        const rect   = instance.triggerElm.getBoundingClientRect();
        const vw     = window.innerWidth;
        const vh     = window.innerHeight;
        const gap    = 6;
        const margin = 8;

        pop.style.maxHeight = 'none';
        const naturalHeight = pop.scrollHeight;
        const naturalWidth  = pop.offsetWidth || pop.scrollWidth;

        const triggerHeight    = rect.bottom - rect.top;
        const triggerVisible   = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
        const triggerHalfHidden = triggerHeight > 0 && triggerVisible < triggerHeight / 2;

        const spaceBelow = vh - rect.bottom - gap - margin;
        const spaceAbove = rect.top         - gap - margin;

        let placeBelow;
        if (triggerHalfHidden)           placeBelow = spaceBelow >= spaceAbove;
        else if (spaceBelow >= naturalHeight) placeBelow = true;
        else if (spaceAbove > spaceBelow)     placeBelow = false;
        else                                  placeBelow = true;

        let top, maxHeight;
        if (placeBelow) {
            top       = rect.bottom + gap;
            maxHeight = Math.max(80, spaceBelow);
        } else {
            maxHeight = Math.max(80, spaceAbove);
            const useHeight = Math.min(naturalHeight, maxHeight);
            top = rect.top - gap - useHeight;
        }

        const popWidth = Math.min(naturalWidth, vw - margin * 2);
        let left = rect.left;
        if (left + popWidth > vw - margin) left = rect.right - popWidth;
        if (left < margin || left + popWidth > vw - margin) {
            left = Math.max(margin, (vw - popWidth) / 2);
        }

        pop.style.position  = 'fixed';
        pop.style.top       = top + 'px';
        pop.style.left      = left + 'px';
        pop.style.maxHeight = maxHeight + 'px';
        pop.style.margin    = '0';
    }

    #getScrollParents(el) {
        const parents = [window];
        let current   = el?.parentElement;
        while (current && current !== document.body && current !== document.documentElement) {
            const cs = getComputedStyle(current);
            if (/auto|scroll|overlay/.test(cs.overflow + cs.overflowY + cs.overflowX)) {
                parents.push(current);
            }
            current = current.parentElement;
        }
        return parents;
    }
}

new DatePicker();
