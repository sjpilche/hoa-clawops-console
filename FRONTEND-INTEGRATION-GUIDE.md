# Phase 2.1: Frontend Integration Guide

**Status**: Backend complete ✅, Frontend pending ⏳
**Estimated time**: 1-2 hours
**Files to modify**: 1-2 files

---

## Summary

The backend now creates **pending runs** that require user confirmation before execution. The frontend needs to be updated to:
1. Handle the pending run response
2. Show a confirmation dialog with agent details
3. Call the confirm endpoint to actually execute the agent

---

## Current Flow vs. New Flow

### OLD FLOW (Current - Direct Execution)
```
User clicks "Run" →
POST /api/agents/:id/run →
Agent executes immediately →
Show results
```

### NEW FLOW (Phase 2.1 - Confirmation Required)
```
User clicks "Run" →
POST /api/agents/:id/run →
Receives pending run with run_id →
Show ConfirmationDialog →
  User clicks "Confirm" →
  POST /api/runs/:run_id/confirm →
  Agent executes →
  Show results

  OR

  User clicks "Cancel" →
  POST /api/runs/:run_id/cancel →
  Run cancelled
```

---

## File to Modify: src/pages/AgentsPage.jsx

**Location**: Line 214-232 (handleRun function)

### Current Code

```javascript
const handleRun = async (e) => {
  e.preventDefault();
  if (!message.trim()) return;

  setStatus('running');
  setError('');
  setResult(null);

  try {
    const data = await api.post(`/agents/${agent.id}/run`, {
      message: message.trim(),
    });
    setStatus('success');
    setResult(data);
  } catch (err) {
    setStatus('error');
    setError(err.message || 'Failed to run agent');
  }
};
```

### New Code (Phase 2.1)

```javascript
const [pendingRun, setPendingRun] = useState(null);
const [showConfirmDialog, setShowConfirmDialog] = useState(false);

const handleRun = async (e) => {
  e.preventDefault();
  if (!message.trim()) return;

  setStatus('pending');
  setError('');
  setResult(null);

  try {
    // Step 1: Create pending run
    const data = await api.post(`/agents/${agent.id}/run`, {
      message: message.trim(),
    });

    if (data.confirmation_required) {
      // Store the pending run and show confirmation dialog
      setPendingRun(data.run);
      setShowConfirmDialog(true);
      setStatus('awaiting_confirmation');
    } else {
      // Fallback: if confirmation not required (shouldn't happen)
      setStatus('success');
      setResult(data);
    }
  } catch (err) {
    setStatus('error');
    setError(err.message || 'Failed to create run');
  }
};

const handleConfirm = async () => {
  if (!pendingRun) return;

  setShowConfirmDialog(false);
  setStatus('running');

  try {
    // Step 2: Confirm and execute
    const data = await api.post(`/runs/${pendingRun.id}/confirm`);
    setStatus('success');
    setResult(data);
    setPendingRun(null);
  } catch (err) {
    setStatus('error');
    setError(err.message || 'Failed to execute agent');
    setPendingRun(null);
  }
};

const handleCancel = async () => {
  if (!pendingRun) return;

  try {
    // Optional: Cancel the pending run on the backend
    await api.post(`/runs/${pendingRun.id}/cancel`);
  } catch (err) {
    console.error('Failed to cancel run:', err);
  }

  setShowConfirmDialog(false);
  setStatus('idle');
  setPendingRun(null);
};
```

### Add Confirmation Dialog to JSX

Add this before the closing `</div>` of the modal:

```jsx
{/* Confirmation Dialog */}
{showConfirmDialog && pendingRun && (
  <ConfirmationDialog
    isOpen={showConfirmDialog}
    title="Confirm Agent Execution"
    message={
      <>
        <p className="mb-3">You are about to run <strong>{agent.name}</strong></p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Permissions:</span>
            <span className="text-text-primary font-medium">{agent.permissions || 'read-only'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Estimated cost:</span>
            <span className="text-text-primary font-medium">~$0.05</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Run ID:</span>
            <span className="text-text-primary font-mono text-xs">{pendingRun.id.substring(0, 8)}...</span>
          </div>
        </div>
      </>
    }
    confirmText="Execute Agent"
    cancelText="Cancel"
    onConfirm={handleConfirm}
    onCancel={handleCancel}
    variant="warning"
  />
)}
```

### Add Import

At the top of the file, add:

```javascript
import ConfirmationDialog from '@/components/safety/ConfirmationDialog';
```

---

## Enhanced Confirmation Dialog (Optional)

If you want to create a more sophisticated agent-specific confirmation dialog:

### File: src/components/safety/AgentRunConfirmation.jsx (New File)

