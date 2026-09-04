@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

for %%I in ("%~dp0..\..") do set "REPOSITORY_ROOT=%%~fI"
cd /d "%REPOSITORY_ROOT%" || exit /b 1

set "LOG_DIRECTORY=%LOCALAPPDATA%\LifeSiteDashboard\reading-bridge"
set "LOG_FILE=%LOG_DIRECTORY%\launcher.log"
if not exist "%LOG_DIRECTORY%" mkdir "%LOG_DIRECTORY%"

if not exist "dist\reading-obsidian-bridge.cjs" (
  echo [%DATE% %TIME%] Bridge bundle missing. Run npm.cmd run build:reading-bridge first.
  >> "%LOG_FILE%" echo [%DATE% %TIME%] Bridge bundle missing. Run npm.cmd run build:reading-bridge first. exitCode=1
  echo [%DATE% %TIME%] exitCode=1
  set "NODE_EXIT=1"
  goto :finish
)

set "OUTPUT_FILE=%TEMP%\life-site-reading-bridge-%RANDOM%-%RANDOM%.log"
rem Production Firestore is separate from the Cloud Run and Secret Manager project.
node dist\reading-obsidian-bridge.cjs --firestore-project-id life-dashboard-502020 --firestore-database-id life-site-production --vault-root "C:\Users\Admin\Documents\Vaults\Francisco's Vault" > "%OUTPUT_FILE%" 2>&1
set "NODE_EXIT=%ERRORLEVEL%"

for /f "usebackq delims=" %%L in ("%OUTPUT_FILE%") do (
  echo [%DATE% %TIME%] %%L
  >> "%LOG_FILE%" echo [%DATE% %TIME%] %%L
)
echo [%DATE% %TIME%] exitCode=%NODE_EXIT%
>> "%LOG_FILE%" echo [%DATE% %TIME%] exitCode=%NODE_EXIT%
del /q "%OUTPUT_FILE%" >nul 2>&1

:finish
if "%QUIET%"=="0" (
  pause
)
endlocal & exit /b %NODE_EXIT%
