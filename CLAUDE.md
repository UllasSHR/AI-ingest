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
scraper.js  ->  data/YYYY-MM-DD.json        (raw items, ~5 sources, normalized shape)
brain.js    ->  data/YYYY-MM-DD.brief.json  (LLM-filtered, ranked brief)
            ->  web/brief.json              (same brief, copied so the site can import it)
web/        ->  imports web/brief.json, renders the morning page (Next.js -> Vercel)
            ->  /api/rate writes star ratings to data/feedback.json (local only)
brain.js    <-  data/feedback.json          (past ratings become a personalization signal)
            <-  data/seen.json              (URLs shown in last 7 days -> skip, cross-day de-dup)
```

The two-stage Gemini pipeline in `brain.js` keeps token use inside the free tier:
- **Stage 1 (FILTER):** send only *titles* of all items -> model returns the indices
  of the most relevant ones, clustering duplicates. Caps at 20 survivors.
- **Stage 2 (BRIEF):** send *full content* of survivors -> model writes the ranked
  "what changed / why it matters to you / try this week" brief (up to 15 items).

The feedback loop closes through `buildLearnedPreferences()` in `brain.js`: items the
user rated >=4 stars steer the next brief toward similar stories, <=2 away. Ratings are
written by `web/app/api/rate/route.js`, which only persists to disk when the app runs
locally — **on Vercel the filesystem is read-only/ephemeral, so deployed ratings live in
the browser's localStorage and never reach `brain.js`.** The learning loop only works
when you run `npm run dev` locally and rate there.

## Commands
Pipeline (run from repo root):
- `npm run scrape` — pull today's items (HN, Reddit, Simon Willison, HF Daily Papers)
- `npm run brief`  — run the two-stage Gemini pipeline, write today's brief

Web app (run from `web/` — it's a separate npm package with its own deps):
- `npm run dev`   — Next dev server (rate stories here to feed the learning loop)
- `npm run build` — production build
- `npm run lint`  — eslint

Automation: `.github/workflows/daily.yml` runs scrape + brief daily at 00:30 UTC
(06:00 IST) and commits the fresh brief back to the repo. `GEMINI_API_KEY` comes
from a repo secret, not `.env.local`.

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
- **`brain.js` writes the brief to TWO places** — `data/*.brief.json` (archive) and
  `web/brief.json` (what the site imports). The daily workflow commits both. If the
  page looks stale, check `web/brief.json`, not just `data/`.
- **`web/` is a separate Next.js app with breaking changes from training data.**
  Per `web/AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/`
  before writing web code — APIs, conventions, and file structure may differ.
- **Quiet-day path:** if every fresh item was already shown (seen.json), `brain.js`
  writes an empty brief and skips the LLM entirely — no wasted API calls.

## Working style (the user is learning Git)
- **The user drives all Git commands.** Claude prepares the work and explains each
  command; the user types it. This is intentional — it's how he's learning Git.
- Feature branches for code (`feature/x`) + PRs to merge. Docs can go to main directly.
- Windows PowerShell: use **single quotes** for commit messages (double quotes get
  mangled by smart-quote substitution).
- `gh` CLI is authed in Claude's environment but NOT the user's interactive terminal
  -> PRs are created via Claude and reviewed/merged on the GitHub website.
- Commit messages: short, one line, no Co-Authored-By tag.
