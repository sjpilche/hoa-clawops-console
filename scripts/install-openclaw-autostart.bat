@echo off
REM ============================================
REM  Install OpenClaw Fleet Auto-Start (pm2)
REM  Starts ALL services at login + 5-min check
REM
REM  Services:
REM    1. clawops-server  (port 3001)
REM    2. clawops-client  (port 5174)
REM    3. openclaw-trader  (port 3002)
REM ============================================
REM  Run this ONCE as Administrator.
REM ============================================

echo.
echo ========================================
echo   OpenClaw Fleet Auto-Start Installer
echo ========================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

SET TASK_NAME=OpenClaw Fleet pm2
SET PM2_PATH=C:\Users\SPilcher\AppData\Roaming\npm\pm2.cmd
SET ECO_PATH=C:\Users\SPilcher\OpenClaw2.0 for linux - Copy\ecosystem.config.cjs
SET ROOT_DIR=C:\Users\SPilcher\OpenClaw2.0 for linux - Copy

echo Checking pm2...
"%PM2_PATH%" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: pm2 not found at %PM2_PATH%
    echo Run: npm install -g pm2
    pause
    exit /b 1
)
echo   pm2 found.
echo.

REM First, start all services now and save
echo Starting all OpenClaw services...
cd /d "%ROOT_DIR%"
"%PM2_PATH%" start "%ECO_PATH%"
"%PM2_PATH%" save
echo.

REM Task 1: Start at login
echo [1/2] Creating login trigger...
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c \"cd /d \"%ROOT_DIR%\" && \"%PM2_PATH%\" resurrect\"" /sc onlogon /rl highest /f
if errorlevel 1 (
    echo ERROR: Failed to create login task.
    pause
    exit /b 1
)
echo      OK

REM Task 2: Every-5-minute failsafe
echo [2/2] Creating 5-minute failsafe...
schtasks /create /tn "%TASK_NAME% Failsafe" /tr "cmd /c \"cd /d \"%ROOT_DIR%\" && \"%PM2_PATH%\" resurrect\"" /sc minute /mo 5 /rl highest /f
if errorlevel 1 (
    echo WARNING: Failsafe task failed (non-critical).
)
echo      OK

echo.
echo ========================================
echo   SUCCESS! OpenClaw Fleet is immortal.
echo ========================================
echo.
echo Services running:
echo   clawops-server   — http://localhost:3001
echo   clawops-client   — http://localhost:5174
echo   openclaw-trader   — http://localhost:3002
echo.
echo They will:
echo   - Auto-start at login
echo   - Auto-restart on crash
echo   - Resurrect every 5 min if killed
echo   - Rotate logs at 50MB
echo   - Restart if memory exceeds 500MB
echo.
echo Commands:
echo   pm2 status                  — See all services
echo   pm2 logs                    — Tail all logs
echo   pm2 logs openclaw-trader    — Tail trader only
echo   pm2 restart all             — Restart everything
echo   pm2 stop all                — Stop everything
echo   pm2 monit                   — Live dashboard
echo.
echo To remove auto-start:
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo   schtasks /delete /tn "%TASK_NAME% Failsafe" /f
echo.
pause
