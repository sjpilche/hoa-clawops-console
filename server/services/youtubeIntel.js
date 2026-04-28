/**
 * @file youtubeIntel.js
 * @description YouTube transcript mining for DC Intel signals via yt-dlp (Agent-Reach).
 *
 * Extracts auto-generated subtitles from industry channels and earnings calls.
 * Feeds extracted insights into DC Intel pipeline via dcPost() webhook.
 *
 * Channels monitored:
 *   - DatacenterDynamics, Uptime Institute, construction industry talks
 *   - EQIX/DLR/QTS earnings call recordings
 *   - Utility company presentations
 *
 * Cost: $0 (yt-dlp is free, no API key)
 * Requires: yt-dlp installed (pip install yt-dlp)
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const YTDLP_TIMEOUT_MS = 60_000;
const TMP_DIR = os.tmpdir();

// yt-dlp is installed via pip to a user Scripts dir — ensure it's on PATH for execFile
const YTDLP_SCRIPTS = path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts');
const YTDLP_ENV = { ...process.env, PATH: `${process.env.PATH}${path.delimiter}${YTDLP_SCRIPTS}` };

// ── Target YouTube searches for DC Intel ────────────────────────────────────

const DC_INTEL_SEARCHES = [
  'data center land acquisition 2026',
  'data center transformer shortage power infrastructure',
  'hyperscale data center construction earnings call',
  'Equinix Vantage Digital Realty investor presentation 2026',
  'Northern Virginia data center development Loudoun',
  'data center power substation grid capacity',
  'data center cooling infrastructure innovation',
  'data center REIT earnings Q1 2026',
];

const CONSTRUCTION_SEARCHES = [
  'construction CFO technology accounting software',
  'contractor financial management automation',
];

// ── Signal keywords for relevance scoring ───────────────────────────────────

// Anchor keywords — DC-infrastructure-specific. At least 1 required to pass.
// Prevents "investment podcast" or "expansion coaching" videos from scoring as intel.
const DC_ANCHOR_KEYWORDS = [
  'data center', 'hyperscale', 'megawatt', 'power capacity',
  'transformer', 'substation', 'land acquisition', 'site selection',
  'rezoning', 'entitlement', 'data center campus',
  'Loudoun', 'Ashburn', 'Prince William', 'Digital Gateway', 'Northern Virginia',
  'Cook County', 'Will County', 'DuPage', 'Joliet', 'Elk Grove',
];

// Supporting keywords — broaden score but can't pass alone
const DC_SUPPORTING_KEYWORDS = [
  'breaking ground', 'groundbreaking', 'lease signed',
  'acquisition', 'billion', 'million', 'expansion',
];

// Combined for backwards compat with extractSnippets
const DC_SIGNAL_KEYWORDS = [...DC_ANCHOR_KEYWORDS, ...DC_SUPPORTING_KEYWORDS];

// ── yt-dlp wrappers ────────────────────────────────────────────────────────

/**
 * Search YouTube and return video metadata.
 * @param {string} query
 * @param {number} count
 * @returns {Promise<object[]>} video metadata objects
 */
function ytSearch(query, count = 5) {
  return new Promise((resolve) => {
    const searchUrl = `ytsearch${count}:${query}`;
    execFile('yt-dlp', ['--dump-json', '--flat-playlist', searchUrl], {
      timeout: YTDLP_TIMEOUT_MS, env: YTDLP_ENV,
    }, (err, stdout) => {
      if (err) {
        console.error(`[YouTubeIntel] Search error: ${err.message}`);
        return resolve([]);
      }
      const videos = (stdout || '').trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);
      resolve(videos);
    });
  });
}

/**
 * Download auto-generated subtitles for a video.
 * @param {string} videoUrl — YouTube URL or video ID
 * @returns {Promise<string|null>} subtitle text or null
 */
