"use client";

import { useEffect, useState } from "react";

// ---------- star rating control ----------
function Stars({ value, onRate }) {
  const [hover, setHover] = useState(0);
  const [popped, setPopped] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} of 5`}
          onMouseEnter={() => setHover(n)}
          onClick={() => {
            onRate(n);
            setPopped(n);
            setTimeout(() => setPopped(0), 300);
          }}
          className="p-0.5 text-lg leading-none"
        >
          <span
            className={`inline-block transition-colors ${
              n <= active ? "text-gold-bright" : "text-line"
            } ${popped === n ? "animate-pop" : ""}`}
          >
            {n <= active ? "★" : "☆"}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- the "Read" space ----------
function ReadSection({ read, onUnread }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-12 border-t border-line pt-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-xs uppercase tracking-[0.2em] text-faint transition-colors hover:text-muted"
      >
        <span>Read &middot; {read.length}</span>
        <span>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <ul className="mt-5 space-y-3">
          {read.map((it) => (
            <li
              key={it.url}
              className="flex items-start justify-between gap-4 opacity-50 transition-opacity hover:opacity-100"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{it.title}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
                  {it.source}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold transition-colors hover:text-gold-bright"
                >
                  Open &#8599;
                </a>
                <button
                  onClick={() => onUnread(it.url)}
                  className="text-faint transition-colors hover:text-ink"
                >
                  Unread
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- the brief list ----------
export default function BriefList({ items, date }) {
  const readKey = `ai-ingest-read-${date}`;
  const ratingsKey = `ai-ingest-ratings`;

  const [readUrls, setReadUrls] = useState([]);
  const [ratings, setRatings] = useState({});
  const [stalenessDays, setStalenessDays] = useState(0);

  useEffect(() => {
    try {
      setReadUrls(JSON.parse(localStorage.getItem(readKey) || "[]"));
      setRatings(JSON.parse(localStorage.getItem(ratingsKey) || "{}"));

      // Delete ai-ingest-read-YYYY-MM-DD keys older than 7 days so localStorage
      // doesn't accumulate indefinitely.
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(localStorage)) {
        const m = key.match(/^ai-ingest-read-(\d{4}-\d{2}-\d{2})$/);
        if (m && new Date(m[1] + "T00:00:00").getTime() < sevenDaysAgo) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [readKey]);

  useEffect(() => {
    // Compute staleness client-side — the page is statically built, so build-time
    // "today" would itself go stale. We need the user's local clock.
    if (!date) return;
    try {
      const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      const days = Math.round(
        (new Date(todayStr + "T00:00:00") - new Date(date + "T00:00:00")) /
          (1000 * 60 * 60 * 24)
      );
      if (days >= 2) setStalenessDays(days);
    } catch {
      /* ignore date parse errors */
    }
  }, [date]);

  // De-duplicate items by URL in case of a pipeline hiccup.
  const dedupedItems = Array.from(new Map((items || []).map((it) => [it.url, it])).values());

  function markRead(url) {
    const next = [...new Set([...readUrls, url])];
    setReadUrls(next);
    localStorage.setItem(readKey, JSON.stringify(next));
  }

  function markUnread(url) {
    const next = readUrls.filter((u) => u !== url);
    setReadUrls(next);
    localStorage.setItem(readKey, JSON.stringify(next));
  }

  function rate(item, n) {
    const next = { ...ratings, [item.url]: n };
    setRatings(next);
    localStorage.setItem(ratingsKey, JSON.stringify(next));

    fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        url: item.url,
        title: item.title,
        source: item.source,
        rating: n,
      }),
    }).catch(() => {});
  }

  const unread = dedupedItems.filter((it) => !readUrls.includes(it.url));
  const readCount = dedupedItems.length - unread.length;
  const pct = dedupedItems.length ? (readCount / dedupedItems.length) * 100 : 0;

  const BATCH = 5;
  const visible = unread.slice(0, BATCH);
  const moreAfter = unread.length - visible.length;
  const read = dedupedItems.filter((it) => readUrls.includes(it.url));

  const stalenessWarning = stalenessDays >= 2 ? (
    <p className="mb-8 text-sm text-muted">
      This brief is {stalenessDays} {stalenessDays === 1 ? "day" : "days"} old — the
      daily pipeline may be stuck (check GitHub Actions).
    </p>
  ) : null;

  if (unread.length === 0) {
    return (
      <div>
        {stalenessWarning}
        <div className="rounded-2xl border border-dashed border-line py-24 text-center">
          <p className="font-display text-3xl font-light text-ink">All caught up.</p>
          <p className="mt-3 text-sm text-muted">
            You&rsquo;ve cleared today&rsquo;s brief. Come back tomorrow.
          </p>
        </div>
        {read.length > 0 && <ReadSection read={read} onUnread={markUnread} />}
      </div>
    );
  }

  return (
    <div>
      {stalenessWarning}

      {/* read progress */}
      <div className="mb-8 flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-faint">
        <span className="shrink-0">
          {readCount} / {dedupedItems.length} read
        </span>
        <div className="relative h-px flex-1 bg-line">
          <div
            className="absolute inset-y-0 left-0 bg-gold transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-5">
        {visible.map((it, i) => {
          const r = ratings[it.url] || 0;
          return (
            <article
              key={it.url}
              className="group animate-rise rounded-2xl border border-line bg-card p-6 transition-all duration-300 hover:border-gold/40 hover:bg-card-hover"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start gap-4 sm:gap-5">
                <span className="font-display text-2xl font-light tabular-nums text-gold/60">
                  {String(readCount + i + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl font-normal leading-snug text-ink">
                      {it.title}
                    </h2>
                    <span className="mt-1 shrink-0 rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-faint">
                      {it.source}
                    </span>
                  </div>

                  <p className="mt-3 text-[15px] leading-relaxed text-muted">
                    {it.why_it_matters}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-4">
                    <div className="flex items-center gap-3">
                      <Stars value={r} onRate={(n) => rate(it, n)} />
                      <span className="text-[11px] tracking-wide text-faint">
                        {r === 0
                          ? "Rate its relevance"
                          : r >= 4
                          ? "More like this"
                          : r <= 2
                          ? "Less like this"
                          : "Noted"}
                      </span>
                    </div>

                    <div className="flex items-center gap-5 text-sm">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gold transition-colors hover:text-gold-bright"
                      >
                        Open &#8599;
                      </a>
                      <button
                        onClick={() => markRead(it.url)}
                        className="text-faint transition-colors hover:text-ink"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {moreAfter > 0 && (
        <p className="mt-8 text-center text-xs uppercase tracking-[0.2em] text-faint">
          {moreAfter} more {moreAfter === 1 ? "story" : "stories"} after these
        </p>
      )}

      {read.length > 0 && <ReadSection read={read} onUnread={markUnread} />}
    </div>
  );
}
