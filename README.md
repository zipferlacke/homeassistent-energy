# wuefl Energie für Home Assistant

Drei Karten (Live-Energiefluss, Energiebilanz, Wallbox) plus eine kleine
Integration, die alle Entitäten an einer zentralen Stelle zuordnet.

Keine externen Abhängigkeiten: keine Bibliothek, kein Font, kein Build-Schritt.
Farben und Maße kommen aus dem aktiven Home-Assistant-Theme, Icons aus dem
mitgelieferten Material-Design-Icons-Satz.

Die Karten liegen in der Integration selbst und werden von ihr ausgeliefert —
**ein einziger Ordner zu kopieren, keine Lovelace-Ressource von Hand
einzutragen.**

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=zipferlacke&repository=homeassistent-energy&category=integration)
## Was gehoert wohin

| Aus dem Paket | Ziel in Home Assistant |
|---|---|
| `custom_components/wuefl_energy/` | `config/custom_components/wuefl_energy/` |
| `packages/wuefl_wallbox.yaml` | `config/packages/wuefl_wallbox.yaml` (optional) |
| `preview.html` | nirgendwo, nur zum Anschauen im Browser |

Kein separater `www/`-Ordner mehr, kein Dashboard-YAML — beides entsteht
automatisch.

## Installation

### Option A: von Hand

**1. Integration kopieren**

`custom_components/wuefl_energy/` nach `config/custom_components/` kopieren.
In `configuration.yaml` auf oberster Ebene ergaenzen — nicht in einem Package:

```yaml
wuefl_energy:
```

**2. Neu starten.**

Home Assistant legt beim ersten Start automatisch einen Eintrag unter
Einstellungen → Geraete & Dienste an — das ist erwartet, da steht nichts
einzustellen. Der Eintrag existiert nur, damit die Helfer-Entitaeten
(Laderegler, Lademodus je Wallbox) zuverlaessig geladen werden, und damit die
Integration ihre Karten unter `/wuefl_energy_files/` ausliefern und als
Lovelace-Ressource anmelden kann. Beides passiert automatisch — keine
Ressource von Hand einzutragen, kein `www/`-Ordner zu kopieren.

**3. Dashboard anlegen**

Einstellungen → Dashboards → Dashboard hinzufuegen → **wuefl Energie**
auswaehlen. Erscheint es nicht in der Liste, den Browser-Cache leeren und die
Seite neu laden.

Alternativ von Hand, im Raw-Konfigurationseditor eines leeren Dashboards:

```yaml
strategy:
  type: custom:wuefl-energy
```

**4. Zuordnen**

Im neuen Dashboard die Ansicht **Zuordnung** oeffnen und die Entitaeten
eintragen. Danach erscheinen die uebrigen Ansichten von selbst.

**5. Helfer und Ladeautomatik (optional)**

`packages/wuefl_wallbox.yaml` nach `config/packages/` kopieren. Dafuer muss in
`configuration.yaml` stehen:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

### Option B: über HACS (empfohlen für Entwicklung/Updates)

Wenn dieses Paket in einem eigenen GitHub-Repository liegt, laesst es sich als
**benutzerdefiniertes Repository** in HACS eintragen — die `hacs.json` im
Wurzelverzeichnis macht das moeglich. Danach ist eine neue Version nur noch
ein Klick auf "Neu herunterladen" statt Dateien von Hand zu kopieren:

1. In HACS → drei Punkte oben rechts → **Benutzerdefinierte Repositories**.
2. URL des eigenen Repositories eintragen, Kategorie **Integration**.
3. "wuefl Energie" suchen, installieren, Home Assistant neu starten.

Da alles — Integration und Karten — in `custom_components/wuefl_energy/`
liegt, reicht die Kategorie *Integration* fuer beides; es ist kein separater
HACS-Eintrag fuer die Karten noetig.

## Wie die Ansichten entstehen

Es gibt kein festes Dashboard-YAML. Eine Dashboard-Strategy baut die Ansichten
bei jedem Oeffnen aus der Zuordnung:

