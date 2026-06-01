// brain.js
// Turns today's raw scrape into a short morning brief tuned to profile.md.
//
// Two stages, to stay cheap and inside the free tier:
//   Stage 1 - FILTER: send only titles of all items -> Gemini returns the
//             indices of the most relevant ones (and clusters duplicates).
//   Stage 2 - BRIEF:  send full content of the survivors -> Gemini writes
//             the "what changed / why it matters to you / try this" brief.
//
// Run with:  npm run brief
// Input:     data/YYYY-MM-DD.json        (from scraper.js)
// Output:    data/YYYY-MM-DD.brief.json

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Load GEMINI_API_KEY from .env.local for local runs. In CI (GitHub Actions)
// there is no .env.local — the key arrives as an environment variable from a
// repo secret — so a missing file is fine, not an error.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* no .env.local (e.g. running in CI) — fall back to process.env */
}
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY || API_KEY.startsWith('PASTE_')) {
  console.error('No real GEMINI_API_KEY in .env.local. Add your key and retry.');
  process.exit(1);
}

// Model fallback chain — if a name is retired, fall through to the next.
// (Straight from the "model deprecation" landmine in CLAUDE.md.)
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

// Call Gemini's REST API, trying each model until one answers.
async function callGemini(prompt) {
  let lastErr;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        // 400/404 usually = bad/retired model name -> try the next one.
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

// Tolerant JSON parse: strip markdown fences and any prose around the JSON.
// (From the "tolerant JSON parsing" landmine in CLAUDE.md.)
function parseJSON(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const starts = ['{', '['].map(c => t.indexOf(c)).filter(i => i !== -1);
  const first = starts.length ? Math.min(...starts) : -1;
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

// ---------- cross-day de-dup ----------
// A story can trend for several days; without memory it would reappear every
// morning. We remember the URLs shown in past briefs (last 7 days) and skip them.
const SEEN_PATH = path.join('data', 'seen.json');
const SEEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function loadRecentlySeen() {
  let seen = {};
  try {
    seen = JSON.parse(await fs.readFile(SEEN_PATH, 'utf8'));
  } catch {
    return new Set(); // no memory yet
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
  } catch {
    /* start fresh */
  }
  for (const it of briefItems || []) {
    if (it.url) seen[it.url] = today;
  }
  // prune anything older than the window so the file can't grow forever
  const cutoff = Date.now() - SEEN_WINDOW_DAYS * DAY_MS;
  for (const [url, iso] of Object.entries(seen)) {
    if (new Date(iso).getTime() < cutoff) delete seen[url];
  }
  await fs.writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
}

// Read data/feedback.json (star ratings from the web page) and turn it into a
// short instruction block the model can use as a personalization signal.
async function buildLearnedPreferences() {
  let feedback = [];
  try {
    feedback = JSON.parse(await fs.readFile(path.join('data', 'feedback.json'), 'utf8'));
  } catch {
    return ''; // no feedback yet
  }
  if (!Array.isArray(feedback) || feedback.length === 0) return '';

  const liked = feedback.filter(f => f.rating >= 4).map(f => `- ${f.title}`);
  const disliked = feedback.filter(f => f.rating <= 2).map(f => `- ${f.title}`);
  if (liked.length === 0 && disliked.length === 0) return '';

  let out = '\n\n## Learned from my past star ratings (strong signal)\n';
  if (liked.length) out += `\nI rated these HIGH — surface more like them:\n${liked.join('\n')}\n`;
  if (disliked.length) out += `\nI rated these LOW — surface fewer like them:\n${disliked.join('\n')}\n`;
  return out;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const inPath = path.join('data', `${today}.json`);

  const profile = await fs.readFile('profile.md', 'utf8');
  const raw = JSON.parse(await fs.readFile(inPath, 'utf8'));

  // Drop items already shown in a brief in the last 7 days (cross-day de-dup).
  const recentlySeen = await loadRecentlySeen();
  const items = raw.items.filter(it => !recentlySeen.has(it.url));
  console.log(`Loaded ${raw.items.length} items; ${items.length} fresh after de-dup\n`);

  // If everything was already shown, it's a genuinely quiet day — write an
  // empty brief rather than forcing repeats, and skip the LLM calls.
  if (items.length === 0) {
    const today2 = today;
    const empty = { date: today2, items: [] };
    await fs.writeFile(path.join('data', `${today2}.brief.json`), JSON.stringify(empty, null, 2));
    await fs.writeFile(path.join('web', 'brief.json'), JSON.stringify(empty, null, 2));
    console.log('Nothing new today — wrote an empty brief.');
    return;
  }

  // Learned preferences: the star ratings the user gave on the web page.
  // High-rated titles steer the brief toward similar items; low-rated away.
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
  const chosen = parseJSON(await callGemini(filterPrompt));
  const survivors = chosen.map(i => items[i]).filter(Boolean).slice(0, 20);
  console.log(`  shortlisted ${survivors.length} items\n`);

  // ---------- Stage 2: BRIEF (full content of survivors) ----------
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

Respond with ONLY valid JSON in this exact shape:
{
  "date": "${today}",
  "items": [
    { "title": "...", "url": "...", "source": "...", "why_it_matters": "what changed; why it matters to them specifically; and ONE concrete thing to try this week" }
  ]
}

<candidates>
${detailList}
</candidates>`;

  console.log('Stage 2: writing the brief...');
  const brief = parseJSON(await callGemini(briefPrompt));

  const outPath = path.join('data', `${today}.brief.json`);
  await fs.writeFile(outPath, JSON.stringify(brief, null, 2));
  console.log(`\nWrote ${brief.items?.length ?? 0} items to ${outPath}`);

  // Publish to the web app too, so the site always serves the latest brief.
  const webPath = path.join('web', 'brief.json');
  await fs.writeFile(webPath, JSON.stringify(brief, null, 2));
  console.log(`Published to ${webPath}`);

  // Remember what we showed so it won't reappear in the next few days.
  await recordShown(brief.items, today);

  // Print so we can eyeball the result (verification rule).
  console.log('\n========== TODAY\'S BRIEF ==========');
  for (const it of brief.items || []) {
    console.log(`\n• ${it.title}  [${it.source}]`);
    console.log(`  ${it.why_it_matters}`);
    console.log(`  ${it.url}`);
  }
  console.log('\n===================================');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
