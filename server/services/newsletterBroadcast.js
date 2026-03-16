/**
 * @file newsletterBroadcast.js
 * @description Broadcasts new blog posts and manages welcome sequences for newsletter subscribers.
 *
 * Called by:
 *   - githubPublisher.js after publishing a new blog post → broadcastNewPost()
 *   - scheduleRunner via welcome_sequence handler → processWelcomeSequence()
 *
 * Exports:
 *   broadcastNewPost(post)          — Email all active subscribers about a new post
 *   processWelcomeSequence()        — Send next welcome email to new subscribers
 *   subscribe(email, opts)          — Add a new subscriber
 *   unsubscribe(email)              — Unsubscribe by email
 *   getStats()                      — Subscriber counts and engagement
 */

const { get, all, run } = require('../db/connection');

const SITE_URL = 'https://hoaprojectfunding.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'HOA Project Funding';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'info@hoaprojectfunding.com';

// ── Welcome Sequence Emails ──────────────────────────────────────────────────
const WELCOME_SEQUENCE = [
  {
    step: 1,
    delay_days: 0,
    subject: 'Welcome to HOA Project Funding — here\'s your free guide',
    body: `Hi {{name}},

Thanks for subscribing! We help HOA boards and property managers fund capital projects without painful special assessments.

Here's what you can expect from us:
- Weekly insights on HOA funding, reserve management, and project planning
- Real stories from boards who've funded major repairs without raising dues
- Practical tools and checklists you can use right away

To get started, check out our most popular article:
{{latest_post_link}}

Talk soon,
The HOA Project Funding Team`,
  },
  {
    step: 2,
    delay_days: 3,
    subject: 'Quick question about your HOA\'s biggest challenge',
    body: `Hi {{name}},

I wanted to follow up on your signup. Every HOA is different, and I'd love to understand what you're dealing with.

What's the #1 financial challenge your board faces right now?
- Deferred maintenance piling up?
- Reserve fund too low for upcoming projects?
- Special assessment fatigue from residents?
- Something else entirely?

Just reply to this email — I read every response personally.

Best,
Steve Pilcher
HOA Project Funding`,
  },
  {
    step: 3,
    delay_days: 7,
    subject: 'How one HOA board funded a $1.2M project — without a special assessment',
    body: `Hi {{name}},

I wanted to share a quick story.

A 200-unit condo in Tampa Bay was facing a $1.2M concrete restoration project. The board had been putting it off for 3 years because they couldn't stomach another special assessment.

Here's what they did instead:
1. Got a professional reserve study (we helped them find one)
2. Explored HOA-specific financing options
3. Structured the repayment through existing dues — no increase needed

The project is now 60% complete, on budget, and residents barely noticed the financial impact.

If your board is sitting on a project like this, we can help you explore options:
{{cta_link}}

Best,
Steve`,
  },
  {
    step: 4,
    delay_days: 14,
    subject: 'Want us to look at your situation? (No cost, no commitment)',
    body: `Hi {{name}},

You've been reading our content for a couple weeks now. If any of it resonated with your HOA's situation, I'd love to offer a free assessment.

Here's what we'd cover:
- Your current reserve fund position
- Upcoming capital projects and their funding gaps
- Options to fund without special assessments
- A simple action plan your board can present at the next meeting

No sales pitch, no pressure. Just an honest look at your numbers.

If you're interested:
{{cta_link}}

Either way, I'll keep sending you useful content every week.

Best,
Steve Pilcher
HOA Project Funding`,
  },
];

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Subscribe a new email to the newsletter.
 */
