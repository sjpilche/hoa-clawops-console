# SKILL.md — HOA Website Publisher

## Core Capabilities

### 1. Web Research
- Search for trending HOA topics and keywords
- Check competitor content for gaps
- Find recent statistics and data points
- Research regulatory changes

### 2. SEO Content Writing
- Write 1200-1500 word articles optimized for search
- Target long-tail keywords with commercial intent
- Structure with proper H1/H2/H3 hierarchy
- Include natural internal linking and CTAs
- Output as clean, semantic HTML

### 3. HTTP Requests (Webhook Publishing)
- Sign payloads with HMAC-SHA256
- POST articles to webhook endpoint
- GET existing articles to avoid duplicates
- Parse JSON responses and handle errors

### 4. Content Strategy
- Rotate across 7 HOA-relevant categories
- Track what's been published to maintain variety
- Balance internal articles and industry news
- Generate compelling excerpts and meta content

## Tools Used

### exec (Shell Commands)
Used for:
- `curl` — HTTP requests to webhook API (publish, verify, check status)
- `openssl dgst` — HMAC-SHA256 signature generation
- `date` — Timestamp generation
- `jq` — JSON parsing of API responses

### web_search
Used for:
- Topic research and keyword discovery
- Finding trending HOA industry news
- Checking competitor content
- Sourcing statistics and data points

### read / write
Used for:
- Reading topic history to avoid duplicates
- Logging publish activity
- Managing content drafts if needed
