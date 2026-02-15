@echo off
REM Start OpenClaw Gateway from Windows
REM This script launches WSL2 and starts the OpenClaw Gateway service

echo ========================================
echo   Starting OpenClaw Gateway (WSL2)
echo ========================================
echo.

REM Check if WSL is available
wsl --status >nul 2>&1
if errorlevel 1 (
    echo ERROR: WSL2 is not available or not running.
    echo Please ensure WSL2 is installed and Ubuntu is set as default.
    pause
    exit /b 1
)

echo Starting gateway in WSL2...
echo.
echo WebSocket URL: ws://127.0.0.1:8000
echo Dashboard: http://127.0.0.1:8000/
echo.
echo Press Ctrl+C to stop the gateway.
echo.

REM Run the bash script in WSL
wsl bash -c "cd '%CD%' && bash scripts/start-openclaw-gateway.sh"
