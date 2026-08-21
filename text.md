Hier ist die saubere, kompakte Zusammenfassung deines gesamten Vorhabens – genau abgestimmt auf deine eigene Python-Integration, dein interaktives SVG und deine autarken Statistiken.Schritt 1: Das Python-Backend (Die Datenbasis)Damit du Verläufe für Tag, Woche und Monat plotten kannst, müssen deine Sensoren im Python-Code als Langzeitstatistik (LTS) definiert sein. Nur so speichert Home Assistant die Daten dauerhaft und berechnet automatisch stündliche oder tägliche Summen.Deine kumulativen (fortlaufend steigenden) Zähler-Sensoren benötigen diese Attribute:pythonfrom homeassistant.components.sensor import SensorEntity, SensorDeviceClass, SensorStateClass
from homeassistant.const import UnitOfEnergy

class MyTotalEnergySensor(SensorEntity):
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_state_class = SensorStateClass.TOTAL_INCREASING # Wichtig für die Differenzberechnung
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR

    @property
    def native_value(self):
        return self._backend_data.get_total_kwh() # z.B. 1250.4 kWh
Use code with caution.Deine Live-Sensoren (aktuelle Watt) definierst du parallel ganz normal mit SensorDeviceClass.POWER und UnitOfPower.WATT.Schritt 2: Die Live-Daten im Frontend (Dein SVG animieren)In deiner Lovelace-Karte nutzt du das hass-Objekt, das Home Assistant bei jeder Änderung triggert. Hier prüfst du deine Zuordnungen und steuerst das SVG:Ein-/Ausblenden: Ist eine Entität (z. B. Wärmepumpe) in deiner Datei konfiguriert? Wenn nein → style.display = "none".Live-Werte & Animation: Du liest den aktuellen Watt-Wert aus und startest CSS-Animationen.javascriptset hass(hass) {
  this._hass = hass;
  
  // 1. Deine konfigurierten Live-Entitäten auslesen
  const livePVSensor = this.config.live_pv_entity; // z.B. "sensor.live_pv_watt"

  if (livePVSensor && hass.states[livePVSensor]) {
    const watt = parseFloat(hass.states[livePVSensor].state);
    
    // 2. SVG-Elemente manipulieren
    const solarIcon = this.querySelector('#svg-solar-panel');
    if (solarIcon) solarIcon.style.display = "block"; // Einblenden

    // 3. Animation umschalten (z.B. fließende Punkte im SVG via CSS-Klasse)
    const flowLine = this.querySelector('#svg-flow-solar');
    if (flowLine) {
      watt > 10 ? flowLine.classList.add('active') : flowLine.classList.remove('active');
    }
  }
}
Use code with caution.Schritt 3: Historische Daten abfragen (Tag, Woche, Monat)Um die Balken-Diagramme für Tag, Woche oder Monat zu zeichnen, fragst du die Langzeitstatistiken über die Websocket-API direkt aus der Home Assistant Datenbank ab. Du benötigst das Delta (change) für den jeweiligen Zeitraum.javascriptasync function getHistoryData(hass, entityId, viewType) {
  const startTime = new Date();
  let period = "hour"; // Standard für Tag: stündliche Werte

  if (viewType === "woche") {
    startTime.setDate(startTime.getDate() - 7);
    period = "day"; // Täglich aggregierte Werte
  } else if (viewType === "monat") {
    startTime.setMonth(startTime.getMonth() - 1);
    period = "day";
  } else {
    startTime.setHours(startTime.getHours() - 24); // Letzte 24 Stunden
  }

  const response = await hass.callWS({
    type: "recorder/statistics_during_period",
    start_time: startTime.toISOString(),
    period: period,
    statistic_ids: [entityId],
    types: ["change"] // Liefert exakt den Verbrauch/Ertrag in diesem Zeitfenster
  });

  // Gibt ein Array zurück: [{ start: "...", change: 1.2 }, ...]
  return response[entityId] || []; 
}
Use code with caution.Schritt 4: Das Plotten der Graphen im FrontendDu nimmst das Daten-Array aus Schritt 3 und übergibst es an die Grafik-Engine. Da Home Assistant die mächtige Bibliothek ECharts bereits nativ im Browser geladen hat (für seine eigenen Graphen), kannst du sie direkt in deiner Karte ansteuern.javascriptclass MyEnergyDashboardCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      // 1. HTML-Struktur mit deinem SVG und Platzhalter für das Chart aufbauen
      this.innerHTML = `
        <ha-card>
          <div id="svg-container"><!-- Dein Haus-SVG hier --></div>
          <div id="chart-container" style="width: 100%; height: 300px;"></div>
        </ha-card>
      `;
      this.content = this.querySelector('ha-card');
      this.renderChart();
    }
    
    // 2. Laufend SVG-Live-Animationen aktualisieren (aus Schritt 2)
    this.updateSvgLiveStyle(hass);
  }

  async renderChart() {
    // 3. Historische Daten für die konfigurierten Zähler holen (z.B. Wochenansicht)
    const totalPVSensor = this.config.total_pv_entity; // "sensor.total_pv_kwh"
    const data = await getHistoryData(this._hass, totalPVSensor, "woche");

    // 4. Daten für ECharts vorbereiten
    const labels = data.map(p => new Date(p.start).toLocaleDateString());
    const values = data.map(p => p.change);

    // 5. In HA integriertes ECharts initialisieren und Balken zeichnen
    const chartContainer = this.querySelector('#chart-container');
    const myChart = window.echarts.init(chartContainer);
    
    myChart.setOption({
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value' },
      series: [{ data: values, type: 'bar', color: '#e0b400' }] // Gelbe Solarbalken
    });
  }

  getCardSize() { return 6; }
}
customElements.define('my-energy-dashboard-card', MyEnergyDashboardCard);
Use code with caution.Das ErgebnisDeine Python-Integration liefert sauber vorbereitete Daten.Dein SVG reagiert in Echtzeit auf das hass-Objekt.Deine Graphen holen sich historische Daten direkt über Websockets und zeichnen sich über das integrierte ECharts selbst.Das offizielle HA-Energiedashboard wird dafür niemals benötigt.Möchtest du als Nächstes sehen, wie du das Layout (Buttons für Tag/Woche/Monat) direkt über dem Chart baust, um dynamisch zwischen den Ansichten umzuschalten?

