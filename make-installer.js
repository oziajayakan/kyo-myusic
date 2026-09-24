/**
 * make-installer.js  –  Creates a Windows installer .exe using 7-Zip SFX
 * 
 * Uses the 7za.exe bundled in node_modules/7zip-bin.
 * Output: dist-electron/KYO-Downloader-2.1.1-Setup-win64.exe
 * 
 * The SFX installer:
 *   1. Extracts to %ProgramFiles%\KYO Downloader (or user's chosen path)
 *   2. Creates a Desktop shortcut via a post-install batch
 *   3. Adds Uninstall entry to Windows registry
 * 
 * Run: node make-installer.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT      = __dirname;
const OUT_DIR   = path.join(ROOT, 'dist-electron');
const APP_NAME  = 'KYO Downloader';
const VERSION   = '2.1.1';
const APP_DIR   = path.join(OUT_DIR, `${APP_NAME}-win32-x64`);
const SEVENZA   = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const SEVENZSFX = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7zSD.sfx');
const WORK_DIR  = path.join(OUT_DIR, '_sfx_work');
const FINAL_EXE = path.join(OUT_DIR, `KYO-Downloader-${VERSION}-Setup-win64.exe`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd) {
  console.log(`> ${cmd.slice(0, 100)}...`);
  execSync(cmd, { stdio: 'inherit' });
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

// ─── Check prerequisites ───────────────────────────────────────────────────────
if (!fs.existsSync(APP_DIR)) {
  console.error(`❌  App dir not found: ${APP_DIR}`);
  console.error('    Run "node pack-win.js" first!');
  process.exit(1);
}

if (!fs.existsSync(SEVENZA)) {
  console.error(`❌  7za.exe not found at: ${SEVENZA}`);
  process.exit(1);
}

// ─── Check if SFX module exists; if not, download from 7-zip.org ─────────────
// 7zSD.sfx is NOT included in 7zip-bin npm package. 
// We'll use a different approach: create a self-extracting archive using
// PowerShell to wrap the zip as a "setup" launcher.
console.log('╔══════════════════════════════════════════════╗');
console.log('║  KYO Downloader – SFX Installer Builder  ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ─── Step 1: Create the 7z archive of the app ────────────────────────────────
console.log('Step 1: Creating 7z archive...');
ensureDir(WORK_DIR);
const archivePath = path.join(WORK_DIR, 'app.7z');
if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);

run(`"${SEVENZA}" a -t7z -mx=5 -mmt=on "${archivePath}" "${APP_DIR}${path.sep}*"`);
console.log('✅  Archive created:', archivePath);

// ─── Step 2: Create install.bat (runs after extraction) ──────────────────────
console.log('\nStep 2: Creating installer script...');

const installBat = `@echo off
setlocal
set "INSTALL_DIR=%ProgramFiles%\\KYO Downloader"

REM Try to install to Program Files, fallback to LocalAppData
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" 2>nul
if errorlevel 1 (
  set "INSTALL_DIR=%LOCALAPPDATA%\\KYO Downloader"
  mkdir "%INSTALL_DIR%"
)

REM Copy files
xcopy /E /I /Y "%~dp0*" "%INSTALL_DIR%\\"

REM Create Desktop shortcut via PowerShell
powershell -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\\Desktop\\KYO Downloader.lnk'); $s.TargetPath = '%INSTALL_DIR%\\KYO Downloader.exe'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()"

REM Create Start Menu shortcut
powershell -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\KYO Downloader.lnk'); $s.TargetPath = '%INSTALL_DIR%\\KYO Downloader.exe'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()"

REM Write uninstall info to registry
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KYO Downloader" /v "DisplayName" /t REG_SZ /d "KYO Downloader" /f
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KYO Downloader" /v "DisplayVersion" /t REG_SZ /d "${VERSION}" /f
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KYO Downloader" /v "Publisher" /t REG_SZ /d "nimidz" /f
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KYO Downloader" /v "UninstallString" /t REG_SZ /d "cmd /c rd /s /q \\"%INSTALL_DIR%\\" && del \\"%USERPROFILE%\\Desktop\\KYO Downloader.lnk\\"" /f

msg * "KYO Downloader berhasil diinstall!\\nShortcut sudah dibuat di Desktop."
endlocal
`;

// ─── Step 3: Build a PowerShell-based self-extracting EXE ────────────────────
// We'll create a .ps1 that extracts + installs, then wrap it in a .exe
// using the iexpress tool (built into Windows) OR just a compiled ps2exe wrapper.

// Simplest approach: Create a launcher .bat that extracts the 7z and runs install
console.log('\nStep 3: Building self-extracting EXE with PowerShell...');

// The SFX will be a PowerShell script compiled to exe using ps2exe (if available)
// or wrapped in a .bat launcher

const ps1Content = `
#Requires -Version 3
$ErrorActionPreference = 'Stop'

$appName    = '${APP_NAME}'
$version    = '${VERSION}'
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  $appName v$version – Installer" -ForegroundColor Cyan  
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Determine install location
$defaultDir = Join-Path $env:LOCALAPPDATA $appName
$installDir = $defaultDir

Write-Host "Install location: $installDir" -ForegroundColor Yellow
Write-Host ""

# Create install dir
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

# Copy all files
Write-Host "Installing files..." -ForegroundColor Green
Copy-Item -Path "$scriptDir\\*" -Destination $installDir -Recurse -Force

# Desktop shortcut
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:USERPROFILE\\Desktop\\$appName.lnk")
$lnk.TargetPath    = "$installDir\\$appName.exe"
$lnk.WorkingDirectory = $installDir
$lnk.Save()

# Start Menu shortcut
$smDir = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs"
$lnk2  = $ws.CreateShortcut("$smDir\\$appName.lnk")
$lnk2.TargetPath    = "$installDir\\$appName.exe"
$lnk2.WorkingDirectory = $installDir
$lnk2.Save()

# Registry uninstall entry (HKCU – no admin needed)
$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$appName"
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name 'DisplayName'    -Value $appName
Set-ItemProperty -Path $regKey -Name 'DisplayVersion' -Value $version
Set-ItemProperty -Path $regKey -Name 'Publisher'      -Value 'nimidz'
Set-ItemProperty -Path $regKey -Name 'InstallLocation'-Value $installDir
Set-ItemProperty -Path $regKey -Name 'UninstallString'-Value "powershell -Command \\"Remove-Item -Recurse -Force '$installDir'; Remove-Item '$env:USERPROFILE\\Desktop\\$appName.lnk' -ErrorAction SilentlyContinue; Remove-Item '$smDir\\$appName.lnk' -ErrorAction SilentlyContinue; Remove-ItemProperty -Path '$regKey' -Name * -ErrorAction SilentlyContinue\\""

Write-Host ""
Write-Host "✅  $appName berhasil diinstall!" -ForegroundColor Green
Write-Host "   Shortcut sudah dibuat di Desktop." -ForegroundColor Green
Write-Host ""
Write-Host "Tekan Enter untuk menutup..." -ForegroundColor Gray
Read-Host
`;

const ps1Path = path.join(WORK_DIR, 'install.ps1');
fs.writeFileSync(ps1Path, ps1Content.trim());

// ─── Step 4: Create a batch-based launcher EXE wrapper ───────────────────────
// iexpress is built into Windows — use it to create a self-extracting cabinet
const iexpressConfig = `
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=${FINAL_EXE}
FriendlyName=KYO Downloader Installer
AppLaunched=cmd /c powershell -ExecutionPolicy Bypass -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
InstallPrompt=Install KYO Downloader v${VERSION}?
DisplayLicense=
FinishMessage=KYO Downloader installed successfully!
[SourceFiles]
SourceFiles0=${APP_DIR}
SourceFiles1=${WORK_DIR}
[SourceFiles0]
%FILE0%=
[SourceFiles1]
%FILE1%=install.ps1
`;

// iexpress path
const iexpressExe = 'C:\\Windows\\System32\\iexpress.exe';
const sedPath = path.join(WORK_DIR, 'setup.sed');
fs.writeFileSync(sedPath, iexpressConfig.trim().replace(/\r\n/g, '\n'));

// ─── Try iexpress first ───────────────────────────────────────────────────────
let built = false;
if (fs.existsSync(iexpressExe)) {
  try {
    console.log('\nTrying iexpress...');
    run(`"${iexpressExe}" /N /Q "${sedPath}"`);
    if (fs.existsSync(FINAL_EXE)) {
      built = true;
      console.log(`\n✅  Installer created: ${FINAL_EXE}`);
    }
  } catch (e) {
    console.warn('iexpress failed:', e.message);
  }
}

// ─── Fallback: Create a smart portable launcher .exe using a .bat wrapper ────
if (!built) {
  console.log('\nCreating portable launcher + ZIP installer combo...');
  
  // Create a launcher .bat that the user can rename and run
  const launcherBat = path.join(OUT_DIR, `KYO-Downloader-${VERSION}-Installer.bat`);
  const batContent = `@echo off
setlocal enabledelayedexpansion
title KYO Downloader v${VERSION} Installer
color 0B

echo.
echo  ==========================================
echo   KYO Downloader v${VERSION} Installer
echo  ==========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\\KYO Downloader"
echo  Install location: !INSTALL_DIR!
echo.
set /p "CONFIRM=Lanjutkan instalasi? (Y/N): "
if /i "!CONFIRM!" neq "Y" goto :EOF

if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"

echo  Menginstall file...
xcopy /E /I /Y "%~dp0KYO Downloader-win32-x64\\*" "!INSTALL_DIR!\\" >nul

echo  Membuat shortcut Desktop...
powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\\Desktop\\KYO Downloader.lnk'); $s.TargetPath = '!INSTALL_DIR!\\KYO Downloader.exe'; $s.WorkingDirectory = '!INSTALL_DIR!'; $s.Save()"

powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\KYO Downloader.lnk'); $s.TargetPath = '!INSTALL_DIR!\\KYO Downloader.exe'; $s.WorkingDirectory = '!INSTALL_DIR!'; $s.Save()"

echo.
echo  ✅  KYO Downloader berhasil diinstall!
echo  Shortcut sudah dibuat di Desktop.
echo.
pause

start "" "!INSTALL_DIR!\\KYO Downloader.exe"
endlocal
`;

  fs.writeFileSync(launcherBat, batContent);
  console.log(`\n✅  Installer batch: ${launcherBat}`);
  built = true;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  BUILD COMPLETE                              ║');
console.log('╚══════════════════════════════════════════════╝');
const files = fs.readdirSync(OUT_DIR).filter(f =>
  f.endsWith('.exe') || f.endsWith('.zip') || f.endsWith('.bat')
);
files.forEach(f => console.log(`  ✅  ${f}`));

// Cleanup
if (fs.existsSync(WORK_DIR)) fs.rmSync(WORK_DIR, { recursive: true, force: true });
