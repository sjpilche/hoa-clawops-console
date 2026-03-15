/**
 * @file rseTranscriptService.js
 * @description YouTube transcript extraction for the Revenue Signal Engine.
 *
 * HOW IT WORKS:
 *   1. checkNewVideos(source) — Parse YouTube RSS feed, dedup against rse_transcripts
 *   2. extractTranscript(videoId) — yt-dlp auto-subs → parse VTT → clean text
 *   3. resolveChannelId(channelUrl) — yt-dlp to get channel ID from URL
 *
 * COST: $0 — YouTube RSS (free, no auth) + yt-dlp (free CLI)
 * FALLBACK: Piped/Invidious API if yt-dlp fails
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { all, run, get } = require('../db/connection');

const execFileAsync = promisify(execFile);

const PYTHON = process.env.PYTHON_PATH || 'python';
const MAX_YT_DLP_CALLS_PER_HOUR = 50;
let ytDlpCallCount = 0;
let ytDlpCallResetAt = Date.now() + 3600000;

// Piped/Invidious instances (shared with idleTrainer.js)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://vid.puffyan.us',
  'https://invidious.fdn.fr',
  'https://invidious.nerdvpn.de',
];

// ════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════════════════════════════════════

function checkRateLimit() {
  if (Date.now() > ytDlpCallResetAt) {
    ytDlpCallCount = 0;
    ytDlpCallResetAt = Date.now() + 3600000;
  }
  if (ytDlpCallCount >= MAX_YT_DLP_CALLS_PER_HOUR) {
    return false;
  }
  ytDlpCallCount++;
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// RSS FEED PARSING — YouTube provides free Atom feeds per channel
// ════════════════════════════════════════════════════════════════════════════

/**
 * Check a source for new videos via YouTube RSS feed.
 * @param {Object} source - Row from rse_sources
 * @returns {Object[]} Array of { videoId, title, publishedAt, videoUrl }
 */