---
Gut Wie Bekomme ich Knöpfe also AUswahl reihe Tag, Monat, jahr, Und dann ein Custum range picker in einer Zeile realisiert und dann Würde ich geren für den Tag Zeitspanne bzw vorallem solche Text DInger anzeigen aber im Homeasstent Syle und nicht im selbst gebastelten ...
---

Das lässt sich perfekt mit den nativen Web-Komponenten von Home Assistant umsetzen! Wenn du die originalen UI-Elemente nutzt, passen sich die Knöpfe und Text-Boxen (Cards) automatisch dem Design des Nutzers an (Light/Dark Mode, Eckenabrundung, Schriftarten).Hier ist der exakte Weg, wie du die Zeitbereichs-Auswahl in einer Reihe und die Text-Boxen (genannt ha-card oder ha-statistic-card) im originalen Home Assistant Look programmierst.Teil 1: Knöpfe & Custom Range Picker in einer ZeileHome Assistant stellt dafür <mwc-button> (für die Knöpfe) und spezielle Zeit-Komponenten bereit. Für ein sauberes Layout in einer Reihe nutzt du einfaches Flexbox-CSS.Füge diesen HTML- und CSS-Code in den Render-Teil deiner Frontend-Karte ein:javascript// In deiner HTML-Struktur (innerHTML)
`
<div class="energy-toolbar">
  <div class="time-buttons">
    <mwc-button dense raised class="active-btn" @click=${() => this._changePeriod('tag')}>Tag</mwc-button>
    <mwc-button dense flat @click=${() => this._changePeriod('monat')}>Monat</mwc-button>
    <mwc-button dense flat @click=${() => this._changePeriod('jahr')}>Jahr</mwc-button>
  </div>
  
  <div class="range-picker-container">
    <!-- Der originale Home Assistant Date-Range-Picker -->
    <ha-date-range-picker
      .hass=${this._hass}
      .startDate=${this._startDate}
      .endDate=${this._endDate}
      @value-changed=${this._dateRangeChanged}
    ></ha-date-range-picker>
  </div>
</div>
`

