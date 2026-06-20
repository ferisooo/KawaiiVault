@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  CyberVault - fresh delete + clone + run
REM
REM  HOW TO USE:
REM    1. COPY this file OUT of the CyberVault folder and into your Documents
REM       folder  (e.g. %USERPROFILE%\Documents).
REM    2. Double-click it there.
REM
REM  It deletes the "CyberVault" folder sitting NEXT TO this .bat and downloads
REM  a brand-new copy from the 'main' branch, then installs and launches it.
REM
REM  Do NOT run it from inside the CyberVault folder - it would try to delete
REM  the folder it is running from. (There is a safety check below.)
REM ===========================================================================

set "BASE=%~dp0"
set "TARGET=%BASE%CyberVault"
set "REPO=https://github.com/ferisooo/CyberVault.git"

REM --- Safety guard: refuse to run from inside the repo itself ---
if exist "%BASE%package.json" (
  echo.
  echo ERROR: This .bat appears to be INSIDE the CyberVault folder.
  echo Move it to your Documents folder and run it from there instead.
  echo.
  pause
  exit /b
)

echo ===========================================================================
echo  This will permanently DELETE the folder:
echo      %TARGET%
echo  and re-download a fresh copy from the 'main' branch.
echo ===========================================================================
echo.
set /p CONFIRM=Type  YES  and press Enter to continue:
if /I not "!CONFIRM!"=="YES" (
  echo Cancelled - nothing was changed.
  pause
  exit /b
)

if exist "%TARGET%" (
  echo.
  echo Deleting old folder...
  rmdir /s /q "%TARGET%"
)

echo.
echo Cloning a fresh copy from main...
git clone --branch main "%REPO%" "%TARGET%"
if errorlevel 1 (
  echo.
  echo Clone FAILED. Make sure Git is installed and you are online.
  pause
  exit /b
)

cd /d "%TARGET%"

echo.
echo Installing dependencies (this can take a minute)...
call npm install

echo.
echo Launching CyberVault - the FIRST run compiles the backend and is slow
echo (5-15 minutes). The app window will open when it is ready. Leave this
echo window open while using the app.
echo.
call npm run tauri dev

echo.
echo CyberVault has stopped.
pause
