# wuefl Energie für Home Assistant

Drei Karten (Live-Energiefluss, Energiebilanz, Wallbox) plus eine kleine
Integration, die alle Entitäten an einer zentralen Stelle zuordnet.

Keine externen Abhängigkeiten: keine Bibliothek, kein Font, kein Build-Schritt.
Farben und Maße kommen aus dem aktiven Home-Assistant-Theme, Icons aus dem
mitgelieferten Material-Design-Icons-Satz.

## Was gehoert wohin

Das ist die haeufigste Fehlerquelle, deshalb zuerst:

| Aus dem Paket | Ziel in Home Assistant |
|---|---|
| `custom_components/wuefl_energy/` | `config/custom_components/wuefl_energy/` |
| `www/wuefl_energy/` | `config/www/wuefl_energy/` |
| `packages/wuefl_wallbox.yaml` | `config/packages/wuefl_wallbox.yaml` |
| `dashboard/energie-dashboard.yaml` | **in keinen Ordner** — Inhalt in den Raw-Editor eines Dashboards |
| `preview.html` | nirgendwo, nur zum Anschauen im Browser |

`energie-dashboard.yaml` ist eine Lovelace-Konfiguration, kein Package. Landet
sie in `config/packages/`, bricht der Start ab mit:

```
Invalid package definition 'wuefl_energy': expected dict for dictionary value @ data['title']
```

Home Assistant erwartet in einem Package nur Integrations-Schluessel wie
`input_number:` oder `automation:`. `title:` und `views:` gehoeren dort nicht
hin.

## Installation

**1. Integration**

`custom_components/wuefl_energy/` nach `config/custom_components/` kopieren.
In `configuration.yaml` auf oberster Ebene ergaenzen — nicht in einem Package:

```yaml
wuefl_energy:
```

**2. Karten**

`www/wuefl_energy/` nach `config/www/` kopieren.

**3. Neu starten.**

**4. Ressourcen eintragen**

Einstellungen → Dashboards → Drei-Punkte-Menue → Ressourcen, drei Eintraege
jeweils als **JavaScript-Modul**:

```
/local/wuefl_energy/wuefl-energy-live-card.js
/local/wuefl_energy/wuefl-energy-history-card.js
/local/wuefl_energy/wuefl-wallbox-card.js
```

`wuefl-energy-shared.js` wird **nicht** eingetragen — die drei Karten
importieren sie selbst.

**5. Helfer und Ladeautomatik (optional)**

`packages/wuefl_wallbox.yaml` nach `config/packages/` kopieren. Dafuer muss in
`configuration.yaml` stehen:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Bei mehreren Wallboxen die Datei kopieren und in allen Namen das Kuerzel
aendern (`wallbox_` → `wallbox2_`). Der Dateiname wird zum Package-Namen, er
muss also eindeutig sein.

**6. Dashboard**

Einstellungen → Dashboards → Dashboard hinzufuegen → oeffnen → Stift →
Drei-Punkte-Menue → **Raw-Konfigurationseditor** → Inhalt von
`dashboard/energie-dashboard.yaml` einfuegen → Speichern.

**7. Zuordnen**

In der Seitenleiste steht jetzt **wuefl Energie**. Dort werden die Sensoren
einmal zugeordnet und gelten fuer alle Karten. Wer eine einzelne Karte
abweichend belegen will, traegt den Wert im Karteneditor ein — der schlaegt
die zentrale Zuordnung.

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
| `wuefl-energy-shared.js` | Tokens, Grundgerüst-CSS, Farben, Icons, Formatierung, Editor-Basis |
| `wuefl-energy-live-card.js` | Energiefluss-Grafik mit laufenden Kabeln |
| `wuefl-energy-history-card.js` | Bilanz über Tag/Woche/Monat/Jahr |
| `wuefl-wallbox-card.js` | Lademodus, Ladeziel, Zeitprognose je Fahrzeug |
| `energieflow.svg` | Die Grafik der Live-Karte |
| `custom_components/wuefl_energy/` | Zentrale Zuordnung, Seite in der Seitenleiste |
| `packages/wuefl_wallbox.yaml` | Helfer und Ladeautomatik |
| `dashboard/energie-dashboard.yaml` | Lovelace-Konfiguration fuer den Raw-Editor |
| `tools/make-preview.py` | Baut `preview.html` aus den Quelldateien |

## Hinweise

* Die Live-Karte holt `energieflow.svg` per `fetch`. Ein abweichender Pfad
  lässt sich im Karteneditor unter *Pfad zur Grafik* setzen.
* Die Energie-Ansicht liest Langzeitstatistiken. Die Sensoren brauchen dafür
  `state_class: total_increasing` und müssen vom Recorder erfasst werden.
* Farben in SVG werden immer über `style="fill: …"` gesetzt, nie über
  `fill="…"`: Browser werten `var()` in Präsentationsattributen nicht aus.
