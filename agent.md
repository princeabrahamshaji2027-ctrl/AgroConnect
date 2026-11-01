# AGROCONNECT IoT — FINAL HARDWARE CONNECTION, FIRMWARE UPLOAD AND LIVE WEBSITE EXECUTION

Act as a senior ESP32 IoT engineer. We have already completed the software setup, installed Arduino CLI and ESP32 Arduino Core, modified the firmware, and successfully compiled the project.

Now I am physically connecting my ESP32 development board to my MacBook.

Your task is to complete the remaining hardware setup, upload the firmware, connect the ESP32 to my phone hotspot, verify communication, and help me open the live AgroConnect soil monitoring website.

IMPORTANT: Continue from the existing project state. Do not recreate the project, reinstall working dependencies, or overwrite completed work unnecessarily.

PROJECT DIRECTORY:
Use the currently opened workspace and the existing `soil_monitor/soil_monitor.ino` sketch.

## PHASE 1 — DETECT THE ESP32

I am going to connect my ESP32 to the MacBook using a USB cable.

1. Wait until the board is physically connected.
2. Execute:

arduino-cli board list

3. Inspect available serial devices.
4. Identify the actual ESP32 serial port.
5. Identify the connected board if possible.
6. Confirm that the serial port is accessible.
7. If the board is not detected:
   - Explain the likely USB cable, driver or permission issue.
   - Check macOS USB devices.
   - Suggest the appropriate fix.
   - Do not proceed with uploading until the board is detected.

Never invent a serial port.

## PHASE 2 — VERIFY THE FIRMWARE

Before uploading:

1. Inspect the latest `soil_monitor/soil_monitor.ino`.
2. Confirm the Wi-Fi SSID and password are preserved.
3. Confirm GPIO 34 is configured for the soil sensor.
4. Confirm the calibration values are preserved.
5. Verify the web server runs on port 80.
6. Verify `/` serves the dashboard.
7. Verify `/data` returns JSON.
8. Confirm Wi-Fi reconnection handling is implemented.
9. Compile the latest sketch again using the correct board configuration.

Use:

arduino-cli compile --fqbn esp32:esp32:esp32 ./soil_monitor

If compilation fails, diagnose and fix the errors before uploading.

## PHASE 3 — UPLOAD FIRMWARE

Once the ESP32 is detected and compilation succeeds:

1. Use the actual detected serial port.
2. Upload the firmware using Arduino CLI.
3. Show me the upload command before executing it.
4. If uploading gets stuck at Connecting, instruct me to hold the ESP32 BOOT button until flashing begins.
5. Wait for the upload to complete.
6. Confirm the actual upload result.

Do not claim that firmware has been uploaded unless the tool confirms success.

## PHASE 4 — CONNECT THE PHONE HOTSPOT (IMPORTANT TIMING)

Connect the hotspot ONLY AFTER the firmware upload has completed.

Tell me explicitly when to perform this step.

My existing Wi-Fi configuration is:

SSID: Nothing Phone (2)_4867
Password: Use the existing password from the firmware.

Do not display or expose the password unnecessarily.

Instructions:

1. Ask me to turn ON the hotspot on my Nothing Phone (2).
2. Ensure the hotspot supports 2.4 GHz Wi-Fi.
3. Ensure the hotspot name matches the existing firmware SSID exactly.
4. Ask me to connect my MacBook to this same hotspot.
5. Keep the ESP32 connected through USB so Serial Monitor remains accessible.
6. Wait for the ESP32 to connect to Wi-Fi.

The ESP32 is configured in Wi-Fi station mode. It connects to my existing phone hotspot; it does not create its own hotspot.

If Wi-Fi connection fails:
- Check SSID mismatch.
- Check password configuration without exposing it.
- Check 2.4 GHz compatibility.
- Check signal strength.
- Check Serial Monitor output.
- Diagnose and fix the issue.

## PHASE 5 — OPEN SERIAL MONITOR

After the hotspot is active and the Mac is connected:

Execute:

arduino-cli monitor -p ACTUAL_SERIAL_PORT -c baudrate=115200

Replace ACTUAL_SERIAL_PORT with the detected port.

Check for:

- ESP32 boot messages.
- Wi-Fi connection status.
- Local IP address.
- Web server startup message.
- Sensor raw values, if serial sensor logging exists.

If the monitor process needs to be restarted after uploading, do so.

If there is no IP address, diagnose the Wi-Fi connection instead of guessing one.

## PHASE 6 — OPEN THE WEBSITE AUTOMATICALLY

Once the ESP32 has successfully connected to Wi-Fi and printed its actual local IP:

1. Extract the real IP address from the Serial Monitor output.
2. Construct the URL using HTTP:

http://ACTUAL_ESP32_IP

3. Check whether the Mac can reach the ESP32.
4. Test the root HTTP endpoint.
5. Test the `/data` endpoint.
6. Verify that `/data` returns valid JSON containing:
   - raw
   - moisture
   - status

7. If the endpoint fails, inspect the server and firmware.
8. If everything works, open the website in my default browser using the actual URL.

Use the available macOS `open` command to launch the browser if possible.

Do not open a guessed IP address.

## PHASE 7 — LIVE SENSOR VALIDATION

Verify that:

1. The dashboard loads.
2. The moisture percentage is visible.
3. The progress bar updates.
4. The status changes according to the moisture percentage.
5. The raw sensor reading is displayed.
6. Automatic refresh works every two seconds.
7. The connection error message behaves correctly.

Ask me to test the sensor under these conditions:

- Sensor exposed to air or dry conditions.
- Sensor inserted into dry soil.
- Sensor inserted into moist soil.

Observe the raw values and help calibrate DRY_VALUE and WET_VALUE based on actual measurements.

Do not invent sensor readings or calibration values.

Do not submerge the sensor's electronic components.

## PHASE 8 — FINAL TROUBLESHOOTING

If anything fails:

- Diagnose the exact error.
- Inspect relevant source code.
- Fix the underlying problem.
- Recompile if firmware changes are made.
- Re-upload if required.
- Retest the affected endpoint.

Do not unnecessarily change working frontend design or project architecture.

Do not introduce Django, React, Node.js or external hosting.

The ESP32 must continue hosting the website itself.

## EXECUTION RULES

- Execute tasks instead of merely explaining them.
- Continue from existing installations.
- Do not fabricate hardware detection or upload results.
- Ask me to perform physical actions only when necessary.
- Tell me clearly when to connect the USB cable and when to turn on the hotspot.
- Do not expose Wi-Fi credentials.
- Never use a guessed serial port or IP address.
- Do not overwrite working files unnecessarily.
- Do not stop after successful compilation.

## FINAL SUCCESS CONDITION

The task is complete only when:

1. ESP32 is detected by the Mac.
2. Firmware is successfully uploaded.
3. ESP32 connects to my Nothing Phone hotspot.
4. The actual local IP is obtained.
5. The dashboard opens in my browser.
6. The `/data` endpoint returns valid sensor data.
7. The physical soil moisture sensor produces readings.

Start with PHASE 1. I am connecting the ESP32 now.