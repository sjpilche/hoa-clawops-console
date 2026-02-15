@echo off
cls
echo ========================================
echo   RESTARTING CLAWOPS FRESH
echo ========================================
echo.
echo This will:
echo   1. Stop all running servers
echo   2. Clear the database (fresh start)
echo   3. Restart with new Lead Gen tables
echo.
pause

echo.
echo Step 1: Stopping all Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Step 2: Backing up and clearing database...
if exist "data\clawops.db" (
    copy "data\clawops.db" "data\clawops.db.backup" >nul
    del "data\clawops.db"
    echo    Database backed up and cleared
) else (
    echo    No existing database found
)

echo Step 3: Starting fresh...
echo.
echo ========================================
echo   Starting servers...
echo ========================================
echo.

cd /d "%~dp0"
set BYPASS_AUTH=true
start "ClawOps Server" cmd /k "set BYPASS_AUTH=true && npm run dev"

echo.
echo Servers starting in new window...
echo.
echo Wait 15 seconds for servers to start, then:
echo.
echo   STEP 1: Enable bypass mode (skip login)
echo   Open: http://localhost:5174/bypass.html
echo.
echo   STEP 2: Create sample data
echo   Run: TEST-LEAD-GEN.bat
echo.
echo   STEP 3: View dashboard
echo   Open: http://localhost:5174/lead-gen
echo.
pause
