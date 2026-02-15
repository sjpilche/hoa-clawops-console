@echo off
REM ============================================
REM  ClawOps Console - Stop All Servers
REM ============================================

echo.
echo ========================================
echo   Stopping ClawOps Console
echo ========================================
echo.

REM Kill all node processes (Express + Vite)
echo Stopping Node.js servers...
taskkill /F /IM node.exe 2>nul

REM Check if anything is still using port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process on port 3001 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)

echo.
echo ========================================
echo   All servers stopped
echo ========================================
echo.
pause
