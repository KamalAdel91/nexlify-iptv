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
echo [*] Installing %IPK% on the TV ...
call ares-install --device tv "%IPK%"
if errorlevel 1 (
  echo [X] Install failed. Make sure the TV is on, Developer Mode is active, and the PC is on the same network.
  exit /b 1
)

echo [*] Launching ...
call ares-launch --device tv com.homeiptv.player
echo [OK] Done.
endlocal
