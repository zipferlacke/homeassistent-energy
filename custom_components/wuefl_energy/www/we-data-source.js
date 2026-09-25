/**
 * we-data-source.js
 * Daten holen, ohne vorher zu wissen, wie fein die Quelle sie führt.
 *
 * Der Aufrufer sagt nur: dieser Zeitraum, dieses Wunschraster. Die Quelle
 * wird dann von fein nach grob durchprobiert, bis eine Stufe den Zeitraum
 * wirklich abdeckt. Zurück kommen die Zeilen und das Raster, das sich damit
 * überhaupt darstellen lässt – feiner als die Quelle geht es nicht, gröber
 * als gewünscht muss es nicht.
 *
 * Warum probieren statt rechnen: Ob es für einen Tag Fünf-Minuten-Werte
 * gibt, hängt an der Aufbewahrung des Recorders, daran ob der Zähler damals
 * schon lief, und daran ob die Werte importiert wurden – Importe kennen nur
 * ganze Stunden. Das lässt sich von außen nicht ausrechnen, nur erfragen.
 *
 * Die Quelle selbst ist austauschbar: eine Funktion
 * (ids, start, end, stufe) -> { id: zeilen[] }. `haStats` ist die Anbindung
 * an Home Assistant, für eine Webseite schreibt man eine eigene.
 */

/** Was eine Quelle anbieten kann – von fein nach grob. */
export const STUFEN = [
  { name: '5minute', ms: 300_000 },
  { name: 'hour', ms: 3_600_000 },
  { name: 'day', ms: 86_400_000 },
  { name: 'month', ms: 2_592_000_000 },
];

/** Ab welcher Abdeckung des Zeitraums eine Stufe als brauchbar gilt. */
const GENUG = 0.9;

/** Anbindung an die Langzeitstatistik von Home Assistant. */
export function haStats(hass, types = ['change', 'mean', 'max', 'min']) {
  return async (ids, start, end, stufe) => hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    statistic_ids: [...ids],
    period: stufe,
    types,
  });
}

/** Erste Stufe, die mindestens so fein ist wie gewünscht. */
function startStufe(wunschMs) {
  let i = 0;
  for (let k = 0; k < STUFEN.length; k += 1) if (STUFEN[k].ms <= wunschMs) i = k;
  return i;
}

/**
 * Wie viel vom Zeitraum die Antwort belegt.
 *
 * Nur zu prüfen, ob überhaupt Zeilen kamen, reicht nicht: Beim Blick auf
 * eine Woche liegen für die letzten zwei Tage Fünf-Minuten-Werte vor und
 * davor nichts. Die Antwort wäre nicht leer, aber fünf Siebtel der Woche
 * fehlten – gebraucht wird hier die Stunden-Stufe.
 */
function abdeckung(antwort, start, end, stufeMs) {
  const spanne = Math.max(1, +end - +start);
  let beste = 0;
  for (const zeilen of Object.values(antwort ?? {})) {
    if (!zeilen?.length) continue;
    const zeiten = zeilen
      .map((r) => (typeof r.start === 'number' ? r.start : Date.parse(r.start)))
      .filter(Number.isFinite);
    if (!zeiten.length) continue;
    const von = Math.min(...zeiten), bis = Math.max(...zeiten) + stufeMs;
    beste = Math.max(beste, (Math.min(bis, +end) - Math.max(von, +start)) / spanne);
  }
  return Math.min(1, Math.max(0, beste));
}

/**
 * Daten für einen Zeitraum holen, so fein wie möglich.
 *
 * Rückgabe: { zeilen, stufe, stufeMs, rasterMs, abdeckung }
 * `rasterMs` ist das Raster, in dem sich die Daten zusammenfassen lassen –
 * das Wunschraster, oder die Stufe der Quelle, falls die gröber ist.
 */
export async function getData(quelle, ids, start, end, wunschMs) {
  const liste = [...ids];
  if (!liste.length) return { zeilen: {}, stufe: null, stufeMs: 0, rasterMs: wunschMs, abdeckung: 0 };

  let bestes = null;
  for (let i = startStufe(wunschMs); i < STUFEN.length; i += 1) {
    const stufe = STUFEN[i];
    const zeilen = await quelle(liste, start, end, stufe.name);
    const deckt = abdeckung(zeilen, start, end, stufe.ms);
    const treffer = {
      zeilen, stufe: stufe.name, stufeMs: stufe.ms,
      rasterMs: Math.max(wunschMs, stufe.ms), abdeckung: deckt,
    };
    if (deckt >= GENUG) return treffer;
    // Nichts deckt den Zeitraum ganz ab – dann wenigstens das Beste nehmen
    if (!bestes || deckt > bestes.abdeckung) bestes = treffer;
  }
  return bestes;
}
