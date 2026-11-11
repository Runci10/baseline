@echo off
rem Baseline on this laptop: get the latest code and Garmin data, start the app, open it in its own window.
cd /d "%~dp0"
title Baseline

set "URL=http://localhost:8081"

rem Already running? Just open the window.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto open

echo Getting the latest Baseline code...
git update-index --skip-worktree src/data/garmin.json 2>nul
git pull
echo.

set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not exist "%PY%" set "PY=python"
echo Pulling new data from Garmin...
"%PY%" scripts\sync_garmin.py
echo.

echo Starting Baseline (this takes about 30 seconds the first time)...
set "BROWSER=none"
start "Baseline server - close to stop" /min cmd /c "npx expo start --web --port 8081"

powershell -NoProfile -Command "for ($i=0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1"
if not %errorlevel%==0 (
  echo Baseline didn't start. Open the "Baseline server" window to see why.
  pause
  exit /b 1
)

:open
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=900,1000
) else (
  start "" %URL%
)
exit /b 0
