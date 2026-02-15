@echo off
echo ========================================
echo   ENABLE BYPASS MODE FOR TESTING
echo ========================================
echo.
echo This will allow you to skip login during testing.
echo.
echo To enable bypass mode:
echo   1. Open browser console (F12)
echo   2. Run: localStorage.setItem('BYPASS_AUTH', 'true')
echo   3. Refresh the page
echo.
echo To disable bypass mode later:
echo   Run: localStorage.removeItem('BYPASS_AUTH')
echo.
echo ========================================
echo.
pause
