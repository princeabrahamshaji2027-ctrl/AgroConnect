# Hardware Configuration & Connection Guide

This document details the exact hardware requirements, pin connections, voltage precautions, and calibration procedures for the **AgroConnect IoT Soil Monitoring System**.

---

## 1. Hardware Components

| Component | Description | Quantity |
| :--- | :--- | :--- |
| **ESP32 Development Board** | 30-pin or 38-pin NodeMCU-32S / ESP32-WROOM-32 Dev Module (2.4 GHz Wi-Fi) | 1 |
| **Soil Moisture Sensor** | Capacitive Soil Moisture Sensor (v1.2 or v2.0 recommended) or Resistive Sensor | 1 |
| **Jumper Wires** | Female-to-Female or Female-to-Male DuPont jumper wires | 3 |
| **Micro-USB / USB-C Cable** | High-quality data-capable USB cable (for power and flashing) | 1 |
| **Power Source / Hotspot** | USB port or 5V 1A adapter + 2.4 GHz Wi-Fi Hotspot | 1 |

---

## 2. Wiring & Pinout Diagram

Connect the soil moisture sensor to the ESP32 board pins as specified below:

```text
+----------------------------+             +-------------------------------+
| Capacitive Soil Sensor v1.2|             |    ESP32 Development Board    |
|                            |             |                               |
|        [ VCC ] ------------+------------>| 3V3 (3.3V Power Out)          |
|        [ GND ] ------------+------------>| GND (Common Ground)           |
|        [ AOUT/AO ] --------+------------>| GPIO 34 (ADC1_CH6 - Input)    |
|        [ DOUT/DO ] (N/C)   |             |                               |
+----------------------------+             +-------------------------------+
```

### Pin Assignment Table

| Sensor Pin | ESP32 Pin | Function | Notes |
| :--- | :--- | :--- | :--- |
| **VCC** | **3V3** (3.3V) | Power supply | **Crucial:** Connect to 3.3V, NOT 5V/VIN! |
| **GND** | **GND** | Ground reference | Common ground |
| **AO / AOUT** | **GPIO 34** | Analog output signal | Connected to ESP32 ADC1 Channel 6 |
| **DO / DOUT** | *(Not Connected)* | Digital threshold output | Leave unconnected (analog mode used) |

---

## 3. Voltage Compatibility Precautions

> [!CAUTION]
> **ESP32 GPIO Voltage Limit is 3.3V Maximum!**
> - The ESP32's ADC and GPIO pins are strictly rated for a maximum of 3.3V. Applying 5V directly to GPIO 34 will cause permanent hardware damage to the ESP32 SoC.
> - Always power the soil moisture sensor from the **3.3V (3V3)** pin of the ESP32. Most modern capacitive soil moisture sensors (v1.2, v2.0) operate between 3.3V and 5.5V. When powered from 3.3V, their analog output will naturally stay within the safe 0V–3.3V range.
> - If using an older resistive sensor board that only outputs 5V, you must use a resistor voltage divider (e.g., 10kΩ and 20kΩ) or a logic level shifter before connecting to GPIO 34.

---

## 4. Why GPIO 34?

- **ADC1 vs ADC2:** ESP32 has two Analog-to-Digital Converters: ADC1 (GPIOs 32–39) and ADC2 (GPIOs 0, 2, 4, 12–15, 25–27).
- **Wi-Fi Conflict Note:** ADC2 is shared with the Wi-Fi driver. When Wi-Fi is active, calls to `analogRead()` on ADC2 pins fail or return invalid data.
- **GPIO 34 is on ADC1 (ADC1_CH6)**, meaning it works reliably and continuously alongside active 2.4 GHz Wi-Fi transmission.
- GPIO 34 is also an input-only pin without internal pull-ups or pull-downs, making it ideal for high-impedance analog sensor signals.

---

## 5. Sensor Calibration Procedure

Every soil moisture sensor has manufacturing tolerances and varies depending on soil density, salinity, and minerals. Default calibration constants are provided in firmware:

```cpp
int DRY_VALUE = 3000;
int WET_VALUE = 1300;
```

### Step-by-Step Calibration:
1. **Air / Dry Value:**
   - Keep the sensor dry and suspended in open air.
   - Observe the `Sensor raw value` on the AgroConnect dashboard or Serial Monitor.
   - Record this value (e.g., `3050`). Set this as `DRY_VALUE`.
2. **Water / Wet Value:**
   - Submerge the sensing probe into a cup of water up to the marked line (do not submerge the electronic components at the top).
   - Observe the `Sensor raw value`.
   - Record this value (e.g., `1280`). Set this as `WET_VALUE`.
3. **Update Firmware:**
   - Modify `DRY_VALUE` and `WET_VALUE` in `soil_monitor.ino` to match your physical readings and re-upload.

