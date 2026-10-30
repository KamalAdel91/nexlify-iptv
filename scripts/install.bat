@echo off
rem Packages the app and installs it on the TV registered as "tv" in ares-setup-device.
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

where ares-package >nul 2>nul
if errorlevel 1 (
  echo [X] webOS CLI is not installed. Run:  npm install -g @webos-tools/cli
  exit /b 1
)

if not exist "app\lib" mkdir "app\lib"
if not exist "app\lib\mpegts.js" (
  echo [*] Downloading mpegts.js ...
  curl -fsSL -o "app\lib\mpegts.js" "https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js"
  if errorlevel 1 (
    echo [!] Could not download mpegts.js. The app will try to load it from the internet when needed.
    if exist "app\lib\mpegts.js" del "app\lib\mpegts.js"
  )
)

if not exist dist mkdir dist
del /q dist\*.ipk 2>nul

echo [*] Packaging ...
call ares-package app -o dist
if errorlevel 1 exit /b 1

for %%f in (dist\*.ipk) do set IPK=%%f
set LOG=%TEMP%\nexlify-install.log

rem ares-* tools can exit with code 0 even on failure, so also look for "ERR!" in their output
echo [*] Checking the connection to the TV ...
call ares-device --device tv --system-info > "%LOG%" 2>&1
findstr /c:"ERR!" "%LOG%" >nul
if not errorlevel 1 goto :noconnect

echo [*] Installing %IPK% on the TV ...
call ares-install --device tv "%IPK%" > "%LOG%" 2>&1
type "%LOG%"
findstr /c:"ERR!" "%LOG%" >nul
if not errorlevel 1 (
  echo [X] Install failed.
  exit /b 1
)

echo [*] Launching ...
call ares-launch --device tv com.homeiptv.player
echo [OK] Done.
exit /b 0

:noconnect
type "%LOG%"
echo.
echo [X] Cannot reach the TV. Check that:
echo     1. The TV is on and the Developer Mode app shows the same IP as before.
echo        If the IP changed, run:  ares-setup-device -m tv -i "host=NEW_IP"
echo     2. Developer Mode is still active (Remain Session is not expired).
echo     3. The PC and the TV are on the same Wi-Fi network.
exit /b 1
