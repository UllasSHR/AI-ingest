# profile.md

This is the most important file in the project. AI-ingest is a function of this document. Update it whenever I read a brief and think "you missed this" or "why is this here."

---

## The one thing the brief is for

**To push me toward shipping.** I am in an over-learning, under-shipping phase, and I know it. I have spent ~8 weeks wanting to ship my first revenue project and the tools/explainers sessions outnumber the ship sessions in my history. Not taking action right now is more dangerous than not being perfect.

So the brief is not a news feed. It is a forcing function. Every morning it should make me *more likely* to open a project, not *more likely* to open another tutorial.

## Who I am

I'm Ullas, 19. I'm learning how to build real software by building real software, and right now AI is doing most of the keyboard work — I direct, AI types. People call this vibe coding. I want to get good at the *direction* part: knowing what to ask for, what to verify, what to keep, what to throw away.

This is my second project of that kind. The first was a personal health reminder website (Next.js + Supabase). This one is AI-ingest itself — a tool to filter the AI news I drown in every day on Twitter, built so I can spend that filtering time on actually building things.

## My current stack (what I actually use)

- **Where I write code:** Claude Code, Codex
- **Frontend:** Next.js (I've shipped one project on this)
- **Hosting:** Vercel
- **Backend / DB:** Supabase
- **AI APIs:** Claude (mostly), have tinkered with others
- **Version control:** Git + GitHub (just learning this properly — AI-ingest is my first repo with real commit discipline)

I'm a beginner. The point of every project I do right now is to be slightly less of a beginner by the end of it.

## What "relevant to me" actually means

A piece of AI news is relevant if it does at least one of these for me:

1. **Shows me someone shipping.** Indie devs, teens, two-person teams who built a thing with AI + my kind of stack (Next.js, Vercel, Supabase, Claude) and put it in the world. Especially: "how I made my first $100/$1k/$10k with X built in Y weeks." These are the ones that move me from reading to building. Rank these the highest.
2. **Opens a career opportunity.** A new job category, a new freelance angle, a tool a 19-year-old can learn and get paid for, a skill that's about to be in demand. I'm at the start of my working life — anything that changes what I could be doing for money matters.
3. **Makes my actual life easier today.** A new model or tool that I, on my laptop, with the stack I already use, can plug in and get something done. Not "imagine if you could…" — "here's the npm package" or "here's the one-click template."
4. **Comes from the labs that actually ship.** OpenAI, Anthropic, xAI, Google (DeepMind / Gemini), Nvidia, Meta AI, Mistral. When they release something it's real and other things move around it.

**The action test.** For each item the brief surfaces, the "why this matters to me" paragraph must end with one concrete thing I could try *this week* with what I have. If the LLM can't write that sentence honestly, the item shouldn't be in the brief.

## What to ignore (the "BS bucket")

These all drain me on Twitter and I don't want them in the brief:

- **Tutorials and explainers.** "Here's how RAG works." "5 things to know about agents." I already have enough learning material. I am not short on knowledge, I am short on shipping.
- **Anything that doesn't point at an action.** If the takeaway is "interesting to know about" rather than "you could try this," cut it.
- Fundraising rounds, valuations, term sheets
- Benchmark wars with no practical example
- AGI / safety / policy / doomer debates
- "X agent autonomously did Y" demos with no working repo
- New image / video / music models (I don't generate media right now)
- Academic papers without code or a clear takeaway
- Big-company restructures and personnel drama
- "The 10 AI tools you need" listicles
- Anything that's been making the rounds for 3+ days — if I haven't heard about it by day 3 it wasn't important

## Voice / tone of the brief

When the LLM writes my morning brief, I want:

- Plain English, no breathless tech-blog adjectives ("revolutionary," "game-changing," etc.)
- One paragraph per item, max
- Always answer: *what changed?* / *why does it matter to me specifically?* / *what's one concrete thing I could try with it today?*
- Source link at the bottom
- Quiet days should say "quiet day" instead of padding with marginal items

## Test items (locked-in examples)

Three things I'd want surfaced, two I'd want filtered. The summarizer prompt gets tested against these every time it changes.

### Show me these:
1. **"19-year-old ships AI study-buddy on Vercel + Supabase, hits $400 MRR in 6 weeks — full repo and launch thread."** *(Why: this is exactly the rung above me. Same age, same stack, real revenue, public artifacts I can study.)*
2. **"Anthropic ships Claude Code Agent SDK — build agents in 10 lines of Python, free during beta. Three example apps in the docs."** *(Why: extends a tool I already use daily; the three examples are direct "you could ship this weekend" prompts.)*
3. **"OpenAI cuts GPT-5-mini to $0.05/1M tokens — now cheaper than Haiku. Three side-project ideas that just became economically viable.")** *(Why: changes the cost math on every project I might build next.)*

### Hide these:
1. **"xAI closes $10B Series C at $200B valuation, plans Memphis data center expansion."** *(Why: fundraising / business news. Nothing for me to do with this information.)*
2. **"Anthropic publishes interpretability paper on circuit-level features in Claude 3.5 Sonnet."** *(Why: academic, no code, no action. Cool, but not for my brief.)*

---

*Last meaningful edit: initial draft. Re-read this any Sunday I look at last week's briefs and feel "this wasn't quite right."*