// Passendes CSS dazu in deiner Karte
`
.energy-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}
.time-buttons {
  display: flex;
  gap: 8px;
}
mwc-button {
  --mdc-theme-primary: var(--primary-color);
}
.range-picker-container {
  max-width: 300px;
}
`
Use code with caution.Teil 2: Die Text-Daten-Karten im originalen HA-StyleDie grauen Boxen aus deinem Bild mit den farbigen Seitenbalken (Indikatoren) basieren auf der Standard <ha-card>. Du musst sie nicht selbst via CSS nachbauen. Du nutzt die CSS-Variablen von Home Assistant, damit die Farben für Erzeugung (Gelb/Orange), Speicher (Grün/Teal) und Netz (Lila) exakt dem System entsprechen.Hier ist das HTML- und CSS-Gerüst für eine solche Info-Box:javascript// Beispiel für die "Speicher"-Box aus deinem Bild
`
<ha-card class="energy-value-card battery-border">
  <div class="card-content">
    <div class="card-title">Speicher</div>
    <div class="main-value">5,10 kWh</div>
    
    <div class="sub-values">
      <div class="sub-item discharge-text">
        <span>2,10 kWh</span>
        <span class="sub-label">entladen</span>
      </div>
      <div class="sub-item charge-text">
        <span>3,00 kWh</span>
        <span class="sub-label">geladen</span>
      </div>
    </div>
  </div>
</ha-card>
`

// Das zugehörige CSS für den originalen Look
`
.energy-value-card {
  position: relative;
  padding: 16px;
  background: var(--card-background-color);
  border-left: 4px solid transparent; /* Platzhalter für den Farbbalken links */
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  border: var(--ha-card-border, 1px solid var(--divider-color));
}

/* Die originalen Farb-Zuweisungen aus dem HA-Energiesystem */
.solar-border { border-left-color: var(--energy-solar-color, #ff9800); }
.battery-border { border-left-color: var(--energy-battery-out-color, #4caf50); }
.grid-border { border-left-color: var(--energy-grid-consumption-color, #f44336); }

.card-title {
  color: var(--secondary-text-color);
  font-size: 14px;
}
.main-value {
  color: var(--primary-text-color);
  font-size: 24px;
  font-weight: bold;
  margin: 4px 0;
}
.sub-values {
  display: flex;
  gap: 16px;
  font-size: 12px;
  margin-top: 8px;
}
.discharge-text { color: var(--energy-battery-out-color, #4caf50); }
.charge-text { color: var(--energy-battery-in-color, #2196f3); }

.sub-label {
  display: block;
  color: var(--secondary-text-color);
}
`
Use code with caution.Wie die Logik im Hintergrund verknüpft wirdSobald der Nutzer auf einen Knopf drückt oder im <ha-date-range-picker> ein Datum auswählt, fängst du das Event ab, berechnest das neue Start- und Enddatum und triggerst deine Websocket-Abfrage (recorder/statistics_during_period) aus dem vorherigen Schritt neu.javascript_dateRangeChanged(ev) {
  // Holt die ausgewählten Daten aus dem originalen Picker
  const { startDate, endDate } = ev.detail;
  this._startDate = startDate;
  this._endDate = endDate;
  
  // Deine Funktion aufrufen, die die ECharts-Grafik und die Text-Karten oben aktualisiert
  this.updateDashboardData();
}
Use code with caution.Der große VorteilWeil du Variablen wie var(--primary-text-color) und var(--energy-solar-color) nutzt, sieht deine Karte sofort absolut nativ aus. Wechselt der Nutzer sein Home Assistant Theme auf "Dark Mode" oder nutzt ein farbiges Theme, färben sich deine Knöpfe und Text-Boxen vollautomatisch im selben Moment um.Möchtest du als Nächstes ein vollständiges, zusammenhängendes JavaScript-Template (als fertige Datei) sehen, wo die Toolbar, die Text-Boxen und der ECharts-Graph im Code sauber miteinander verdrahtet sind?
