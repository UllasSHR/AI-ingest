// opportunity-brain.js
// Turns raw problem signals into a short market-opportunity tab tuned to profile.md.
//
// Run with:  npm run opportunity:brief
// Input:     data/YYYY-MM-DD.opportunities.raw.json
// Output:    data/YYYY-MM-DD.opportunities.json

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* no .env.local in CI */
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY || API_KEY.startsWith('PASTE_')) {
  console.error('No real GEMINI_API_KEY in .env.local. Add your key and retry.');
  process.exit(1);
}

const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
const SEEN_PATH = path.join('data', 'opportunities-seen.json');
const SEEN_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SIGNALS_FOR_FILTER = 180;

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
          generationConfig: { temperature: 0.35 },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
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

function parseJSON(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const starts = ['{', '['].map(c => t.indexOf(c)).filter(i => i !== -1);
  const first = starts.length ? Math.min(...starts) : -1;
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

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

async function recordShown(items, today) {
  let seen = {};
  try {
    seen = JSON.parse(await fs.readFile(SEEN_PATH, 'utf8'));
  } catch {
    /* start fresh */
  }

  for (const item of items || []) {
    if (item.url) seen[item.url] = today;
  }

  const cutoff = Date.now() - SEEN_WINDOW_DAYS * DAY_MS;
  for (const [url, iso] of Object.entries(seen)) {
    if (new Date(iso).getTime() < cutoff) delete seen[url];
  }

  await fs.writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
}

function normalizeOpportunity(raw, fallback) {
  const difficulty = String(raw.difficulty || '').toLowerCase();
  return {
    title: String(raw.title || fallback.title || '').trim(),
    customer: String(raw.customer || '').trim(),
    source_problem: String(raw.source_problem || '').trim(),
    willingness_to_pay: String(raw.willingness_to_pay || '').trim(),
    build_shape: String(raw.build_shape || '').trim(),
    difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
    first_action: String(raw.first_action || '').trim(),
    proof: String(raw.proof || '').trim(),
    price_hint: String(raw.price_hint || 'USD 10-20/mo').trim(),
    url: String(raw.url || fallback.url || '').trim(),
    source: String(raw.source || fallback.source || '').trim(),
  };
}

function diversifyBySource(items, limit) {
  const groups = new Map();
  for (const item of items) {
    const key = item.source || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const out = [];
  while (out.length < limit && groups.size) {
    for (const [source, group] of groups) {
      const next = group.shift();
      if (next) out.push(next);
      if (group.length === 0) groups.delete(source);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const inPath = path.join('data', `${today}.opportunities.raw.json`);

  const profile = await fs.readFile('profile.md', 'utf8');
  const raw = JSON.parse(await fs.readFile(inPath, 'utf8'));

  const recentlySeen = await loadRecentlySeen();
  const items = raw.items.filter(item => !recentlySeen.has(item.url));
  console.log(`Loaded ${raw.items.length} signals; ${items.length} fresh after de-dup\n`);

  if (items.length === 0) {
    const empty = { date: today, items: [] };
    await fs.writeFile(path.join('data', `${today}.opportunities.json`), JSON.stringify(empty, null, 2));
    await fs.writeFile(path.join('web', 'opportunities.json'), JSON.stringify(empty, null, 2));
    console.log('Nothing new today - wrote an empty opportunities file.');
    return;
  }

  const modelItems = diversifyBySource(items, MAX_SIGNALS_FOR_FILTER);
  const titleList = modelItems
    .map((item, i) => {
      const score = item.score ?? '-';
      const comments = item.comments ?? '-';
      return `${i}. [${item.source}, score ${score}, comments ${comments}, query "${item.query}"] ${item.title}`;
    })
    .join('\n');

  const filterPrompt = `You are filtering raw internet posts into market-opportunity candidates for one specific builder.

<profile>
${profile}
</profile>

The builder wants small, realistic products or services:
- ideally a tiny SaaS or workflow tool people might pay USD 10-20/month for
- must solve a real repeated pain, not just a cool technical idea
- should be buildable by a capable beginner using Codex, Next.js, public/free APIs, browser automation, or simple databases
- reject enterprise-only, regulated, hardware-heavy, crypto, gambling, medical, or vague AI-wrapper ideas
- prefer problems where the first validation step can be done this week

Below are raw signals as "index. [source, score, comments, query] title".
Pick at most 35 indices with the strongest evidence of a real problem. Cluster duplicates. Keep ordinary people and small businesses higher than developer hype.

Respond with ONLY a JSON array of indices, best first. Example: [12, 4, 39]

<signals>
${titleList}
</signals>`;

  console.log(`Stage 1: filtering ${modelItems.length} of ${items.length} signals -> shortlist...`);
  const chosen = parseJSON(await callGemini(filterPrompt));
  const survivors = chosen.map(i => modelItems[i]).filter(Boolean).slice(0, 35);
  console.log(`  shortlisted ${survivors.length} signals\n`);

  const detailList = survivors
    .map((item, i) =>
      `### ${i + 1}. ${item.title}\n` +
      `source: ${item.source} | score: ${item.score ?? '-'} | comments: ${item.comments ?? '-'} | query: ${item.query}\n` +
      `url: ${item.url}\n` +
      `${(item.content || '').slice(0, 900)}`)
    .join('\n\n');

  const briefPrompt = `You are writing the "Market Opportunities" tab for Ullas.

<profile>
${profile}
</profile>

From the candidate problem signals below, choose up to 10 opportunities. Be strict. Each item must be grounded in a real source URL and must help Ullas decide what to validate or build next.

Rank by:
1. real pain from real people
2. likely willingness to pay USD 10-20/month or pay for a small service
3. fit for Ullas: beginner-friendly, Codex-assisted, shippable, useful for build-in-public proof
4. narrow MVP scope

Difficulty rules:
- "easy" means a one-page tool, checklist generator, report builder, tracker, or simple automation
- "medium" means auth, database, payments, scheduled jobs, browser automation, or integrations
- "hard" means many integrations, messy data, compliance risk, marketplace dynamics, or a long sales cycle

Respond with ONLY valid JSON in this exact shape:
{
  "date": "${today}",
  "items": [
    {
      "title": "short product/service name",
      "customer": "who has this problem",
      "source_problem": "one sentence describing the pain from the source",
      "willingness_to_pay": "why this person/business might pay USD 10-20/month or pay for setup",
      "build_shape": "smallest useful MVP Ullas could build",
      "difficulty": "easy | medium | hard",
      "first_action": "one concrete validation/build action for the next 60-90 minutes",
      "proof": "what counts as shipped proof",
      "price_hint": "USD 10-20/mo, setup fee, or free validation first",
      "url": "source URL",
      "source": "source name"
    }
  ]
}

Use plain English. No hype. No filler. If the evidence is weak, return fewer items.

<candidates>
${detailList}
</candidates>`;

  console.log('Stage 2: writing market opportunities...');
  const result = parseJSON(await callGemini(briefPrompt));
  const normalized = {
    date: result.date || today,
    items: (result.items || [])
      .map(item => normalizeOpportunity(item, survivors.find(s => s.url === item.url) || {}))
      .filter(item => item.title && item.url)
      .slice(0, 10),
  };

  const outPath = path.join('data', `${today}.opportunities.json`);
  await fs.writeFile(outPath, JSON.stringify(normalized, null, 2));
  console.log(`\nWrote ${normalized.items.length} opportunities to ${outPath}`);

  const webPath = path.join('web', 'opportunities.json');
  await fs.writeFile(webPath, JSON.stringify(normalized, null, 2));
  console.log(`Published to ${webPath}`);

  await recordShown(normalized.items, today);

  console.log('\n========== MARKET OPPORTUNITIES ==========');
  for (const item of normalized.items) {
    console.log(`\n- ${item.title} [${item.difficulty}]`);
    console.log(`  Customer: ${item.customer}`);
    console.log(`  Build: ${item.build_shape}`);
    console.log(`  First action: ${item.first_action}`);
    console.log(`  ${item.url}`);
  }
  console.log('\n==========================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
