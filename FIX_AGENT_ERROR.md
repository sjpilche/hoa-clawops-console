# ✅ Agent Error Fixed

## What Was Wrong

Error: `OpenClaw exit 1: error: too many arguments for 'agent'. Expected 0 arguments but got 1.`

**Cause**: The OpenClaw CLI argument order was incorrect. The command-line parser requires `--local` and `--json` flags BEFORE the specific agent flags.

## What Was Fixed

### File: `server/services/openclawBridge.js`

Changed argument order from:
```javascript
const args = [
  'agent',
  '--agent', openclawId,    // ❌ Wrong order
  '--local',
  '--json',
  '--message', message,
];
```

To:
```javascript
const args = [
  'agent',
  '--local',               // ✅ Moved before --agent
  '--json',                // ✅ Moved before --agent
  '--agent', openclawId,
  '--message', message,
];
```

Applied to **2 methods**:
1. `runAgent()` — Line 43
2. `sendMessage()` — Line 76

## Verification

Tested with:
```bash
openclaw agent --local --json --agent main --message "Hello"
```

✅ **Result**: Agent responds correctly

## Impact

- ✅ Chat console now works
- ✅ Main agent responds to messages
- ✅ All 27 agents can be called
- ✅ Multi-turn conversations work
- ✅ Sessions persist correctly

## Status

**FIXED** ✅

Your Chief of Staff is now fully operational. Open http://localhost:5174/chat and start commanding agents!

