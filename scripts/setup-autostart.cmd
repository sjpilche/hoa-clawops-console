@echo off
REM Setup PM2 auto-resurrect on login + 5-min failsafe
REM Run as Administrator

net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: Run as Administrator.
    pause
    exit /b 1
)

set PM2=C:\Users\steve\AppData\Roaming\npm\pm2.cmd
set DIR=C:\Users\steve\Code\hoa-clawops-console

echo Saving current PM2 state...
cd /d "%DIR%"
"%PM2%" save

echo.
echo [1/2] Creating login trigger...
schtasks /create /tn "OpenClawFleet" /tr "cmd /c cd /d %DIR% && %PM2% resurrect" /sc onlogon /ru steve /rl highest /f
if errorlevel 1 (
    echo FAILED: login task
    pause
    exit /b 1
)
echo      OK

echo [2/2] Creating 5-minute failsafe...
REM Failsafe: resurrect first (fast, from dump), then start from config as backup
schtasks /create /tn "OpenClawFleetFailsafe" /tr "cmd /c cd /d %DIR% && %PM2% resurrect && %PM2% start ecosystem.config.cjs" /sc minute /mo 5 /ru steve /rl highest /f
if errorlevel 1 (
    echo WARNING: failsafe task failed (non-critical)
)
echo      OK

echo.
echo [3/3] Verifying tasks...
schtasks /query /tn "OpenClawFleet" /fo list | findstr "Status"
schtasks /query /tn "OpenClawFleetFailsafe" /fo list | findstr "Status"

echo.
echo Done. PM2 will auto-resurrect at login and every 5 minutes.
echo If processes crash, the failsafe will also re-run ecosystem.config.cjs.
echo.
echo Press any key to close...
pause >nul
