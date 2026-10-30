@echo off
rem Prints the Developer Mode session token. Put it in the GitHub secret LG_DEVMODE_TOKEN.
chcp 65001 >nul
call ares-novacom --device tv --run "cat /var/luna/preferences/devmode_enabled"
echo.
