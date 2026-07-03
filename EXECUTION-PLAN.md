# AI-ingest — Execution Plan (for an AI coding agent)

You are an AI coding agent executing this plan. It was produced from a full audit
of this codebase on 2026-07-03. It contains everything you need; do not assume
context beyond this file and the repo itself. Work through the phases **in
order** — later phases depend on earlier ones.

---

## 0. Context you must internalize first

### What this project is
A personal AI-news filter for one user (Ullas, 19, learning to build software).
A GitHub Action runs daily at 00:30 UTC:

```
scraper.js  ->  data/YYYY-MM-DD.json        (raw items from free sources)
brain.js    ->  data/YYYY-MM-DD.brief.json  (Gemini-filtered 3-15 item brief)
            ->  web/brief.json              (copy the Next.js site builds from)
web/        ->  Next.js app on Vercel; rebuilds when the Action pushes
```

`profile.md` is the product spec — the LLM prompts are built around it. Read it
before touching `brain.js`. The brief's purpose is to push the user toward
**shipping projects**, not consuming more news.

### Hard constraints — violating these fails the task
1. **Free only.** No paid APIs, no paid hosting, no paid tiers. Gemini free
   tier, Vercel hobby, GitHub Actions free tier, Supabase free tier. If a step
   would cost money, stop and leave a note instead.
2. **The user drives all Git commands.** He is learning Git. NEVER run
   `git add`, `git commit`, `git push`, `git checkout -b`, etc. yourself.
   At each checkpoint marked `🧑 GIT CHECKPOINT`, print the exact commands for
   the user to type, with a one-line explanation of each.
3. **Style:** Node ESM (`"type": "module"`), Node 24+. Raw `fetch`, no SDK
   packages for HTTP APIs (no `@google/generative-ai`, no `@supabase/supabase-js`
   — use their REST endpoints directly). Match the existing comment style:
   plain-English comments explaining *why*, aimed at a beginner reading later.
4. **Never `JSON.parse` raw LLM output.** Always go through the tolerant
   `parseJSON()` in `brain.js`, and validate the shape after parsing.
5. Commit messages: short, one line, imperative, no Co-Authored-By tag.
6. Branch naming: `feature/<short-name>` for code. Docs may go to `main`.
7. `web/AGENTS.md` warning applies: this Next.js version may differ from your
   training data. Before editing anything under `web/`, check
   `web/node_modules/next/dist/docs/` for the relevant API if unsure.

