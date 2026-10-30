@echo off
rem One-time setup for another LG TV: registers it, pairs the PC, installs the app
rem and adds its token to the daily Developer Mode extension on GitHub.
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo  Before you start, on the TV:
echo    - Install "Developer Mode" from LG Content Store and sign in with your LG developer account
echo    - Turn on "Dev Mode Status" (the TV restarts), then turn on "Key Server"
echo.

set NAME=
set /p NAME=Short name for this TV, no spaces (e.g. bedroom):
if "%NAME%"=="" set NAME=tv2
set IP=
set /p IP=TV IP address (shown in the Developer Mode app):
if "%IP%"=="" (
  echo [X] The IP address is required.
  exit /b 1
)

call ares-setup-device -l | findstr /b /c:"%NAME% " >nul
if errorlevel 1 (
  call ares-setup-device -a %NAME% -i "host=%IP%" -i "port=9922" -i "username=prisoner"
) else (
  call ares-setup-device -m %NAME% -i "host=%IP%"
)

echo.
echo [*] Pairing with the TV. Type the Passphrase shown in the Developer Mode app when asked.
call ares-novacom --device %NAME% --getkey

echo.
call "%~dp0install.bat" %NAME%
if errorlevel 1 exit /b 1

echo.
echo [*] Adding this TV to the daily Developer Mode extension ...
node "%~dp0sync-tokens.js" %NAME%
if errorlevel 1 (
  echo [!] The app is installed, but its token was not saved to GitHub. Fix the message above, then run scripts\sync-tokens.bat
)
echo.
echo  To update this TV later:  scripts\install.bat %NAME%
endlocal
