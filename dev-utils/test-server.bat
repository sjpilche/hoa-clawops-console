@echo off
REM Quick Server Test Script
REM Tests the health endpoint and shows server status

echo ========================================
echo ClawOps Console - Quick Server Test
echo ========================================
echo.

echo Starting server...
start /B npm run dev:server

echo Waiting for server to start (10 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo Testing health endpoint...
echo.

curl -s http://localhost:3001/api/health 2>nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo.
    echo ========================================
    echo SUCCESS! Server is running!
    echo ========================================
    echo.
    echo Open in browser:
    echo   - Health check: http://localhost:3001/api/health
    echo   - Frontend: http://localhost:5173
    echo.
    echo Press Ctrl+C to stop the server
    echo.
) else (
    echo.
    echo ========================================
    echo Server not responding yet...
    echo ========================================
    echo.
    echo Try manually:
    echo   npm run dev
    echo.
    echo Then visit: http://localhost:3001/api/health
)

pause
