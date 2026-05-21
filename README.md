# AI-ingest

A personal filter for the AI firehose. Instead of opening Twitter and getting absorbed in everything that *looks* important, this tool gives me one page each morning with the 3–5 things from the last 24h that are actually relevant to what I'm building — and how each one is useful in my hands.

## How it works

```
1. Collect  ──▶  2. Score  ──▶  3. Summarize  ──▶  4. Serve
scrape sources   rank by your   LLM with personal   your morning page
                 interests      context
```

Runs once daily via GitHub Actions. Read it for 3 minutes. Close the tab.

## Status

Phase 01 — setup. See [plan.html](plan.html) for the full build plan and [sources.html](sources.html) for where the data comes from.

## Stack (planned)

Node.js scraper · Anthropic API · Next.js + Vercel · GitHub Actions cron
