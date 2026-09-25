/**
 * we-chart-ha.js
 * Die drei Stücke, die das Diagramm aus wuefl-libs an Home Assistant binden.
 *
 * Das Paket selbst (diagramm_v1.0.0) ist Zeichen für Zeichen dasselbe wie in
 * der Bibliothek – Rahmen, Chips, Legende, Vollbild, Aggregation und die
 * Auflösungsleiter sind überall gleich. Projektabhängig sind nur:
 *
 *   Renderer   womit gezeichnet wird   → ha-chart-base, das HA mitbringt
 *   Quelle     woher die Zahlen kommen → recorder/statistics_during_period
 *   Icons      wie die Knöpfe aussehen → mdi über <ha-icon>
 *
 * ECharts steckt schon in ha-chart-base. Es ein zweites Mal mitzuliefern wäre
 * rund ein Megabyte für nichts – deshalb bleibt renderer-echarts.js aus der
 * Bibliothek hier draußen und der Renderer unten tritt an seine Stelle.
 */

/**
 * Renderer auf Basis von ha-chart-base.
 *
 * ha-chart-base nimmt die Reihen getrennt von der übrigen Option entgegen,
 * darum wird sie hier auseinandergenommen. Ein eigenes resize() bietet es
 * nicht an; wir greifen auf die ECharts-Instanz darunter zu, und wenn HA die
 * einmal umbenennt, bleibt als Rückfall ein resize-Ereignis.
 */
export function haRenderer(getHass) {
  return {
    mount(host) {
      const el = document.createElement('ha-chart-base');
      // Dieselbe Klasse wie beim ECharts-Renderer: Daran hängt im Stilblatt
      // des Pakets die Regel, die der Zeichenfläche die volle Höhe gibt.
      el.className = 'dg_canvas';
      el.height = '100%';
      host.appendChild(el);
      return { el };
    },

    draw(griff, option) {
      const { series, ...rest } = option;
      griff.el.hass = getHass();
      griff.el.data = series;
      griff.el.options = rest;
    },

    resize(griff) {
      const ec = griff.el?.chart ?? griff.el?._chart;
      if (ec?.resize) { ec.resize(); return; }
      window.dispatchEvent(new Event('resize'));
    },

    destroy(griff) {
      griff.el.remove();
    },
  };
}

/**
 * Quelle: die Langzeitstatistik von Home Assistant.
 *
 * Genau die Schnittstelle, die das Paket erwartet – (keys, von, bis, stufe).
 * Die keys sind hier Entitäten; in einem Web-Projekt wären es Spaltennamen
 * und aus dem Aufruf würde eine SQL-Abfrage.
 */
export function haSource(getHass, types = ['change', 'mean', 'max', 'min']) {
  return async (keys, start, end, stufe) => {
    const hass = getHass();
    if (!hass) return {};
    return hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      statistic_ids: [...keys],
      period: stufe,
      types,
    });
  };
}

/** Icons des Diagramms als mdi – wie im Rest der Integration. */
export const HA_ICONS = {
  fullscreen: '<ha-icon icon="mdi:fullscreen"></ha-icon>',
  fullscreenExit: '<ha-icon icon="mdi:fullscreen-exit"></ha-icon>',
};

/**
 * Karten-Konfiguration in die des Pakets übersetzen.
 *
 * Die Karten sprechen von `entity`, das Paket von `key` – für das Paket ist
 * ein Bezeichner eben nur ein Bezeichner. Dazu wird hier die Einheit der
 * Entität nachgetragen, damit W/kW/MWh richtig umgerechnet werden; im
 * Web-Projekt käme sie aus der Tabelle.
 */
export function toDiagrammConfig(cfg, hass) {
  const einheit = (id) => hass?.states?.[id]?.attributes?.unit_of_measurement || undefined;
  const chips = (Array.isArray(cfg.chips) ? cfg.chips : cfg.chip ? [cfg.chip] : [])
    .filter(Boolean)
    .map((c) => ({
      ...c,
      key: c.key ?? c.entity,
      calc: c.calc ?? c.calc_type ?? c.stat_type,
    }));

  return {
    ...cfg,
    chips,
    chip: undefined,
    series: (cfg.series ?? []).map((s) => ({
      ...s,
      key: s.key ?? s.entity,
      unit: s.unit ?? (s.entity ? einheit(s.entity) : undefined),
    })),
  };
}
