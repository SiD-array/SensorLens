# Cleanly stops any running backend or frontend processes on ports 8000 and 5173
try { $Host.UI.RawUI.WindowTitle = "Stopping SensorLens" } catch {}

function Stop-PortProcesses([int]$port, [string]$name) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            $pidToKill = $c.OwningProcess
            try {
                $proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
                if ($proc) {
                    $pName = $proc.ProcessName
                    Write-Host "[*] Stopping $name (PID: $pidToKill, Process: $pName)..." -ForegroundColor Yellow
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }
        Write-Host "[OK] $name on port $port stopped." -ForegroundColor Green
    } else {
        Write-Host "[-] $name is not currently active on port $port." -ForegroundColor Gray
    }
}

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "                 Stopping SensorLens Services                       " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

Stop-PortProcesses 8000 "Backend API"
Stop-PortProcesses 5173 "Frontend UI"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "[OK] All SensorLens services have been stopped." -ForegroundColor Green
