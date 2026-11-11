@echo off
rem Adds Baseline to the Desktop and the Start menu. Run once (double-click).
cd /d "%~dp0"
set "ROOT=%CD%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$root = '%ROOT%'; $icon = Join-Path $root 'scripts\baseline.ico';" ^
  "$places = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Baseline'));" ^
  "foreach ($p in $places) {" ^
  "  New-Item -ItemType Directory -Force -Path $p | Out-Null;" ^
  "  $s = $ws.CreateShortcut((Join-Path $p 'Baseline.lnk'));" ^
  "  $s.TargetPath = Join-Path $root 'open-baseline.bat'; $s.WorkingDirectory = $root; $s.IconLocation = $icon;" ^
  "  $s.WindowStyle = 7; $s.Description = 'Open Baseline on this laptop'; $s.Save();" ^
  "  $s = $ws.CreateShortcut((Join-Path $p 'Baseline for iPhone.lnk'));" ^
  "  $s.TargetPath = Join-Path $root 'start-baseline.bat'; $s.WorkingDirectory = $root; $s.IconLocation = $icon;" ^
  "  $s.Description = 'Start Baseline for Expo Go on the iPhone'; $s.Save();" ^
  "}"

echo.
echo Done. "Baseline" and "Baseline for iPhone" are on your Desktop and in the Start menu.
echo To pin it: open Start, type Baseline, right-click it and choose Pin to Start.
pause
