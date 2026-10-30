@echo off
rem One-time setup for another LG TV: registers it, pairs the PC, installs the app
rem and prints the token for the daily Developer Mode extension.
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
echo [*] Developer Mode token for this TV:
call "%~dp0get-devmode-token.bat" %NAME%
echo  Add the token above as a new line in the GitHub secret LG_DEVMODE_TOKENS
echo  so Developer Mode on this TV is extended every day.
echo.
echo  To update this TV later:  scripts\install.bat %NAME%
endlocal
