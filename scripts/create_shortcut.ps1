# Creates a Windows Desktop shortcut for SensorLens
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$TargetBat = Join-Path $ProjectRoot "start_sensorlens.bat"
$IconPath = Join-Path $ProjectRoot "sensorlens.ico"
$DesktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutFile = Join-Path $DesktopDir "SensorLens.lnk"

# If icon doesn't exist, generate it
if (-not (Test-Path $IconPath)) {
    & (Join-Path $PSScriptRoot "generate_icon.ps1")
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutFile)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Launch SensorLens Analytics Platform & Dashboard"
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = "$IconPath,0"
}
$Shortcut.Save()

Write-Host "===================================================================="
Write-Host " [OK] Desktop Shortcut created successfully!"
Write-Host " Location: $ShortcutFile"
Write-Host " Target  : $TargetBat"
Write-Host " Icon    : $IconPath"
Write-Host "===================================================================="
