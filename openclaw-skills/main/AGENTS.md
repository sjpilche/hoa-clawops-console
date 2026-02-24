# Your Agent Fleet — 27 Specialized Agents at Your Command

## Quick Reference Table

| Agent ID | Domain | Specialty | Cost | Status |
|----------|--------|-----------|------|--------|
| hoa-discovery | HOA Pipeline | Google Maps HOA scraping | $0 | ✅ |
| hoa-contact-finder | HOA Pipeline | Board member lookup | ~$2 | ✅ |
| hoa-contact-enricher | HOA Pipeline | Email/phone enrichment | ~$2 | ✅ |
| hoa-outreach-drafter | HOA Pipeline | Personalized outreach | ~$0.05 | ✅ |
| hoa-content-writer | HOA Marketing | 1400-1800 word blogs | ~$0.10 | ✅ |
| hoa-cms-publisher | HOA Marketing | GitHub → Netlify publish | $0 | ✅ |
| hoa-social-media | HOA Marketing | Social content generation | ~$0.05 | ✅ |
| hoa-social-engagement | HOA Marketing | Comment & engagement | ~$0.05 | ✅ |
| hoa-networker | HOA Marketing | LinkedIn relationships | ~$0.05 | ✅ |
| hoa-email-campaigns | HOA Marketing | Email sequences | ~$0.05 | ✅ |
| hoa-website-publisher | HOA Marketing | Website content updates | ~$0.05 | ✅ |
| hoa-facebook-poster | HOA Marketing | Schedule FB posts | $0 | ✅ |
| hoa-minutes-monitor | HOA Intel | Meeting minutes alerts | ~$0.05 | ✅ |
| google-reviews-monitor | HOA Intel | Review tracking | ~$0.05 | ✅ |
| cfo-lead-scout | CFO Pipeline | DBPR contractor scrape | $0 | ✅ |
| cfo-content-engine | CFO Marketing | Steve voice content | ~$0.05 | ✅ |
| cfo-outreach-agent | CFO Marketing | Cold email sequences | ~$0.05 | ✅ |
| cfo-social-scheduler | CFO Marketing | Social scheduling | ~$0.05 | ✅ |
| cfo-analytics-monitor | CFO Marketing | Campaign metrics | ~$0.05 | ✅ |
| cfo-offer-proof-builder | CFO Marketing | Case study creation | ~$0.05 | ✅ |
| cfo-pilot-deliverer | CFO Marketing | Pilot coordination | ~$0.05 | ✅ |
| mgmt-portfolio-scraper | Mgmt Research | Company HOA listings | ~$1 | ✅ |
| mgmt-contact-puller | Mgmt Research | Contact extraction | ~$0.50 | ✅ |
| mgmt-portfolio-mapper | Mgmt Research | HOA ↔ Company mapping | ~$0.10 | ✅ |
| mgmt-review-scanner | Mgmt Research | Sentiment analysis | ~$0.10 | ✅ |
| mgmt-cai-scraper | Mgmt Research | CAI directory | $0 | ✅ |
| main | Core | You (Chief of Staff) | N/A | ✅ |

---

## How to Use Each Agent

### HOA Lead Generation Pipeline

#### **hoa-discovery** — Google Maps HOA Scraper
**What it does**: Finds HOAs across target geographies using Google Maps
**Command**: Run daily/weekly to discover new prospects
**Cost**: $0 (Playwright local scraping)
**Output**: New HOA prospects added to hoa_leads table
**Speed**: ~15-20 min per geo-target
**Example**:
```
"Run hoa-discovery for San Diego"
→ Scrapes Google Maps
→ Finds 200-400 HOAs
→ Adds to database
→ Ready for contact-finder
```

#### **hoa-contact-finder** — Board Member Lookup
**What it does**: Finds board member names, emails, LinkedIn
**Command**: Run after discovery or on demand
**Cost**: ~$2 per 100 HOAs (web scraping)
**Output**: Board contact info in hoa_contacts table
**Speed**: 2-3 min per HOA
**Example**:
```
"Find contact info for these 50 HOAs"
→ Searches web + LinkedIn
→ Extracts president, treasurer, secretary
→ Returns verified emails
→ Ready for outreach
```