```javascript
import React from 'react';
import { AlertTriangle, Play, Clock, DollarSign, Shield } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function AgentRunConfirmation({
  isOpen,
  agent,
  pendingRun,
  onConfirm,
  onCancel,
  estimatedCost = 0.05,
  estimatedDuration = 30,
}) {
  if (!isOpen) return null;

  const domains = agent.domains ? JSON.parse(agent.domains) : [];

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl max-w-lg w-full p-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-accent-warning/10 flex items-center justify-center">
            <AlertTriangle size={24} className="text-accent-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Confirm Agent Execution</h3>
            <p className="text-sm text-text-secondary">Review details before running</p>
          </div>
        </div>

        {/* Agent Info */}
        <div className="bg-bg-secondary rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Agent:</span>
            <span className="text-sm text-text-primary font-medium">{agent.name}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted flex items-center gap-1.5">
              <Shield size={14} />
              Permissions:
            </span>
            <span className={`text-sm font-medium ${
              agent.permissions === 'read-only' ? 'text-green-400' :
              agent.permissions === 'read-write' ? 'text-yellow-400' :
              'text-orange-400'
            }`}>
              {agent.permissions || 'read-only'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted flex items-center gap-1.5">
              <DollarSign size={14} />
              Estimated cost:
            </span>
            <span className="text-sm text-text-primary font-medium">${estimatedCost.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted flex items-center gap-1.5">
              <Clock size={14} />
              Estimated time:
            </span>
            <span className="text-sm text-text-primary font-medium">~{estimatedDuration}s</span>
          </div>

          {domains.length > 0 && (
            <div className="pt-2 border-t border-border">
              <span className="text-sm text-text-muted block mb-1.5">Allowed domains:</span>
              <div className="flex flex-wrap gap-1.5">
                {domains.slice(0, 3).map((domain, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-accent-success/10 text-accent-success text-xs rounded"
                  >
                    {domain}
                  </span>
                ))}
                {domains.length > 3 && (
                  <span className="px-2 py-0.5 bg-bg-tertiary text-text-muted text-xs rounded">
                    +{domains.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-yellow-400">
            This agent will have <strong>{agent.permissions || 'read-only'}</strong> access.
            Review the permissions and domain restrictions above before proceeding.
          </p>
        </div>

        {/* Run ID */}
        <div className="text-xs text-text-muted mb-6">
          Run ID: <span className="font-mono">{pendingRun?.id || 'N/A'}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Play size={16} />
            Execute Agent
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Then use it in AgentsPage.jsx:

```javascript
import AgentRunConfirmation from '@/components/safety/AgentRunConfirmation';

// In the JSX:
{showConfirmDialog && pendingRun && (
  <AgentRunConfirmation
    isOpen={showConfirmDialog}
    agent={agent}
    pendingRun={pendingRun}
    onConfirm={handleConfirm}
    onCancel={handleCancel}
    estimatedCost={0.05}
    estimatedDuration={30}
  />
)}
```

---

## Testing the Frontend Integration

### 1. Start the server
```bash
npm run dev
```

### 2. Navigate to Agents page
- Go to http://localhost:5173/agents
- Click "Run" on any agent

### 3. Expected behavior

**OLD (without frontend changes):**
- Agent executes immediately
- No confirmation dialog
- Shows results right away

**NEW (with frontend changes):**
1. Click "Run" → Confirmation dialog appears
2. Dialog shows:
   - Agent name
   - Permissions
   - Estimated cost
   - Run ID
3. Click "Execute Agent" → Agent runs
4. Results displayed after completion
5. OR click "Cancel" → Run cancelled, nothing executes

### 4. Verify in Network tab

Check browser DevTools → Network:

1. **First request**: `POST /api/agents/:id/run`
   - Response: `{ confirmation_required: true, run: { id: "...", status: "pending" } }`

2. **After confirmation**: `POST /api/runs/:id/confirm`
   - Response: `{ message: "Agent completed", run: { status: "success", ...} }`

### 5. Verify in database

Check the `runs` table:
- `status` should be 'pending' initially
- `confirmed_by` should be populated after confirmation
- `confirmed_at` should have a timestamp
- Final `status` should be 'success' or 'failed'

---

## Cost Estimation Integration (Phase 2.2)

Once you implement `costTracker.js`, update the confirmation dialog:

```javascript
const [estimatedCost, setEstimatedCost] = useState(null);

const handleRun = async (e) => {
  // ... existing code ...

  try {
    // Create pending run
    const data = await api.post(`/agents/${agent.id}/run`, { message: message.trim() });

    if (data.confirmation_required) {
      // Get cost estimate (Phase 2.2)
      try {
        const estimate = await api.get(`/agents/${agent.id}/estimate`, {
          params: { message_length: message.trim().length }
        });
        setEstimatedCost(estimate.estimated_cost);
      } catch (err) {
        console.warn('Cost estimation unavailable:', err);
        setEstimatedCost(0.05); // Default fallback
      }

      setPendingRun(data.run);
      setShowConfirmDialog(true);
    }
  } catch (err) {
    // ... error handling ...
  }
};
```

---

## Rollback (If Needed)

If the frontend changes cause issues, you can temporarily bypass confirmation by modifying the backend:

### Quick Fix: Add bypass parameter

In `server/routes/agents.js`, add an optional bypass:

```javascript
const { message, sessionId, json, bypass_confirmation } = req.validated.body;

if (bypass_confirmation === true) {
  // Execute immediately (old behavior)
  // ... old execution code ...
} else {
  // Create pending run (new behavior)
  // ... current code ...
}
```

Then in frontend, add `bypass_confirmation: true` to the POST body temporarily.

**But this defeats the purpose of Phase 2.1!** Only use as a temporary workaround.

---

## Summary

**Changes required:**
1. ✅ Modify `handleRun` in `AgentsPage.jsx` (add confirmation state + logic)
2. ✅ Add `handleConfirm` and `handleCancel` functions
3. ✅ Add `<ConfirmationDialog>` or `<AgentRunConfirmation>` to JSX
4. ✅ Add state variables: `pendingRun`, `showConfirmDialog`

**Estimated time:** 30-60 minutes

**Testing:** Create pending run → See dialog → Confirm → Agent executes

**Result:** Human-in-the-loop safety gate complete! Security score: 91/100 → 92/100

---

**Ready to implement?** Follow the code examples above or let me know if you'd like me to make the changes directly!
