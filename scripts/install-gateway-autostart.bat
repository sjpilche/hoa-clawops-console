@echo off
REM ============================================
REM  Install OpenClaw Gateway Auto-Start
REM  Registers a Windows Task Scheduler task
REM  that starts the gateway watchdog at login.
REM ============================================
REM  Run this ONCE as Administrator.
REM ============================================

echo.
echo ========================================
echo   OpenClaw Gateway Auto-Start Installer
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

SET SCRIPT_PATH=%~dp0start-gateway-background.bat

echo Registering scheduled task...
echo   Script: %SCRIPT_PATH%
echo   Trigger: At user login
echo.

schtasks /create /tn "OpenClaw Gateway Watchdog" /tr "\"%SCRIPT_PATH%\"" /sc onlogon /rl highest /f

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create scheduled task.
    pause
    exit /b 1
)

echo.
echo SUCCESS! OpenClaw Gateway will now auto-start when you log in.
echo.
echo To manage this task:
echo   - View:    schtasks /query /tn "OpenClaw Gateway Watchdog"
echo   - Remove:  schtasks /delete /tn "OpenClaw Gateway Watchdog" /f
echo   - Run now: schtasks /run /tn "OpenClaw Gateway Watchdog"
echo.

REM Offer to start it right now
set /p RUNNOW="Start the gateway now? (Y/N): "
if /i "%RUNNOW%"=="Y" (
    echo Starting gateway watchdog...
    schtasks /run /tn "OpenClaw Gateway Watchdog"
    echo Gateway watchdog started!
)

echo.
echo Done.
pause
