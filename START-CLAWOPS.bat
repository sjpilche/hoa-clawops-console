@echo off
title ClawOps Console
echo.
echo  ================================
echo       ClawOps Console Startup
echo  ================================
echo.

echo [1/3] Clearing stale node processes...
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force"
timeout /t 2 /nobreak >nul

echo [2/3] Starting OpenClaw Gateway...
start "OpenClaw Gateway" cmd /k "openclaw gateway start"
timeout /t 3 /nobreak >nul

echo [3/3] Starting ClawOps (Server + Vite + Trader)...
cd /d "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
start "ClawOps Dev" cmd /k "npm run dev"

echo.
echo  Frontend:  http://localhost:5174
echo  API:       http://localhost:3001/api
echo  Trader:    http://localhost:3002
echo  Gateway:   http://127.0.0.1:18789
echo.
echo  You can close this window.
timeout /t 5 /nobreak >nul
