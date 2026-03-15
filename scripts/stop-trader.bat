@echo off
REM ============================================
REM  Stop OpenClaw Trader
REM  Kills the watchdog and trader process.
REM ============================================

echo Stopping OpenClaw Trader...

REM Kill watchdog window
taskkill /fi "WINDOWTITLE eq OpenClaw Trader Watchdog" /f >nul 2>&1

REM Kill any node process on port 3002
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3002 ^| findstr LISTENING 2^>nul') do (
    echo Killing trader PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo Trader stopped.
pause
