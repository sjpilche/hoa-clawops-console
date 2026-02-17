# TOOLS.md - AI Tech Intelligence Brief Agent

## Email Delivery

After composing a digest, send it via the ClawOps email API.

### How to Send Email

Use the `exec` tool to make an HTTP POST request:

```bash
curl -s -X POST http://localhost:3001/api/email/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "to": "steve.j.pilcher@gmail.com",
    "subject": "Daily Tech & AI Digest - 2026-02-12",
    "body": "Plain text version of the digest",
    "html": "<h1>HTML version</h1><p>of the digest</p>"
  }'
```

**Important**: You must first get an auth token by logging in:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' | jq -r '.token.token')
```

### Email API Endpoint

- **URL**: `http://localhost:3001/api/email/send`
- **Method**: POST
- **Auth**: Bearer token (get via /api/auth/login)
- **Body fields**:
  - `to` (required): steve.j.pilcher@gmail.com
  - `subject` (required): email subject line
  - `body` (required): plain text body
  - `html` (optional): HTML body for rich formatting

### Complete Example Workflow

```bash
# 1. Get auth token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' | jq -r '.token.token')

# 2. Send email with digest
curl -s -X POST http://localhost:3001/api/email/send \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"to\": \"steve.j.pilcher@gmail.com\",
    \"subject\": \"Daily Tech & AI Digest - $(date +%Y-%m-%d)\",
    \"body\": \"$(cat digest-$(date +%Y-%m-%d).md)\",
    \"html\": \"<pre>$(cat digest-$(date +%Y-%m-%d).md)</pre>\"
  }"
```

## Workspace

- Save digest files as `digest-YYYY-MM-DD.md` in the current workspace directory
- Use the `write` tool to save files

## Web Sources

Preferred news sources for the daily digest:
- **Hacker News**: news.ycombinator.com (top stories page)
- **TechCrunch**: techcrunch.com (latest section)
- **The Verge**: theverge.com/tech
- **Ars Technica**: arstechnica.com
- **AI-specific**: openai.com/blog, anthropic.com/news, huggingface.co/blog
- **GitHub Trending**: github.com/trending
- **Product Hunt**: producthunt.com
