# AgroConnect IoT Soil Monitoring System — Setup & Deployment Guide

This guide walks through configuring the development environment on macOS, compiling the firmware, flashing the ESP32, and accessing the real-time web dashboard.

---

## 1. Prerequisites

- **Host System:** macOS (Intel or Apple Silicon)
- **Wi-Fi Network:** 2.4 GHz mobile hotspot or home Wi-Fi router
  - *Note:* ESP32 only connects to 2.4 GHz Wi-Fi channels (802.11 b/g/n). 5 GHz-only hotspots will not be visible to the ESP32.
- **Hardware:** ESP32 development board, Soil Moisture Sensor, USB data cable.

---

## 2. Arduino CLI & ESP32 Core Setup

### 2.1 Verify Arduino CLI Installation
Check if `arduino-cli` is available:
```bash
arduino-cli version
```

If not installed, install the official release binary:
```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh
```

### 2.2 Configure Arduino CLI with ESP32 Index
Initialize configuration and add the official Espressif board manager URL:
```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
```

### 2.3 Install ESP32 Core
```bash
arduino-cli core install esp32:esp32
```

Verify installed cores:
```bash
arduino-cli core list
```

---

## 3. Wi-Fi Configuration

Open `soil_monitor/soil_monitor.ino` and locate lines 10–11:
```cpp
const char *ssid = "Nothing Phone (2)_4867";
const char *password = "4256";
```

### Important Hotspot Configuration:
1. Turn on personal hotspot on your phone.
2. In your phone's Hotspot settings, enable **"Maximize Compatibility"** (iOS) or select **"2.4 GHz Band"** (Android/Nothing OS).
3. Connect your Mac/PC to the **same** hotspot network so you can access the ESP32's local web server.

---

## 4. Compilation

Compile the project targeting the standard ESP32 Dev Module (`esp32:esp32:esp32`):

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 ./soil_monitor
```

For verbose compilation diagnostics:
```bash
arduino-cli compile --fqbn esp32:esp32:esp32 ./soil_monitor --verbose
```

---

## 5. Board Detection & Flashing

### 5.1 Identify Connected Serial Port
Plug your ESP32 board into your Mac using a data-capable USB cable and run:
```bash
arduino-cli board list
```
or inspect macOS device nodes:
```bash
ls /dev/cu.usbserial* /dev/cu.wchusbserial* /dev/cu.SLAB_USBtoUART* 2>/dev/null
```

### 5.2 Upload Firmware
Run the upload command replacing `<PORT>` with your detected port (e.g. `/dev/cu.usbserial-0001`):
```bash
arduino-cli upload -p <PORT> --fqbn esp32:esp32:esp32 ./soil_monitor
```

> [!TIP]
> If the upload fails with `Failed to connect to ESP32: Timed out waiting for packet header`:
> Press and hold the **BOOT** (or **IO0**) button on the ESP32 when `Connecting......` appears in the terminal until the flashing percentage begins.

---

## 6. Accessing the Dashboard

1. Open the Serial Monitor at 115200 baud:
   ```bash
   arduino-cli monitor -p <PORT> -c baudrate=115200
   ```
2. Press the **EN / RST** button on the ESP32.
3. Observe the boot logs:
   ```text
   ==========================================
     AgroConnect IoT Soil Monitoring System  
   ==========================================
   [AgroConnect] Connecting to Wi-Fi SSID: Nothing Phone (2)_4867
   ....
   [AgroConnect] Wi-Fi connected!
   [AgroConnect] Open this address in your browser: http://192.168.43.123
   [AgroConnect] HTTP Web Server started on port 80.
   ```
4. Open your web browser (Safari, Chrome, Firefox) on any device connected to the same hotspot/Wi-Fi and navigate to:
   ```text
   http://192.168.43.123
   ```
5. The live dashboard updates automatically every 2 seconds without requiring page refreshes.

---

## 7. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| Serial shows repeated `Connecting......` or Wi-Fi timeout | 5 GHz band or wrong password | Ensure phone hotspot is set to 2.4 GHz; verify SSID & password. |
| Browser shows "Site can't be reached" | Mac and ESP32 on different networks | Ensure your computer/phone is connected to the exact same Wi-Fi hotspot as the ESP32. |
| Moisture reads 0% or 100% constantly | Sensor disconnected or uncalibrated | Verify VCC is on 3.3V, GND to GND, and AO to GPIO 34. Check raw readings in `/data`. |
| Port not detected in `arduino-cli board list` | Missing USB-UART driver or charge-only cable | Replace USB cable with a data cable. Install CP210x or CH340 drivers if required. |

