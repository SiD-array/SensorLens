Add-Type -AssemblyName System.Drawing

$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Background deep slate rounded circle
$p1 = New-Object System.Drawing.Point 0, 0
$p2 = New-Object System.Drawing.Point $size, $size
$c1 = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
$c2 = [System.Drawing.Color]::FromArgb(255, 30, 41, 59)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $c1, $c2
$g.FillEllipse($bgBrush, 2, 2, $size - 4, $size - 4)

# Border cyan glow ring
$borderCol = [System.Drawing.Color]::FromArgb(220, 0, 242, 254)
$penBorder = New-Object System.Drawing.Pen $borderCol, 2.5
$g.DrawEllipse($penBorder, 3, 3, $size - 6, $size - 6)

# Draw stylized sensor wave & lens
$waveCol = [System.Drawing.Color]::FromArgb(255, 56, 189, 248)
$wavePen = New-Object System.Drawing.Pen $waveCol, 3.0
$points = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 12, 34),
    (New-Object System.Drawing.Point 20, 18),
    (New-Object System.Drawing.Point 30, 46),
    (New-Object System.Drawing.Point 40, 22),
    (New-Object System.Drawing.Point 48, 34),
    (New-Object System.Drawing.Point 52, 34)
)
$g.DrawCurve($wavePen, $points, 0.45)

# Glowing pulse node
$purpleCol = [System.Drawing.Color]::FromArgb(255, 168, 85, 247)
$nodeBrush = New-Object System.Drawing.SolidBrush $purpleCol
$g.FillEllipse($nodeBrush, 27, 21, 10, 10)

$whiteCol = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$nodeCore = New-Object System.Drawing.SolidBrush $whiteCol
$g.FillEllipse($nodeCore, 30, 24, 4, 4)

$g.Dispose()

# Save as ICO
$outPath = Join-Path $PSScriptRoot "..\sensorlens.ico"
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::OpenWrite($outPath)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()

Write-Host "Created sensorlens.ico at $outPath"