function ytSubtitles(videoUrl) {
  return new Promise((resolve) => {
    const videoId = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
      ? videoUrl
      : `https://www.youtube.com/watch?v=${videoUrl}`;

    const outTemplate = path.join(TMP_DIR, `yt-intel-%(id)s`);

    execFile('yt-dlp', [
      '--write-auto-sub',
      '--sub-lang', 'en',
      '--skip-download',
      '--sub-format', 'vtt',
      '-o', outTemplate,
      videoId,
    ], { timeout: YTDLP_TIMEOUT_MS, env: YTDLP_ENV }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[YouTubeIntel] Subtitle download failed: ${err.message}`);
        return resolve(null);
      }

      // Find the downloaded subtitle file
      const idMatch = videoUrl.match(/[?&]v=([^&]+)/) || videoUrl.match(/youtu\.be\/([^?]+)/);
      const id = idMatch ? idMatch[1] : videoUrl;
      const possiblePaths = [
        path.join(TMP_DIR, `yt-intel-${id}.en.vtt`),
        path.join(TMP_DIR, `yt-intel-${id}.en-orig.vtt`),
      ];

      for (const p of possiblePaths) {
        try {
          if (fs.existsSync(p)) {
            const vtt = fs.readFileSync(p, 'utf-8');
            fs.unlinkSync(p); // Clean up
            return resolve(parseVTT(vtt));
          }
        } catch {}
      }

      // Try glob for any matching subtitle file
      try {
        const tmpFiles = fs.readdirSync(TMP_DIR);
        const match = tmpFiles.find(f => f.startsWith(`yt-intel-${id}`) && f.endsWith('.vtt'));
        if (match) {
          const vtt = fs.readFileSync(path.join(TMP_DIR, match), 'utf-8');
          fs.unlinkSync(path.join(TMP_DIR, match));
          return resolve(parseVTT(vtt));
        }
      } catch {}

      resolve(null);
    });
  });
}

/**
 * Parse VTT subtitle file into plain text (deduped, cleaned).
 */
function parseVTT(vtt) {
  const lines = vtt.split('\n')
    .filter(line => !line.match(/^(WEBVTT|NOTE|\d{2}:\d{2})/))
    .filter(line => !line.match(/^$/))
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(line => line.length > 0);

  // Dedup consecutive identical lines (VTT often repeats)
  const deduped = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join(' ').slice(0, 50_000); // Cap at 50K chars
}

// ── Signal Extraction ───────────────────────────────────────────────────────

/**
 * Score transcript text for DC Intel relevance.
 * Requires at least 1 anchor keyword — prevents life coach / crypto / generic
 * investment videos from scoring as data center intel.
 * @param {string} text
 * @returns {{ score: number, matches: string[] }}
 */
function scoreTranscript(text) {
  const lower = text.toLowerCase();
  const anchorMatches = DC_ANCHOR_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
  const supportingMatches = DC_SUPPORTING_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));

  // Must have at least 1 DC-specific anchor keyword
  if (anchorMatches.length === 0) return { score: 0, matches: [] };

  // Anchors worth 0.4 each, supporting worth 0.15 each, cap at 1.0
  const score = Math.min(anchorMatches.length * 0.4 + supportingMatches.length * 0.15, 1.0);
  return { score, matches: [...anchorMatches, ...supportingMatches] };
}

/**
 * Extract key snippets from transcript near keyword matches.
 * @param {string} text
 * @param {string[]} keywords
 * @param {number} contextChars — chars of context around each match
 * @returns {string[]} relevant snippets
 */
function extractSnippets(text, keywords, contextChars = 200) {
  const snippets = [];
  const lower = text.toLowerCase();

  for (const kw of keywords.slice(0, 5)) { // limit to top 5 keywords
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - contextChars);
      const end = Math.min(text.length, idx + kw.length + contextChars);
      snippets.push(`...${text.slice(start, end).trim()}...`);
    }
  }

  return snippets.slice(0, 3); // max 3 snippets
}

// ── Main Scan Function ──────────────────────────────────────────────────────

/**
 * Scan YouTube for DC Intel signals. Returns array of intel notes.
 * @param {object} options
 * @param {string[]} [options.searches] — custom search queries (default: DC_INTEL_SEARCHES)
 * @param {number} [options.maxVideos] — max videos per search (default: 3)
 * @param {number} [options.minScore] — minimum relevance score to include (default: 0.3)
 * @returns {Promise<object[]>} intel notes ready for dcPost
 */
async function scanForIntel(options = {}) {
  const {
    searches = DC_INTEL_SEARCHES,
    maxVideos = 3,
    minScore = 0.3,
  } = options;

  const notes = [];
  const seenVideos = new Set();

  for (const query of searches) {
    console.log(`[YouTubeIntel] Searching: "${query}"`);

    const videos = await ytSearch(query, maxVideos);
    if (videos.length === 0) {
      console.log(`[YouTubeIntel] No results for "${query}"`);
      continue;
    }

    for (const video of videos) {
      const videoId = video.id || video.url || '';
      if (seenVideos.has(videoId)) continue;
      seenVideos.add(videoId);

      // Get video metadata
      const title = video.title || '';
      const channel = video.channel || video.uploader || '';
      const duration = video.duration || 0;
      const viewCount = video.view_count || 0;

      // Skip very short (<2min) or very long (>2hr) videos
      if (duration < 120 || duration > 7200) continue;

      console.log(`[YouTubeIntel] Processing: "${title}" (${channel}, ${Math.round(duration / 60)}min)`);

      // Try to get subtitles
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const transcript = await ytSubtitles(videoUrl);

      if (!transcript || transcript.length < 100) {
        console.log(`[YouTubeIntel] No usable subtitles for "${title}"`);
        continue;
      }

      // Score for relevance
      const { score, matches } = scoreTranscript(transcript);

      if (score < minScore) {
        console.log(`[YouTubeIntel] Low relevance (${score.toFixed(2)}) for "${title}" — skipping`);
        continue;
      }

      // Extract key snippets
      const snippets = extractSnippets(transcript, matches);

      notes.push({
        note_type: 'market_intel',
        content: [
          `📺 YouTube Intel: ${title}`,
          `Channel: ${channel} | Views: ${viewCount.toLocaleString()} | Duration: ${Math.round(duration / 60)}min`,
          `Relevance: ${(score * 100).toFixed(0)}% — keywords: ${matches.join(', ')}`,
          '',
          ...snippets.map((s, i) => `[Snippet ${i + 1}] ${s}`),
        ].join('\n').slice(0, 2000),
        confidence: score >= 0.7 ? 'high' : 'medium',
        source_url: videoUrl,
        source_type: 'youtube_transcript',
        metadata: {
          video_id: videoId,
          channel,
          title,
          duration,
          view_count: viewCount,
          relevance_score: score,
          keyword_matches: matches,
        },
      });

      console.log(`[YouTubeIntel] ✅ Intel note created: "${title}" (score: ${score.toFixed(2)})`);
    }

    // Rate limit between searches
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[YouTubeIntel] Scan complete: ${notes.length} intel notes from ${seenVideos.size} videos`);
  return notes;
}

module.exports = {
  scanForIntel,
  ytSearch,
  ytSubtitles,
  scoreTranscript,
  DC_INTEL_SEARCHES,
  CONSTRUCTION_SEARCHES,
};
