@echo off
cls
echo.
echo ============================================
echo   CLAWOPS CONSOLE + LEAD GEN NETWORKER
echo ============================================
echo.
echo This will start:
echo   [1] Backend API Server (Express)
echo   [2] Frontend Dashboard (React + Vite)
echo.
echo Once started, open your browser to:
echo.
echo   http://localhost:5174
echo.
echo Look for "Lead Gen" in the sidebar!
echo.
echo ============================================
echo.
echo Starting servers...
echo.

cd /d "%~dp0"
set BYPASS_AUTH=true
call npm run dev

echo.
echo Servers stopped.
pause
