/**
 * wuefl-energy-chart.js
 * Eigenständiges Diagramm-Element mit automatischer Einheiten-Skalierung,
 * kalendergenauen Zeiträumen, isoliertem Chip-Handling und sauberer Tooltip-Formatierung.
 */
import { registerCard, cssColor } from './wuefl-energy-shared.js';

class WueflEnergyChart extends HTMLElement {
    #config = {};
    #hass = null;
    #built = false;
    #chartEl = null;
    #els = {};

    #unitFactors = {
        'mW': 0.001, 'W': 1, 'kW': 1000, 'MW': 1000000, 'GW': 1000000000,
        'mWh': 0.001, 'Wh': 1, 'kWh': 1000, 'MWh': 1000000, 'GWh': 1000000000
    };

    setConfig(config) {
        if (!config || !config.series) {
            throw new Error("wuefl-energy-chart benötigt mindestens eine 'series'.");
        }
        this.config = config;
    }

    getCardSize() { return this.#config.card_size || 4; }

    set config(config) {
        this.#config = config;
        if (this.#built) this.#refresh();
    }

    set hass(hass) {
        this.#hass = hass;
        if (!this.#built) this.#build();
        else if (this.#config?.series) this.#refresh();
    }

    #build() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; height: 100%; }
        ha-card { display: flex; flex-direction: column; flex: 1; height: 100%; box-sizing: border-box; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 16px 0 16px; }
        .title { font-size: var(--ha-card-header-font-size, 20px); font-weight: 500; color: var(--ha-card-header-color, var(--primary-text-color)); }
        .chip {
          --_chip-color: var(--chip-color);
          border-radius: 12px; border: 1px solid var(--_chip-color, lightgray);
          background: hsl(from var(--_chip-color) h s 95%); color: var(--_chip-color, var(--primary-text-color));
          font-size: 14px; font-weight: 600; padding: 4px 12px; display: none; align-items: center;  
        }
        .chart-slot { flex: 1; min-height: 160px; position: relative; padding: 4px 12px 8px 12px; }
        ha-chart-base { width: 100%; height: 100%; display: block; }
        .error { color: var(--error-color, red); padding: 16px; }
      </style>
      <div class="header"><div class="title"></div><div class="chip"></div></div>
      <div class="chart-slot"></div>
    `;
        root.replaceChildren(card);

        this.#els = {
            title: card.querySelector('.title'),
            chip: card.querySelector('.chip'),
            slot: card.querySelector('.chart-slot'),
        };
        this.#built = true;
    }

    #toRgba(colorStr, alpha) {
        if (!colorStr) return `rgba(0, 0, 0, ${alpha})`;
        let resolvedColor = colorStr;
        if (colorStr.startsWith('var(')) {
            const varName = colorStr.match(/var\(([^)]+)\)/)?.[1];
            if (varName) {
                resolvedColor = getComputedStyle(this).getPropertyValue(varName).trim() || colorStr;
            }
        }
        try {
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.fillStyle = resolvedColor;
            const resolved = ctx.fillStyle;
            if (resolved.startsWith('#')) {
                let hex = resolved.slice(1);
                if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            if (resolved.startsWith('rgb')) {
                return resolved.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
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
        if (typeof bucketStr === 'number') return bucketStr;

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
            if (unit === 'min') return val * 60000;
            if (unit === 'h') return val * 3600000;
            if (unit === 'd') return val * 86400000;
            if (unit === 'w') return val * 604800000;
            if (unit === 'm') return val * 2592000000;
            if (unit === 'y') return val * 31536000000;
        }
        return parseInt(bucketStr, 10) || 3600000;
    }

    #getLegendOptions(legendConfig) {
        const cfg = Array.isArray(legendConfig) ? (legendConfig[0] || {}) : (legendConfig || {});
        if (cfg.hidden) return { show: false };

        const pos = cfg.position || 'bottom-center';
        const isInner = pos.startsWith('inner-');

        const opts = {
            show: true,
            type: 'scroll',
            padding: [2, 10, 2, 10],
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: {
                color: this.#toRgba('var(--primary-text-color)', 1),
                fontSize: 12,
                fontFamily: 'Roboto, sans-serif'
            }
        };

        if (isInner) {
            opts.backgroundColor = this.#toRgba('var(--card-background-color, #ffffff)', 0.85);
            opts.borderRadius = 8;
            opts.borderColor = this.#toRgba('var(--divider-color, #e0e0e0)', 0.5);
            opts.borderWidth = 1;
        }

        if (pos.includes('top')) opts.top = isInner ? 10 : 0;
        if (pos.includes('bottom')) opts.bottom = isInner ? 15 : 0;
        if (pos.includes('left')) opts.left = isInner ? 10 : 0;
        if (pos.includes('right')) opts.right = isInner ? 10 : 0;
        if (pos.includes('center')) opts.left = 'center';

        return opts;
    }

    #bucketize(rows, bucketMs, statType = 'change') {
        if (!rows?.length) return [];
        const buckets = new Map();
        for (const row of rows) {
            const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
            if (Number.isNaN(t)) continue;
            const key = Math.floor(t / bucketMs) * bucketMs;
            const value = Number(statType === 'mean' ? (row.mean ?? row.state) : row.change);
            if (!Number.isFinite(value)) continue;
            const b = buckets.get(key) ?? { sum: 0, count: 0 };
            b.sum += value; b.count += 1;
            buckets.set(key, b);
        }
        return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => [t, statType === 'mean' ? b.sum / b.count : b.sum]);
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

    async #refresh() {
        if (!this.#built || !this.#hass || !this.#config?.series?.length) return;
        this.#els.title.textContent = this.#config.title || '';

        const { start, end } = this.#calculateTimeBounds(this.#config.range, this.#config.start, this.#config.end);
        const bucketMs = this.#parseBucketSize(this.#config.aggregation, this.#config.range);
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
                const bucketed = this.#bucketize(raw, bucketMs, s.stat_type || 'change');

                const nativeUnit = this.#hass.states[s.entity]?.attributes?.unit_of_measurement || '';
                const axisIdx = s.y_axis || 0;
                const chartTargetUnit = yAxesConfig[axisIdx]?.unit || '';
                const autoChartScale = this.#getScaleFactor(nativeUnit, chartTargetUnit);
                const manualMulti = s.multiplier ?? 1;
                const sign = s.sign ?? 1;

                return {
                    ...s,
                    stat_type: s.stat_type || 'change',
                    chartTargetUnit,
                    chartData: bucketed.map(([t, v]) => [t, v * manualMulti * autoChartScale * sign])
                };
            });

            if (this.#config.chip) {
                // Der Chip darf NICHT von der gewählten Aggregation abhängen —
                // sonst ändert sich die angezeigte Summe, nur weil man das
                // Diagramm gröber stellt. Deshalb eine eigene Abfrage mit einer
                // Auflösung, die allein am Zeitraum hängt: innerhalb eines Tages
                // die feinste (5 Minuten), über mehrere Tage die tägliche.
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

            this.#renderChart(processedSeries, yAxesConfig, start, end);

        } catch (err) {
            this.#els.slot.innerHTML = `<div class="error">Fehler: ${err.message}</div>`;
        }
    }

    #renderChart(processedSeries, yAxesConfig, start, end) {
        if (!customElements.get('ha-chart-base')) {
            this.#els.slot.innerHTML = '<div class="error">ha-chart-base fehlt!</div>';
            return;
        }

        const yAxisEcharts = yAxesConfig.map((ax, idx) => ({
            type: 'value', name: ax.unit || '', min: ax.min, max: ax.max,
            // Feste Schrittweite, wenn die Karte sie vorgibt: beim Ladestand
            // etwa 0/25/50/75/100 statt automatisch gewaehlter Werte — sonst
            // wandern die Striche je nach Tagesverlauf, obwohl der
            // Wertebereich immer derselbe ist.
            ...(ax.interval !== undefined ? { interval: ax.interval } : {}),
            ...(ax.split_number !== undefined ? { splitNumber: ax.split_number } : {}),
            position: idx === 1 ? 'right' : 'left', nameGap: 8, splitLine: { show: idx === 0 }
        }));

        const data = processedSeries.map(s => {
            let areaStyle = undefined;
            if (s.fill === 'gradient') {
                areaStyle = {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: this.#toRgba(s.color || '#000', 0.5) },
                            { offset: 1, color: this.#toRgba(s.color || '#000', 0.05) }
                        ]
                    }
                };
            } else if (s.fill !== false && s.fill !== undefined) {
                areaStyle = { opacity: 0.25 };
            }

            return {
                name: s.legend_group || s.name || s.entity,
                id: s.name || s.entity,
                type: s.type || 'line', stack: s.stack, yAxisIndex: s.y_axis || 0,
                data: s.chartData, smooth: s.smooth ?? true, symbol: 'none',
                itemStyle: { color: s.color }, areaStyle, lineStyle: { width: 2 }
            };
        });

        const isSameDay = start.toDateString() === end.toDateString();
        const spansYears = start.getFullYear() !== end.getFullYear();

        const options = {
            xAxis: [{ type: 'time', min: start.getTime(), max: end.getTime() }],
            yAxis: yAxisEcharts,
            grid: { top: 25, left: 10, right: 10, bottom: 20, containLabel: true },
            legend: this.#getLegendOptions(this.#config.legend),
            tooltip: {
                trigger: 'axis',
                renderMode: 'html',
                appendToBody: true, // Verhindert SVG-String-Escaping im Shadow DOM
                formatter: (params) => {
                    if (!params || !params.length) return '';
                    const date = new Date(params[0].value[0]);
                    const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

                    let headerHtml = '';
                    if (isSameDay) {
                        headerHtml = `<div>${timeStr}</div>`;
                    } else if (spansYears) {
                        const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        headerHtml = `<div><span style="font-size: 0.85em; opacity: 0.75; margin-right: 6px;">${dateStr}</span>${timeStr}</div>`;
                    } else {
                        const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
                        headerHtml = `<div><span style="font-size: 0.85em; opacity: 0.75; margin-right: 6px;">${dateStr}</span>${timeStr}</div>`;
                    }

                    const itemsHtml = params.map(p => {
                        // Ueber den Index statt ueber den Namen suchen: bei
                        // Legenden-Gruppen tragen mehrere Reihen denselben
                        // Namen ("Netz"), ein Namensvergleich fände dann immer
                        // dieselbe Reihe und zeigte falsche Einheiten. Der
                        // Index ist eindeutig.
                        const seriesObj = processedSeries[p.seriesIndex]
                            ?? processedSeries.find(s => s.name === p.seriesName || s.entity === p.seriesName);
                        const unit = seriesObj?.chartTargetUnit || '';
                        const label = seriesObj?.name || p.seriesName;
                        const val = p.value[1];
                        const formattedVal = (val !== null && val !== undefined)
                            ? Number(val).toLocaleString('de-DE', { maximumFractionDigits: 2 })
                            : '-';
                        return `<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                          <span>${p.marker} ${label}</span>
                          <span style="font-weight: 600;">${formattedVal} ${unit}</span>
                        </div>`;
                    }).join('');

                    return `<div style="font-weight: 500; margin-bottom: 4px;">${headerHtml}</div>${itemsHtml}`;
                }
            }
        };

        if (!this.#chartEl) {
            this.#chartEl = document.createElement('ha-chart-base');
            // Bewusst KEIN renderer="svg": beim SVG-Renderer kann ECharts
            // keinen HTML-Tooltip aufbauen und fällt auf reinen Text zurück
            // — dann steht das Markup als sichtbarer Text im Tooltip.
            // Ohne die Vorgabe bleibt es beim Canvas-Renderer, dort
            // funktioniert der HTML-Tooltip wie gedacht.
            this.#els.slot.replaceChildren(this.#chartEl);
        }

        this.#chartEl.hass = this.#hass;
        this.#chartEl.data = data;
        this.#chartEl.options = options;
    }
}

customElements.define('wuefl-energy-chart', WueflEnergyChart);

registerCard({
    type: 'wuefl-energy-chart',
    name: 'wuefl-energy-chart',
    description: 'Erweitertes Energie-Diagramm mit flexibler Zeitraumauswahl.',
});