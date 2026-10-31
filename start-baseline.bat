@echo off
rem Baseline: get the latest code, pull new Garmin data, then start the app for Expo Go.
cd /d "%~dp0"

echo Getting the latest Baseline code...
git update-index --skip-worktree src/data/garmin.json 2>nul
git pull
echo.

set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not exist "%PY%" set "PY=python"
echo Pulling new data from Garmin...
"%PY%" scripts\sync_garmin.py
echo.

echo Starting Baseline. In Expo Go, open the project under Development servers.
npx expo start --tunnel
pause
