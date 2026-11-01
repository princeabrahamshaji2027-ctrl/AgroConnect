#include <WiFi.h>
#include <WebServer.h>

// ==========================================
// AgroConnect IoT Soil Monitoring System
// ==========================================

// Wi-Fi Configuration (Preserved)
const char *ssid = "Nothing Phone (2)_4867";
const char *password = "4256";

// Hardware Pin Configuration
const int SOIL_PIN = 34;

// Default calibration values (Preserved initial defaults)
// NOTE: Capacitive soil moisture sensors output higher analog values in dry air
// and lower analog values when submerged in water or wet soil.
// Calibrate these two values for your specific physical sensor:
int DRY_VALUE = 3000;
int WET_VALUE = 1300;

WebServer server(80);

// Non-blocking sensor reading & caching state
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 500; // Sample sensor every 500ms
int cachedRawValue = 0;
int cachedMoisturePercent = 0;

// Wi-Fi connection tracking and non-blocking reconnection state
unsigned long lastWifiCheckTime = 0;
const unsigned long WIFI_CHECK_INTERVAL = 5000; // Check/attempt reconnect every 5s if disconnected
bool wasConnected = false;

// ---------------------------------------------------------------------------
// Analog Reading with Multi-sample Averaging
// ---------------------------------------------------------------------------
int readSoilRaw() {
  long total = 0;
  const int SAMPLES = 10;
  for (int i = 0; i < SAMPLES; i++) {
    total += analogRead(SOIL_PIN);
    delayMicroseconds(500); // 0.5ms delay between samples (total ~5ms, non-blocking)
  }
  return (int)(total / SAMPLES);
}

// ---------------------------------------------------------------------------
// Moisture Percentage Calculation with Bounds & Calibration Protection
// ---------------------------------------------------------------------------
int readMoisturePercent(int raw) {
  if (DRY_VALUE == WET_VALUE) {
    return 0; // Guard against division by zero if calibration values are identical
  }

  // Capacitive sensor: DRY_VALUE maps to 0%, WET_VALUE maps to 100%
  int percent = map(raw, DRY_VALUE, WET_VALUE, 0, 100);
  return constrain(percent, 0, 100);
}

// ---------------------------------------------------------------------------
// Status Classification
// ---------------------------------------------------------------------------
String getStatus(int percent) {
  if (percent < 30) {
    return "Dry";
  } else if (percent < 60) {
    return "Moderate";
  } else {
    return "Wet";
  }
}

// ---------------------------------------------------------------------------
// Periodic Sensor Reading Update
// ---------------------------------------------------------------------------
void updateSensorReadings() {
  unsigned long now = millis();
  if (now - lastSensorReadTime >= SENSOR_READ_INTERVAL || lastSensorReadTime == 0) {
    lastSensorReadTime = now;
    cachedRawValue = readSoilRaw();
    cachedMoisturePercent = readMoisturePercent(cachedRawValue);
  }
}

