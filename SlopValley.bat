@echo off
setlocal
title Slop Valley Server
cd /d "%~dp0"
set PORT=7777
set REPO=TheWarBoys2/slop-game

echo Checking for updates...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "try {" ^
  "  $r = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/%REPO%/releases/latest';" ^
  "  $have = if (Test-Path 'version.txt') { (Get-Content 'version.txt').Trim() } else { '' };" ^
  "  if ($have -ne $r.tag_name -or -not (Test-Path 'SlopValley.exe')) {" ^
  "    Write-Host ('Downloading ' + $r.tag_name + ' (about 115 MB, first time only)...');" ^
  "    $a = $r.assets | Where-Object { $_.name -eq 'SlopValley.exe' };" ^
  "    Invoke-WebRequest -UseBasicParsing $a.browser_download_url -OutFile 'SlopValley.new.exe';" ^
  "    Move-Item -Force 'SlopValley.new.exe' 'SlopValley.exe';" ^
  "    Set-Content 'version.txt' $r.tag_name;" ^
  "    Write-Host 'Updated.'" ^
  "  } else { Write-Host ('Already up to date (' + $have + ').') }" ^
  "} catch { Write-Host 'Could not check for updates, using the copy you already have.' }"

if not exist SlopValley.exe (
  echo.
  echo Could not download the game. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo If Windows Firewall asks, tick BOTH Private and Public networks and click Allow.
echo.
SlopValley.exe %PORT%
pause
