# Quick Test Guide - Confirmation Flow

**Time**: 5 minutes
**What you're testing**: Phase 2.1 human-in-the-loop confirmation gates

---

## Prerequisites

1. **Start the development server**:
   ```bash
   cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
   npm run dev
   ```

2. **Wait for both servers to start**:
   - Backend (Express): http://localhost:3001
   - Frontend (Vite): http://localhost:5173

---

## Test Steps

### Step 1: Open the Application

1. Open browser: http://localhost:5173
2. Login with:
   - Email: `admin@clawops.local`
   - Password: (from your `.env.local` → `DEFAULT_ADMIN_PASSWORD`)

### Step 2: Navigate to Agents

1. Click "Agents" in the sidebar
2. You should see your list of agents

### Step 3: Run an Agent

1. Click the "Run" button on any agent
2. A modal should appear: "Run Agent"

### Step 4: Enter a Message

1. In the "Instructions for this run" textarea, enter:
   ```
   Test message for confirmation flow verification
   ```

### Step 5: Click "Run Agent" Button

1. Click the "Run Agent" button
2. **EXPECTED**: A confirmation dialog should appear

### Step 6: Verify Confirmation Dialog

**The dialog should show**:
- ✅ Title: "Confirm Agent Execution"
- ✅ Message: "You are about to run [Agent Name]"
- ✅ Permissions level (colored based on type)
- ✅ Estimated cost: ~$0.05
- ✅ Max duration: (from agent config)
- ✅ Run ID: (first 8 characters)
- ✅ Warning message at bottom
- ✅ Two buttons: "Execute Agent" and "Cancel"

### Step 7: Test Cancel

1. Click "Cancel" button
2. **EXPECTED**: Dialog closes, no execution happens
3. Status should return to idle
4. You can click "Run Agent" again

### Step 8: Test Confirm

1. Click "Run Agent" button again
2. Enter a message
3. Click "Run Agent" button
4. Confirmation dialog appears
5. Click "Execute Agent" button
6. **EXPECTED**:
   - Dialog closes
   - Status changes to "Running..."
   - Agent executes (if OpenClaw is running)
   - Results appear after completion

---

## Expected Behavior

### ✅ PASS Criteria

- [ ] Confirmation dialog appears after clicking "Run Agent"
- [ ] Dialog shows all agent details (permissions, cost, duration, run ID)
- [ ] "Cancel" button closes dialog without executing
- [ ] "Execute Agent" button closes dialog and runs the agent
- [ ] Status updates correctly (idle → awaiting confirmation → running → success/error)
- [ ] Can run multiple agents sequentially

### ❌ FAIL Scenarios

If any of these happen, something is wrong:

- **Dialog doesn't appear**: Check browser console for errors
- **Agent executes immediately**: Backend changes not active (restart server)
- **Error on "Execute Agent"**: Check network tab for API errors
- **Cancel doesn't work**: Check browser console for errors

---

## Troubleshooting

### Issue: Dialog doesn't appear

**Check**:
1. Browser console for JavaScript errors
2. Network tab: Does `POST /api/agents/:id/run` return `confirmation_required: true`?
3. Server logs: Is backend running and processing requests?

**Fix**:
- Restart server: `npm run dev`
- Clear browser cache: Ctrl+Shift+R
- Check that `AgentsPage.jsx` was saved correctly

### Issue: Agent executes without confirmation

**Check**:
1. Network tab: Is `POST /api/agents/:id/run` returning pending run?
2. Response should have: `{ confirmation_required: true, run: { status: "pending" } }`

**Fix**:
- Backend changes not active
- Restart server: `npm run dev`
- Verify `server/routes/agents.js` was modified correctly

### Issue: "Execute Agent" fails

**Check**:
1. Network tab error message
2. Common errors:
   - 404: `/runs/:id/confirm` endpoint not found → Check `server/routes/runs.js`
   - 400: Run not pending → Check database, run may have expired
   - 502: OpenClaw not running → Expected if OpenClaw gateway is down

**Fix**:
- Check backend logs
- Verify run exists in database: `SELECT * FROM runs ORDER BY created_at DESC LIMIT 5`
- If OpenClaw error: Start OpenClaw gateway in WSL2

---

## Quick Verification Commands

### Check server is running
```bash
curl http://localhost:3001/api/health
```

### Check pending runs in database
```bash
sqlite3 data/clawops.db "SELECT id, status, created_at FROM runs ORDER BY created_at DESC LIMIT 5"
```

### Check confirmation endpoint exists
```bash
curl http://localhost:3001/api/runs -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Success Screenshot Checklist

When testing, you should see these screens in order:

1. **Agents Page** - List of agents with "Run" buttons
2. **Run Agent Modal** - Message input, agent details
3. **Confirmation Dialog** - ⭐ NEW - Agent details with Execute/Cancel buttons
4. **Running Status** - Spinner, "Agent is running..."
5. **Success Status** - Green checkmark, results displayed

---

## What to Report

If you encounter issues, provide:

1. **Browser console errors** (F12 → Console tab)
2. **Network requests** (F12 → Network tab → Filter: XHR)
   - `POST /api/agents/:id/run` response
   - `POST /api/runs/:id/confirm` response (if it gets that far)
3. **Server logs** (terminal where `npm run dev` is running)
4. **Database state**:
   ```bash
   sqlite3 data/clawops.db "SELECT * FROM runs ORDER BY created_at DESC LIMIT 1"
   ```

---

## Next Steps After Testing

### If tests PASS ✅
1. Mark Phase 2.1 as complete
2. Update security score to 92/100
3. Move to Phase 2.2 (Budget Hard Stops)
4. Celebrate! 🎉

### If tests FAIL ❌
1. Review error messages
2. Check troubleshooting section above
3. Verify all files were modified correctly
4. Restart server and try again
5. If still failing, rollback using git

---

**Time to test**: ~5 minutes
**Confidence level**: High (well-tested backend, simple frontend changes)

**Good luck!** 🚀
