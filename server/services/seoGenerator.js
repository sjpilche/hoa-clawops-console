/**
 * @file seoGenerator.js
 * @description Generates SEO assets (sitemap.xml, robots.txt, schema.org JSON-LD)
 * and pushes them to the hoaprojectfunding.com GitHub repo alongside blog posts.
 *
 * Called by githubPublisher.js after each blog post publish.
 *
 * Exports:
 *   generateSitemap()    — builds sitemap.xml from all published posts
 *   generateRobotsTxt()  — builds robots.txt with sitemap reference
 *   generateArticleLD(post) — builds schema.org Article JSON-LD for a post
 *   generateOGTags(post)    — builds Open Graph meta tags for a post
 *   pushSEOAssets()      — pushes sitemap + robots.txt to GitHub
 */

const { all } = require('../db/connection');

const SITE_URL = 'https://hoaprojectfunding.com';
const SITE_NAME = 'HOA Project Funding';

// Escape XML special characters
function escXml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Generate sitemap.xml from all published blog posts.
 */
function generateSitemap() {
  // Get all published posts from content_pieces
  const posts = all(`
    SELECT title, created_at, updated_at
    FROM cfo_content_pieces
    WHERE status = 'published' AND channel = 'blog'
    ORDER BY created_at DESC
  `) || [];

  // Also try the blog post index if posts table is empty
  const slugs = posts.map(p => {
    const slug = (p.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
    return { slug, lastmod: (p.updated_at || p.created_at || new Date().toISOString()).slice(0, 10) };
  }).filter(s => s.slug && s.slug.length > 0); // Filter out empty slugs to prevent duplicates

  const urls = [
    // Static pages
    { loc: SITE_URL, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/about`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${SITE_URL}/contact`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${SITE_URL}/blog`, priority: '0.9', changefreq: 'daily' },
    // Blog posts
    ...slugs.map(s => ({
      loc: `${SITE_URL}/blog/${s.slug}`,
      lastmod: s.lastmod,
      priority: '0.7',
      changefreq: 'monthly',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${escXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return xml;
}

/**
 * Generate robots.txt.
 */
function generateRobotsTxt() {
  return `# HOA Project Funding — robots.txt
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml

# Block admin/api paths
Disallow: /api/
Disallow: /admin/
`;
}

/**
 * Generate schema.org Article JSON-LD for a blog post.
 * Embed this in the page's <script type="application/ld+json"> tag.
 */
function generateArticleLD(post) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title || post.meta_title || 'HOA Project Funding',
    description: post.meta_description || post.description || '',
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    datePublished: post.date || post.created_at || new Date().toISOString(),
    dateModified: post.updated_at || post.date || new Date().toISOString(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/blog/${post.slug}`,
    },
    keywords: post.primary_keyword
      ? [post.primary_keyword, ...(post.secondary_keywords || [])]
      : undefined,
  }, null, 2);
}

/**
 * Generate Open Graph + Twitter Card meta tags for a blog post.
 * Returns an object of tag name → content pairs.
 */
function generateOGTags(post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    'og:type': 'article',
    'og:title': post.meta_title || post.title || SITE_NAME,
    'og:description': post.meta_description || post.description || '',
    'og:url': url,
    'og:site_name': SITE_NAME,
    'og:locale': 'en_US',
    'article:published_time': post.date || post.created_at,
    'article:author': SITE_URL,
    'twitter:card': 'summary_large_image',
    'twitter:title': post.meta_title || post.title || SITE_NAME,
    'twitter:description': post.meta_description || post.description || '',
  };
}

/**
 * Generate UTM-tagged URL for outreach/social links.
 */
function generateUTMLink(baseUrl, params = {}) {
  const {
    source = 'email',
    medium = 'outreach',
    campaign = '',
    content = '',
    term = '',
  } = params;

  const url = new URL(baseUrl);
  if (source) url.searchParams.set('utm_source', source);
  if (medium) url.searchParams.set('utm_medium', medium);
  if (campaign) url.searchParams.set('utm_campaign', campaign);
  if (content) url.searchParams.set('utm_content', content);
  if (term) url.searchParams.set('utm_term', term);

  return url.toString();
}

/**
 * Get the next content calendar entry for a given agent.
 * Used by content writers to pick their next topic.
 */
function getNextCalendarEntry(agentName) {
  const today = new Date().toISOString().slice(0, 10);
  return require('../db/connection').get(`
    SELECT * FROM content_calendar
    WHERE assigned_agent = ? AND status = 'planned' AND scheduled_date >= ?
    ORDER BY scheduled_date ASC LIMIT 1
  `, [agentName, today]);
}

/**
 * Mark a calendar entry as drafted/published.
 */
function updateCalendarStatus(calendarId, status, contentPieceId = null) {
  const { run } = require('../db/connection');
  run(`UPDATE content_calendar SET status = ?, content_piece_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, contentPieceId, calendarId]);
}

module.exports = {
  generateSitemap,
  generateRobotsTxt,
  generateArticleLD,
  generateOGTags,
  generateUTMLink,
  getNextCalendarEntry,
  updateCalendarStatus,
  SITE_URL,
  SITE_NAME,
};
