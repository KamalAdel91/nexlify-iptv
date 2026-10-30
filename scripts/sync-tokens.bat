@echo off
rem Puts the Developer Mode token of every registered LG TV into the GitHub secret
rem LG_DEVMODE_TOKENS. Usage: sync-tokens.bat [tv-name ...]   (no names: every TV)
setlocal
chcp 65001 >nul
node "%~dp0sync-tokens.js" %*
endlocal