async function checkNewVideos(source) {
  const rssUrl = source.rss_url || buildRssUrl(source.channel_id);
  if (!rssUrl) {
    console.log(`[RSE] No RSS URL or channel_id for source: ${source.name}`);
    return [];
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(rssUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ClawOps-RSE/1.0' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.log(`[RSE] RSS fetch failed for ${source.name}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const videos = parseAtomFeed(xml);

    // Dedup against existing transcripts
    const existingIds = new Set(
      all('SELECT video_id FROM rse_transcripts WHERE source_id = ?', [source.id])
        .map(r => r.video_id)
    );

    const newVideos = videos.filter(v => !existingIds.has(v.videoId));
    console.log(`[RSE] ${source.name}: ${videos.length} in RSS, ${newVideos.length} new`);
    return newVideos;
  } catch (err) {
    console.error(`[RSE] RSS error for ${source.name}:`, err.message);
    return [];
  }
}

function buildRssUrl(channelId) {
  if (!channelId) return null;
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Parse YouTube Atom RSS feed XML into video entries.
 * No XML library needed — YouTube's feed is very consistent.
 */
function parseAtomFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = extractTag(entry, 'yt:videoId');
    const title = extractTag(entry, 'title');
    const published = extractTag(entry, 'published');

    if (videoId) {
      entries.push({
        videoId,
        title: title || 'Unknown',
        publishedAt: published || null,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
  }

  return entries;
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSCRIPT EXTRACTION — yt-dlp primary, Piped fallback
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract transcript for a YouTube video.
 * @param {string} videoId - YouTube video ID
 * @returns {{ text: string, lang: string, source: string, wordCount: number } | null}
 */
async function extractTranscript(videoId) {
  // Input validation — videoId must be alphanumeric + hyphens/underscores (YouTube format)
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    console.warn(`[RSE] Invalid videoId rejected: "${videoId}"`);
    return null;
  }
  // Try yt-dlp first
  const ytResult = await extractViaYtDlp(videoId);
  if (ytResult) return ytResult;

  // Fallback: Piped API
  const pipedResult = await extractViaPiped(videoId);
  if (pipedResult) return pipedResult;

  console.log(`[RSE] Failed to extract transcript for ${videoId}`);
  return null;
}

/**
 * Extract transcript via yt-dlp CLI.
 * Uses python -m yt_dlp to avoid PATH/permission issues on Windows.
 */
async function extractViaYtDlp(videoId) {
  if (!checkRateLimit()) {
    console.log('[RSE] yt-dlp rate limit hit, skipping');
    return null;
  }

  const tmpDir = path.join(os.tmpdir(), `rse-${videoId}`);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Download auto-subs only, skip video
    await execFileAsync(PYTHON, [
      '-m', 'yt_dlp',
      '--write-auto-subs',
      '--sub-lang', 'en',
      '--skip-download',
      '--sub-format', 'vtt',
      '-o', path.join(tmpDir, '%(id)s.%(ext)s'),
      videoUrl,
    ], { timeout: 60000 });

    // Find the VTT file
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.vtt'));
    if (files.length === 0) {
      console.log(`[RSE] No VTT file found for ${videoId}`);
      return null;
    }

    const vttPath = path.join(tmpDir, files[0]);
    const vttContent = fs.readFileSync(vttPath, 'utf-8');
    const text = parseVtt(vttContent);

    if (!text || text.length < 100) {
      console.log(`[RSE] Transcript too short for ${videoId}: ${text?.length || 0} chars`);
      return null;
    }

    const wordCount = text.split(/\s+/).length;
    return { text, lang: 'en', source: 'yt-dlp', wordCount };
  } catch (err) {
    console.log(`[RSE] yt-dlp failed for ${videoId}: ${err.message}`);
    return null;
  } finally {
    // Cleanup temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Parse VTT subtitle file into clean text.
 * Removes timestamps, duplicate lines (YouTube auto-subs repeat), and formatting tags.
 */
function parseVtt(vttContent) {
  const lines = vttContent.split('\n');
  const textLines = [];
  const seen = new Set();

  for (const line of lines) {
    // Skip header, timestamps, blank lines, position tags
    if (line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    if (/^\d{2}:\d{2}/.test(line)) continue;  // Timestamp lines
    if (line.trim() === '') continue;
    if (/^NOTE/.test(line)) continue;
    if (/^[\d\s]*$/.test(line.trim())) continue;  // Cue numbers

    // Strip HTML tags (YouTube uses <c> tags for word timing)
    let clean = line.replace(/<[^>]+>/g, '').trim();
    if (!clean) continue;

    // Dedup consecutive identical lines (YouTube auto-subs repeat heavily)
    if (seen.has(clean)) continue;
    seen.add(clean);

    textLines.push(clean);
  }

  return textLines.join(' ');
}

/**
 * Fallback: Try Piped API for transcript.
 */
async function extractViaPiped(videoId) {
  for (const instance of PIPED_INSTANCES) {
    if (!instance.includes('piped')) continue;  // Only Piped has transcript endpoint

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'ClawOps-RSE/1.0' },
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = await res.json();

      // Piped returns subtitles array with url field
      const enSubs = (data.subtitles || []).find(s =>
        s.code === 'en' || s.autoGenerated && s.code?.startsWith('en')
      );

      if (!enSubs?.url) continue;

      // Fetch the actual subtitle content
      const subRes = await fetch(enSubs.url, { timeout: 10000 });
      if (!subRes.ok) continue;

      const subText = await subRes.text();
      const text = parseVtt(subText);

      if (text && text.length >= 100) {
        const wordCount = text.split(/\s+/).length;
        return { text, lang: 'en', source: 'piped', wordCount };
      }
    } catch { continue; }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// CHANNEL ID RESOLUTION — resolve @handle URLs to channel IDs
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a YouTube channel URL to its channel ID.
 * Uses yt-dlp --print channel_id on the channel URL.
 */
async function resolveChannelId(channelUrl) {
  // URL validation — must be a YouTube channel/handle URL
  if (!channelUrl || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrl)) {
    console.warn(`[RSE] Invalid channel URL rejected: "${channelUrl}"`);
    return null;
  }
  if (!checkRateLimit()) return null;

  try {
    const { stdout } = await execFileAsync(PYTHON, [
      '-m', 'yt_dlp',
      '--print', 'channel_id',
      '--playlist-items', '1',
      channelUrl,
    ], { timeout: 30000 });

    const channelId = stdout.trim();
    if (channelId && channelId.startsWith('UC')) {
      return channelId;
    }
  } catch (err) {
    console.log(`[RSE] Channel ID resolution failed for ${channelUrl}: ${err.message}`);
  }

  return null;
}

/**
 * Get video metadata (duration, view count) via yt-dlp.
 */
async function getVideoMetadata(videoId) {
  if (!checkRateLimit()) return {};

  try {
    const { stdout } = await execFileAsync(PYTHON, [
      '-m', 'yt_dlp',
      '--print', '%(duration)s|%(view_count)s',
      '--skip-download',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 20000 });

    const parts = stdout.trim().split('|');
    return {
      durationSecs: parseInt(parts[0]) || 0,
      viewCount: parseInt(parts[1]) || 0,
    };
  } catch {
    return {};
  }
}

/**
 * Content hash for dedup.
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ════════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL ORCHESTRATION — called by special handlers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Discover new videos from all enabled sources.
 * Called by rse_channel_monitor handler.
 */
async function discoverNewVideos() {
  const sources = all('SELECT * FROM rse_sources WHERE enabled = 1');
  let totalNew = 0;
  let sourcesChecked = 0;

  for (const source of sources) {
    // Resolve channel_id if missing
    if (!source.channel_id && source.channel_url) {
      const channelId = await resolveChannelId(source.channel_url);
      if (channelId) {
        run('UPDATE rse_sources SET channel_id = ?, rss_url = ? WHERE id = ?', [
          channelId,
          buildRssUrl(channelId),
          source.id,
        ]);
        source.channel_id = channelId;
        source.rss_url = buildRssUrl(channelId);
        console.log(`[RSE] Resolved channel ID for ${source.name}: ${channelId}`);
      }
    }

    const newVideos = await checkNewVideos(source);

    for (const video of newVideos) {
      run(`INSERT OR IGNORE INTO rse_transcripts (source_id, video_id, video_url, title, published_at, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`, [
        source.id, video.videoId, video.videoUrl, video.title, video.publishedAt,
      ]);
    }

    run('UPDATE rse_sources SET last_scanned_at = datetime(\'now\'), total_videos_scanned = total_videos_scanned + ? WHERE id = ?', [
      newVideos.length, source.id,
    ]);

    totalNew += newVideos.length;
    sourcesChecked++;
  }

  return { totalNew, sourcesChecked };
}

/**
 * Extract transcripts for pending videos.
 * Called by rse_transcript_extractor handler.
 */
async function extractPendingTranscripts(limit = 15) {
  const pending = all(
    `SELECT t.*, s.name AS source_name FROM rse_transcripts t
     JOIN rse_sources s ON s.id = t.source_id
     WHERE t.status = 'pending'
     ORDER BY t.created_at ASC LIMIT ?`, [limit]
  );

  let extracted = 0, failed = 0, skipped = 0;
  const results = [];

  for (const row of pending) {
    console.log(`[RSE] Extracting transcript: "${row.title}" (${row.video_id})`);

    const result = await extractTranscript(row.video_id);

    if (!result) {
      run('UPDATE rse_transcripts SET status = \'rejected\' WHERE id = ?', [row.id]);
      failed++;
      results.push({ videoId: row.video_id, title: row.title, status: 'failed' });
      continue;
    }

    if (result.wordCount < 500) {
      run('UPDATE rse_transcripts SET status = \'rejected\', word_count = ? WHERE id = ?', [
        result.wordCount, row.id,
      ]);
      skipped++;
      results.push({ videoId: row.video_id, title: row.title, status: 'too_short', wordCount: result.wordCount });
      continue;
    }

    // Get metadata
    const meta = await getVideoMetadata(row.video_id);

    const hash = contentHash(result.text);
    run(`UPDATE rse_transcripts SET
         transcript_text = ?, transcript_lang = ?, transcript_source = ?,
         word_count = ?, content_hash = ?, duration_secs = ?, view_count = ?,
         status = 'transcribed', scraped_at = datetime('now')
         WHERE id = ?`, [
      result.text, result.lang, result.source,
      result.wordCount, hash, meta.durationSecs || 0, meta.viewCount || 0,
      row.id,
    ]);

    extracted++;
    results.push({ videoId: row.video_id, title: row.title, status: 'ok', wordCount: result.wordCount });
  }

  return { extracted, failed, skipped, total: pending.length, results };
}

module.exports = {
  checkNewVideos,
  extractTranscript,
  resolveChannelId,
  getVideoMetadata,
  discoverNewVideos,
  extractPendingTranscripts,
  contentHash,
  parseVtt,
};