// ---------------------------------------------------------------------------
// HTTP Endpoint: Root Dashboard (/)
// ---------------------------------------------------------------------------
void handleRoot() {
  static const char PROGMEM HTML_CONTENT[] = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgroConnect Soil Monitor</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      text-align: center;
      background: #eef7ee;
      margin: 0;
      padding: 20px;
      color: #173b24;
    }
    .card {
      max-width: 430px;
      margin: 25px auto;
      padding: 24px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    }
    h1 { color: #176b35; margin-bottom: 4px; }
    .subtitle { color: #555; margin-top: 0; font-size: 15px; }
    .value {
      font-size: 56px;
      font-weight: bold;
      margin: 15px 0;
      color: #173b24;
    }
    .bar {
      height: 22px;
      background: #e2e8e2;
      border-radius: 20px;
      overflow: hidden;
      margin: 18px 0;
    }
    #fill {
      height: 100%;
      width: 0%;
      background: #28a745;
      border-radius: 20px;
      transition: width 0.4s ease, background-color 0.4s ease;
    }
    .label { font-size: 18px; margin: 14px 0; }
    .note { color: #666; font-size: 13px; margin: 8px 0; }
    .status-badge {
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h1>AgroConnect</h1>
  <p class="subtitle">IoT Soil Moisture Monitoring</p>

  <div class="card">
    <h2>Soil Moisture</h2>
    <div class="value"><span id="percent">--</span>%</div>
    <div class="bar"><div id="fill"></div></div>
    <p class="label">Status: <span id="status" class="status-badge">Connecting...</span></p>
    <p>Sensor raw value: <b id="raw">--</b></p>
    <p class="note">Updates automatically every 2 seconds.</p>
    <p class="note" id="updated">Connecting to sensor...</p>
  </div>

  <script>
    async function updateSensor() {
      try {
        const response = await fetch('/data', { cache: 'no-store' });
        if (!response.ok) throw new Error('Sensor request failed: ' + response.status);

        const data = await response.json();

        document.getElementById('percent').textContent = data.moisture;
        document.getElementById('raw').textContent = data.raw;
        
        const statusEl = document.getElementById('status');
        statusEl.textContent = data.status;
        
        const fillEl = document.getElementById('fill');
        fillEl.style.width = data.moisture + '%';
        
        if (data.status === 'Dry') {
          fillEl.style.backgroundColor = '#dc3545';
        } else if (data.status === 'Moderate') {
          fillEl.style.backgroundColor = '#ffc107';
        } else {
          fillEl.style.backgroundColor = '#28a745';
        }

        document.getElementById('updated').textContent =
          'Last updated: ' + new Date().toLocaleTimeString();
      } catch (error) {
        document.getElementById('status').textContent = 'Connection lost - retrying...';
      }
    }

    updateSensor();
    setInterval(updateSensor, 2000);
  </script>
</body>
</html>
)rawliteral";

  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.send(200, "text/html", HTML_CONTENT);
}

// ---------------------------------------------------------------------------
// HTTP Endpoint: JSON Sensor Data (/data)
// ---------------------------------------------------------------------------
void handleData() {
  updateSensorReadings();

  String json = "{";
  json += "\"raw\":" + String(cachedRawValue) + ",";
  json += "\"moisture\":" + String(cachedMoisturePercent) + ",";
  json += "\"status\":\"" + getStatus(cachedMoisturePercent) + "\"";
  json += "}";

  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// ---------------------------------------------------------------------------
// Non-blocking Wi-Fi Reconnection & Event Reporting
// ---------------------------------------------------------------------------
void handleWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wasConnected) {
      wasConnected = true;
      Serial.println();
      Serial.println("[AgroConnect] Wi-Fi connected successfully!");
      Serial.print("[AgroConnect] IP Address: http://");
      Serial.println(WiFi.localIP());
      Serial.print("[AgroConnect] Signal Strength (RSSI): ");
      Serial.print(WiFi.RSSI());
      Serial.println(" dBm");
    }
  } else {
    if (wasConnected) {
      wasConnected = false;
      Serial.println("\n[AgroConnect] Wi-Fi connection lost. Attempting periodic reconnection...");
    }
    unsigned long now = millis();
    if (now - lastWifiCheckTime >= WIFI_CHECK_INTERVAL) {
      lastWifiCheckTime = now;
      Serial.println("[AgroConnect] Attempting to reconnect Wi-Fi...");
      WiFi.reconnect();
    }
  }
}

// ---------------------------------------------------------------------------
// Arduino Setup
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500); // UART settle delay
  Serial.println("\n==========================================");
  Serial.println("  AgroConnect IoT Soil Monitoring System  ");
  Serial.println("==========================================");

  analogReadResolution(12); // ESP32 12-bit ADC (0 - 4095)
  pinMode(SOIL_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("[AgroConnect] Connecting to Wi-Fi SSID: ");
  Serial.println(ssid);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wasConnected = true;
    Serial.println();
    Serial.println("[AgroConnect] Wi-Fi connected!");
    Serial.print("[AgroConnect] Open this address in your browser: http://");
    Serial.println(WiFi.localIP());
  } else {
    wasConnected = false;
    Serial.println();
    Serial.println("[AgroConnect] Initial Wi-Fi connection timed out.");
    Serial.println("[AgroConnect] Background reconnection active. Ensure 2.4 GHz hotspot is active.");
  }

  // Configure HTTP routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/data", HTTP_GET, handleData);
  server.begin();
  Serial.println("[AgroConnect] HTTP Web Server started on port 80.");

  // Prime initial sensor reading
  updateSensorReadings();
}

// ---------------------------------------------------------------------------
// Arduino Main Loop
// ---------------------------------------------------------------------------
void loop() {
  handleWiFi();
  updateSensorReadings();
  server.handleClient();
}

