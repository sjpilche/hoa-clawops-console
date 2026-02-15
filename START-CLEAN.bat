@echo off
REM ============================================
REM  ClawOps Console - Clean Startup
REM  Kills all Node processes and starts fresh
REM ============================================

cd /d "%~dp0"

echo.
echo ========================================
echo   ClawOps Console - Clean Startup
echo ========================================
echo.

echo Step 1: Stopping all Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Step 2: Starting servers...
start "ClawOps Console" cmd /k npm run dev

echo Step 3: Waiting for servers to start...
timeout /t 8 /nobreak >nul

echo.
echo ========================================
echo   Servers should be running!
echo ========================================
echo.
echo   Frontend: http://localhost:5173
echo   API:      http://localhost:3001
echo.
echo   Login: admin@clawops.local / changeme123
echo.
echo Opening browser...
start http://localhost:5173

echo.
pause