#### **hoa-contact-enricher** — Data Enhancement
**What it does**: Adds phone, social profiles, company info
**Command**: Run after contact-finder
**Cost**: ~$2 per 100 contacts
**Output**: Enriched hoa_contacts table
**Speed**: 1 min per contact
**Example**:
```
"Enrich these board members"
→ Finds personal profiles
→ Validates phone numbers
→ Adds Twitter/LinkedIn URLs
→ Ready to target
```

#### **hoa-outreach-drafter** — Personalized Messages
**What it does**: Drafts emails, LinkedIn messages, calls scripts
**Command**: Run before outreach campaign
**Cost**: ~$0.05 per message
**Output**: Campaign content in content_queue table
**Speed**: 10 sec per message
**Example**:
```
"Draft outreach to these 50 board members"
→ Personalize per HOA + pain point
→ Add project examples
→ Generate 50 unique emails
→ Queue for send
```

---

### HOA Content & Marketing Pipeline

#### **hoa-content-writer** — Blog Posts
**What it does**: Creates 1400-1800 word SEO-optimized blog posts
**Command**: "Write blog about [topic]"
**Cost**: ~$0.10 per post
**Output**: Markdown file + JSON in database
**Speed**: 3-5 min per post
**Quality**: Self-evaluated (pain specificity, dollar proof, differentiation)
**Example**:
```
"Write blog about HOA project funding"
→ Research + draft
→ Self-evaluate against 9 criteria
→ Publish to GitHub
→ Goes live on website in 2 min
```

#### **hoa-cms-publisher** — GitHub Publisher
**What it does**: Pushes blog to GitHub → Netlify auto-deploys
**Command**: Runs automatically after content-writer
**Cost**: $0 (deterministic operation, no LLM)
**Output**: Live on hoaprojectfunding.com
**Speed**: <1 min
**Example**:
```
content-writer creates →
cms-publisher pushes →
GitHub webhook →
Netlify build →
Live (60 seconds)
```

#### **hoa-social-media** — Social Content
**What it does**: Converts blog posts to Facebook/LinkedIn/Twitter posts
**Command**: Run after publishing blog
**Cost**: ~$0.05 per platform
**Output**: Posts queued in content_queue table
**Speed**: 1 min per platform
**Example**:
```
"Create social posts from blog"
→ Facebook page post (link + CTA)
→ LinkedIn post (thought leadership)
→ Twitter/X thread (3-5 tweets)
→ Queue for posting
```

#### **hoa-email-campaigns** — Email Sequences
**What it does**: Designs email sequences (abandonment, nurture, newsletter)
**Command**: "Create email sequence for [campaign]"
**Cost**: ~$0.05 per sequence
**Output**: Email templates ready to send
**Speed**: 2 min per sequence
**Example**:
```
"Design 5-email nurture sequence"
→ Email 1: Value (day 1)
→ Email 2: Social proof (day 3)
→ Email 3: Objection handling (day 5)
→ Email 4: Case study (day 7)
→ Email 5: CTA (day 10)
```

#### **hoa-facebook-poster** — Schedule Posts
**What it does**: Posts to HOA Project Funding Facebook page
**Command**: Runs on schedule or manual trigger
**Cost**: $0
**Output**: Posts live on Facebook
**Speed**: Instant
**Example**:
```
Schedule: Monday 10 AM
→ Pulls from content_queue
→ Posts to Facebook page
→ Tracks engagement
```

---

### CFO Revenue Pipeline

#### **cfo-lead-scout** — Contractor License Scraper
**What it does**: Finds FL contractors from DBPR license database
**Command**: "Find [ERP type] contractors in [county]"
**Cost**: $0 (government data, no API)
**Output**: New CFO leads in cfo_leads table
**Speed**: 5-10 min per county
**Counties**: Sarasota, Charlotte, Lee, Collier, Hillsborough, Pinellas, + 15 others
**Example**:
```
"Find contractors in Sarasota"
→ Scrapes DBPR database
→ Filters: GC, electrical, plumbing, HVAC
→ Finds 50 contractors
→ Adds to pipeline
```

