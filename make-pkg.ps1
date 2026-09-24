param()
$ErrorActionPreference = 'Stop'

# Verify compiled exe exists
$setupExe = "dist-electron\NIMIYO-Downloader-2.1.1-Setup-win64.exe"
if (Test-Path $setupExe) {
    $size = [math]::Round((Get-Item $setupExe).Length / 1KB, 1)
    Write-Host "Setup.exe: $size KB" -ForegroundColor Green
}

# Create installer package zip (Setup.exe + app folder + ps1 script)
$installerZip = "dist-electron\NIMIYO-Downloader-2.1.1-Installer-win64.zip"
if (Test-Path $installerZip) { Remove-Item $installerZip }

$tmpDir = "dist-electron\_installer_pkg"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
New-Item -ItemType Directory $tmpDir | Out-Null

# Copy app files + installer
Copy-Item -Path "dist-electron\NIMIYO Downloader-win32-x64\*" -Destination $tmpDir -Recurse
Copy-Item "dist-electron\installer_src.ps1" $tmpDir
Copy-Item "dist-electron\NIMIYO-Downloader-2.1.1-Setup-win64.exe" (Join-Path $tmpDir "Install NIMIYO Downloader.exe")

Compress-Archive -Path "$tmpDir\*" -DestinationPath $installerZip -Force
Remove-Item $tmpDir -Recurse -Force

Write-Host ""
Write-Host "=== dist-electron output ===" -ForegroundColor Cyan
Get-ChildItem "dist-electron" | Where-Object { -not $_.PSIsContainer } |
    Select-Object Name, @{N="Size";E={"$([math]::Round($_.Length/1MB,2)) MB"}} |
    Format-Table -AutoSize
