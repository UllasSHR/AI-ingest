"use client";

import { useEffect, useMemo, useState } from "react";

const FILTERS = ["all", "easy", "medium", "hard"];

function difficultyStyles(difficulty) {
  if (difficulty === "easy") return "border-emerald-500/30 text-emerald-200";
  if (difficulty === "hard") return "border-rose-500/30 text-rose-200";
  return "border-gold/30 text-gold-bright";
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="font-display text-3xl font-light text-ink">No market scan yet.</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        Run the opportunity pipeline to fill this tab with real problems, source
        links, difficulty, price signal, and the next validation action.
      </p>
      <p
        className="mt-6 text-xs text-faint"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      >
        npm run opportunities
      </p>
    </div>
  );
}

export default function OpportunityList({ items, date }) {
  const savedKey = `ai-ingest-opportunities-saved`;
  const [filter, setFilter] = useState("all");
  const [savedUrls, setSavedUrls] = useState([]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setSavedUrls(JSON.parse(localStorage.getItem(savedKey) || "[]"));
      } catch {
        /* ignore corrupt storage */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [savedKey]);

  function toggleSaved(url) {
    const next = savedUrls.includes(url)
      ? savedUrls.filter((u) => u !== url)
      : [...new Set([...savedUrls, url])];
    setSavedUrls(next);
    localStorage.setItem(savedKey, JSON.stringify(next));
  }

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.difficulty === filter);
  }, [filter, items]);

  if (!items.length) return <EmptyState />;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-faint">
            Market scan for {date}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Problems worth validating before you build: source pain, customer,
            smallest MVP, and proof of completion.
          </p>
        </div>

        <div className="grid grid-cols-4 rounded-xl border border-line bg-card p-1 text-xs">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-2 capitalize transition-colors ${
                filter === value
                  ? "bg-ink text-bg"
                  : "text-faint hover:bg-card-hover hover:text-muted"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {filtered.map((item, i) => {
          const saved = savedUrls.includes(item.url);
          return (
            <article
              key={item.url}
              className="group animate-rise rounded-2xl border border-line bg-card p-6 transition-all duration-300 hover:border-gold/40 hover:bg-card-hover"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-display text-2xl font-light tabular-nums text-gold/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="font-display text-xl font-normal leading-snug text-ink">
                      {item.title}
                    </h2>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${difficultyStyles(item.difficulty)}`}
                      >
                        {item.difficulty}
                      </span>
                      <span className="rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-faint">
                        {item.price_hint}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-4 text-sm leading-relaxed text-muted">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                        Customer
                      </dt>
                      <dd className="mt-1 text-ink">{item.customer}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                        Source pain
                      </dt>
                      <dd className="mt-1">{item.source_problem}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                        Small MVP
                      </dt>
                      <dd className="mt-1">{item.build_shape}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                        Why they might pay
                      </dt>
                      <dd className="mt-1">{item.willingness_to_pay}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 rounded-xl border border-line/70 bg-bg/40 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-faint">
                      Next 60-90 minutes
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink">
                      {item.first_action}
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Proof: {item.proof}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-4 text-sm">
                    <span className="text-xs uppercase tracking-[0.18em] text-faint">
                      {item.source}
                    </span>
                    <div className="flex items-center gap-5">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gold transition-colors hover:text-gold-bright"
                      >
                        Source &#8599;
                      </a>
                      <button
                        type="button"
                        onClick={() => toggleSaved(item.url)}
                        className={`transition-colors ${
                          saved ? "text-gold-bright" : "text-faint hover:text-ink"
                        }`}
                      >
                        {saved ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="mt-10 text-center text-sm text-muted">
          No {filter} opportunities in today&apos;s scan.
        </p>
      )}
    </div>
  );
}
