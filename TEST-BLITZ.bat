@echo off
echo ========================================
echo   TESTING BLITZ MODE API
echo ========================================
echo.
echo This will:
echo   1. Start a blitz run
echo   2. Check status
echo   3. Get results
echo.
pause
echo.

echo Step 1: Starting blitz run...
echo.
curl -X POST http://localhost:3001/api/blitz/run
echo.
echo.

echo Enter the runId from above:
set /p RUN_ID=runId:

echo.
echo Step 2: Checking status (will poll every 5 seconds)...
echo Press Ctrl+C when complete
echo.

:loop
curl -s http://localhost:3001/api/blitz/status/%RUN_ID% | jq .
timeout /t 5 /nobreak >nul
goto loop

pause
