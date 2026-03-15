@echo off
REM ============================================
REM  OpenClaw Trader Watchdog
REM  Keeps the trader service alive 24/7.
REM  If it crashes, waits 10s and restarts.
REM  Logs rotate at 50,000 lines.
REM ============================================
REM  Do NOT close this window — it IS the trader.
REM  To stop: close this window or Ctrl+C.
REM ============================================

title OpenClaw Trader Watchdog

SET TRADER_DIR=C:\Users\SPilcher\OpenClaw2.0 for linux - Copy\services\trader-service
SET LOG_FILE=%TRADER_DIR%\logs\trader.log
SET PID_FILE=%TRADER_DIR%\logs\trader.pid
SET MAX_LOG_LINES=50000
SET RESTART_DELAY=10

echo.
echo ========================================
echo   OpenClaw Trader Watchdog
echo   Dir:  %TRADER_DIR%
echo   Log:  %LOG_FILE%
echo   Mode: Auto-restart on crash
echo ========================================
echo.

cd /d "%TRADER_DIR%"

:LOOP
echo [%date% %time%] Starting trader service... >> "%LOG_FILE%"
echo [%date% %time%] Starting trader service...

REM Kill any stale process on port 3002
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3002 ^| findstr LISTENING 2^>nul') do (
    echo [%date% %time%] Killing stale PID %%a on port 3002 >> "%LOG_FILE%"
    taskkill /PID %%a /F >nul 2>&1
)

REM Wait a beat for port to free
timeout /t 2 /nobreak >nul

REM Start the trader and pipe output to log
REM Using node directly with tsx loader for stability (no npx overhead)
node --import tsx src/server.ts >> "%LOG_FILE%" 2>&1

REM If we get here, the process exited
echo [%date% %time%] Trader exited (code: %ERRORLEVEL%). Restarting in %RESTART_DELAY%s... >> "%LOG_FILE%"
echo [%date% %time%] Trader exited (code: %ERRORLEVEL%). Restarting in %RESTART_DELAY%s...

REM Rotate log if too large
for /f %%A in ('find /c /v "" ^< "%LOG_FILE%" 2^>nul') do (
    if %%A GTR %MAX_LOG_LINES% (
        echo [%date% %time%] Rotating log (%MAX_LOG_LINES% lines exceeded) >> "%LOG_FILE%"
        REM Keep last 10,000 lines
        powershell -Command "Get-Content '%LOG_FILE%' | Select-Object -Last 10000 | Set-Content '%LOG_FILE%.tmp'; Move-Item -Force '%LOG_FILE%.tmp' '%LOG_FILE%'"
    )
)

timeout /t %RESTART_DELAY% /nobreak >nul
goto LOOP
