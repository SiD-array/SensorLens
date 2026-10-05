@echo off
setlocal
cd /d "%~dp0"
title Stop SensorLens
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\stop.ps1"
echo.
pause
