@echo off
setlocal
cd /d "%~dp0"
title Create SensorLens Desktop Shortcut
echo [*] Creating SensorLens Desktop Shortcut...
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\create_shortcut.ps1"
echo.
pause
