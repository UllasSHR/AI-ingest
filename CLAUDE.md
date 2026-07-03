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
scraper.js  ->  data/YYYY-MM-DD.json        (raw items; NOW COMMITTED to git)
brain.js    ->  data/YYYY-MM-DD.brief.json  (LLM-filtered 3-15 item brief)
            ->  web/brief.json              (copy the Next.js site builds from)
web/        ->  reads the brief, renders the morning page (Next.js -> Vercel)
```

## Commands
- `npm run scrape` — pull today's items (HN, Reddit via OAuth, Simon Willison, HF Daily Papers)
- `npm run brief [YYYY-MM-DD]`  — run the two-stage Gemini pipeline, write today's brief
- `npm test`       — run the plain-Node test suite (no framework)

## Conventions
- Node ESM (`"type": "module"`), Node 24+.
- Scripts use raw `fetch` (no SDKs) — fewer deps, easier to read.
- Each source is one function returning the normalized item shape in `scraper.js`.
- `data/` IS tracked in git (the brief is committed so the site can read it).
- Secrets live in `.env.local` (gitignored). `.env.example` documents what's needed.

## Env vars (all documented in `.env.example`)
- `GEMINI_API_KEY` — free from https://aistudio.google.com/apikey
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — Reddit script app (prefs/apps). Required in CI; optional locally (falls back to public API, which 403s from datacenter IPs).

## New files (added during hardening)
- `lib/date.js` — exports `todayStamp()`, single UTC date source used by both scripts
- `lib/rate-validate.js` — shared validation for `/api/rate`; imported by route + tests
- `test/` — plain Node test scripts, runnable via `npm test`

## Gotchas already hit (don't rediscover these)
- **Date rollover:** ~~brain.js reads today's scrape file~~ — **fixed**: `brain.js` now
  picks the newest `data/*.json` automatically, so rollover can't bite.
- **Anthropic has no public RSS** — that source is commented out in `scraper.js`.
  Their news reaches HN within hours anyway.
- **HN Algolia rate-limits** rapid queries -> 250ms delay between keyword queries.
  Each keyword query now has its own try/catch; a single 429 no longer drops all results.
- **Gemini model names cycle** -> `MODELS` fallback chain in `brain.js`. Model JSON is
  parsed tolerantly (strip fences); never `JSON.parse` raw model output.
  429 quota errors are now logged distinctly and fall through to the next model.
- **API key in logs** — moved from URL query string to `x-goog-api-key` header.
- **Stage 2 URL hallucination** — model now returns `{index, why_it_matters}` only;
  title/url/source are joined from the scraper data so URLs are never retyped.
- **Reddit 403 from CI** — fixed via OAuth (`REDDIT_CLIENT_ID`/`SECRET`). Falls back
  to public API locally. Each subreddit now has its own try/catch.
- **Re-running the scraper clobbers the day's file** (same date = same name).
  Fine for one daily run; revisit if it bites.
- **Raw scrapes now committed** — `data/*.json` is in the `git add` line so past
  scrapes can be debugged/replayed. data/ is fully tracked.

## Working style (the user is learning Git)
- **The user drives all Git commands.** Claude prepares the work and explains each
  command; the user types it. This is intentional — it's how he's learning Git.
- Feature branches for code (`feature/x`) + PRs to merge. Docs can go to main directly.
- Windows PowerShell: use **single quotes** for commit messages (double quotes get
  mangled by smart-quote substitution).
- `gh` CLI is authed in Claude's environment but NOT the user's interactive terminal
  -> PRs are created via Claude and reviewed/merged on the GitHub website.
- Commit messages: short, one line, no Co-Authored-By tag.
