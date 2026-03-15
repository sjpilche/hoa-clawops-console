@echo off
REM ============================================
REM  Install OpenClaw Trader Auto-Start (pm2)
REM  Registers a Windows Task Scheduler task
REM  that resurrects pm2 + trader at login
REM  + a 5-minute failsafe check.
REM ============================================
REM  Run this ONCE as Administrator.
REM ============================================

echo.
echo ========================================
echo   OpenClaw Trader Auto-Start Installer
echo   (pm2 + Windows Task Scheduler)
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

SET TASK_NAME=OpenClaw Trader pm2
SET PM2_PATH=C:\Users\SPilcher\AppData\Roaming\npm\pm2.cmd
SET ECO_PATH=C:\Users\SPilcher\OpenClaw2.0 for linux - Copy\services\trader-service\ecosystem.config.cjs
SET TRADER_DIR=C:\Users\SPilcher\OpenClaw2.0 for linux - Copy\services\trader-service

echo Registering scheduled tasks...
echo   pm2:       %PM2_PATH%
echo   Ecosystem: %ECO_PATH%
echo.

REM Task 1: Start at login — resurrect pm2 saved processes
echo [1/2] Creating login trigger...
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c \"cd /d \"%TRADER_DIR%\" && \"%PM2_PATH%\" resurrect\"" /sc onlogon /rl highest /f

if errorlevel 1 (
    echo ERROR: Failed to create login task.
    pause
    exit /b 1
)
echo      OK — pm2 resurrect at login

REM Task 2: Every-5-minute failsafe — check if trader is running, restart if not
echo [2/2] Creating 5-minute failsafe...
schtasks /create /tn "%TASK_NAME% Failsafe" /tr "cmd /c \"cd /d \"%TRADER_DIR%\" && \"%PM2_PATH%\" resurrect\"" /sc minute /mo 5 /rl highest /f

if errorlevel 1 (
    echo WARNING: Failsafe task failed (non-critical).
)
echo      OK — pm2 resurrect every 5 min

echo.
echo ========================================
echo   SUCCESS!
echo ========================================
echo.
echo The trader will now:
echo   1. Auto-start when you log in (pm2 resurrect)
echo   2. Auto-restart if it crashes (pm2 autorestart)
echo   3. 5-minute failsafe check (pm2 resurrect)
echo   4. Log rotation at 50MB (pm2 max_size)
echo   5. Memory limit restart at 500MB
echo.
echo Useful commands:
echo   pm2 status              — Check if trader is running
echo   pm2 logs openclaw-trader — Tail live logs
echo   pm2 restart openclaw-trader — Manual restart
echo   pm2 stop openclaw-trader    — Stop trader
echo.
echo To remove auto-start:
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo   schtasks /delete /tn "%TASK_NAME% Failsafe" /f
echo.
pause
