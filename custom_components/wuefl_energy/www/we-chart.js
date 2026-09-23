/**
 * we-chart.js
 * Eigenständiges Diagramm-Element mit automatischer Einheiten-Skalierung,
 * kalendergenauen Zeiträumen, HTML-Legende und Bucket-Zeitspannen im Tooltip.
 */
import { registerCard, cssColor } from './we-shared.js';

class WueflEnergyChart extends HTMLElement {
    #config = {};
    #hass = null;
    #built = false;
    #chartEl = null;
    #els = {};
    #hiddenSeries = new Set();
    #isActive = false;
    #lastFetch = 0;
    // Laufende Nummer der Abfrage: schnelles Hin- und Herschalten startet
    // mehrere Abfragen, nur die zuletzt gestartete darf zeichnen.
    #seq = 0;
    #fs = null;        // <dialog> für die Vollbild-Ansicht
    #fsChart = null;

    #unitFactors = {
        'mW': 0.001, 'W': 1, 'kW': 1000, 'MW': 1000000, 'GW': 1000000000,
        'mWh': 0.001, 'Wh': 1, 'kWh': 1000, 'MWh': 1000000, 'GWh': 1000000000
    };

    setConfig(config) {
        if (!config || !config.series) {
            throw new Error("we-chart benötigt mindestens eine 'series'.");
        }
        this.config = config;
    }

    getCardSize() { 
        return this.#config.card_size || 4; 
    }

    set config(config) {
        this.#config = config;
        // Im Vollbild ist Zoomen/Verschieben gleich aktiv
        if (config?._fullscreen) this.#isActive = true;
        if (this.#fs?.open) this.#fsChart.config = { ...config, title: '', _fullscreen: true };
        if (this.#built) this.#refresh();
    }

    /**
     * HA setzt hass bei jeder Zustandsänderung irgendeiner Entität neu. Die
     * Statistik ändert sich aber höchstens alle 5 Minuten – deshalb nur dann
     * neu abfragen. Zeitraum- oder Konfigurationswechsel laden sofort (config).
     */
    set hass(hass) {
        this.#hass = hass;
        if (this.#fs?.open) this.#fsChart.hass = hass;
        if (!this.#built) this.#build();
        if (this.#config?.series && Date.now() - this.#lastFetch > 300000) this.#refresh();
    }

    #build() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
        ha-card { display: flex; flex-direction: column; flex: 1; height: 100%; box-sizing: border-box; overflow: hidden; }
        
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 16px 0 16px; flex-shrink: 0; }
        .title { font-size: var(--ha-card-header-font-size, 20px); font-weight: 500; color: var(--ha-card-header-color, var(--primary-text-color)); }
        .chip {
          --_chip-color: var(--chip-color);
          border-radius: 12px; border: 1px solid var(--_chip-color, lightgray);
          --l: light-dark(95%, 5%)
          background: hsl(from var(--_chip-color) h s var(--l)); color: var(--_chip-color, var(--primary-text-color));
          font-size: 14px; font-weight: 600; padding: 4px 12px; display: none; align-items: center;  
        }

        .legend-container {
          display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 6px 16px;
          align-items: center; flex-shrink: 0; user-select: none;
        }
        .legend-container[data-pos*="center"] { justify-content: center; }
        .legend-container[data-pos*="right"] { justify-content: flex-end; }
        .legend-container[data-pos*="left"] { justify-content: flex-start; }

        .legend-container.inner {
          position: absolute; z-index: 2; pointer-events: auto;
          background: rgba(var(--rgb-card-background-color, 255, 255, 255), 0.85);
          backdrop-filter: blur(4px); padding: 6px 12px; border-radius: 8px;
          border: 1px solid var(--divider-color, #e0e0e0);
        }
        .legend-container.inner[data-pos*="top"] { top: 8px; }
        .legend-container.inner[data-pos*="bottom"] { bottom: 8px; }
        .legend-container.inner[data-pos*="left"] { left: 12px; }
        .legend-container.inner[data-pos*="right"] { right: 12px; }

        .legend-item {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
          color: var(--primary-text-color); cursor: pointer; opacity: 1; transition: opacity 0.2s;
        }
        .legend-item.disabled { opacity: 0.35; text-decoration: line-through; }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

        .chart-slot { flex: 1; min-height: 0; position: relative; padding: 0px 8px 4px 8px; display: flex; flex-direction: column; }
        ha-chart-base { width: 100%; height: 100%; flex: 1; display: block; }
        .error { color: var(--error-color, red); padding: 16px; }
        .hright { align-items: center; display: flex; gap: 4px; margin-left: auto; }
        .fs-btn {
          align-items: center; background: none; border: 0; border-radius: 50%; color: var(--secondary-text-color);
          cursor: pointer; display: inline-flex; height: 32px; justify-content: center; padding: 0; width: 32px;
        }
        .fs-btn:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); }
        .fs-btn ha-icon { --mdc-icon-size: 22px; }
        :host([data-fullscreen]) .fs-btn { display: none; }
        dialog.fs {
          background: var(--card-background-color, var(--primary-background-color, #fff)); border: 0;
          box-sizing: border-box; color: var(--primary-text-color); display: none; flex-direction: column;
          height: 100dvh; margin: 0; max-height: none; max-width: none; padding: 8px 8px 12px; width: 100vw;
        }
        dialog.fs[open] { display: flex; }
        dialog.fs::backdrop { background: rgba(0, 0, 0, .5); }
        dialog.fs .fs-head { align-items: center; display: flex; gap: 8px; padding: 4px 8px 8px; }
        dialog.fs .fs-title { flex: 1; font-size: 18px; font-weight: 500; }
        dialog.fs .fs-body { flex: 1; min-height: 0; }
        dialog.fs .fs-body we-chart { display: block; height: 100%; }
      </style>
      <div class="header"><div class="title"></div>
        <div class="hright"><div class="chip"></div>
          <button type="button" class="fs-btn" title="Vollbild" aria-label="Diagramm im Vollbild öffnen"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
        </div>
      </div>
      <div class="legend-slot-top"></div>
      <div class="chart-slot">
        <div class="legend-slot-inner"></div>
      </div>
      <div class="legend-slot-bottom"></div>
    `;
        root.replaceChildren(card);

        this.#els = {
            title: card.querySelector('.title'),
            chip: card.querySelector('.chip'),
            slot: card.querySelector('.chart-slot'),
            legendTop: card.querySelector('.legend-slot-top'),
            legendInner: card.querySelector('.legend-slot-inner'),
            legendBottom: card.querySelector('.legend-slot-bottom'),
        };
        this.#built = true;

        const fsBtn = card.querySelector('.fs-btn');
        fsBtn.hidden = this.#config?.fullscreen === false || !!this.#config?._fullscreen;
        fsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // sonst schaltet der Klick die Karte in den Zoom-Modus
            this.#openFullscreen();
        });

        card.addEventListener('click', () => {
            if (!this.#isActive) {
                this.#isActive = true;
                this.classList.add('is-active');
                this.#refresh();
            }
        });

        window.addEventListener('pointerdown', (e) => {
            if (this.#isActive && !this.#config?._fullscreen && !e.composedPath().includes(this)) {
                this.#isActive = false;
                this.classList.remove('is-active');
                this.#refresh();
            }
        });
    }

    /**
     * Vollbild: dasselbe Diagramm groß in einem Dialog. Der Dialog liegt in
     * der obersten Ebene des Browsers – Transformationen im Dashboard stören
     * ihn nicht. Wo erlaubt (Android, Desktop) zusätzlich echtes Vollbild;
     * auf dem iPhone gibt es das für normale Elemente nicht.
     */
    #openFullscreen() {
        if (!this.#fs) {
            const dlg = document.createElement('dialog');
            dlg.className = 'fs';
            dlg.innerHTML = `
                <div class="fs-head"><span class="fs-title"></span>
                  <button type="button" class="fs-btn close" title="Schließen" aria-label="Vollbild schließen"><ha-icon icon="mdi:fullscreen-exit"></ha-icon></button>
                </div>
                <div class="fs-body"></div>`;
            dlg.querySelector('.close').addEventListener('click', () => dlg.close());
            dlg.addEventListener('close', () => {
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                dlg.querySelector('.fs-body').replaceChildren();
                this.#fsChart = null;
            });
            this.shadowRoot.appendChild(dlg);
            this.#fs = dlg;
        }
        const chart = document.createElement('we-chart');
        chart.setAttribute('data-fullscreen', '');
        this.#fs.querySelector('.fs-title').textContent = this.#config.title || '';
        this.#fs.querySelector('.fs-body').replaceChildren(chart);
        this.#fsChart = chart;
        this.#fs.showModal();
        chart.config = { ...this.#config, title: '', _fullscreen: true };
        chart.hass = this.#hass;
        this.#fs.requestFullscreen?.().catch(() => {});
    }

    #resolveColor(colorStr) {
        if (!colorStr) return '#999999';
        let resolved = cssColor(this, colorStr, colorStr);
        if (typeof resolved === 'string' && resolved.includes('var(')) {
            const match = resolved.match(/var\((--[^,\s)]+)(?:,\s*(.+))?\)/);
            if (match) {
                const varName = match[1];
                const fallback = match[2] ? match[2].trim() : '#999999';
                const computed = getComputedStyle(this).getPropertyValue(varName).trim();
                resolved = computed || fallback;
            }
        }
        return resolved;
    }

    #toRgba(resolvedColor, alpha) {
        if (!resolvedColor) return `rgba(0, 0, 0, ${alpha})`;
        try {
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.fillStyle = resolvedColor;
            const res = ctx.fillStyle;
            if (res.startsWith('#')) {
                let hex = res.slice(1);
                if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            if (res.startsWith('rgb')) {
                return res.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
            }
        } catch (e) {}
        return resolvedColor;
    }

    #getScaleFactor(sourceUnit, targetUnit) {
        if (!sourceUnit || !targetUnit || sourceUnit === targetUnit) return 1;
        const sourceVal = this.#unitFactors[sourceUnit];
        const targetVal = this.#unitFactors[targetUnit];
        if (sourceVal && targetVal) return sourceVal / targetVal;
        return 1;
    }

    #calculateTimeBounds(rangeStr, customStart, customEnd) {
        if (customStart && customEnd) {
            return { start: new Date(customStart), end: new Date(customEnd) };
        }
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (!rangeStr) rangeStr = '1d';
        const match = String(rangeStr).trim().match(/^(last)?\s*(\d+)?\s*(min|h|d|w|m|y)$/i);

        if (match) {
            const isRolling = !!match[1];
            const count = parseInt(match[2] || '1', 10);
            const unit = match[3].toLowerCase();

            if (unit === 'min' || unit === 'h' || isRolling) {
                end = new Date(now.getTime());
                start = new Date(now.getTime());
                if (unit === 'min') start.setMinutes(now.getMinutes() - count);
                else if (unit === 'h') start.setHours(now.getHours() - count);
                else if (unit === 'd') start.setDate(now.getDate() - count);
                else if (unit === 'w') start.setDate(now.getDate() - (count * 7));
                else if (unit === 'm') start.setMonth(now.getMonth() - count);
                else if (unit === 'y') start.setFullYear(now.getFullYear() - count);
            } else {
                if (unit === 'd') {
                    start.setHours(0, 0, 0, 0);
                    start.setDate(now.getDate() - (count - 1));
                    end.setHours(23, 59, 59, 999);
                } else if (unit === 'w') {
                    const currentDayOfWeek = now.getDay() || 7;
                    start.setHours(0, 0, 0, 0);
                    start.setDate(now.getDate() - (currentDayOfWeek - 1) - ((count - 1) * 7));
                    end = new Date(start.getTime());
                    end.setDate(start.getDate() + (count * 7) - 1);
                    end.setHours(23, 59, 59, 999);
                } else if (unit === 'm') {
                    start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1, 0, 0, 0);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                } else if (unit === 'y') {
                    start = new Date(now.getFullYear() - (count - 1), 0, 1, 0, 0, 0);
                    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                }
            }
        }
        return { start, end };
    }

    #parseBucketSize(bucketStr, rangeStr) {
        if (typeof bucketStr === 'number') return { ms: bucketStr, unit: 'ms', val: bucketStr };

        if (!bucketStr) {
            if (rangeStr === '1d') bucketStr = '10min';
            else if (rangeStr === '1w' || rangeStr === '1m') bucketStr = '1d';
            else if (rangeStr === '1y') bucketStr = '1m';
            else bucketStr = '1h';
        }

        const match = String(bucketStr).trim().match(/^(\d+)?\s*(min|h|d|w|m|y)$/i);
        if (match) {
            const val = parseInt(match[1] || '1', 10);
            const unit = match[2].toLowerCase();
            if (unit === 'min') return { ms: val * 60000, unit: 'min', val };
            if (unit === 'h') return { ms: val * 3600000, unit: 'h', val };
            if (unit === 'd') return { ms: val * 86400000, unit: 'd', val };
            if (unit === 'w') return { ms: val * 604800000, unit: 'w', val };
            if (unit === 'm') return { ms: val * 2592000000, unit: 'm', val };
            if (unit === 'y') return { ms: val * 31536000000, unit: 'y', val };
        }
        return { ms: parseInt(bucketStr, 10) || 3600000, unit: 'h', val: 1 };
    }

    /**
     * Beginn des Buckets, in den der Zeitpunkt `t` fällt.
     *
     * Ausgerichtet an der lokalen Zeit ab `origin` (Beginn des Zeitraums),
     * nicht an UTC — sonst beginnt ein Tages-Bucket in Deutschland um 1 bzw.
     * 2 Uhr und die Werte rutschen einen Tag nach vorn.
     */
    #bucketKey(t, bucketInfo, origin) {
        const d = new Date(t);
        if (bucketInfo.unit === 'm' || bucketInfo.unit === 'y') {
            const months = bucketInfo.unit === 'y' ? 12 * bucketInfo.val : bucketInfo.val;
            const idx = (d.getFullYear() - origin.getFullYear()) * 12 + d.getMonth() - origin.getMonth();
            const start = Math.floor(idx / months) * months;
            return new Date(origin.getFullYear(), origin.getMonth() + start, 1).getTime();
        }
        if (bucketInfo.unit === 'd' || bucketInfo.unit === 'w') {
            const days = bucketInfo.unit === 'w' ? 7 * bucketInfo.val : bucketInfo.val;
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const originDay = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate());
            const idx = Math.round((dayStart - originDay) / 86400000);
            const startIdx = Math.floor(idx / days) * days;
            return new Date(originDay.getFullYear(), originDay.getMonth(), originDay.getDate() + startIdx).getTime();
        }
        const ms = bucketInfo.ms;
        return origin.getTime() + Math.floor((t - origin.getTime()) / ms) * ms;
    }

    /** Beginn des nächsten Buckets nach `key`. */
    #nextBucket(key, bucketInfo) {
        const d = new Date(key);
        if (bucketInfo.unit === 'm') return new Date(d.getFullYear(), d.getMonth() + bucketInfo.val, 1).getTime();
        if (bucketInfo.unit === 'y') return new Date(d.getFullYear() + bucketInfo.val, d.getMonth(), 1).getTime();
        if (bucketInfo.unit === 'd') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + bucketInfo.val).getTime();
        if (bucketInfo.unit === 'w') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * bucketInfo.val).getTime();
        return key + bucketInfo.ms;
    }

    /**
     * Fasst die Statistikzeilen in Buckets zusammen.
     *
     * Vergangene Buckets ohne Daten bekommen bei Zählern (change) eine 0 —
     * da wurde nachweislich nichts verbraucht. Bei Mittelwerten (mean) ist
     * "keine Daten" dagegen etwas anderes als 0, dort bleibt es leer (null).
     * Buckets, die noch in der Zukunft liegen, entstehen gar nicht erst:
     * das Diagramm endet bei "jetzt", statt eine Null-Linie weiterzuziehen.
     */
    #bucketize(rows, bucketInfo, statType = 'change', start = null, end = null, onlyPositive = false) {
        const buckets = new Map();
        const origin = start ?? new Date(0);
        const now = Date.now();
        const isMean = statType === 'mean';

        if (start && end) {
            const last = Math.min(end.getTime(), now);
            for (let k = this.#bucketKey(start.getTime(), bucketInfo, origin); k <= last; k = this.#nextBucket(k, bucketInfo)) {
                buckets.set(k, { sum: 0, count: 0 });
            }
        }

        const prepared = this.#prepareRows(rows, isMean, onlyPositive, now);
        for (const [t, value] of prepared) {
            const key = this.#bucketKey(t, bucketInfo, origin);
            const b = buckets.get(key) ?? { sum: 0, count: 0 };
            b.sum += value; b.count += 1;
            buckets.set(key, b);
        }

        return [...buckets.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([t, b]) => [t, isMean ? (b.count > 0 ? b.sum / b.count : null) : b.sum]);
    }

    /**
     * Statistikzeilen aufbereiten: Rückschritte verrechnen und verspätete
     * Zählerschritte auf die Nullen davor verteilen.
     *
     * Ein Wechselrichter zählt in festen Schritten, bei Sungrow 0,1 kWh. Bei
     * kleiner Last steht deshalb minutenlang 0 und dann kommt der ganze
     * Schritt auf einmal – verbraucht wurde aber die ganze Zeit über. Ein
     * einzelner Schritt nach einer Nullstrecke wird daher gleichmäßig über
     * diese Strecke verteilt. Größere Sprünge (echter Verbrauch, z. B. der
     * Start der Wallbox) bleiben, wo sie sind, und die Summe ändert sich nie.
     */
    #prepareRows(rows, isMean, onlyPositive, now) {
        const out = [];
        // Gerechnete Zähler (z. B. Hausverbrauch = PV − Einspeisung + Bezug …)
        // springen kurz zurück, wenn ihre Einzelwerte zu verschiedenen Zeiten
        // gelesen werden. Als Minus landete das auf der falschen Seite der
        // Nulllinie. Der Rückschritt wird deshalb mit den nächsten Schritten
        // verrechnet – die Summe über den Zeitraum bleibt damit dieselbe.
        let carry = 0;

        for (const row of rows ?? []) {
            const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
            if (Number.isNaN(t) || t > now) continue;

            let value = Number(isMean ? (row.mean ?? row.state) : row.change);
            if (!Number.isFinite(value)) continue;
            if (onlyPositive && !isMean) {
                value += carry;
                carry = value < 0 ? value : 0;
                if (value < 0) value = 0;
            }

            out.push([t, value]);
        }

        if (isMean || !onlyPositive || out.length < 4) return out;

        // Schrittweite des Zählers: die kleinen Schritte, nicht der kleinste –
        // ein einzelner Rest aus der Verrechnung soll sie nicht verfälschen
        const positives = out.map(([, v]) => v).filter((v) => v > 0.0001).sort((a, b) => a - b);
        if (positives.length < 4) return out;
        const quantum = positives[Math.floor(positives.length * 0.1)];
        const MAX_RUN = 12;   // höchstens eine Stunde zurück verteilen
        let zeros = 0;

        for (let i = 0; i < out.length; i += 1) {
            const value = out[i][1];
            if (value <= 0.0001) { zeros += 1; continue; }
            // Nur der einzelne Schritt des Zählers wird verteilt
            if (zeros > 0 && zeros <= MAX_RUN && value <= quantum * 1.5) {
                const share = value / (zeros + 1);
                for (let k = i - zeros; k <= i; k += 1) out[k][1] = share;
            }
            zeros = 0;
        }
        return out;
    }

    #calculateNativeChipValue(dbStats, seriesList) {
        const c = this.#config.chip;
        if (!c) return null;

        const calcType = c.calc_type || c.stat_type || 'sum';
        let targets = [];

        if (c.entity) {
            const foundSeries = seriesList.find(s => s.entity === c.entity);
            targets.push({
                entity: c.entity,
                stat_type: c.stat_type || foundSeries?.stat_type || 'change',
                multiplier: foundSeries?.multiplier ?? 1,
                sign: foundSeries?.sign ?? 1,
                chartTargetUnit: foundSeries?.chartTargetUnit
            });
        } else {
            if (c.stack) targets = seriesList.filter(s => s.stack === c.stack);
            else if (c.series) targets = seriesList.filter(s => s.name === c.series || s.id === c.series || s.entity === c.series);
            else targets = seriesList;
        }

        if (!targets.length) return null;

        if (calcType === 'sum') {
            let total = 0;
            for (const t of targets) {
                const rawRows = dbStats[t.entity] || [];
                const nativeUnit = this.#hass.states[t.entity]?.attributes?.unit_of_measurement || '';
                const targetUnit = c.unit || t.chartTargetUnit || nativeUnit;
                const scale = this.#getScaleFactor(nativeUnit, targetUnit) * (t.multiplier ?? 1) * (t.sign ?? 1);
                const statType = t.stat_type || 'change';

                for (const row of rawRows) {
                    if (statType === 'mean') {
                        const durationMs = (row.end && row.start) ? (Date.parse(row.end) - Date.parse(row.start)) : 300000;
                        const hours = durationMs / 3600000;
                        const val = row.mean ?? row.state;
                        if (val !== null && val !== undefined) total += Number(val) * scale * hours;
                    } else {
                        const val = row.change;
                        if (val !== null && val !== undefined) total += Number(val) * scale;
                    }
                }
            }
            return total;
        } else {
            const values = [];
            for (const t of targets) {
                const rawRows = dbStats[t.entity] || [];
                const nativeUnit = this.#hass.states[t.entity]?.attributes?.unit_of_measurement || '';
                const targetUnit = c.unit || t.chartTargetUnit || nativeUnit;
                const scale = this.#getScaleFactor(nativeUnit, targetUnit) * (t.multiplier ?? 1) * (t.sign ?? 1);

                for (const row of rawRows) {
                    const val = row.max ?? row.mean ?? row.change ?? row.state;
                    if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
                        values.push(Number(val) * scale);
                    }
                }
            }

            if (!values.length) return null;
            switch (calcType) {
                case 'max': return Math.max(...values);
                case 'min': return Math.min(...values);
                case 'mean': return values.reduce((a, b) => a + b, 0) / values.length;
                case 'last': return values[values.length - 1];
                default: return null;
            }
        }
    }

    #renderHtmlLegend(processedSeries) {
        this.#els.legendTop.replaceChildren();
        this.#els.legendInner.replaceChildren();
        this.#els.legendBottom.replaceChildren();

        const legendCfg = Array.isArray(this.#config.legend) ? (this.#config.legend[0] || {}) : (this.#config.legend || {});
        if (legendCfg.hidden) return;

        const pos = legendCfg.position || 'bottom-center';
        const isInner = pos.startsWith('inner-');

        const container = document.createElement('div');
        container.className = `legend-container ${isInner ? 'inner' : ''}`;
        container.dataset.pos = pos;

        const seenNames = [];

        for (const s of processedSeries) {
            const name = s.legend_group || s.name || s.entity;
            
            if (seenNames.includes(name)) continue;
            seenNames.push(name);

            const isHidden = this.#hiddenSeries.has(name);

            const item = document.createElement('div');
            item.className = `legend-item ${isHidden ? 'disabled' : ''}`;
            item.innerHTML = `
                <span class="legend-dot" style="background-color: ${s.color || '#999'};"></span>
                <span>${name}</span>
            `;

            item.addEventListener('click', () => {
                if (this.#hiddenSeries.has(name)) {
                    this.#hiddenSeries.delete(name);
                } else {
                    this.#hiddenSeries.add(name);
                }
                this.#refresh();
            });

            container.appendChild(item);
        }

        if (isInner) {
            this.#els.legendInner.appendChild(container);
        } else if (pos.includes('top')) {
            this.#els.legendTop.appendChild(container);
        } else {
            this.#els.legendBottom.appendChild(container);
        }
    }

    async #refresh() {
        if (!this.#built || !this.#hass || !this.#config?.series?.length) return;
        this.#lastFetch = Date.now();
        const seq = ++this.#seq;
        const stale = () => seq !== this.#seq;
        this.#els.title.textContent = this.#config.title || '';

        const { start, end } = this.#calculateTimeBounds(this.#config.range, this.#config.start, this.#config.end);
        const bucketInfo = this.#parseBucketSize(this.#config.aggregation, this.#config.range);
        const bucketMs = bucketInfo.ms;
        const period = bucketMs >= 86400000 ? 'day' : bucketMs >= 3600000 ? 'hour' : '5minute';

        // Reihen mit fertigen Daten (z. B. Prognose) brauchen keine Statistik
        const idsToFetch = new Set(this.#config.series.filter(s => s.entity && !s.data).map(s => s.entity));
        if (this.#config.chip?.entity) idsToFetch.add(this.#config.chip.entity);

        const yAxesConfig = Array.isArray(this.#config.y_axes) ? this.#config.y_axes : [
            { unit: this.#config.y_axis_unit || '', min: this.#config.y_axis_min, max: this.#config.y_axis_max }
        ];

        try {
            // Reihen mit fertigen Punkten (Geld, Prognose) brauchen keine Abfrage
            const dbStats = idsToFetch.size
                ? await this.#hass.callWS({
                    type: 'recorder/statistics_during_period',
                    start_time: start.toISOString(), end_time: end.toISOString(),
                    statistic_ids: Array.from(idsToFetch), period, types: ['change', 'mean', 'max', 'min'],
                })
                : {};
            if (stale()) return;

            const processedSeries = this.#config.series.map(s => {
                if (s.data) {
                    // Fertige Punkte [ms, Wert] in der Einheit der Achse
                    return {
                        ...s,
                        color: s.color || '#999999',
                        resolvedColor: this.#resolveColor(s.color),
                        // Einheit für den Tooltip: eigene Angabe, sonst die der Achse
                        chartTargetUnit: s.unit ?? yAxesConfig[s.y_axis || 0]?.unit ?? '',
                        chartData: s.data.filter(([t]) => t >= start.getTime() && t <= end.getTime()),
                    };
                }
                const raw = dbStats[s.entity] || [];
                const bucketed = this.#bucketize(raw, bucketInfo, s.stat_type || 'change', start, end, !!s.only_positive);

                const nativeUnit = this.#hass.states[s.entity]?.attributes?.unit_of_measurement || '';
                const axisIdx = s.y_axis || 0;
                const chartTargetUnit = yAxesConfig[axisIdx]?.unit || '';
                const autoChartScale = this.#getScaleFactor(nativeUnit, chartTargetUnit);
                const manualMulti = s.multiplier ?? 1;
                const sign = s.sign ?? 1;

                return {
                    ...s,
                    color: s.color || '#999999',
                    resolvedColor: this.#resolveColor(s.color),
                    stat_type: s.stat_type || 'change',
                    chartTargetUnit,
                    chartData: bucketed.map(([t, v]) => {
                        if (v === null) return [t, null];
                        const val = v * manualMulti * autoChartScale * sign;
                        return [t, Math.abs(val) < 0.000001 ? 0 : val];
                    })
                };
            });

            if (this.#config.chip?.value !== undefined) {
                // Fester Wert, z. B. der aktuelle Strompreis
                const c = this.#config.chip;
                this.#els.chip.style.display = 'flex';
                this.#els.chip.textContent =
                    `${Number(c.value).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${c.unit || ''}`.trim();
                if (c.color) this.#els.chip.style.setProperty('--chip-color', c.color);
            } else if (this.#config.chip) {
                const spanDays = (end - start) / 86400000;
                // 5-Minuten-Werte hält der Recorder nur ~10 Tage – ältere Tage stündlich
                const recent = Date.now() - start < 9 * 86400000;
                const chipPeriod = spanDays <= 1.05 ? (recent ? '5minute' : 'hour') : 'day';
                let chipStats = dbStats;
                if (chipPeriod !== period && idsToFetch.size) {
                    try {
                        chipStats = await this.#hass.callWS({
                            type: 'recorder/statistics_during_period',
                            start_time: start.toISOString(), end_time: end.toISOString(),
                            statistic_ids: Array.from(idsToFetch), period: chipPeriod,
                            types: ['change', 'mean', 'max', 'min'],
                        });
                    } catch {
                        chipStats = dbStats;
                    }
                }
                if (stale()) return;
                const finalVal = this.#calculateNativeChipValue(chipStats, processedSeries);
                if (finalVal !== null && !isNaN(finalVal)) {
                    this.#els.chip.style.display = 'flex';
                    this.#els.chip.textContent = `${finalVal.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${this.#config.chip.unit || ''}`.trim();
                    if (this.#config.chip.color) {
                        this.#els.chip.style.setProperty('--chip-color', this.#config.chip.color);
                    }
                } else {
                    this.#els.chip.style.display = 'none';
                }
            } else {
                this.#els.chip.style.display = 'none';
            }

            this.#renderHtmlLegend(processedSeries);
            this.#renderChart(processedSeries, yAxesConfig, start, end, bucketInfo);

        } catch (err) {
            if (stale()) return;
            this.#els.slot.innerHTML = `<div class="error">Fehler: ${err.message}</div>`;
        }
    }

    #renderChart(processedSeries, yAxesConfig, start, end, bucketInfo) {
        if (!customElements.get('ha-chart-base')) {
            this.#els.slot.innerHTML = '<div class="error">ha-chart-base fehlt!</div>';
            return;
        }

        const bucketMs = bucketInfo.ms;
        const isMonthly = bucketInfo.unit === 'm';

        const yAxisEcharts = yAxesConfig.map((ax, idx) => ({
            type: 'value', name: ax.unit || '', min: ax.min, max: ax.max,
            ...(ax.interval !== undefined ? { interval: ax.interval } : {}),
            ...(ax.split_number !== undefined ? { splitNumber: ax.split_number } : {}),
            position: idx === 1 ? 'right' : 'left', nameGap: 8, splitLine: { show: idx === 0 }
        }));

        const totalSeries = processedSeries.length;
        const data = processedSeries.map((s, index) => {
            const name = s.legend_group || s.name || s.entity;
            const isHidden = this.#hiddenSeries.has(name);
            const chartType = s.type || this.#config.type || 'line';
            let areaStyle = undefined;
            if (chartType === 'line') {
                if (s.fill === 'gradient') {
                    areaStyle = {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: this.#toRgba(s.resolvedColor, 0.5) },
                                { offset: 1, color: this.#toRgba(s.resolvedColor, 0.05) }
                            ]
                        }
                    };
                } else if (s.fill === 'soft') {
                    // Hintergrund-Fläche, z. B. die PV-Prognose
                    areaStyle = { color: this.#toRgba(s.resolvedColor, 0.12) };
                } else if (s.fill !== false && s.fill !== undefined) {
                    areaStyle = { opacity: 0.25 };
                }
            }

            return {
                name: name,
                id: s.name || s.entity,
                type: chartType, 
                stack: s.stack,
                // Innerhalb eines Stapels haben alle Reihen dasselbe Vorzeichen.
                // Ohne diese Angabe entscheidet ECharts bei einer 0 selbst, auf
                // welche Seite der Nulllinie sie gehört – dann landete z. B.
                // "Batterie geladen" ohne Ladung oben bei der Erzeugung.
                ...(s.stack ? { stackStrategy: 'all' } : {}),
                
                yAxisIndex: s.y_axis || 0,
                data: isHidden ? [] : s.chartData,
                smooth: chartType === 'line' ? (s.smooth ?? true) : undefined,
                // Runde Ecken, aber keine Bögen über den Messwert hinaus –
                // sonst zeigt die Kurve Spitzen, die es nie gab
                ...(chartType === 'line' && (s.smooth ?? true) ? { smoothMonotone: 'x' } : {}),
                // Treppenstufen, z. B. beim Strompreis je Stunde
                ...(chartType === 'line' && s.step ? { step: s.step } : {}),
                symbol: 'none',
                z: s.background ? 1 : s.stack ? totalSeries + 1 - index : 2,
                itemStyle: { color: s.resolvedColor }, 
                areaStyle, 
                lineStyle: chartType === 'line'
                    ? { width: 1.5, ...(s.dashed ? { type: 'dashed', opacity: 0.8 } : {}) }
                    : undefined,
                // Erzeugung und Verbrauch sind zwei Stapel. Ohne barGap stellt
                // ECharts sie nebeneinander – sie sollen aber übereinander
                // stehen, oben die Erzeugung, unten der Verbrauch.
                ...(chartType === 'bar' ? { barCategoryGap: '25%', barMaxWidth: 48, barGap: '-100%' } : {}),
            };
        });

        const spansYears = start.getFullYear() !== end.getFullYear();

        const options = {
            xAxis: [{
                type: 'time', min: start.getTime(), max: end.getTime(),
                // Kräftige Null-Linie – trennt Erzeugung (oben) und Verbrauch (unten)
                axisLine: {
                    show: true, onZero: true,
                    lineStyle: { width: 2, color: this.#resolveColor('var(--primary-text-color, #888888)') },
                },
            }],
            yAxis: yAxisEcharts,
            grid: { top: 15, left: 10, right: 10, bottom: 5, containLabel: true },
            legend: { show: false },
            dataZoom: [
                {
                    type: 'inside',
                    disabled: !this.#isActive,
                    filterMode: 'none'
                }
            ],
            tooltip: {
                trigger: 'axis',
                appendToBody: true,
                formatter: (params) => {
                    if (!params || !params.length) return '';
                    const date = new Date(params[0].value[0]);
                    
                    let headerText = '';

                    if (isMonthly) {
                        // Monats-Ansicht: Nur ausgeschriebener Monatsname (z.B. August)
                        headerText = date.toLocaleDateString('de-DE', spansYears 
                            ? { month: 'long', year: 'numeric' } 
                            : { month: 'long' });
                    } else if (bucketMs === 86400000 || (bucketInfo?.unit === 'd' && bucketInfo?.val === 1)) {
                        // Exakt 1 Tag Aggregation: Z.B. 23. August
                        headerText = date.toLocaleDateString('de-DE', spansYears 
                            ? { day: '2-digit', month: 'long', year: 'numeric' } 
                            : { day: '2-digit', month: 'long' });
                    } else if (bucketMs > 86400000) {
                        // Mehrere Tage Aggregation: Z.B. 23. – 29. Aug.
                        const dateEnd = new Date(date.getTime() + bucketMs - 86400000);
                        const d1 = date.getDate();
                        const m1 = date.toLocaleDateString('de-DE', { month: 'short' });
                        const d2 = dateEnd.getDate();
                        const m2 = dateEnd.toLocaleDateString('de-DE', { month: 'short' });
                        
                        if (spansYears) {
                            headerText = `${date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })} – ${dateEnd.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}`;
                        } else if (m1 === m2) {
                            headerText = `${d1}. – ${d2}. ${m1}`;
                        } else {
                            headerText = `${d1}. ${m1} – ${d2}. ${m2}`;
                        }
                    } else {
                        // Stündlich / Minuten-Raster: Datums-Header mit Uhrzeitbereich
                        const dateEnd = new Date(date.getTime() + bucketMs);
                        const timeStart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const timeEnd = dateEnd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const dateStr = date.toLocaleDateString('de-DE', spansYears 
                            ? { day: '2-digit', month: 'short', year: 'numeric' } 
                            : { day: '2-digit', month: 'short' });
                        headerText = `<span style="font-size: 0.85em; opacity: 0.75; margin-right: 6px;">${dateStr}</span>${timeStart} – ${timeEnd}`;
                    }

                    const itemsHtml = params.map(p => {
                        // Über den Namen suchen, nicht über den Index: ha-chart-base
                        // fügt eigene Reihen hinzu (z. B. die Jetzt-Linie), dadurch
                        // passten Beschriftung und Farbe um eine Reihe nicht mehr
                        const seriesObj = processedSeries.find(
                            s => (s.legend_group || s.name || s.entity) === p.seriesName
                        ) ?? processedSeries[p.seriesIndex];
                        const unit = seriesObj?.chartTargetUnit || '';
                        const label = seriesObj?.name || p.seriesName;
                        const val = p.value[1];
                        const colorStr = seriesObj?.color || p.color;
                        const formattedVal = (val !== null && val !== undefined)
                            ? Number(val).toLocaleString('de-DE', { maximumFractionDigits: 2 })
                            : '-';
                        
                        const markerHtml = `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${colorStr};"></span>`;

                        return `<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                          <span>${markerHtml} ${label}</span>
                          <span style="font-weight: 600;">${formattedVal} ${unit}</span>
                        </div>`;
                    }).join('');

                    const tooltipNode = document.createElement('div');
                    tooltipNode.style.padding = '4px 8px';
                    tooltipNode.innerHTML = `<div style="font-weight: 500; margin-bottom: 4px;">${headerText}</div>${itemsHtml}`;
                    return tooltipNode;
                }
            }
        };

        if (!this.#chartEl) {
            this.#chartEl = document.createElement('ha-chart-base');
            this.#chartEl.height = '100%';
            this.#els.slot.appendChild(this.#chartEl);
        }

        this.#chartEl.hass = this.#hass;
        this.#chartEl.data = data;
        this.#chartEl.options = options;
    }
}

customElements.define('we-chart', WueflEnergyChart);

registerCard({
    type: 'we-chart',
    name: 'we-chart',
    description: 'Erweitertes Energie-Diagramm mit flexibler Zeitraumauswahl.',
});