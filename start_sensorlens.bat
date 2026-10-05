@echo off
setlocal
cd /d "%~dp0"
title SensorLens Controller
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\launch.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] An unexpected error occurred while launching SensorLens.
    echo Error code: %ERRORLEVEL%
    pause
)