| Ansicht | Erscheint, wenn |
|---|---|
| Live | Netzleistung, eine Solaranlage oder ein Speicher zugeordnet ist |
| Energie | mindestens ein **Gesamtzaehler** zugeordnet ist, oder HA's Energie-Dashboard eingerichtet ist |
| Wallbox | mindestens eine Wallbox angelegt ist — je Wallbox eine Karte |
| Infos | Temperaturen oder weitere Werte zugeordnet sind |
| Einstellungen | immer — die Laderegeln darin blenden sich selbst aus |
| Zuordnung | kein eigener Reiter — Knopf *Zuordnung oeffnen* unten in den Einstellungen |

Eine zweite Wallbox anlegen heisst also: Eintrag hinzufuegen, fertig. Am
Dashboard ist nichts zu aendern.

## Die Energie-Ansicht

Zeichnet eine eigene Karte, `wuefl-energy-history-card.js` — gestapelte
Balken, Erzeugung oberhalb der Nulllinie, Verbrauch unterhalb, dieselben
Farbvariablen, die auch Home Assistants eigene Energie-Ansicht benutzt
(`--energy-solar-color` usw.). Braucht nur deine Zuordnung, sonst nichts:
kein separates Energie-Dashboard, keine zweite Konfiguration. Tag, Woche,
Monat, Jahr umschaltbar, Legende gruppiert Netz und Speicher zu je einem
Knopf mit zwei Punkten.

### Bessere Optik verfügbar, wenn du sie installierst