### Secrets & user-action checkpoints
Some tasks need things only the user can do (create a Reddit app, a Supabase
project, a Telegram bot, add GitHub repo secrets). These are marked
`🧑 USER SETUP`. When you hit one: print precise instructions, then implement
the code so it **degrades gracefully** when the secret is absent (log a clear
skip message, don't crash). That way the code can merge before the setup is done.

### How to verify your work (do this after every phase)
- `npm run scrape` — must exit 0 and write `data/<today>.json` with items from
  ≥ 3 sources (Reddit will fail locally-or-not depending on IP; that's OK
  locally, see Task 1.1).
- `npm run brief` — needs `GEMINI_API_KEY` in `.env.local`. If the key is
  missing, you cannot run it; instead write a small `test/` harness (Task 0.1)
  and rely on that.
- `cd web && npm run build` — must succeed. This is the canary for brief-shape
  bugs: `web/app/page.js` statically imports `web/brief.json` at build time.
- Never mark a task done without running its "Verify" block.

### Task 0.1 — Minimal test harness (do this first)
There are no tests. Create `test/` with plain Node scripts (no test framework —
keep deps at zero) runnable via `node test/<file>.js`, each exiting non-zero on
failure. Add `"test": "node --test test/"`-style or a simple runner script —
your choice, but wire `npm test` in the root `package.json`. Cover, as you go
through the phases:
- `parseJSON()` tolerance (fences, prose, bare arrays, `{"indices": [...]}`)
- brief-shape validation (Task 2.1)
- feedback validation (Task 3.3)
- date helper (Task 1.4)

To make functions testable, export them from `brain.js` / `scraper.js`
(`export { parseJSON, ... }`) and guard the main entry with
`if (process.argv[1] === fileURLToPath(import.meta.url))` — do this refactor as
part of 0.1, changing zero behavior. Verify: `npm run scrape` still works.

---

## Phase 1 — The pipeline is silently broken in production. Fix that first.

### Task 1.1 — Reddit is dead in CI (403 since ~2026-06-29). Restore it via free OAuth.
**Evidence:** every recent GitHub Actions run logs
`✗ reddit FAILED: Reddit[LocalLLaMA]: 403`. Reddit blocks unauthenticated JSON
requests from datacenter IPs. The two subreddits (r/LocalLLaMA, r/ClaudeAI) have
contributed zero items for days while the workflow reports success.

**Change in `scraper.js` (`fetchReddit`, ~line 66):**
1. If `process.env.REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` exist:
   - POST `https://www.reddit.com/api/v1/access_token` with
     `grant_type=client_credentials`, HTTP Basic auth (`id:secret` base64),
     `User-Agent` header (reuse `USER_AGENT`), body as
     `application/x-www-form-urlencoded`.
   - Then request `https://oauth.reddit.com/r/<sub>/top?t=day&limit=25` with
     `Authorization: Bearer <token>` and the same User-Agent. Response shape is
     identical to the public JSON (`data.data.children`).
2. If the env vars are absent, fall back to the current public
   `www.reddit.com/...top.json` call (works from residential IPs for local runs)
   and log one line saying OAuth creds are missing.
3. Load env for the scraper the same way `brain.js` does
   (`process.loadEnvFile('.env.local')` in a try/catch) so local runs can use
   the creds too. Add both vars to `.env.example` with a comment.

**Workflow:** in `.github/workflows/daily.yml`, pass
`REDDIT_CLIENT_ID: ${{ secrets.REDDIT_CLIENT_ID }}` and the secret to the
**scrape** step.

**🧑 USER SETUP (print this):** go to https://www.reddit.com/prefs/apps → create
app → type "script" → any name/redirect. Copy the client id (under the app
name) and secret. Add both as GitHub repo secrets (`Settings → Secrets and
variables → Actions`) and to local `.env.local`.

**Verify:** with creds in `.env.local`, `npm run scrape` shows
`✓ reddit  N items` with N > 0. Without creds, it still runs and clearly logs
the fallback.

### Task 1.2 — Make failure loud: a green run must mean a healthy brief.
Right now `Promise.allSettled` lets **all** sources fail and the run still
succeeds; brain.js then treats an empty scrape as a "quiet day" and publishes an
empty brief over a good one.

**Changes:**
1. `scraper.js` main: after collecting results, `process.exit(1)` if
   (a) total items < 10, or (b) more than half the sources failed. Print which
   sources failed before exiting. (GitHub emails the user automatically when a
   scheduled workflow run fails — that's the free alerting.)
2. `brain.js`: distinguish the two zero cases.
   - `raw.items.length === 0` → print an error and `process.exit(1)`
     (scrape produced nothing = broken, not quiet).
   - `items.length === 0` **after** the 7-day de-dup filter → keep the current
     "quiet day, write empty brief" behavior. That one is legitimate.

**Verify:** temporarily hardcode all sources to throw; `npm run scrape` must
exit 1 with a clear message. Revert the hack. Add a test for the brain.js
zero-case logic if you extracted it into a function.

### Task 1.3 — Per-query resilience inside sources.
`fetchHN` throws on any single non-OK keyword query, discarding results already
collected from the other four queries. Same all-or-nothing shape in
`fetchReddit`'s subreddit loop.

**Change:** wrap each keyword query (HN) and each subreddit (Reddit) in its own
try/catch: log `HN[agent] skipped: 429` style warnings and continue. Only throw
from the source function if **every** query in it failed (so Task 1.2's
half-the-sources check still sees a truly dead source as failed).

**Verify:** point one HN query at a bogus path; scrape still returns items from
the other queries and logs the skip. Revert.

### Task 1.4 — Kill the UTC/date-rollover landmine.
Both scripts compute "today" via `new Date().toISOString().slice(0,10)` (UTC).
The user is in IST: a local `npm run scrape` before 05:30 IST writes
*yesterday's* filename, then `npm run brief` after 05:30 reads a file that
doesn't exist. This class of bug has already bitten this project once
(see CLAUDE.md "Date rollover").

**Changes:**
1. Create `lib/date.js` exporting `todayStamp()` (keep UTC — CI runs in UTC and
   consistency matters more than locale) — single source of truth both scripts
   import.
2. `brain.js`: accept an optional date argument (`node brain.js 2026-07-03`).
   With no argument, **use the newest `data/*.json` file** (matching
   `/^\d{4}-\d{2}-\d{2}\.json$/`, i.e. excluding `.brief.json`, `seen.json`,
   `feedback.json`) instead of assuming today's stamp. Print which file it
   picked. This makes brain.js immune to rollover entirely.

**Verify:** rename today's scrape file to yesterday's date; `npm run brief`
should pick it up and say so. Rename back. Add a unit test for the
newest-file picker with a fixture directory.

---

## Phase 2 — Harden brain.js: never trust the model.

### Task 2.1 — Validate every LLM response shape; never publish garbage.
Two live risks:
- Stage 1: `chosen.map(...)` assumes a bare array. Models often return
  `{"indices": [1,2,3]}` or `{"chosen": [...]}` → crash.
- Stage 2 (worse): the parsed object is written to `web/brief.json`
  **unvalidated**. If it lacks `items`, the Action commits it, Vercel rebuilds,
  and `web/app/page.js` (`brief.items.length`) **crashes the build** — every
  deploy fails until someone hand-fixes a committed file.

**Changes in `brain.js`:**
1. Stage 1: after `parseJSON`, normalize — if it's an object, look for the
   first array-of-numbers value inside it; coerce numeric strings; drop
   out-of-range indices. If nothing usable, retry the Gemini call **once**,
   then exit(1).
2. Stage 2: write a `validateBrief(brief, today)` function that checks:
   `brief.items` is an array; every item has non-empty string `title`, `url`,
   `why_it_matters`; `brief.date` is set to `today` (overwrite whatever the
   model said). On failure: retry once, then exit(1) **without writing any
   file** — yesterday's good brief must survive on the site.
3. Defense in depth in `web/app/page.js` and `web/app/brief-list.js`: render
   from `brief.items ?? []` so a bad committed file degrades to an empty page
   instead of a failed build.

**Verify:** unit-test `validateBrief` and the stage-1 normalizer against: bare
array, `{"indices":[...]}`, fenced JSON, missing items, item missing url.
`cd web && npm run build` with a `brief.json` containing `{"date":"x"}` must
still build after change 3.

### Task 2.2 — Stop letting the model retype URLs (hallucinated links + broken de-dup).
Stage 2 currently asks Gemini to echo back `title`/`url`/`source`. Models mangle
URLs, which (a) puts dead links in front of the user and (b) breaks cross-day
de-dup, because `seen.json` records the *model's* URL while the filter compares
the *scraper's* URLs.

**Change:** Stage 2 prompt now returns
`{ "date": ..., "items": [ { "index": <1-based candidate number>, "why_it_matters": "..." } ] }`.
After validation, build the real brief items by joining `survivors[index-1]`'s
`title`, `url`, `source` with the model's `why_it_matters`. Drop items whose
index is out of range or duplicated.

**Verify:** unit test the join with a fake model response including an
out-of-range and a duplicate index.

### Task 2.3 — Cap the learned-preferences block.
`buildLearnedPreferences()` injects **every rating ever** into both prompts,
forever — token bloat that will eventually drown out `profile.md`.

**Change:** sort feedback by `ratedAt` descending; keep at most the 25 most
recent liked (rating ≥ 4) and 25 most recent disliked (rating ≤ 2).

### Task 2.4 — Small brain.js/scraper cleanups (do together).
- Move the Gemini API key from the URL query string to the
  `x-goog-api-key` request header (keeps it out of logs/proxies).
- In `callGemini`, when a model returns 429 (quota), log it distinctly — the
  fallback chain already moves on, but the log should say "quota" not just fail.

**Verify after Phase 2:** with a real key, `npm run brief` end-to-end produces a
brief whose every URL exactly matches a URL present in today's scrape file
(write a small script check for this — it's the acceptance test for 2.2).

---

## Phase 3 — Web app fixes.

### Task 3.1 — Staleness banner.
The site shows whatever brief was baked in at build time, dated politely. If the
cron dies, GitHub disables the schedule (it does this to repos it deems
inactive), or a Vercel build fails, the user reads a week-old brief formatted
like today's paper, with no warning.

**Change:** in the client (`brief-list.js` or a tiny new client component used
by `page.js`): compare `brief.date` to the user's local today; if the brief is
≥ 2 days old, render a clearly visible warning line above the list:
"This brief is N days old — the daily pipeline may be stuck (check GitHub
Actions)." Must be computed client-side (`useEffect`/state) — the page is
statically built, so build-time "today" would itself go stale. Match the
site's existing muted/gold aesthetic; no red alarm boxes.

**Verify:** set `web/brief.json` date to a week ago, `npm run dev`, see the
banner; set to today, banner gone.

### Task 3.2 — Defensive rendering + localStorage hygiene.
- (Done partly in 2.1.3) `items ?? []` everywhere the brief is consumed.
- `formatDate` in `page.js`: if `brief.date` is missing/invalid, render nothing
  rather than "Invalid Date".
- On load in `brief-list.js`, delete `localStorage` keys matching
  `ai-ingest-read-YYYY-MM-DD` older than 7 days (they currently accumulate
  daily, forever).
- React keys: after Task 2.2 URLs are guaranteed real, but guard against
  duplicate URLs from the model by de-duplicating `items` by URL once at the
  top of `BriefList`.

### Task 3.3 — Validate `/api/rate` input.
`web/app/api/rate/route.js` accepts any number as a rating (`9999`, `-5`) from
anyone, and the file grows unbounded.

**Change:** require `Number.isInteger(rating) && rating >= 1 && rating <= 5`;
require `url` to parse with `new URL()` and be http(s); truncate `title` to 300
chars; after upsert, if the list exceeds 500 entries, drop the oldest by
`ratedAt`. Return 400 on invalid input. (This route matters for local dev now
and becomes the Supabase proxy in Phase 5 — keep its request/response contract.)

**Verify:** unit-test the validation logic (extract it to a small exported
function so the test doesn't need to run Next).

---

## Phase 4 — Workflow fixes (`.github/workflows/daily.yml`).

### Task 4.1
- **Commit the raw scrapes too:** add `data/*.json` to the `git add` line
  (currently only briefs + seen.json are committed, so the model's actual input
  evaporates with each CI runner and no past day can ever be debugged/replayed).
  Also fixes CLAUDE.md's claim that `data/` is tracked.
- **Push race:** add `git pull --rebase origin main` before `git push` (if the
  user pushes around 04:30 UTC, the bot's push currently fails non-fast-forward).
- Pass the Reddit secrets to the scrape step (from Task 1.1) if not already done.

### Task 4.2 — Repo metadata
`package.json` `repository`/`bugs`/`homepage` point at a dead repo name
(`greatullas0-sketch/AI-ingest`); the real remote is `UllasSHR/AI-ingest`. Fix
all three URLs.

**🧑 GIT CHECKPOINT** — Phases 1–4 are one coherent "harden the pipeline"
change. Suggest: branch `feature/pipeline-hardening`, one commit per phase
(messages like `fix: restore reddit via oauth, fail loud on dead scrape`), PR
to main. Print each command with a one-line explanation; the user types them.
PRs are created via `gh` (authed in the agent environment) after the user has
pushed the branch; the user reviews/merges on the GitHub website.

---

## Phase 5 — Close the feedback loop with Supabase (highest-value feature).

**Why:** the star ratings on the deployed site currently do nothing — the API
route writes to Vercel's read-only filesystem, the client swallows the error,
and the UI still says "More like this". The personalization loop has been open
since launch. Supabase free tier fixes this and the user already knows Supabase.

### Task 5.1 — 🧑 USER SETUP (print this, then implement with graceful degradation)
1. Create a free Supabase project.
2. SQL editor, run:
   ```sql
   create table ratings (
     url text primary key,
     title text not null default '',
     source text not null default '',
     rating int not null check (rating between 1 and 5),
     brief_date date,
     rated_at timestamptz not null default now()
   );
   alter table ratings enable row level security;
   -- inserts/updates come only through the API route using the service key,
   -- so no anon policies are needed.
   ```
3. Add to Vercel project env vars AND GitHub repo secrets AND `.env.local`:
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role key — server-side only,
   never shipped to the browser). Document both in `.env.example`.

### Task 5.2 — Write path
Rewrite `web/app/api/rate/route.js`: after the Task 3.3 validation, if
`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are set, upsert via REST:
`POST {SUPABASE_URL}/rest/v1/ratings` with headers `apikey`, `Authorization:
Bearer <key>`, `Prefer: resolution=merge-duplicates` (raw fetch, no SDK — repo
convention). If env vars are absent (local dev without setup), fall back to the
current `data/feedback.json` file write so nothing breaks. Keep the
fire-and-forget client as is — localStorage stays the UI source of truth.

### Task 5.3 — Read path
In `brain.js` `buildLearnedPreferences()`: if the Supabase env vars are present,
fetch `GET {SUPABASE_URL}/rest/v1/ratings?select=title,rating,rated_at&order=rated_at.desc&limit=200`
and use that; merge with (or fall back to) `data/feedback.json`. Apply the
Task 2.3 caps after merging. Pass the two secrets to the brief step in
`daily.yml`.

**Verify:** run the site locally with real Supabase creds, rate an item, confirm
the row via the Supabase dashboard, then run `npm run brief` and confirm the
title appears in the printed learned-preferences block (add a `--debug` flag or
log line that prints the block).

**🧑 GIT CHECKPOINT** — branch `feature/supabase-ratings`, PR.

---

## Phase 6 — Features (in this order; each is its own branch + PR).

### Task 6.1 — Telegram morning push + built-in dead-man's-switch
New file `notify.js` (root): reads today's brief JSON, sends the top 3 items
(title + one-line why + link) via
`https://api.telegram.org/bot<TOKEN>/sendMessage` (raw fetch, `parse_mode:
'HTML'`, escape the content). Add `"notify": "node notify.js"` script and a
workflow step after the commit step, with `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` from secrets. Skip cleanly with a log line if secrets are
absent. Because the workflow now fails loudly on a dead scrape (Task 1.2), "no
message by 6:15 IST" doubles as the user's failure alarm.

**🧑 USER SETUP:** message @BotFather → `/newbot` → copy token. Message the new
bot once, then `https://api.telegram.org/bot<TOKEN>/getUpdates` to read your
chat id. Add both as repo secrets.

### Task 6.2 — Fetch real article content for Stage 2
The brief is currently written from ≤ 800 chars of scraped snippet — for HN
link posts that's usually **empty**, so Gemini writes "why it matters" from a
headline. For the ≤ 20 stage-1 survivors only: fetch each URL (10s timeout,
`Promise.allSettled`, skip non-HTML content types and bodies > 2 MB), extract
readable text with `@mozilla/readability` + `linkedom` (two small free deps —
allowed exception to the no-deps lean, add to root `package.json`), and give
Stage 2 up to ~3000 chars per item instead of 800. On any per-URL failure fall
back to the existing snippet. Cache nothing; it runs once a day.

### Task 6.3 — HN comment context
For survivors whose source is `hn`, fetch
`https://hn.algolia.com/api/v1/items/<objectID>` (keep `objectID` on the item in
`scraper.js` when building HN items) and pass the top ~5 top-level comments
(strip HTML, cap ~200 chars each) into the Stage 2 candidate block as
`hn_reaction:`. Prompt addition: "If commenters raise credible problems
(doesn't build, cherry-picked demo, paid wall), say so plainly in
why_it_matters." This is what turns the brief from headline-summaries into a
filter the user can trust.

### Task 6.4 — New "someone shipping" sources (profile rule #1)
Add to `scraper.js`, one function each, normalized via `makeItem`:
- **Show HN:** existing Algolia pattern with `tags=show_hn` (no query string) —
  one function, high yield.
- **Vercel changelog:** `https://vercel.com/changelog/rss.xml` via `fetchRSS`.
- **Supabase changelog:** RSS at `https://supabase.com/changelog/rss.xml` —
  verify the URL resolves before wiring; if it 404s, try
  `https://github.com/supabase/supabase/releases.atom`, and if neither works,
  leave a TODO comment instead of shipping a dead source.
These two changelogs are literally the user's stack — news about them is
maximally actionable for him.

### Task 6.5 — The accountability loop (the flagship feature — read profile.md first)
Every brief item ends with a "try this week" action. Make it a commitment:
1. **Commit button:** in `brief-list.js`, next to Done, add "I'll try this".
   Stores `{url, title, action_sentence, committed_at, status: 'open'}` in a
   Supabase `commitments` table (same REST pattern as ratings; new API route
   `web/app/api/commit/route.js`; localStorage mirror for instant UI).
2. **Morning check-in:** at the top of the brief page, list open commitments
   older than today with three buttons — "Shipped it" / "Still going" /
   "Dropped it" — updating `status` (`shipped`/`open`/`dropped`).
3. **Feed it back:** in `brain.js`, fetch commitments and add a short prompt
   block: shipped actions = strongest positive signal ("more items like the
   ones that got him to build"); dropped = negative. Cap like Task 2.3.
This converts the tool from news-you-read into a standup-with-yourself, which is
the product's stated purpose.

### Task 6.6 — Sunday self-tuning PR
New workflow `weekly-retro.yml` (cron: Sunday ~03:00 UTC) + `retro.js`:
gather the week's briefs (`data/*.brief.json`), ratings, and commitment
outcomes; ask Gemini for (a) a 10-line plain-text weekly retro and (b) a
**proposed revision of `profile.md`** (full file, minimal edits, preserving the
locked-in test items section). Write the retro to `data/retro-YYYY-MM-DD.md`,
apply the revision on branch `retro/YYYY-MM-DD`, and open a PR via `gh` (the
Action can use `GITHUB_TOKEN` with `gh pr create`; add `pull-requests: write`
permission). The user reviews the diff on GitHub — the tool proposing changes
to its own spec, with the human merging, is both the point and good Git
practice for him. Guardrail: if the model's revision deletes more than 40% of
the file, abort and open no PR.

### Task 6.7 — Archive page + build radar
- **/archive:** new route `web/app/archive/page.js` statically rendering all
  committed briefs, newest first (they're in git after Task 4.1 — read
  `../data/*.brief.json` at build time in a server component; confirm against
  the Next docs note in `web/AGENTS.md`).
- **Build radar:** a third brain.js stage (only when Stage 2 found items):
  "given today's items and this profile, list 0–3 concrete things HE could
  build with Next.js/Supabase/Claude — each with: idea (1 line), evidence url,
  effort guess (weekend / week / more), and an opening prompt he could paste
  into Claude Code." Append to `data/ideas.json` (validated, capped at 50,
  de-duplicated by idea title similarity — exact-lowercase match is fine),
  commit it in the workflow, render at `web/app/ideas/page.js` as a ranked
  backlog. This turns the news filter into a shipping queue.

---

## Definition of done (whole plan)
- `npm test` passes; `npm run scrape` and `cd web && npm run build` pass.
- A green Actions run guarantees: ≥ 3 sources healthy, a validated brief whose
  URLs all exist in that day's scrape file, site rebuilt, Telegram sent.
- A red run (or a silent morning) is guaranteed to reach the user (GitHub
  failure email + missing Telegram message).
- Ratings and commitments made on the **deployed** site demonstrably alter the
  next day's prompts.
- Every phase merged via a PR the user created from printed commands, except
  docs (this file, CLAUDE.md updates) which may go straight to main.
- Update `CLAUDE.md`'s architecture/gotchas sections to reflect all of the
  above when finished (new env vars, new files, raw scrapes now committed,
  brain.js date-argument behavior).
