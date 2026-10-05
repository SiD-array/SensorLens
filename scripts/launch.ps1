# SensorLens Launcher & Controller
# Manages FastAPI backend and Vite frontend services, opens browser, and monitors lifecycle.

try { $Host.UI.RawUI.WindowTitle = "SensorLens Controller" } catch {}
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectRoot

function Write-Color([string]$text, [ConsoleColor]$color) {
    Write-Host $text -ForegroundColor $color
}

function Test-PortListening([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

try { Clear-Host } catch {}
Write-Color "====================================================================" Cyan
Write-Color "                 SensorLens - Sensor Studio Launcher                " Cyan
Write-Color "====================================================================" Cyan
Write-Host ""

$backendStartedByUs = $false
$frontendStartedByUs = $false
$backendProc = $null
$frontendProc = $null

# 1. Check or Start Backend (Port 8000)
if (Test-PortListening 8000) {
    Write-Color "[OK] Backend is already active on http://localhost:8000" Green
} else {
    Write-Color "[*] Starting FastAPI Backend on port 8000..." Yellow
    $venvPython = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
    $pythonExe = if (Test-Path $venvPython) { $venvPython } else { "python" }
    $backendDir = Join-Path $ProjectRoot "backend"

    $backendProc = Start-Process -FilePath $pythonExe `
        -ArgumentList "-m uvicorn main:app --port 8000" `
        -WorkingDirectory $backendDir `
        -PassThru `
        -WindowStyle Hidden
    $backendStartedByUs = $true
}

# 2. Check or Start Frontend (Port 5173)
if (Test-PortListening 5173) {
    Write-Color "[OK] Frontend is already active on http://localhost:5173" Green
} else {
    Write-Color "[*] Starting Vite React Frontend on port 5173..." Yellow
    $npmCmd = "cmd.exe"
    $frontendDir = Join-Path $ProjectRoot "frontend"

    $frontendProc = Start-Process -FilePath $npmCmd `
        -ArgumentList "/c npm run dev -- --port 5173" `
        -WorkingDirectory $frontendDir `
        -PassThru `
        -WindowStyle Hidden
    $frontendStartedByUs = $true
}

# 3. Wait for services to become responsive
Write-Host ""
Write-Host -NoNewline "[*] Waiting for services to initialize" -ForegroundColor Gray
$timeoutSec = 25
$elapsed = 0.0
$backendReady = $false
$frontendReady = $false
$backendAnnounced = $false
$frontendAnnounced = $false

while ($elapsed -lt $timeoutSec) {
    if (-not $backendReady) {
        $backendReady = Test-PortListening 8000
        if ($backendReady -and -not $backendAnnounced) {
            Write-Host ""
            $t = [math]::Round($elapsed, 1)
            Write-Color "    -> [OK] Backend online at http://localhost:8000 ($t s)" Green
            $backendAnnounced = $true
            Write-Host -NoNewline "[*] Waiting for frontend..." -ForegroundColor Gray
        }
    }
    if (-not $frontendReady) {
        $frontendReady = Test-PortListening 5173
        if ($frontendReady -and -not $frontendAnnounced) {
            Write-Host ""
            $t = [math]::Round($elapsed, 1)
            Write-Color "    -> [OK] Frontend online at http://localhost:5173 ($t s)" Green
            $frontendAnnounced = $true
        }
    }
    if ($backendReady -and $frontendReady) {
        break
    }
    Write-Host -NoNewline "." -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 500
    $elapsed += 0.5
}
Write-Host ""

if (-not $backendReady) {
    Write-Color "[!] Warning: Backend server did not respond on port 8000 within $timeoutSec seconds." Red
}
if (-not $frontendReady) {
    Write-Color "[!] Warning: Frontend server did not respond on port 5173 within $timeoutSec seconds." Red
}

# 4. Open default browser to Frontend
Write-Color "[OK] Opening SensorLens in default web browser..." Cyan
Start-Process "http://localhost:5173"
try { $Host.UI.RawUI.WindowTitle = "SensorLens [RUNNING] - http://localhost:5173" } catch {}

# 5. Display interactive status console
Write-Host ""
Write-Color "====================================================================" Cyan
Write-Color "                       SensorLens is Running                        " Green
Write-Color "====================================================================" Cyan
Write-Color "  Web Dashboard : http://localhost:5173" White
Write-Color "  Backend API   : http://localhost:8000" White
Write-Color "  API Docs      : http://localhost:8000/docs" Gray
Write-Host ""
Write-Color " Keep this window open while using SensorLens." Yellow
Write-Color " Press [Q] or [Enter] in this window to stop servers and exit." Cyan
Write-Color "====================================================================" Cyan

$canCheckKeys = $false
try {
    $canCheckKeys = -not [System.Console]::IsInputRedirected
} catch {
    $canCheckKeys = $false
}

try {
    if ($canCheckKeys) {
        while ($true) {
            if ([System.Console]::KeyAvailable) {
                $key = [System.Console]::ReadKey($true)
                if ($key.Key -eq [System.ConsoleKey]::Q -or $key.Key -eq [System.ConsoleKey]::Enter -or $key.Key -eq [System.ConsoleKey]::Escape) {
                    break
                }
            }
            Start-Sleep -Milliseconds 400
        }
    } else {
        Start-Sleep -Seconds 3600
    }
}
finally {
    Write-Host ""
    Write-Color "[*] Shutting down SensorLens services..." Yellow

    if ($backendStartedByUs -or $frontendStartedByUs) {
        # Terminate processes on port 8000 if we started it
        if ($backendStartedByUs) {
            $bConns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
            foreach ($c in $bConns) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
            if ($backendProc -and -not $backendProc.HasExited) {
                Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
            }
        }

        # Terminate processes on port 5173 if we started it
        if ($frontendStartedByUs) {
            $fConns = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
            foreach ($c in $fConns) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
            if ($frontendProc -and -not $frontendProc.HasExited) {
                Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }

    Write-Color "[OK] SensorLens services stopped cleanly. Goodbye!" Green
    Start-Sleep -Seconds 1
}
