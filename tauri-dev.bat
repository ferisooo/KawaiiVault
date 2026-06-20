@echo off
setlocal
REM ===========================================================================
REM  CyberVault - run the app in development mode
REM
REM  HOW TO USE:
REM    Double-click this file from INSIDE the CyberVault folder.
REM
REM  It installs dependencies (if needed) and launches the Tauri dev build.
REM  The FIRST run compiles the Rust backend and is slow (5-15 minutes); the
REM  app window opens automatically when it is ready. Leave this window open
REM  while using the app.
REM ===========================================================================

cd /d "%~dp0"

if not exist "package.json" (
  echo.
  echo ERROR: package.json not found. Run this .bat from inside the CyberVault folder.
  echo.
  pause
  exit /b
)

if not exist "node_modules" (
  echo.
  echo Installing dependencies ^(this can take a minute^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install FAILED. Make sure Node.js is installed and you are online.
    pause
    exit /b
  )
)

echo.
echo Launching CyberVault in dev mode...
echo.
call npm run tauri dev

echo.
echo CyberVault has stopped.
pause
