@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title SensorLens - First Time Setup

echo ====================================================================
echo                 SensorLens - Automated System Setup
echo ====================================================================
echo.

:: 1. Check Python
echo [*] Checking Python installation...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)
python --version

:: 2. Set up Backend Python Virtual Environment & Requirements
echo.
echo [*] Setting up Python backend environment...
if not exist "backend\.venv" (
    echo     -> Creating virtual environment in backend\.venv...
    python -m venv backend\.venv
)

echo     -> Installing Python packages from requirements.txt...
backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul 2>&1
backend\.venv\Scripts\python.exe -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Encountered an issue installing requirements with backend venv.
    echo Trying fallback with global python...
    pip install -r requirements.txt
)
echo     [OK] Python dependencies installed successfully!

:: 3. Check Node.js and npm
echo.
echo [*] Checking Node.js and npm...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo The SensorLens frontend requires Node.js (v18+ or v20+ LTS).
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
node --version
npm --version

:: 4. Install Frontend npm dependencies
echo.
echo [*] Installing frontend Node.js packages (npm install)...
echo     (This may take 1-2 minutes on first run)...
cd /d "%~dp0frontend"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed!
    echo Please check your internet connection or run 'cd frontend && npm install' manually.
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"
echo     [OK] Frontend dependencies installed successfully!

:: 5. Create Desktop Shortcut
echo.
echo [*] Creating Desktop shortcut...
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\create_shortcut.ps1"

echo.
echo ====================================================================
echo                   Setup Completed Successfully!
echo ====================================================================
echo  You can now start SensorLens by:
echo  1) Double-clicking the "SensorLens" icon on your Desktop.
echo  2) Or running "start_sensorlens.bat" in this directory.
echo ====================================================================
echo.
pause