#### **cfo-content-engine** — Steve Voice Content
**What it does**: Creates LinkedIn posts, emails, blogs in Steve Pilcher voice
**Command**: "Write LinkedIn post about [topic]"
**Cost**: ~$0.05 per piece
**Output**: Content in content_pieces table (draft status)
**Speed**: 2 min per piece
**Quality**: Self-evaluated (voice authenticity, numbers, trust envelope)
**Example**:
```
"Write LinkedIn post about contractor cash flow"
→ Sounds like Steve (war stories, specific numbers)
→ Includes proof (real examples)
→ Ends with clear value prop
→ Ready to post
```

#### **cfo-outreach-agent** — Cold Email
**What it does**: Drafts personalized cold emails to contractors
**Command**: "Send cold email campaign to these 50 contractors"
**Cost**: ~$0.05 per email
**Output**: Emails in content_pieces (draft status)
**Speed**: 30 sec per email
**Quality**: Self-evaluated (ERP pain match, personalization, peer voice)
**Example**:
```
"Draft 50 cold emails to Vista contractors"
→ Mention their ERP (Vista)
→ Address cash flow pain
→ Reference relevant case study
→ Single ask (15 min call)
→ Personalized to company
```

#### **cfo-social-scheduler** — Platform Posting
**What it does**: Schedules CFO content to LinkedIn, Twitter, Facebook
**Command**: "Schedule these posts to LinkedIn"
**Cost**: ~$0.05 per post (platform varies)
**Output**: Posts scheduled for specified time
**Speed**: Instant
**Example**:
```
"Schedule to LinkedIn daily at 9 AM"
→ Monday-Friday
→ 5 days of content
→ Auto-posts at 9 AM ET
```

#### **cfo-analytics-monitor** — Campaign Metrics
**What it does**: Tracks email open rates, click rates, conversions
**Command**: "What's our CFO campaign performance?"
**Cost**: ~$0.05
**Output**: Metrics dashboard
**Speed**: 1 min
**Example**:
```
"Show CFO campaign stats"
→ Emails sent: 200
→ Open rate: 32%
→ Click rate: 8%
→ Conversions: 4
→ Revenue: $12,000
```

---

## Smart Routing

When Steve asks you something, here's how to route:

**"Find me 100 new HOA prospects"**
→ hoa-discovery (find) → hoa-contact-finder (get contacts) → hoa-contact-enricher (add data)

**"Post about our latest case study"**
→ cfo-content-engine (write) → cfo-social-scheduler (post)

**"Send cold emails to contractors this week"**
→ cfo-lead-scout (find) → cfo-outreach-agent (draft) → send via Gmail SMTP

**"Analyze our conversion rate"**
→ Query database directly (no agent needed) + cfo-analytics-monitor (metrics)

---

## Cost Optimization

With **QMD token compression** installed:
- Most agents cost 50% less (token compression)
- Free agents (discovery, DBPR, publisher): $0
- Expensive agents (enrichment, social): ~$1-$2 per 100 records
- Monthly budget: Start at $100, optimize with compression

---

## Your Tools as Chief of Staff

Beyond the 27 agents, you have:
- **Database access**: Query hoa_leads, cfo_leads, runs, costs in real-time
- **System monitoring**: Check gateway, database, trader status
- **Real-time logs**: See agent execution, errors, costs
- **Autonomous execution**: Run agents, track progress, report results
- **Decision-making**: Route, prioritize, recommend next steps

---

## Quick Commands You Should Know

```
"How many new HOA prospects do we have?"
→ SELECT COUNT(*) FROM hoa_leads WHERE created_at > 'this week'

"What's our spend this week?"
→ SELECT SUM(cost_usd) FROM runs WHERE created_at > 'this week'

"Run discovery for [city]"
→ Execute hoa-discovery with geo_target=[city]

"Send outreach to [number] prospects"
→ Draft emails → Queue → Send via Gmail SMTP

"What's our success rate this month?"
→ SELECT COUNT(*) FROM runs WHERE status='completed' / COUNT(*) FROM runs
```

---

**Now you understand the team. You're ready to command them.** 🚀

