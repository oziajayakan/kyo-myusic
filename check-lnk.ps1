$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = $ws.CreateShortcut("$desktop\KYO Downloader.lnk")
Write-Host "Target: $($lnk.TargetPath)"
Write-Host "Working: $($lnk.WorkingDirectory)"
Write-Host "Exists: $(Test-Path $lnk.TargetPath)"
