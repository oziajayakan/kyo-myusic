$desktopDir = [Environment]::GetFolderPath('Desktop')
Write-Host "Desktop folder: $desktopDir"

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$desktopDir\KYO Downloader.lnk")

$target = "C:\Users\mifta\Music\Nimiyo-Downloader-2.1.1\Nimiyo-Downloader-2.1.1\dist-electron\KYO Downloader-win32-x64\KYO Downloader.exe"
$lnk.TargetPath = $target
$lnk.WorkingDirectory = Split-Path $target
$lnk.IconLocation = "$target,0"
$lnk.Save()

Write-Host "✅ Shortcut successfully created at: $desktopDir\KYO Downloader.lnk"
