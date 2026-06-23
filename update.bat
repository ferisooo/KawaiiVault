@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  Kawaii-Vault - force update from the 'main' branch
REM
REM  HOW TO USE:
REM    Just double-click this file. It lives in the Kawaii-Vault folder and
REM    updates THAT folder in place.
REM
REM  WHAT IT DOES:
REM    Force-pulls the latest 'main' from GitHub, OVERWRITING every tracked
REM    file in this folder and discarding any local code changes. If this
REM    folder is not a git repo yet (no .git), it bootstraps one automatically:
REM    initializes git, points it at the GitHub remote, then force-pulls main.
REM
REM    Ignored files (node_modules, dist, target) are left untouched so the
REM    update stays fast - no need to reinstall or recompile every time.
REM ===========================================================================

set "REPO=https://github.com/ferisooo/Kawaii-Vault.git"
set "DIR=%~dp0"

cd /d "%DIR%"

REM --- Make sure Git is available ---
git --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Git is not installed or not on PATH.
  echo Install Git from https://git-scm.com/download/win and try again.
  echo.
  pause
  exit /b 1
)

echo ===========================================================================
echo  This will FORCE-UPDATE this folder to the latest 'main':
echo      %DIR%
echo  Any local changes to tracked files will be PERMANENTLY discarded.
echo ===========================================================================
echo.
set /p CONFIRM=Type  YES  and press Enter to continue:
if /I not "!CONFIRM!"=="YES" (
  echo Cancelled - nothing was changed.
  pause
  exit /b
)

REM --- Bootstrap git if this folder is not a repo yet ---
if not exist "%DIR%.git" (
  echo.
  echo No .git found - bootstrapping a fresh repository...
  git init
  if errorlevel 1 goto :fail
  git remote add origin "%REPO%"
  if errorlevel 1 goto :fail
) else (
  REM Make sure the remote points at the expected repo
  git remote set-url origin "%REPO%" 2>nul || git remote add origin "%REPO%"
)

echo.
echo Fetching latest 'main' from GitHub...
git fetch origin main
if errorlevel 1 goto :fail

echo.
echo Overwriting local files with 'main'...
git reset --hard origin/main
if errorlevel 1 goto :fail

REM Point the local 'main' branch at the fetched commit so future runs are clean
git checkout -B main origin/main >nul 2>&1

REM Remove stray untracked files so the folder matches 'main' exactly.
REM (No -x, so ignored node_modules/dist/target are preserved.)
git clean -fd

echo.
echo ===========================================================================
echo  Update complete - this folder now matches the latest 'main'.
echo  If dependencies changed, run:  npm install
echo ===========================================================================
echo.
pause
exit /b 0

:fail
echo.
echo Update FAILED. Make sure Git is installed and you are online.
echo.
pause
exit /b 1
