@echo off
rem Baseline: get the latest code and data, then start the app for Expo Go.
cd /d "%~dp0"
echo Getting the latest Baseline code and data...
git pull
echo.
echo Starting Baseline. In Expo Go, open the project under Development servers.
npx expo start --tunnel
pause
