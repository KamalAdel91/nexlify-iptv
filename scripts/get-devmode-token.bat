@echo off
rem Prints the Developer Mode session token. Put it in the GitHub secret LG_DEVMODE_TOKENS (one line per TV).
rem Usage: get-devmode-token.bat [device]   (default device name: tv)
setlocal
chcp 65001 >nul
set DEVICE=%~1
if "%DEVICE%"=="" set DEVICE=tv
call ares-novacom --device %DEVICE% --run "cat /var/luna/preferences/devmode_enabled"
echo.
