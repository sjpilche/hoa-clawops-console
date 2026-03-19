# Secret Rotation Checklist

Generated: 2026-03-16 | Status: PENDING

All secrets below are in `.env.local` (NOT in git). Rotate as a precaution since they were exposed during an audit session.

## Priority 1: Financial / Data Access

- [ ] **OpenAI API Key** (line 19)
  - Rotate at: https://platform.openai.com/api-keys
  - Delete old key, generate new one, update `OPENAI_API_KEY=`

- [ ] **Azure SQL Password** (line 43)
  - Rotate at: Azure Portal > empirecapital.database.windows.net > Reset password
  - Update `AZURE_SQL_PASSWORD=`

- [ ] **SendGrid API Key** (line 28)
  - Rotate at: https://app.sendgrid.com/settings/api_keys
  - Delete old key, generate new one, update `SENDGRID_API_KEY=`

## Priority 2: Social Media / Communications

- [ ] **Discord Bot Token** (line 121)
  - Rotate at: https://discord.com/developers/applications > Bot > Reset Token
  - Update `DISCORD_BOT_TOKEN=`

- [ ] **Facebook Access Tokens** (lines 56, 66)
  - Regenerate at: Facebook Developer Portal > App > Access Tokens
  - Update `FACEBOOK_ACCESS_TOKEN=` and `JAKE_FACEBOOK_ACCESS_TOKEN=`

- [ ] **LinkedIn Access Token** (line 74)
  - Regenerate via OAuth flow at LinkedIn Developer Portal
  - Update `LINKEDIN_ACCESS_TOKEN=`

- [ ] **Twitter/X API Keys** (lines 86-89)
  - Rotate at: https://developer.x.com/portal > Keys and Tokens > Regenerate
  - Update all 4 values: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`

- [ ] **GitHub Token** (line 80)
  - Rotate at: https://github.com/settings/tokens > Delete + regenerate
  - Update `GITHUB_TOKEN=`

## Priority 3: Email / Webhooks

- [ ] **Gmail App Password** (line 36)
  - Rotate at: Google Account > Security > App Passwords > Revoke + regenerate
  - Update `SMTP_PASS=`

- [ ] **Webhook Secrets** (lines 46, 48)
  - Generate new: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Update `HOA_WEBHOOK_SECRET=` and `CONTENT_WEBHOOK_SECRET=` in both .env.local AND the receiving service

- [ ] **OpenClaw Gateway Token** (line 8)
  - Generate new: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Update `OPENCLAW_GATEWAY_TOKEN=`

## After Rotation

1. Restart the server: `pm2 restart all` (or stop/start via batch files)
2. Test each integration:
   - `curl http://localhost:3001/api/health` (overall health)
   - Check Discord bot connects (look for bot online in your server)
   - Test one agent run to verify OpenAI key works
   - Check SendGrid can send (use test email endpoint)
3. Mark each item above as [x] when completed
