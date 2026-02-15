@echo off
REM ============================================
REM  ClawOps Console - One-Click Startup
REM ============================================
REM
REM This script starts:
REM  1. ClawOps Console (Express + Vite)
REM  2. Opens browser to the UI
REM
REM OpenClaw runs in WSL2 and is accessed via shell commands
REM ============================================

cd /d "%~dp0"

echo.
echo ========================================
echo   ClawOps Console - Starting Up
echo ========================================
echo.
echo Starting servers...
echo   - Express API: http://localhost:3001
echo   - Vite Frontend: http://localhost:5177
echo.
echo Press Ctrl+C to stop all servers
echo ========================================
echo.

REM Start the dev servers (Express + Vite)
start "ClawOps Console" cmd /k npm run dev

REM Wait for servers to start
timeout /t 8 /nobreak >nul

REM Open browser to the UI
start http://localhost:5177

echo.
echo ========================================
echo   ClawOps Console is starting!
echo ========================================
echo.
echo   Frontend UI: http://localhost:5177
echo   API Server:  http://localhost:3001
echo.
echo   Login with:
echo   Email:    admin@clawops.local
echo   Password: changeme123
echo.
echo   OpenClaw is accessed via WSL2
echo   Location: /home/sjpilche/projects/openclaw-v1/
echo.
echo ========================================
echo.
echo Press any key to close this window...
pause >nul
