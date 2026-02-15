# OpenClaw Cron Commands Reference

Individual cron commands for manual setup or troubleshooting.

---

## Content Writer - Monday 6:00 AM EST

```bash
openclaw cron add \
  --agent hoa-content-writer \
  --cron "0 6 * * 1" \
  --message "Pick the next unwritten topic from content-calendar.md. Generate a 1500-2000 word SEO-optimized blog post. Include two CTAs: one mid-article for the free consult, one end-of-article for the full application at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Content - Weekly Blog Post"
```

**Schedule:** Every Monday at 6:00 AM Eastern
**Output:** Draft blog post in `posts/drafts/`
**Manual step:** Review, edit, move to `posts/approved/`

---

## CMS Publisher - Tuesday 8:00 AM EST

```bash
openclaw cron add \
  --agent hoa-cms-publisher \
  --cron "0 8 * * 2" \
  --message "Check approved directory and publish all approved posts to WordPress as drafts. Insert CTA blocks pointing to the application form and free consult at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA CMS - Upload to WordPress"
```

**Schedule:** Every Tuesday at 8:00 AM Eastern
**Output:** WordPress draft post with CTAs
**Manual step:** Add featured image, publish in WordPress admin

---

## Social Media - Facebook Page + LinkedIn - Tuesday 10:00 AM EST

```bash
openclaw cron add \
  --agent hoa-social-media \
  --cron "0 10 * * 2" \
  --message "Convert the latest blog post into a Facebook page share post and LinkedIn thought leadership post. All CTAs drive to www.hoaprojectfunding.com application or free consult." \
  --tz "America/New_York" \
  --name "HOA Social - Facebook Page + LinkedIn"
```

**Schedule:** Every Tuesday at 10:00 AM Eastern
**Output:** Facebook page post + LinkedIn post in `posts/`
**Manual step:** Review, approve, schedule/publish

---

## Social Media - Facebook Group Discussion - Wednesday 12:00 PM EST

```bash
openclaw cron add \
  --agent hoa-social-media \
  --cron "0 12 * * 3" \
  --message "Create a Facebook group discussion post based on the latest blog post. Value-first, no direct sales CTA. Goal is engagement and credibility." \
  --tz "America/New_York" \
  --name "HOA Social - Facebook Group Discussion"
```

**Schedule:** Every Wednesday at 12:00 PM Eastern
**Output:** Facebook group discussion post in `posts/`
**Manual step:** Review, approve, post to groups

---

## Social Engagement Monitor - Daily 8:00 AM EST

```bash
openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 8 * * *" \
  --message "Check social platforms for new engagement. Score leads per lead-scoring.json. Draft responses for any leads scoring 10+. Include site link only for high-intent leads." \
  --tz "America/New_York" \
  --name "HOA Engagement - Daily Monitor"
```

**Schedule:** Every day at 8:00 AM Eastern
**Output:** Draft responses in `drafts/YYYY-MM-DD-responses.md`
**Manual step:** Review and approve responses before posting

---

## Social Engagement Metrics - Monday 9:00 AM EST

```bash
openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 9 * * 1" \
  --message "Generate weekly engagement metrics report. Track: total interactions, leads identified, website clicks from social, and any application form submissions this week." \
  --tz "America/New_York" \
  --name "HOA Engagement - Weekly Metrics"
```

**Schedule:** Every Monday at 9:00 AM Eastern
**Output:** Metrics report in `metrics/weekly-YYYY-MM-DD.json`
**Manual review:** Check which content drives conversions

---

## Email Follow-ups Check - Friday 9:00 AM EST

```bash
openclaw cron add \
  --agent hoa-email-campaigns \
  --cron "0 9 * * 5" \
  --message "Check for any pending follow-up emails due in active sequences (abandonment or post-consult). Generate drafts for review." \
  --tz "America/New_York" \
  --name "HOA Email - Follow-ups Check"
```

**Schedule:** Every Friday at 9:00 AM Eastern
**Output:** Draft follow-up emails if any are due
**Manual step:** Review and approve emails before send

---

## Monthly Newsletter - First Tuesday 10:00 AM EST

```bash
openclaw cron add \
  --agent hoa-email-campaigns \
  --cron "0 10 1-7 * 2" \
  --message "Generate monthly newsletter with latest blog highlight, one board tip, and standing CTA to www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Email - Monthly Newsletter"
```

**Schedule:** First Tuesday of every month at 10:00 AM Eastern
**Output:** Newsletter draft, sent to ESP
**Manual review (optional):** Check newsletter before send

---

## Useful Commands

**List all active cron jobs:**
```bash
openclaw cron list
```

**List with full details (JSON):**
```bash
openclaw cron list --json
```

**Remove a specific cron job:**
```bash
openclaw cron remove --id <cron-job-id>
```

**Remove ALL cron jobs:**
```bash
openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {}
```

**Test a cron job manually:**
```bash
openclaw agent \
  --agent <agent-name> \
  --local \
  --session-id "test-$(date +%s)" \
  --message "<cron message here>"
```

---

## Cron Schedule Syntax

Cron format: `"minute hour day-of-month month day-of-week"`

Examples:
- `"0 6 * * 1"` = Monday at 6:00 AM
- `"0 8 * * 2"` = Tuesday at 8:00 AM
- `"0 8 * * *"` = Every day at 8:00 AM
- `"0 10 1-7 * 2"` = First Tuesday of month at 10:00 AM (days 1-7, Tuesday)

---

## Troubleshooting

**Cron job not running:**
1. Check cron is active: `openclaw cron list`
2. Check timezone is correct (America/New_York)
3. Test manually with `openclaw agent` command
4. Check agent exists: `openclaw agents list`

**Agent not found:**
```bash
# Register the agent first
openclaw agents add <agent-name>
```

**Need to update a cron job:**
```bash
# Remove the old job
openclaw cron remove --id <old-id>

# Add the new job with updated message/schedule
openclaw cron add --agent <agent> --cron "<schedule>" --message "..." --tz "..." --name "..."
```

---

**For full pipeline documentation, see:** `/docs/pipeline-schedule.md`
