// opportunity-scraper.js
// Pulls raw "people have a problem" signals from free public sources.
//
// Run with:  npm run opportunity:scrape
// Output:    data/YYYY-MM-DD.opportunities.raw.json

import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const USER_AGENT = 'AI-ingest-opportunity-scraper/0.1 (personal learning project)';

const REDDIT_SUBS = [
  'smallbusiness',
  'freelance',
  'SaaS',
  'Entrepreneur',
  'productivity',
  'Notion',
];

const PROBLEM_QUERIES = [
  'looking for a tool',
  'is there an app',
  'how do you manage',
  'manual process',
  'spreadsheet',
  'automate',
  'pain point',
  'frustrating',
];

const HN_QUERIES = [
  'Ask HN tool for',
  'Ask HN how do you manage',
  'spreadsheet manual process',
  'is there a tool',
  'automate workflow',
  'small business software',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeSignal({
  title,
  url,
  source,
  score,
  comments,
  content,
  published_at,
  query,
}) {
  return {
    title: (title || '').trim(),
    url,
    source,
    score: score ?? null,
    comments: comments ?? null,
    query,
    content: (content || '').trim().slice(0, 2400),
    published_at: published_at || null,
    fetched_at: new Date().toISOString(),
  };
}

function cleanText(text) {
  return (text || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url, label) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${label}: ${res.status}`);
  return res.json();
}

async function fetchRedditSub(sub) {
  const items = [];
  const errors = [];
  const parser = new Parser();

  for (const query of PROBLEM_QUERIES) {
    const url =
      `https://www.reddit.com/r/${sub}/search.rss?` +
      `q=${encodeURIComponent(query)}&restrict_sr=on&sort=new&t=week`;

    try {
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`Reddit RSS[${sub}:${query}]: ${res.status}`);
      const feed = await parser.parseString(await res.text());

      for (const entry of feed.items || []) {
        items.push(makeSignal({
          title: entry.title,
          url: entry.link,
          source: `reddit/${sub}`,
          content: cleanText(entry.contentSnippet || entry.content),
          published_at: entry.isoDate || entry.pubDate,
          query,
        }));
      }
    } catch (e) {
      errors.push(e.message);
    }

    await sleep(350);
  }

  return { items, errors };
}

async function fetchHN() {
  const since = Math.floor(Date.now() / 1000) - WEEK_SECONDS;
  const items = [];
  const errors = [];

  for (const query of HN_QUERIES) {
    for (const tag of ['ask_hn', 'story']) {
      const url =
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
        `&tags=${tag}&numericFilters=created_at_i>${since}&hitsPerPage=25`;

      try {
        const data = await fetchJSON(url, `HN[${tag}:${query}]`);
        for (const hit of data.hits || []) {
          items.push(makeSignal({
            title: hit.title || hit.story_title,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            source: `hn/${tag}`,
            score: hit.points,
            comments: hit.num_comments,
            content: hit.story_text || hit.comment_text,
            published_at: hit.created_at,
            query,
          }));
        }
      } catch (e) {
        errors.push(e.message);
      }

      await sleep(250);
    }
  }

  return { items, errors };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.url || item.title.toLowerCase();
    if (!item.title || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const start = Date.now();
  console.log('Starting opportunity scrape...\n');

  const tasks = [
    ['hn', fetchHN()],
    ...REDDIT_SUBS.map(sub => [`reddit/${sub}`, fetchRedditSub(sub)]),
  ];

  const results = await Promise.allSettled(tasks.map(t => t[1]));
  const all = [];
  const summary = [];

  for (let i = 0; i < tasks.length; i++) {
    const name = tasks[i][0];
    const result = results[i];

    if (result.status === 'fulfilled') {
      all.push(...result.value.items);
      const errorCount = result.value.errors.length;
      const line = `  ${name.padEnd(20)} ${result.value.items.length} signals` +
        (errorCount ? ` (${errorCount} query errors)` : '');
      summary.push(line);
      console.log(line);
    } else {
      const msg = result.reason?.message || String(result.reason);
      summary.push(`  ${name.padEnd(20)} FAILED: ${msg}`);
      console.log(`  ${name.padEnd(20)} FAILED: ${msg}`);
    }
  }

  const items = dedupe(all);
  const today = new Date().toISOString().slice(0, 10);
  await fs.mkdir('data', { recursive: true });

  const outPath = path.join('data', `${today}.opportunities.raw.json`);
  await fs.writeFile(outPath, JSON.stringify({
    date: today,
    fetched_at: new Date().toISOString(),
    summary,
    item_count: items.length,
    items,
  }, null, 2));

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nWrote ${items.length} raw opportunity signals to ${outPath} in ${seconds}s`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
