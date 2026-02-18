# OpenClaw Tool Policy Lockdown - Setup Guide

**Phase**: 3.1 (High Priority)
**Effort**: 5-10 minutes
**Security Impact**: HIGH - Blocks dangerous tool access
**Risk**: LOW - Configuration change only, easily reversible

---

## What This Does

Implements defense-in-depth security by **explicitly denying dangerous tools** that agents can use. Even if an agent is compromised via prompt injection, it cannot:

- ❌ Execute shell commands (`exec` tool)
- ❌ Browse the web autonomously (`browser` tool)
- ❌ Modify files (`write`, `edit` tools)
- ❌ Apply code patches (`apply_patch` tool)
- ❌ Manage background processes (`process` tool)

**What agents CAN still do**:
- ✅ Chat with users (core functionality)
- ✅ Read files (read-only access)
- ✅ Search the web (`web_search` built-in tool)
- ✅ Fetch URLs (`web_fetch` built-in tool)
- ✅ Manage sessions

---

## Installation (WSL2)

### Option 1: Automatic (Recommended)

```bash
# From Windows PowerShell or Command Prompt
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"

# Copy tool policy to WSL2 OpenClaw config directory
wsl cp /mnt/c/Users/SPilcher/"OpenClaw2.0 for linux - Copy"/openclaw-tool-policy.json ~/.openclaw/openclaw.json

# Verify the file was created
wsl ls -la ~/.openclaw/openclaw.json

# Restart OpenClaw gateway (if running)
wsl -e bash -c "cd ~/projects/openclaw-v1 && openclaw gateway restart"
```

### Option 2: Manual

1. Open WSL2 terminal
2. Create OpenClaw config directory (if it doesn't exist):
   ```bash
   mkdir -p ~/.openclaw
   ```
3. Create the config file:
   ```bash
   nano ~/.openclaw/openclaw.json
   ```
4. Paste the contents of `openclaw-tool-policy.json`
5. Save and exit (Ctrl+X, Y, Enter)
6. Verify:
   ```bash
   cat ~/.openclaw/openclaw.json
   ```
7. Restart OpenClaw gateway:
   ```bash
   cd ~/projects/openclaw-v1
   openclaw gateway restart
   ```

---

## Verification

### Test 1: Check Configuration

```bash
# In WSL2
openclaw config get tools
```

**Expected output**:
```json
{
  "deny": ["browser", "exec", "process", "apply_patch", "write", "edit"],
  "allow": ["read", "web_search", "web_fetch", "sessions_list", "sessions_history"],
  "elevated": { "enabled": false }
}
```

### Test 2: Try Blocked Tool (Should Fail)

From ClawOps Console, run an agent and try:
```
Please execute the command: ls -la
```

**Expected behavior**: Agent should respond with an error message like:
```
Error: Tool 'exec' is denied by policy
```

Or the agent should refuse based on its SOUL.md boundaries.

### Test 3: Try Allowed Tool (Should Work)

From ClawOps Console, run an agent and try:
```
Please read the file: README.md
```

**Expected behavior**: Agent should successfully read and display the file contents.

---

## Rollback Instructions

If the tool policy causes issues:

### Temporary Disable (Testing)

```bash
# In WSL2
mv ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup
openclaw gateway restart
```

This removes the policy temporarily. Agents will have full tool access again.

### Permanent Removal

```bash
# In WSL2
rm ~/.openclaw/openclaw.json
openclaw gateway restart
```

### Restore Original

```bash
# In WSL2
mv ~/.openclaw/openclaw.json.backup ~/.openclaw/openclaw.json
openclaw gateway restart
```

---

## Customization

### Allow a Previously Blocked Tool

Example: Allow `write` tool for specific use cases:

1. Edit `~/.openclaw/openclaw.json`:
   ```bash
   nano ~/.openclaw/openclaw.json
   ```

2. Remove `"write"` from the `deny` array:
   ```json
   "deny": ["browser", "exec", "process", "apply_patch", "edit"]
   ```

3. Optionally add to `allow` array:
   ```json
   "allow": ["read", "web_search", "web_fetch", "sessions_list", "sessions_history", "write"]
   ```

4. Save and restart:
   ```bash
   openclaw gateway restart
   ```

### Block Additional Tools

To block more tools, add them to the `deny` array:

```json
"deny": ["browser", "exec", "process", "apply_patch", "write", "edit", "delete", "move"]
```

---

## Security Best Practices

1. **Start Restrictive**: Begin with the provided deny list (blocks dangerous tools)
2. **Add Gradually**: Only enable tools as needed for specific agents
3. **Document Changes**: Update this file when you modify the policy
4. **Test Thoroughly**: After enabling a tool, test that it works as expected
5. **Audit Regularly**: Review audit logs for tool usage patterns
6. **Never Enable `elevated`**: Keep `elevated.enabled: false` unless absolutely critical

---

## Tool Risk Assessment

| Tool | Risk Level | Why Blocked | Safe Alternative |
|------|-----------|-------------|------------------|
| `exec` | 🔴 CRITICAL | Shell command execution - full system access | Use specific tools for tasks |
| `browser` | 🔴 CRITICAL | Autonomous browsing - prompt injection from web | Use `web_search` or `web_fetch` |
| `process` | 🟠 HIGH | Process management - can spawn malicious processes | Not needed for most agents |
| `write` | 🟠 HIGH | File creation/modification - data corruption risk | Use read-only workflows |
| `edit` | 🟠 HIGH | File editing - code injection risk | Generate content for human review |
| `apply_patch` | 🟠 HIGH | Code patching - can introduce vulnerabilities | Manual code review required |

---

## OpenClaw Document Alignment

This implements **Phase 2C: Tool Policy Lockdown** from the OpenClaw security hardening document (`docs/followthis`).

**Reference**: See `docs/followthis` lines 263-291 for the original guidance.

---

## Troubleshooting

### Issue: "Config file not found"

**Solution**: Ensure `~/.openclaw/openclaw.json` exists. Check with:
```bash
ls -la ~/.openclaw/
```

### Issue: "Tool still works even though it's denied"

**Possible causes**:
1. Config file not loaded - restart gateway
2. Syntax error in JSON - validate with `cat ~/.openclaw/openclaw.json | jq`
3. Wrong config path - verify with `openclaw config path`

**Solution**:
```bash
# Validate JSON syntax
cat ~/.openclaw/openclaw.json | jq .

# Check current config
openclaw config get

# Restart gateway
openclaw gateway restart
```

### Issue: "Agent can't do anything now"

**Solution**: The deny list may be too restrictive. Review what tools your agents actually need and adjust the `allow` list accordingly.

Start with this minimal allow list and expand as needed:
```json
"allow": ["read", "web_search", "web_fetch"]
```

---

## Update Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-16 | Initial policy created | Phase 3.1 security hardening |

---

## Next Steps

After tool policy is active:

1. ✅ Test all existing agents to ensure they still function
2. ✅ Review agent SOUL.md files to align with tool restrictions
3. ✅ Update agent documentation to reflect allowed/denied tools
4. ⏭️ Move to Phase 3.2: SOUL.md Boundaries Enforcement