function subscribe(email, opts = {}) {
  const { name = null, product = 'hoa', source = 'website', sourceDetail = null } = opts;

  const existing = get('SELECT id, status FROM newsletter_subscribers WHERE LOWER(email) = ?', [email.toLowerCase()]);

  if (existing) {
    if (existing.status === 'unsubscribed') {
      // Re-subscribe
      run(`UPDATE newsletter_subscribers SET status = 'active', welcome_step = 0,
        welcome_next_at = datetime('now'), unsubscribed_at = NULL WHERE id = ?`, [existing.id]);
      return { status: 'resubscribed', id: existing.id };
    }
    return { status: 'already_subscribed', id: existing.id };
  }

  try {
    run(`INSERT INTO newsletter_subscribers (email, name, product, source, source_detail, welcome_next_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [email.toLowerCase(), name, product, source, sourceDetail]);
  } catch (err) {
    // UNIQUE constraint race condition — another request inserted between our SELECT and INSERT
    if (err.message?.includes('UNIQUE')) {
      const dup = get('SELECT id FROM newsletter_subscribers WHERE LOWER(email) = ?', [email.toLowerCase()]);
      return { status: 'already_subscribed', id: dup?.id };
    }
    throw err;
  }

  const sub = get('SELECT id FROM newsletter_subscribers WHERE LOWER(email) = ?', [email.toLowerCase()]);
  console.log(`[Newsletter] New subscriber: ${email} (${source})`);

  return { status: 'subscribed', id: sub?.id };
}

/**
 * Unsubscribe an email.
 */
function unsubscribe(email) {
  run(`UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now')
    WHERE LOWER(email) = ? AND status = 'active'`, [email.toLowerCase()]);
  return { status: 'unsubscribed' };
}

/**
 * Process welcome sequence — send next email to subscribers who are due.
 * Call this every hour or on a schedule.
 */
async function processWelcomeSequence() {
  let sg;
  try { sg = require('./sendgrid'); } catch { return { sent: 0, error: 'SendGrid not available' }; }

  const due = all(`
    SELECT * FROM newsletter_subscribers
    WHERE status = 'active'
      AND welcome_step < 4
      AND welcome_next_at <= datetime('now')
    ORDER BY welcome_next_at ASC
    LIMIT 20
  `) || [];

  let sent = 0;
  for (const sub of due) {
    const nextStep = sub.welcome_step + 1;

    // Guard: if welcome_step is corrupted (>= max steps), mark as complete
    if (nextStep > WELCOME_SEQUENCE.length) {
      run(`UPDATE newsletter_subscribers SET welcome_step = ?, welcome_next_at = NULL WHERE id = ?`,
        [WELCOME_SEQUENCE.length, sub.id]);
      continue;
    }

    const template = WELCOME_SEQUENCE.find(t => t.step === nextStep);
    if (!template) continue;

    // Personalize — link to latest blog post if available
    const latestPost = get("SELECT title FROM cfo_content_pieces WHERE status='published' AND channel='blog' ORDER BY created_at DESC LIMIT 1");
    const latestPostSlug = latestPost?.title
      ? latestPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
      : null;
    const latestPostLink = latestPostSlug
      ? `${SITE_URL}/BlogPost?slug=${latestPostSlug}`
      : `${SITE_URL}/blog`;
    const body = template.body
      .replace(/\{\{name\}\}/g, sub.name || 'there')
      .replace(/\{\{latest_post_link\}\}/g, latestPostLink)
      .replace(/\{\{cta_link\}\}/g, `${SITE_URL}/contact`);

    try {
      const result = await sg.send({
        to: sub.email,
        subject: template.subject,
        text: body,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;line-height:1.6;color:#374151;">
          ${body.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px;">${p}</p>` : '<br>').join('')}
          <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            You're receiving this because you subscribed at ${SITE_URL}.<br>
            <a href="${SITE_URL}/api/capture/unsubscribe?email=${encodeURIComponent(sub.email)}" style="color:#6b7280;">Unsubscribe</a>
          </p>
        </div>`,
      });

      if (result.success) {
        const nextDelay = WELCOME_SEQUENCE.find(t => t.step === nextStep + 1)?.delay_days;
        run(`UPDATE newsletter_subscribers SET
          welcome_step = ?,
          welcome_next_at = ${nextDelay ? `datetime('now', '+${nextDelay} days')` : 'NULL'}
          WHERE id = ?`, [nextStep, sub.id]);
        sent++;
        console.log(`[Newsletter] Welcome step ${nextStep} sent to ${sub.email}`);
      }
    } catch (err) {
      console.error(`[Newsletter] Welcome email failed for ${sub.email}:`, err.message);
    }
  }

  return { sent, due: due.length };
}

/**
 * Broadcast a new blog post to all active subscribers.
 */
async function broadcastNewPost(post) {
  let sg;
  try { sg = require('./sendgrid'); } catch { return { sent: 0, error: 'SendGrid not available' }; }

  const subscribers = all(`SELECT * FROM newsletter_subscribers WHERE status = 'active'`) || [];
  if (subscribers.length === 0) return { sent: 0, reason: 'no_subscribers' };

  const slug = post.slug || (post.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
  const postUrl = `${SITE_URL}/blog/${slug}?utm_source=newsletter&utm_medium=email&utm_campaign=blog-broadcast`;

  // Check if already broadcast
  const existing = get('SELECT id FROM newsletter_broadcasts WHERE blog_slug = ?', [slug]);
  if (existing) return { sent: 0, reason: 'already_broadcast' };

  // Create broadcast record
  run(`INSERT INTO newsletter_broadcasts (blog_slug, subject, body_preview, recipient_count, status)
    VALUES (?, ?, ?, ?, 'sending')`,
    [slug, `New: ${post.title}`, (post.description || post.title || '').slice(0, 200), subscribers.length]);

  let sent = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const sub of subscribers) {
    // Circuit breaker: if 5 consecutive sends fail, stop (likely network/auth issue)
    if (consecutiveFailures >= 5) {
      console.error(`[Newsletter] Aborting broadcast — 5 consecutive failures (likely SendGrid issue)`);
      failed += subscribers.length - sent - failed;
      break;
    }

    try {
      await sg.send({
        to: sub.email,
        subject: `New: ${post.title}`,
        text: `New article from HOA Project Funding:\n\n${post.title}\n\n${post.description || ''}\n\nRead it here: ${postUrl}\n\n---\nUnsubscribe: ${SITE_URL}/api/capture/unsubscribe?email=${encodeURIComponent(sub.email)}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#374151;">
          <h2 style="color:#111827;margin:0 0 8px;">${post.title}</h2>
          <p style="color:#6b7280;margin:0 0 16px;">${post.description || ''}</p>
          <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Read the Full Article</a>
          <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            <a href="${SITE_URL}/api/capture/unsubscribe?email=${encodeURIComponent(sub.email)}" style="color:#6b7280;">Unsubscribe</a>
          </p>
        </div>`,
      });
      sent++;
      consecutiveFailures = 0;
    } catch (err) {
      console.error(`[Newsletter] Broadcast failed for ${sub.email}:`, err.message);
      failed++;
      consecutiveFailures++;
    }
  }

  // Update broadcast record — distinguish full success from partial failure
  const broadcastStatus = failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'partial');
  run(`UPDATE newsletter_broadcasts SET sent_count = ?, status = ?, sent_at = datetime('now')
    WHERE blog_slug = ?`, [sent, broadcastStatus, slug]);

  console.log(`[Newsletter] Broadcast "${post.title}" — ${sent} sent, ${failed} failed (${broadcastStatus})`);
  return { sent, failed, total: subscribers.length, status: broadcastStatus };
}

/**
 * Get newsletter stats.
 */
function getStats() {
  const total = get("SELECT COUNT(*) as n FROM newsletter_subscribers WHERE status = 'active'");
  const thisWeek = get("SELECT COUNT(*) as n FROM newsletter_subscribers WHERE status = 'active' AND subscribed_at >= datetime('now', '-7 days')");
  const broadcasts = get("SELECT COUNT(*) as n FROM newsletter_broadcasts WHERE status = 'sent'");
  const unsubscribed = get("SELECT COUNT(*) as n FROM newsletter_subscribers WHERE status = 'unsubscribed'");

  return {
    active_subscribers: total?.n || 0,
    new_this_week: thisWeek?.n || 0,
    total_broadcasts: broadcasts?.n || 0,
    unsubscribed: unsubscribed?.n || 0,
  };
}

module.exports = {
  subscribe,
  unsubscribe,
  processWelcomeSequence,
  broadcastNewPost,
  getStats,
  WELCOME_SEQUENCE,
};
