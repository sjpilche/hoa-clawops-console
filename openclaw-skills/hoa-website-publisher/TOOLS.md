# TOOLS.md — HOA Website Publisher Environment Config

## API Configuration

### HOA Website Webhook
- **API URL**: `https://hoaprojectfunding-api.onrender.com`
- **Push Articles**: `POST /api/v1/articles/webhook/push`
- **Push Insights**: `POST /api/v1/articles/webhook/insights`
- **Delete Article**: `DELETE /api/v1/articles/webhook/articles/:externalId`
- **List Articles (public)**: `GET /api/v1/articles`
- **Auth**: HMAC-SHA256 via `x-webhook-signature` + `x-webhook-timestamp` headers
- **Secret env var**: `HOA_WEBHOOK_SECRET`

### Environment Variables (from .env.local)
- `HOA_WEBHOOK_SECRET` — shared HMAC secret (matches CONTENT_WEBHOOK_SECRET on server)
- `HOA_WEBHOOK_API_URL` — base URL for the HOA API (https://hoaprojectfunding-api.onrender.com)

## Category Rotation

| Day | Category | Color on Frontend |
|-----|----------|------------------|
| Monday | Financing | Blue |
| Tuesday | Board Governance | Indigo |
| Wednesday | Reserve Studies | Teal |
| Thursday | Compliance | Red |
| Friday | Project Planning | Amber |
| Saturday | Industry Trends | Purple |
| Sunday | Best Practices | Emerald |

## Content Guidelines

- **Length**: 1200-1500 words
- **Format**: HTML (not markdown)
- **Author**: "HOA Project Funding Team"
- **external_id format**: `hoa-auto-YYYY-MM-DD-slug-name`
- **Featured**: Set to `true` only for exceptional pieces (max 1 per week)
- **Excerpt**: Under 200 characters, compelling summary

## Website Pages Reference

- **Homepage**: https://www.hoaprojectfunding.com
- **Articles page**: https://www.hoaprojectfunding.com/SEOArticles
- **Application**: https://www.hoaprojectfunding.com (main CTA)
