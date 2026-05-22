# AI-ingest — project notes for Claude

A personal AI-news filter. Scrapes a few free sources daily, uses an LLM to pick
the 3–5 items that match `profile.md`, and shows them on a deliberately boring
morning page. This is a learning project — see `plan.html` for the full build plan
and `sources.html` for why each source was chosen.

## Hard constraints
- **Free only.** No paid APIs, no paid hosting. Gemini free tier, Vercel hobby,
  GitHub Actions free tier. If a step would cost money, stop and find a free path.
- **`profile.md` is the product.** The whole tool is a function of that file. The
  brief exists to push the user toward *shipping*, not toward more learning.

## Architecture / data flow
```
scraper.js  ->  data/YYYY-MM-DD.json        (raw items from the sources)
brain.js    ->  data/YYYY-MM-DD.brief.json  (LLM-filtered 3-5 item brief)
web/        ->  reads the brief, renders the morning page (Next.js -> Vercel)
```

## Commands
- `npm run scrape` — pull today's items (HN, Reddit, Simon Willison, HF Daily Papers)
- `npm run brief`  — run the two-stage Gemini pipeline, write today's brief

## Conventions
- Node ESM (`"type": "module"`), Node 24+.
- Scripts use raw `fetch` (no SDKs) — fewer deps, easier to read.
- Each source is one function returning the normalized item shape in `scraper.js`.
- `data/` IS tracked in git (the brief is committed so the site can read it).
- Secrets live in `.env.local` (gitignored). `.env.example` documents what's needed.

## Gotchas already hit (don't rediscover these)
- **Date rollover:** `brain.js` reads *today's* scrape file, so scrape and brief
  must run the same day or the file won't exist. (Phase 06 runs them back-to-back.)
- **Anthropic has no public RSS** — that source is commented out in `scraper.js`.
  Their news reaches HN within hours anyway.
- **HN Algolia rate-limits** rapid queries -> 250ms delay between keyword queries.
- **Gemini model names cycle** -> `MODELS` fallback chain in `brain.js`
  (gemini-2.5-flash -> 2.0-flash -> 1.5-flash). Model JSON is parsed tolerantly
  (strip markdown fences); never `JSON.parse` raw model output.
- **Re-running the scraper clobbers the day's file** (same date = same name).
  Fine for one daily run; revisit if it bites.

## Working style (the user is learning Git)
- **The user drives all Git commands.** Claude prepares the work and explains each
  command; the user types it. This is intentional — it's how he's learning Git.
- Feature branches for code (`feature/x`) + PRs to merge. Docs can go to main directly.
- Windows PowerShell: use **single quotes** for commit messages (double quotes get
  mangled by smart-quote substitution).
- `gh` CLI is authed in Claude's environment but NOT the user's interactive terminal
  -> PRs are created via Claude and reviewed/merged on the GitHub website.
- Commit messages: short, one line, no Co-Authored-By tag.
