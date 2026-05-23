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

// Load GEMINI_API_KEY from .env.local using Node's built-in env loader (no dep).
process.loadEnvFile('.env.local');
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY || API_KEY.startsWith('PASTE_')) {
  console.error('No real GEMINI_API_KEY in .env.local. Add your key and retry.');
  process.exit(1);
}

// Model fallback chain — if a name is retired, fall through to the next.
// (Straight from the "model deprecation" landmine in CLAUDE.md.)
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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
  const items = raw.items;
  console.log(`Loaded ${items.length} items from ${inPath}\n`);

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

Below are today's ${items.length} candidate items as "index. [source, score] title". Pick the items most relevant to THIS person per their profile. Cluster duplicates (same story) and keep only the best from each cluster. Keep AT MOST 12.

Respond with ONLY a JSON array of the chosen indices, most relevant first. Example: [12, 47, 3]

<items>
${titleList}
</items>`;

  console.log(`Stage 1: filtering ${items.length} -> shortlist...`);
  const chosen = parseJSON(await callGemini(filterPrompt));
  const survivors = chosen.map(i => items[i]).filter(Boolean).slice(0, 12);
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

From the candidates below, choose the 3-5 that genuinely matter most to THIS person and write their brief. Follow the profile's rules exactly:
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
