@echo off
echo ========================================
echo   TESTING HOA NETWORKER AGENT
echo ========================================
echo.
echo This will test the HOA Networker agent by asking it to:
echo   - Review the 3 opportunities in the queue
echo   - Provide recommendations
echo.
echo Agent: hoa-networker
echo Model: Claude Sonnet 4.5
echo.
pause
echo.
echo Running agent...
echo.

openclaw agent --agent hoa-networker --local --message "Please review the engagement opportunities in the Lead Gen queue at http://localhost:3001/api/lead-gen/networker/queue and provide a brief summary of what you see. Focus on the top opportunity by relevance score."

echo.
echo ========================================
echo   AGENT RUN COMPLETE
echo ========================================
echo.
pause
