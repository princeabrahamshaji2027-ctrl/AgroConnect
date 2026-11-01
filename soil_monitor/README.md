# AgroConnect Soil Monitor — Firmware Source

This directory contains the primary Arduino sketch for the AgroConnect IoT Soil Monitoring System.

## Files
- `soil_monitor.ino`: Main ESP32 firmware source code containing sensor sampling logic, Wi-Fi reconnection handler, embedded HTML/CSS/JS dashboard, and `/data` JSON API.

## Compilation & Upload Commands

### Compile
```bash
arduino-cli compile --fqbn esp32:esp32:esp32 .
```

### Upload
```bash
arduino-cli upload -p <SERIAL_PORT> --fqbn esp32:esp32:esp32 .
```

### Monitor Serial Output
```bash
arduino-cli monitor -p <SERIAL_PORT> -c baudrate=115200
```

