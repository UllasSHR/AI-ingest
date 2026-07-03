// brain.js
// Turns today's raw scrape into a short morning brief tuned to profile.md.
//
// Two stages, to stay cheap and inside the free tier:
//   Stage 1 - FILTER: send only titles -> Gemini returns chosen indices.
//   Stage 2 - BRIEF:  send full content of survivors -> Gemini writes the brief.
//             Model returns only { index, why_it_matters }; we join title/url/source
//             from the scraper data so URLs are never retyped by the model.
//
// Run with:  npm run brief [YYYY-MM-DD]
// Input:     data/YYYY-MM-DD.json        (from scraper.js)
// Output:    data/YYYY-MM-DD.brief.json  +  web/brief.json

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { todayStamp } from './lib/date.js';

// Load .env.local for local runs; CI gets the key from repo secrets.
// The process.exit(1) key check lives inside main() so tests can import
// the utility functions without needing a real key.
try { process.loadEnvFile('.env.local'); } catch { /* no file in CI */ }
const API_KEY = process.env.GEMINI_API_KEY;

// Model fallback chain — if a name is retired, fall through to the next.
const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

// Call Gemini's REST API, trying each model until one answers.
// API key goes in the x-goog-api-key header, not the URL, to keep it out of logs.
async function callGemini(prompt) {
  let lastErr;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
          console.warn(`  ${model}: quota exceeded (429) — trying next model`);
          lastErr = new Error(`${model}: quota exceeded`);
          continue;
        }
        if (res.status === 400 || res.status === 404) {
          lastErr = new Error(`${model}: ${res.status}`);
          continue;
        }
        throw new Error(`${model}: ${res.status} ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`${model}: empty response`);
      console.log(`  (model: ${model})`);
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`All models failed. Last: ${lastErr?.message}`);
}

// ---------- exported utilities (no API key needed) ----------

// Tolerant JSON parse: strip markdown fences and any prose around the JSON.
export function parseJSON(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const starts = ['{', '['].map(c => t.indexOf(c)).filter(i => i !== -1);
  const first = starts.length ? Math.min(...starts) : -1;
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

// Normalize Stage 1 output into a clean array of integer indices.
// Models sometimes return {"indices":[0,1,2]} or {"chosen":[...]} instead of a
// bare array. We also coerce numeric strings and drop out-of-range values.
export function normalizeChosenIndices(parsed, maxIndex) {
  let arr = null;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === 'object') {
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) { arr = val; break; }
    }
  }
  if (!arr) return [];
  return arr
    .map(n => (typeof n === 'string' ? parseInt(n, 10) : n))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= maxIndex);
}

// Validate the assembled brief shape. Also overwrites brief.date with today so
// the model can't sneak in a wrong date.
export function validateBrief(brief, today) {
  if (!brief || typeof brief !== 'object') return false;
  if (!Array.isArray(brief.items)) return false;
  for (const item of brief.items) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.title !== 'string' || !item.title.trim()) return false;
    if (typeof item.url !== 'string' || !item.url.trim()) return false;
    if (typeof item.why_it_matters !== 'string' || !item.why_it_matters.trim()) return false;
  }
  brief.date = today;
  return true;
}

// Find the newest data/YYYY-MM-DD.json file (excludes .brief.json, seen.json, etc.)
// Accepts an optional dir for testing with fixture directories.
export async function newestScrapeFile(dir = 'data') {
  const files = await fs.readdir(dir);
  const scrapeFiles = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) // ISO date + .json only
    .sort()
    .reverse(); // lexicographic = chronological for ISO dates
  if (scrapeFiles.length === 0) throw new Error('No scrape files found in data/');
  return path.join(dir, scrapeFiles[0]);
}

// ---------- cross-day de-dup ----------
const SEEN_PATH = path.join('data', 'seen.json');
const SEEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function loadRecentlySeen() {
  let seen = {};
  try {
    seen = JSON.parse(await fs.readFile(SEEN_PATH, 'utf8'));
  } catch {
    return new Set();
  }
  const cutoff = Date.now() - SEEN_WINDOW_DAYS * DAY_MS;
  return new Set(
    Object.entries(seen)
      .filter(([, iso]) => new Date(iso).getTime() >= cutoff)
      .map(([url]) => url)
  );
}

async function recordShown(briefItems, today) {
  let seen = {};
  try {
    seen = JSON.parse(await fs.readFile(SEEN_PATH, 'utf8'));
  } catch { /* start fresh */ }
  for (const it of briefItems || []) {
    if (it.url) seen[it.url] = today;
  }
  const cutoff = Date.now() - SEEN_WINDOW_DAYS * DAY_MS;
  for (const [url, iso] of Object.entries(seen)) {
    if (new Date(iso).getTime() < cutoff) delete seen[url];
  }
  await fs.writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
}

// ---------- learned preferences ----------
// Capped at 25 liked + 25 disliked (sorted newest first) to avoid token bloat.
export async function buildLearnedPreferences() {
  let feedback = [];
  try {
    feedback = JSON.parse(await fs.readFile(path.join('data', 'feedback.json'), 'utf8'));
  } catch {
    return '';
  }
  if (!Array.isArray(feedback) || feedback.length === 0) return '';

  // Newest first so the caps keep the most recent signals.
  feedback.sort((a, b) => new Date(b.ratedAt || 0) - new Date(a.ratedAt || 0));

  const liked = feedback.filter(f => f.rating >= 4).slice(0, 25).map(f => `- ${f.title}`);
  const disliked = feedback.filter(f => f.rating <= 2).slice(0, 25).map(f => `- ${f.title}`);
  if (liked.length === 0 && disliked.length === 0) return '';

  let out = '\n\n## Learned from my past star ratings (strong signal)\n';
  if (liked.length) out += `\nI rated these HIGH — surface more like them:\n${liked.join('\n')}\n`;
  if (disliked.length) out += `\nI rated these LOW — surface fewer like them:\n${disliked.join('\n')}\n`;
  return out;
}

// ---------- main ----------
async function main() {
  if (!API_KEY || API_KEY.startsWith('PASTE_')) {
    console.error('No real GEMINI_API_KEY in .env.local. Add your key and retry.');
    process.exit(1);
  }

  // Accept an explicit date arg (e.g. node brain.js 2026-07-03), or fall back to
  // the newest scrape file in data/. This makes brain.js immune to date rollover.
  let inPath;
  let today;
  if (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])) {
    today = process.argv[2];
    inPath = path.join('data', `${today}.json`);
    console.log(`Using date arg: ${today}`);
  } else {
    inPath = await newestScrapeFile();
    today = path.basename(inPath, '.json');
    console.log(`Using newest scrape file: ${inPath}`);
  }

  const profile = await fs.readFile('profile.md', 'utf8');

  let raw;
  try {
    raw = JSON.parse(await fs.readFile(inPath, 'utf8'));
  } catch {
    console.error(`Cannot read scrape file: ${inPath}`);
    process.exit(1);
  }

  // An empty scrape is a broken pipeline — not a quiet day.
  // Exit without touching the brief files so yesterday's good brief survives.
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    console.error('Scrape file has no items — pipeline is broken. Aborting to preserve the last good brief.');
    process.exit(1);
  }

  const recentlySeen = await loadRecentlySeen();
  const items = raw.items.filter(it => !recentlySeen.has(it.url));
  console.log(`Loaded ${raw.items.length} items; ${items.length} fresh after de-dup\n`);

  // Zero fresh items after de-dup is a legitimately quiet day — not a pipeline failure.
  if (items.length === 0) {
    const empty = { date: today, items: [] };
    await fs.writeFile(path.join('data', `${today}.brief.json`), JSON.stringify(empty, null, 2));
    await fs.writeFile(path.join('web', 'brief.json'), JSON.stringify(empty, null, 2));
    console.log('Nothing new today — wrote an empty brief.');
    return;
  }

  const learned = await buildLearnedPreferences();

  // ---------- Stage 1: FILTER (titles only) ----------
  const titleList = items
    .map((it, i) => `${i}. [${it.source}, score ${it.score ?? '-'}] ${it.title}`)
    .join('\n');

  const filterPrompt = `You are filtering a day of AI/tech news for one specific person. Here is exactly who they are and what they care about:

<profile>
${profile}${learned}
</profile>

Below are today's ${items.length} candidate items as "index. [source, score] title". Pick the items most relevant to THIS person per their profile. Cluster duplicates (same story) and keep only the best from each cluster. Keep AT MOST 20.

Respond with ONLY a JSON array of the chosen indices, most relevant first. Example: [12, 47, 3]

<items>
${titleList}
</items>`;

  console.log(`Stage 1: filtering ${items.length} -> shortlist...`);
  let survivors;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const raw1 = parseJSON(await callGemini(filterPrompt));
      const indices = normalizeChosenIndices(raw1, items.length - 1);
      if (indices.length > 0) {
        survivors = indices.map(i => items[i]).filter(Boolean).slice(0, 20);
        break;
      }
      console.warn(`  Stage 1 attempt ${attempt + 1}: no usable indices from model`);
    } catch (e) {
      console.warn(`  Stage 1 attempt ${attempt + 1} error: ${e.message}`);
    }
    if (attempt === 1) {
      console.error('Stage 1 failed twice. Aborting.');
      process.exit(1);
    }
    console.log('  Retrying Stage 1...');
  }
  console.log(`  shortlisted ${survivors.length} items\n`);

  // ---------- Stage 2: BRIEF (full content of survivors) ----------
  // The model returns only { index, why_it_matters } — never title/url/source.
  // We join from survivors so URLs are always the scraper's originals, not retyped.
  const detailList = survivors
    .map((it, i) =>
      `### ${i + 1}. ${it.title}\nsource: ${it.source} | score: ${it.score ?? '-'} | url: ${it.url}\n${(it.content || '').slice(0, 800)}`)
    .join('\n\n');

  const briefPrompt = `You are writing a short morning AI-news brief for one specific person. Here is who they are:

<profile>
${profile}${learned}
</profile>

From the candidates below, choose up to 15 items worth surfacing and write their brief, RANKED most-important first. The top 3-5 are the day's essentials (the reader may stop there); the rest are "more if they have time", so quality must stay high all the way down — no filler to reach 15. Follow the profile's rules exactly:
- Rank "someone shipping" stories highest.
- Every item's explanation MUST end with one concrete thing they could try THIS WEEK with what they already have. If you can't write that sentence honestly, drop the item.
- Plain English, no hype words, one short paragraph per item.
- If it's genuinely a quiet day, return fewer items (even zero) rather than padding.

Respond with ONLY valid JSON in this exact shape — use the 1-based candidate number as the index:
{
  "date": "${today}",
  "items": [
    { "index": 3, "why_it_matters": "what changed; why it matters to them specifically; and ONE concrete thing to try this week" }
  ]
}

<candidates>
${detailList}
</candidates>`;

  console.log('Stage 2: writing the brief...');
  let brief = null;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const raw2 = parseJSON(await callGemini(briefPrompt));

      // Build the real brief by joining survivor data with the model's why_it_matters.
      // Duplicate and out-of-range indices are silently dropped.
      const seenIndices = new Set();
      const briefItems = (raw2.items || [])
        .filter(entry => {
          const idx = Number(entry.index) - 1; // 1-based → 0-based
          if (!Number.isInteger(idx) || idx < 0 || idx >= survivors.length) return false;
          if (seenIndices.has(idx)) return false;
          seenIndices.add(idx);
          return true;
        })
        .map(entry => {
          const src = survivors[Number(entry.index) - 1];
          return {
            title: src.title,
            url: src.url,
            source: src.source,
            why_it_matters: entry.why_it_matters,
          };
        });

      const candidate = { date: today, items: briefItems };
      if (validateBrief(candidate, today)) {
        brief = candidate;
        break;
      }
      console.warn(`  Stage 2 attempt ${attempt + 1}: brief failed validation`);
    } catch (e) {
      console.warn(`  Stage 2 attempt ${attempt + 1} error: ${e.message}`);
    }
    if (attempt === 1) {
      console.error('Stage 2 failed twice. Aborting without writing files — yesterday\'s brief is preserved.');
      process.exit(1);
    }
    console.log('  Retrying Stage 2...');
  }

  const outPath = path.join('data', `${today}.brief.json`);
  await fs.writeFile(outPath, JSON.stringify(brief, null, 2));
  console.log(`\nWrote ${brief.items.length} items to ${outPath}`);

  const webPath = path.join('web', 'brief.json');
  await fs.writeFile(webPath, JSON.stringify(brief, null, 2));
  console.log(`Published to ${webPath}`);

  await recordShown(brief.items, today);

  console.log('\n========== TODAY\'S BRIEF ==========');
  for (const it of brief.items) {
    console.log(`\n• ${it.title}  [${it.source}]`);
    console.log(`  ${it.why_it_matters}`);
    console.log(`  ${it.url}`);
  }
  console.log('\n===================================');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