Hast du zusätzlich [Thyraz/energy-custom-graph](https://github.com/Thyraz/energy-custom-graph)
über HACS installiert (MIT-lizenziert, aktiv gepflegt, nutzt HA's eigene
ECharts-Instanz), erkennt die Zuordnung das automatisch und baut die Ansicht
stattdessen mit dieser Karte auf — genauer nach deren eigenem Beispiel
"Recreate the energy dashboard usage card" aus deren Dokumentation, mit
denselben Entitäten aus deiner Zuordnung. Nichts von dir einzustellen, kein
YAML zu schreiben — einmal per HACS installieren, beim nächsten Öffnen des
Dashboards springt die Ansicht automatisch um.

Ohne diese Installation läuft alles genauso weiter, nur mit der eigenen,
mitgelieferten Karte statt der von Thyraz.

Ich habe deren Code nicht selbst eingebaut oder kopiert — die Karte nutzt
interne, nicht öffentlich garantierte Zugriffe auf HA's mitgelieferte
ECharts-Instanz, die ich hier nicht gegen ein echtes Home Assistant testen
konnte. Die Umschaltung erkennt nur, ob du sie selbst installiert hast, und
überlässt ihr dann die Anzeige.

### Zusätzlich, wenn du HA's eigenes Energie-Dashboard eingerichtet hast

Hast du zusätzlich Einstellungen → Energie ausgefüllt, erscheint obendrauf
noch Home Assistants eigene `energy-usage-graph`-Karte — reiner Lesezugriff
(`energy/get_prefs`), nichts wird verändert oder automatisch eingerichtet.

## Null, eins oder viele

## Null, eins oder viele

Solaranlagen, Speicher, Waermepumpen, Wallboxen und Fahrzeuge sind Listen.
Keine Anlage ist genauso in Ordnung wie fuenf. Zwei Dachausrichtungen legst du
als zwei Solaranlagen an — dann zeigt die Live-Ansicht Ost und Sued getrennt.

**Wallbox und Fahrzeug sind getrennt.** Die Wallbox ist der Ladepunkt
(Leistung, Ladestrom, Phasen), das Fahrzeug ist das Auto (Ladestand, Ladeziel,
Kapazitaet). In der Wallbox waehlst du aus, welches Fahrzeug dort haengt.
Meldet dein Auto den Ladestand nicht selbst, laesst du das Fahrzeug weg und
traegst den Wert, den die Wallbox meldet, direkt in der Wallbox ein.

## Nur Gesamtzaehler, keine Tageswerte

Fuer jede Groesse brauchst du **zwei** Angaben, mehr nicht:

* den **aktuellen Wert** in W — darf positiv und negativ sein, die Richtung
  liest die Karte aus dem Vorzeichen
* den **Gesamtzaehler** in kWh, der immer weiterlaeuft

In der Zuordnung steht das jetzt auch so an jedem Feld: Name oben, darunter
klein die Einheit und ob es der Live-Wert oder ein Gesamt-Zaehler ist.

Was heute, diese Woche oder dieses Jahr zusammengekommen ist, rechnen die
Karten aus der Langzeitstatistik von Home Assistant. Einen zweiten Sensor
"Today's PV Generation" einzutragen waere doppelt gepflegt — genauso arbeitet
das eingebaute Energie-Dashboard.

Bei Sungrow heisst das konkret: *Total DC power* als Leistung, *Total PV
generation* als Zaehler. Die Sensoren mit "Daily" im Namen brauchst du nicht.

Sensornamen sind nicht genormt, die `device_class` schon. Deshalb filtert die
Zuordnung danach: im Leistungsfeld stehen nur W-Sensoren, im Zaehlerfeld nur
kWh. Fehlt ein Sensor, setzt seine Integration keine Einheit — dann oben
*Nur passende Sensoren anzeigen* ausschalten.

## Die Bloecke der Zuordnung

| Block | Wofuer |
|---|---|
| Stromnetz | Leistung am Hausanschluss, Zaehler fuer Bezug und Einspeisung |
| Photovoltaik | Gesamtleistung und Gesamtzaehler der Anlage, Ertragsprognose |
| Einzelne Dachflaechen | Aufklappbar unter Photovoltaik, nur bei Ost/Sued oder zwei MPPT-Eingaengen |
| Hausspeicher | Liste, je Speicher Leistung, Ladestand, zwei Zaehler |
| Haushalt | Optional, wird sonst ausgerechnet |
| Waermepumpen | Liste, elektrische Aufnahme |
| Fahrzeuge | Liste, Ladestand und Ladeziel des Autos |
| Wallboxen | Liste, Ladepunkt mit Zuordnung zu einem Fahrzeug |
| Strompreis | Fester Tarif oder Preissensor |
| Anlage | Ueberschriften, Anschaffungskosten, Grundlast |
| Wetter und Temperaturen | Wetter fuer die Live-Ansicht, Temperaturen fuer Infos |

## Lademodus, Ladestrom, Ladeziel, Laderegler

Diese sieben Dinge ordnest du nirgends zu — die Integration legt sie selbst
an, sobald mindestens eine Wallbox existiert, und entfernt sie automatisch
wieder, wenn keine mehr da ist:

| Entität | Bedeutung |
|---|---|
| `switch.wuefl_hausakku_freigabe` | Freigabe: aus dem Hausakku laden |
| `number.wuefl_speicherreserve` | Speicher nutzen bis … % |
| `select.wuefl_prioritaet` | Hausakku zuerst oder Auto zuerst |
| `number.wuefl_preisgrenze_laden` | Preisgrenze für Netzstrom |
| `select.wuefl_wallbox_<name>_modus` | Lademodus dieser Wallbox |
| `number.wuefl_wallbox_<name>_ladestrom` | Maximaler Ladestrom dieser Wallbox |
| `number.wuefl_wallbox_<name>_ladeziel` | Ladeziel dieser Wallbox |

`<name>` ist der Name der Wallbox aus der Zuordnung, kleingeschrieben und ohne
Sonderzeichen — bei zwei gleichnamigen Wallboxen hängt eine `_2` dran.

Diese Entitäten sind ganz normale Home-Assistant-Entitäten: sie lassen sich
in eigene Dashboards ziehen, in Automationen verwenden, wie jede andere
Entität auch. Eingestuft sind sie als `entity_category: config` — deshalb
tauchen sie nicht ungefragt in automatisch gebauten Übersichten auf, sondern
nur, wenn du gezielt danach suchst (Einstellungen → Geräte & Dienste →
Entitäten, Suche "wuefl") oder sie in der Ansicht *Einstellungen* bedienst.

Bedienen tust du sie über die Ansicht *Einstellungen* im Dashboard — dort
musst du nichts zuordnen, nichts anwenden, nichts suchen.

`packages/wuefl_wallbox.yaml` legt diese sieben nicht mehr an. Die
mitgelieferte Automation liest sie über ihre neuen, festen Namen; bei
mehreren Wallboxen findest du die tatsächlichen Namen unter Einstellungen →
Geräte & Dienste → Entitäten.

## Strompreis ohne dynamischen Tarif

Du brauchst keinen Preissensor. Trag im Block Strompreis einfach deinen
Arbeitspreis und deine Einspeiseverguetung als feste Werte ein — damit rechnen
die Geld-Kacheln genauso.

Einen Preissensor gibt es nur bei dynamischem Tarif, ueber eine Integration
unter Einstellungen → Geraete und Dienste: **Tibber** fuer Tibber-Kunden,
**Nord Pool** oder **EPEX Spot** fuer den reinen Boersenpreis, **aWATTar** fuer
aWATTar-Kunden. Danach steht der Sensor in der Zuordnung zur Auswahl.

## Ertragsprognose

Forecast.Solar und Solcast legen die Stundenkurve unter verschiedenen
Attributen ab. Die Karte probiert `watt_hours_period`, `wh_period`,
`watt_hours`, `wh_hours`, `detailedForecast`, `detailedHourly` und `forecast`
der Reihe nach durch — das Feld *Attribut mit der Ertragskurve* bleibt also
normalerweise leer.

## Was gilt wo

Regeln, die es nur einmal gibt, bedienst du in der Ansicht **Einstellungen**,
gruppiert nach *Laderegeln Wallbox* und *Allgemeine Laderegeln*. Es gibt
schliesslich nur einen Hausakku — die Regler dafuer in jeder Wallbox-Karte zu
wiederholen, waere irrefuehrend.

Zuordnen musst du dafuer nichts: die zugrunde liegenden Entitaeten legt die
Integration selbst an (siehe *Lademodus, Ladestrom, Ladeziel, Laderegler*
weiter oben). Gibt es keine Wallbox, verschwinden die Laderegeln in den
Einstellungen ganz, und die Speicherreserve erscheint erst, wenn die
Hausakku-Freigabe aktiv ist — sonst waere es ein Regler ohne Wirkung.

In der Wallbox-Karte bleibt nur, was wirklich je Ladepunkt gilt: Lademodus,
Ladeziel und der maximale Ladestrom unter *Mehr Optionen* — auch das ohne
eigene Zuordnung.

Die Zuordnung selbst ist eine Ansicht im Dashboard, keine Seite in der
Seitenleiste mehr.

## Steuert die Karte den Energiefluss?

Nein, und das kann sie auch nicht. Die Reihenfolge PV → Haus → Speicher →
Netz steckt in der Firmware des Wechselrichters und laeuft im
Millisekundentakt. Home Assistant sieht die Werte im Sekundentakt und waere
viel zu langsam.

Steuerbar ist die **Wallbox**, und dafuer gibt es die Wallbox-Karte:

* *Lademodus* — nur Sonne, auch guenstiger Netzstrom, oder volle Leistung
* *Prioritaet* — bei Ueberschuss zuerst der Hausakku oder zuerst das Auto
* *Speicher nutzen bis … %* — darunter bleibt der Akku fuers Haus

Die Automation in `packages/wuefl_wallbox.yaml` regelt daraus den Ladestrom
nach. Manche Wechselrichter erlauben per Modbus zusaetzlich, den Hausakku
gezielt aus dem Netz zu laden oder Zeitfenster zu setzen — das ist
herstellerabhaengig und hier nicht enthalten.

## Vorschau

`preview.html` im Browser oeffnen. Die Datei enthaelt den echten Kartencode mit
erfundenen Sensorwerten und laesst sich zwischen hell/dunkel und drei
Spaltenbreiten umschalten — praktisch, um Layoutaenderungen zu beurteilen,
ohne Home Assistant neu zu laden.

Neu erzeugen nach Aenderungen am Code:

```
python3 tools/make-preview.py
```

## Eigene Farben

Alles läuft über CSS-Variablen. Für die Energiefarben nutzen die Karten die,
die Home Assistant im eingebauten Energie-Dashboard setzt — sie passen also
ohne Zutun zusammen. Überschreiben geht im Theme:

```yaml
mein-theme:
  # von Home Assistant vorgegeben
  energy-solar-color: "#ff9800"
  energy-grid-consumption-color: "#488fc2"
  energy-grid-return-color: "#8353d1"
  energy-battery-in-color: "#f6c34c"
  energy-battery-out-color: "#4db0a2"
  # nur in diesen Karten
  wuefl-house-color: "#488fc2"
  wuefl-wallbox-color: "#7f77dd"
  wuefl-heatpump-color: "#d85a30"
  wuefl-price-color: "#fbaa00"
```

Maße und Schriftgrößen hängen an `--w-radius`, `--w-pad`, `--w-input-h` und
`--w-fs-sm|md|lg`. Sie stehen gesammelt in `TOKENS_CSS` in
`wuefl-energy-shared.js`.

## Aufbau

| Datei | Zweck |
|---|---|
| `custom_components/wuefl_energy/www/wuefl-energy-shared.js` | Tokens, Grundgerüst-CSS, Farben, Icons, Formatierung, Editor-Basis |
| `custom_components/wuefl_energy/www/wuefl-energy-live-card.js` | Energiefluss-Grafik mit laufenden Kabeln |
| `custom_components/wuefl_energy/www/wuefl-energy-history-card.js` | Energie-Ansicht, Balken oberhalb/unterhalb der Nulllinie |
| `custom_components/wuefl_energy/www/wuefl-wallbox-card.js` | Lademodus, Ladeziel, Zeitprognose je Fahrzeug |
| `custom_components/wuefl_energy/www/wuefl-energy-settings-card.js` | Laderegeln, die fuer alle Wallboxen gelten |
| `custom_components/wuefl_energy/www/wuefl-energy-config-card.js` | Die Zuordnung — Bloecke mit Hinzufuegen-Dialogen |
| `custom_components/wuefl_energy/www/wuefl-energy-strategy.js` | Baut die Ansichten, wird automatisch angemeldet |
| `custom_components/wuefl_energy/www/energieflow.svg` | Die Grafik der Live-Karte |
| `custom_components/wuefl_energy/__init__.py` | Speichert die Zuordnung, liefert die Karten aus, zwei WebSocket-Befehle |
| `custom_components/wuefl_energy/specs.py` | Soll-Liste der selbst verwalteten Helfer |
| `custom_components/wuefl_energy/config_flow.py` | Legt automatisch den Config Entry an |
| `custom_components/wuefl_energy/switch.py` | Hausakku-Freigabe als eigene Plattform |
| `custom_components/wuefl_energy/number.py` | Speicherreserve, Preisgrenze, Ladestrom, Ladeziel |
| `custom_components/wuefl_energy/select.py` | Prioritaet, Lademodus je Wallbox |
| `packages/wuefl_wallbox.yaml` | Preissensor-Beispiel und Ladeautomatik |
| `hacs.json` | Macht das Repository als HACS-Quelle nutzbar |
| `tools/make-preview.py` | Baut `preview.html` aus den Quelldateien (nur zur Entwicklung) |

## Hinweise

* Die Live-Karte holt `energieflow.svg` per `fetch`. Ein abweichender Pfad
  lässt sich im Karteneditor unter *Pfad zur Grafik* setzen.
* Die Energie-Ansicht liest Langzeitstatistiken. Die Sensoren brauchen dafür
  `state_class: total_increasing` und müssen vom Recorder erfasst werden.
* Farben in SVG werden immer über `style="fill: …"` gesetzt, nie über
  `fill="…"`: Browser werten `var()` in Präsentationsattributen nicht aus.
* Die Helfer-Entitäten (Lademodus, Laderegler) laufen seit dieser Version über
  einen Config Entry statt der älteren Discovery-Methode (`async_load_platform`),
  weil diese in der Praxis zuverlässig in ein Timeout lief, unabhängig davon,
  wie lange gewartet wurde. Der neue Weg wurde in einer selbstgebauten
  Testumgebung geprüft, die eigens `async_forward_entry_setups` nachbildet,
  nicht gegen eine echte, laufende Home-Assistant-Instanz. Melde dich, falls
  beim ersten Start etwas nicht wie beschrieben erscheint.
