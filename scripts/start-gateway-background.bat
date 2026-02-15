@echo off
REM Start OpenClaw Gateway Watchdog in the background (hidden window)
REM This is called by Windows Task Scheduler at login.
REM The watchdog keeps the gateway alive — if it crashes, it restarts automatically.

REM Check WSL
wsl --status >nul 2>&1
if errorlevel 1 (
    echo ERROR: WSL2 is not available or not running.
    exit /b 1
)

REM Launch the watchdog in WSL (runs forever in background)
wsl bash -c "nohup bash /mnt/c/Users/SPilcher/'OpenClaw2.0 for linux - Copy'/scripts/openclaw-gateway-watchdog.sh > /dev/null 2>&1 &"
