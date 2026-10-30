@echo off
rem Builds the Samsung (Tizen) version of the app and installs it on a Samsung TV in Developer Mode.
rem Usage: samsung-install.bat [TV IP]
rem Needs Tizen Studio (CLI) and a Samsung certificate profile named "nexlify" (see README).

rem Same as install.bat: get the latest version first, then run the updated copy of this script
if /i not "%~1"=="--pulled" (
  where git >nul 2>nul
  if not errorlevel 1 if exist "%~dp0..\.git" (
    echo [*] Getting the latest version from GitHub ...
    git -C "%~dp0.." pull --ff-only || echo [!] Could not update from GitHub. Installing the version already on this PC.
  )
  call "%~f0" --pulled %*
  exit /b
)
shift

setlocal
chcp 65001 >nul
cd /d "%~dp0.."

rem Tizen Studio's default install folders
if exist "C:\tizen-studio\tools\ide\bin" set "PATH=%PATH%;C:\tizen-studio\tools\ide\bin;C:\tizen-studio\tools"
if exist "%USERPROFILE%\tizen-studio\tools\ide\bin" set "PATH=%PATH%;%USERPROFILE%\tizen-studio\tools\ide\bin;%USERPROFILE%\tizen-studio\tools"

where tizen >nul 2>nul
if errorlevel 1 (
  echo [X] Tizen Studio is not installed, or its "tools\ide\bin" folder is not on PATH. See the README.
  exit /b 1
)

set IP=%~1
if "%IP%"=="" set /p IP=Samsung TV IP address:
if "%IP%"=="" (
  echo [X] The TV IP address is required.
  exit /b 1
)
set SERIAL=%IP%:26101

if not exist "app\lib" mkdir "app\lib"
if not exist "app\lib\mpegts.js" (
  echo [*] Downloading mpegts.js ...
  curl -fsSL -o "app\lib\mpegts.js" "https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js"
  if errorlevel 1 if exist "app\lib\mpegts.js" del "app\lib\mpegts.js"
)

node scripts\samsung-prepare.js
if errorlevel 1 exit /b 1

echo [*] Packaging and signing with the "nexlify" certificate profile ...
call tizen package -t wgt -s nexlify -- build\tizen
if not exist "build\tizen\Nexlify.wgt" (
  echo [X] Packaging failed. Check that a Samsung certificate profile named "nexlify" exists in Certificate Manager.
  exit /b 1
)

echo [*] Connecting to the TV ...
call sdb connect %IP%
call sdb devices | findstr /c:"%SERIAL%" >nul
if errorlevel 1 (
  echo [X] Cannot reach the TV. Check that Developer Mode is on with this PC's IP, and that both are on the same Wi-Fi.
  exit /b 1
)

echo [*] Installing ...
call tizen install -n Nexlify.wgt -s %SERIAL% -- build\tizen
if errorlevel 1 (
  echo [X] Install failed. If it mentions the certificate, add this TV's DUID to the "nexlify" profile.
  exit /b 1
)

echo [*] Launching ...
call tizen run -p NxlfyIPTV0.Nexlify -s %SERIAL%
echo [OK] Done.
endlocal
