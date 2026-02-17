@echo off
title ClawOps Console
color 0A

echo.
echo  ============================================
echo   ClawOps Console - One-Click Launcher
echo  ============================================
echo.

:: Kill any stale node processes first
echo  [1/3] Cleaning up stale processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Navigate to project directory
cd /d "%~dp0"

echo  [2/3] Starting services...
echo.
echo    Server:   http://localhost:3001/api
echo    Frontend: http://localhost:5174
echo    Trader:   http://localhost:3002
echo.
echo  [3/3] Opening browser in 8 seconds...
echo.
echo  ============================================
echo   Login: admin@clawops.local / changeme123
echo  ============================================
echo.
echo  Press Ctrl+C to stop all services.
echo.

:: Open browser after a delay (background)
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5174"

:: Start everything (this keeps the window open)
npm run dev
