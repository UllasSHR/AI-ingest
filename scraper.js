// scraper.js
// Pulls a day of items from our 5 sources and dumps them to data/YYYY-MM-DD.json.
// No AI yet, no website yet — just prove we can get the raw data in.
//
// Run with:  npm run scrape
// Output:    data/YYYY-MM-DD.json

import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'AI-ingest-scraper/0.1 (personal learning project)';

// ---------- shared shape ----------
// Every source returns items in this normalized shape so downstream code
// (ranker, summarizer, page) doesn't have to know where they came from.
function makeItem({ title, url, source, score, content, published_at }) {
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
async function fetchHN() {
  const since = Math.floor((Date.now() - ONE_DAY_MS) / 1000);
  const queries = ['AI', 'LLM', 'Claude', 'Anthropic', 'agent' , 'codex'];
  const items = [];

  for (const q of queries) {
    const url =
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}` +
      `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HN[${q}]: ${res.status}`);
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
  }

  // dedup by URL (the same story shows up under multiple keyword queries)
  const seen = new Set();
  return items.filter(i => {
    if (!i.url || seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}

// ---------- source 2: Reddit (public JSON, no auth) ----------
async function fetchReddit() {
  const subs = ['LocalLLaMA', 'ClaudeAI'];
  const items = [];

  for (const sub of subs) {
    const url = `https://www.reddit.com/r/${sub}/top.json?t=day&limit=25`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Reddit[${sub}]: ${res.status}`);
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
  }
  return items;
}

// ---------- sources 3 & 4: RSS / Atom feeds ----------
// Simon Willison's blog and the Anthropic news feed both speak RSS/Atom.
// One function handles both.
async function fetchRSS(name, url) {
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
async function fetchHF() {
  const today = new Date().toISOString().slice(0, 10);
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

  // Run all five sources in parallel. allSettled means one failure
  // doesn't kill the whole run — we log it and keep the rest.
  const tasks = [
    ['hn',             fetchHN()],
    ['reddit',         fetchReddit()],
    ['simonwillison',  fetchRSS('simonwillison', 'https://simonwillison.net/atom/everything/')],
    // TODO: Anthropic doesn't expose a public RSS feed. Options for later:
    //   - HTML-scrape https://www.anthropic.com/news (fragile, needs DOM parsing)
    //   - Wait for them to add one
    //   - Rely on HN to surface their announcements (it always does, within hours)
    // ['anthropic',   fetchRSS('anthropic',     'https://www.anthropic.com/news/rss.xml')],
    ['hf',             fetchHF()],
  ];

  const results = await Promise.allSettled(tasks.map(t => t[1]));

  const all = [];
  const summary = [];
  for (let i = 0; i < tasks.length; i++) {
    const name = tasks[i][0];
    const r = results[i];
    if (r.status === 'fulfilled') {
      all.push(...r.value);
      summary.push(`  ${name.padEnd(16)} ${r.value.length} items`);
      console.log(`  ✓ ${name.padEnd(16)} ${r.value.length} items`);
    } else {
      const msg = r.reason?.message || String(r.reason);
      summary.push(`  ${name.padEnd(16)} FAILED: ${msg}`);
      console.log(`  ✗ ${name.padEnd(16)} FAILED: ${msg}`);
    }
  }

  // Write the dump
  const today = new Date().toISOString().slice(0, 10);
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

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
