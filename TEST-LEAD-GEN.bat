@echo off
echo ========================================
echo   TESTING LEAD GEN NETWORKER
echo ========================================
echo.
echo Creating test opportunities...
echo.

REM Test 1: Reddit opportunity - High relevance
curl -X POST http://localhost:3001/api/lead-gen/networker/queue -H "Content-Type: application/json" -d "{\"platform\":\"reddit\",\"community\":\"r/HOA\",\"post_url\":\"https://reddit.com/r/HOA/test001\",\"post_title\":\"Our HOA announced $15K special assessment per unit for emergency roof\",\"post_summary\":\"40-unit condo in Tampa. Board hit us with $15K assessment due in 60 days. I'm on fixed income. What are my options?\",\"post_author\":\"florida_homeowner_123\",\"post_age_hours\":2,\"relevance_score\":95,\"recommended_template\":\"special_assessment_distress\",\"draft_response\":\"I completely understand the panic - $15K with 60 days notice is a gut punch, especially on fixed income. Here are your options: 1) Ask for a payment plan (most HOAs offer 12-24 months), 2) Request detailed documentation (you have a right to see bids and reports), 3) Talk to the board about HOA financing as an alternative to spread costs through modest monthly fee increases instead of huge one-time bills. For Tampa specifically, this may be related to Florida SIRS compliance - those have tight deadlines. Start by asking your board about payment plans and exploring alternatives. Disclosure: I work with HOA Project Funding but genuinely want to help you understand your options.\",\"includes_link\":false}"

echo.
echo Test 1 created (Reddit - High relevance)
echo.

REM Test 2: Facebook opportunity - Medium relevance
curl -X POST http://localhost:3001/api/lead-gen/networker/queue -H "Content-Type: application/json" -d "{\"platform\":\"facebook\",\"community\":\"HOA Board Members Support Group\",\"post_url\":\"https://facebook.com/groups/hoaboards/posts/test002\",\"post_title\":\"How do HOA loans actually work?\",\"post_summary\":\"Our board is considering a loan for pool renovation instead of special assessment. Never done this before. What should we know?\",\"post_author\":\"Sarah Martinez\",\"post_age_hours\":5,\"relevance_score\":78,\"recommended_template\":\"educational_question\",\"draft_response\":\"Great question! HOA loans work differently than personal loans. Key points: The HOA corporation is the borrower (not individual owners), typically secured by reserve fund or future assessments, requires board vote (sometimes member vote depending on bylaws), and paid from HOA budget through either small monthly fee increases or reallocating existing budget. When it makes sense: emergency repairs, large projects where assessment would be a hardship, or when preserving reserves for other expenses. When assessment makes more sense: small projects under $50K, strong reserves, or when members prefer one-time cost. The decision should be data-driven - run the numbers for both scenarios and present pros/cons to your members.\",\"includes_link\":false}"

echo.
echo Test 2 created (Facebook - Medium relevance)
echo.

REM Test 3: LinkedIn opportunity - Professional
curl -X POST http://localhost:3001/api/lead-gen/networker/queue -H "Content-Type: application/json" -d "{\"platform\":\"linkedin\",\"community\":\"Community Association Institute\",\"post_url\":\"https://linkedin.com/feed/update/test003\",\"post_title\":\"Reserve study shows our HOA is 40%% funded - board seeking advice\",\"post_summary\":\"Managing 80-unit complex. Reserve study came back showing we're only 40%% funded with major roof project in 2 years. Board meeting next week - what's our best approach?\",\"post_author\":\"Michael Chen - Property Manager\",\"post_age_hours\":12,\"relevance_score\":88,\"recommended_template\":\"reserve_funding_gap\",\"draft_response\":\"40%% funded puts you in a challenging but manageable position - you're not alone. Your levers: 1) Increase monthly reserve contributions (study should recommend amount), 2) Consider bridge financing to cover the gap while ramping up contributions, 3) Prioritize projects by urgency (life-safety first), 4) Get a second opinion on the study if numbers seem inflated. What NOT to do: ignore it, slash operating budget to pad reserves, or wait until emergency hits. Action steps: Board presents study to owners with transparency, propose funding plan (X%% increase over Y years), show timeline for major projects, get member buy-in NOW before crisis. For the roof in 2 years, you have time to plan - use it wisely.\",\"includes_link\":false}"

echo.
echo Test 3 created (LinkedIn - Professional)
echo.

echo ========================================
echo   TESTS COMPLETE!
echo ========================================
echo.
echo Now open your browser to:
echo   http://localhost:5174/lead-gen
echo.
echo You should see 3 opportunities in the queue!
echo.
pause
