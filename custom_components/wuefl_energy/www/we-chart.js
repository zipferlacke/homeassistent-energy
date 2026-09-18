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
        if (this.#built) this.#refresh();
    }

    /**
     * HA setzt hass bei jeder Zustandsänderung irgendeiner Entität neu. Die
     * Statistik ändert sich aber höchstens alle 5 Minuten – deshalb nur dann
     * neu abfragen. Zeitraum- oder Konfigurationswechsel laden sofort (config).
     */
    set hass(hass) {
        this.#hass = hass;
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
      </style>
      <div class="header"><div class="title"></div><div class="chip"></div></div>
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

        card.addEventListener('click', () => {
            if (!this.#isActive) {
                this.#isActive = true;
                this.classList.add('is-active');
                this.#refresh();
            }
        });

        window.addEventListener('pointerdown', (e) => {
            if (this.#isActive && !e.composedPath().includes(this)) {
                this.#isActive = false;
                this.classList.remove('is-active');
                this.#refresh();
            }
        });
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
    #bucketize(rows, bucketInfo, statType = 'change', start = null, end = null) {
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

        for (const row of rows ?? []) {
            const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
            if (Number.isNaN(t) || t > now) continue;

            const value = Number(isMean ? (row.mean ?? row.state) : row.change);
            if (!Number.isFinite(value)) continue;

            const key = this.#bucketKey(t, bucketInfo, origin);
            const b = buckets.get(key) ?? { sum: 0, count: 0 };
            b.sum += value; b.count += 1;
            buckets.set(key, b);
        }

        return [...buckets.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([t, b]) => [t, isMean ? (b.count > 0 ? b.sum / b.count : null) : b.sum]);
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
        this.#els.title.textContent = this.#config.title || '';

        const { start, end } = this.#calculateTimeBounds(this.#config.range, this.#config.start, this.#config.end);
        const bucketInfo = this.#parseBucketSize(this.#config.aggregation, this.#config.range);
        const bucketMs = bucketInfo.ms;
        const period = bucketMs >= 86400000 ? 'day' : bucketMs >= 3600000 ? 'hour' : '5minute';

        const idsToFetch = new Set(this.#config.series.map(s => s.entity));
        if (this.#config.chip?.entity) idsToFetch.add(this.#config.chip.entity);

        const yAxesConfig = Array.isArray(this.#config.y_axes) ? this.#config.y_axes : [
            { unit: this.#config.y_axis_unit || '', min: this.#config.y_axis_min, max: this.#config.y_axis_max }
        ];

        try {
            const dbStats = await this.#hass.callWS({
                type: 'recorder/statistics_during_period',
                start_time: start.toISOString(), end_time: end.toISOString(),
                statistic_ids: Array.from(idsToFetch), period, types: ['change', 'mean', 'max', 'min'],
            });

            const processedSeries = this.#config.series.map(s => {
                const raw = dbStats[s.entity] || [];
                const bucketed = this.#bucketize(raw, bucketInfo, s.stat_type || 'change', start, end);

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

            if (this.#config.chip) {
                const spanDays = (end - start) / 86400000;
                const chipPeriod = spanDays <= 1.05 ? '5minute' : 'day';
                let chipStats = dbStats;
                if (chipPeriod !== period) {
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
                } else if (s.fill !== false && s.fill !== undefined) {
                    areaStyle = { opacity: 0.25 };
                }
            }

            return {
                name: name,
                id: s.name || s.entity,
                type: chartType, 
                stack: s.stack, 
                yAxisIndex: s.y_axis || 0,
                data: isHidden ? [] : s.chartData,
                smooth: chartType === 'line' ? (s.smooth ?? true) : undefined, 
                symbol: 'none',
                z: s.stack ? totalSeries + 1 - index : 2,
                itemStyle: { color: s.resolvedColor }, 
                areaStyle, 
                lineStyle: chartType === 'line' ? { width: 1.5 } : undefined,
                ...(chartType === 'bar' ? { barCategoryGap: '25%', barMaxWidth: 48 } : {}),
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
                        const seriesObj = processedSeries[p.seriesIndex]
                            ?? processedSeries.find(s => s.name === p.seriesName || s.entity === p.seriesName);
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