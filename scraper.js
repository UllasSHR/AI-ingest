// scraper.js
// Pulls a day of items from our sources and dumps them to data/YYYY-MM-DD.json.
//
// Run with:  npm run scrape
// Output:    data/YYYY-MM-DD.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import { todayStamp } from './lib/date.js';

// Load credentials for local runs; in CI they arrive as env vars from repo secrets.
try { process.loadEnvFile('.env.local'); } catch { /* no .env.local in CI */ }

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'AI-ingest-scraper/0.1 (personal learning project)';

// ---------- shared shape ----------
// Every source returns items in this normalized shape so downstream code
// doesn't have to know where they came from.
export function makeItem({ title, url, source, score, content, published_at }) {
  return {
    title: (title || '').trim(),
    url,
    source,
    score: score ?? null,
    content: (content || '').trim().slice(0, 2000), // cap so files don't bloat
    published_at: published_at || null,
    fetched_at: new Date().toISOString(),
  };
}

// ---------- source 1: Hacker News (Algolia search) ----------
// Each keyword is wrapped in its own try/catch so a single 429 doesn't discard
// results already collected from the other queries (Task 1.3).
export async function fetchHN() {
  const since = Math.floor((Date.now() - ONE_DAY_MS) / 1000);
  const queries = ['AI', 'LLM', 'Claude', 'Anthropic', 'agent'];
  const items = [];
  let allFailed = true;

  for (const q of queries) {
    try {
      const url =
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}` +
        `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      await new Promise(r => setTimeout(r, 250)); // be polite to Algolia
      for (const hit of data.hits) {
        items.push(makeItem({
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          source: 'hn',
          score: hit.points,
          content: hit.story_text,
          published_at: hit.created_at,
        }));
      }
      allFailed = false;
    } catch (e) {
      console.warn(`  HN[${q}] skipped: ${e.message}`);
    }
  }

  if (allFailed) throw new Error('all HN keyword queries failed');

  // dedup by URL (same story shows up across multiple keyword queries)
  const seen = new Set();
  return items.filter(i => {
    if (!i.url || seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}

// ---------- source 2: Reddit ----------
// Reddit has blocked unauthenticated requests from datacenter IPs since ~2026-06-29.
// When REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set (CI), we fetch an OAuth
// token first and use oauth.reddit.com. Without creds (local residential IP),
// we fall back to the public JSON endpoint.
export async function fetchReddit() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  let token = null;
  let baseUrl = 'https://www.reddit.com';

  if (clientId && clientSecret) {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Reddit OAuth token: ${res.status}`);
    const data = await res.json();
    token = data.access_token;
    baseUrl = 'https://oauth.reddit.com';
  } else {
    console.log('  Reddit: REDDIT_CLIENT_ID/SECRET not set — using public API (may 403 from datacenter IPs)');
  }

  const subs = ['LocalLLaMA', 'ClaudeAI'];
  const items = [];
  let allFailed = true;

  for (const sub of subs) {
    try {
      const url = `${baseUrl}/r/${sub}/top?t=day&limit=25`;
      const headers = { 'User-Agent': USER_AGENT };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      for (const child of data.data.children) {
        const p = child.data;
        items.push(makeItem({
          title: p.title,
          url: `https://www.reddit.com${p.permalink}`,
          source: `reddit/${sub}`,
          score: p.score,
          content: p.selftext,
          published_at: new Date(p.created_utc * 1000).toISOString(),
        }));
      }
      allFailed = false;
    } catch (e) {
      console.warn(`  Reddit[${sub}] skipped: ${e.message}`);
    }
  }

  if (allFailed) throw new Error('all Reddit subreddit fetches failed');
  return items;
}

// ---------- sources 3 & 4: RSS / Atom feeds ----------
export async function fetchRSS(name, url) {
  const parser = new Parser({
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000,
  });
  const feed = await parser.parseURL(url);
  const cutoff = Date.now() - ONE_DAY_MS * 2; // 48h window for low-volume feeds
  return feed.items
    .filter(it => !it.isoDate || new Date(it.isoDate).getTime() > cutoff)
    .map(it => makeItem({
      title: it.title,
      url: it.link,
      source: name,
      content: it.contentSnippet || it.content,
      published_at: it.isoDate,
    }));
}

// ---------- source 5: HuggingFace Daily Papers ----------
export async function fetchHF() {
  const today = todayStamp();
  const url = `https://huggingface.co/api/daily_papers?date=${today}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HF: ${res.status}`);
  const data = await res.json();
  return data.map(p => makeItem({
    title: p.paper?.title,
    url: `https://huggingface.co/papers/${p.paper?.id}`,
    source: 'hf-daily-papers',
    score: p.paper?.upvotes,
    content: p.paper?.summary,
    published_at: p.publishedAt,
  }));
}

// ---------- main ----------
async function main() {
  const start = Date.now();
  console.log('Starting scrape…\n');

  const tasks = [
    ['hn',            fetchHN()],
    ['reddit',        fetchReddit()],
    ['simonwillison', fetchRSS('simonwillison', 'https://simonwillison.net/atom/everything/')],
    // Anthropic has no public RSS; their news reaches HN within hours anyway.
    // ['anthropic',  fetchRSS('anthropic', 'https://www.anthropic.com/news/rss.xml')],
    ['hf',            fetchHF()],
  ];

  const results = await Promise.allSettled(tasks.map(t => t[1]));

  const all = [];
  const summary = [];
  let failures = 0;

  for (let i = 0; i < tasks.length; i++) {
    const name = tasks[i][0];
    const r = results[i];
    if (r.status === 'fulfilled') {
      all.push(...r.value);
      summary.push(`  ✓ ${name.padEnd(16)} ${r.value.length} items`);
      console.log(`  ✓ ${name.padEnd(16)} ${r.value.length} items`);
    } else {
      failures++;
      const msg = r.reason?.message || String(r.reason);
      summary.push(`  ✗ ${name.padEnd(16)} FAILED: ${msg}`);
      console.log(`  ✗ ${name.padEnd(16)} FAILED: ${msg}`);
    }
  }

  // Fail loudly so GitHub emails the user and this broken run can't silently
  // overwrite a good brief with an empty one. GitHub emails on scheduled-job failures.
  const totalSources = tasks.length;
  if (all.length < 10 || failures > totalSources / 2) {
    const failedNames = tasks
      .filter((_, i) => results[i].status === 'rejected')
      .map(t => t[0])
      .join(', ');
    console.error(`\nFATAL: only ${all.length} items from ${totalSources - failures}/${totalSources} sources.`);
    if (failedNames) console.error(`Failed sources: ${failedNames}`);
    process.exit(1);
  }

  const today = todayStamp();
  await fs.mkdir('data', { recursive: true });
  const outPath = path.join('data', `${today}.json`);
  await fs.writeFile(outPath, JSON.stringify({
    date: today,
    fetched_at: new Date().toISOString(),
    summary,
    item_count: all.length,
    items: all,
  }, null, 2));

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nWrote ${all.length} items to ${outPath} in ${seconds}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
