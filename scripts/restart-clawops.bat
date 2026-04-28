@echo off
echo.
echo === ClawOps Full Restart ===
echo.

REM Kill ALL node processes (old servers, stale PM2, everything)
echo [1/4] Killing all node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 3 /nobreak >nul

REM Clean PM2 state
echo [2/4] Cleaning PM2 daemon...
del /Q "%USERPROFILE%\.pm2\pm2.pid" >nul 2>&1
del /Q "%USERPROFILE%\.pm2\rpc.sock" >nul 2>&1
del /Q "%USERPROFILE%\.pm2\pub.sock" >nul 2>&1

REM Ensure logs directory
echo [3/4] Ensuring directories...
cd /d "c:\Users\steve\Code\hoa-clawops-console"
if not exist logs mkdir logs

REM Start PM2
echo [4/4] Starting ClawOps via PM2...
call pm2 start ecosystem.config.cjs
timeout /t 5 /nobreak >nul
call pm2 status

echo.
echo === ClawOps is running ===
echo.
echo   Server:  http://localhost:3001
echo   Console: http://localhost:5174
echo   Login:   admin@clawops.local / changeme123
echo.
echo   Agents auto-seed on first startup if DB is empty.
echo.
pause
