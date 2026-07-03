import brief from "../brief.json";
import BriefList from "./brief-list";

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function Home() {
  const items = brief.items ?? [];
  const dateStr = formatDate(brief.date);

  return (
    <div className="relative min-h-full">
      {/* soft gold glow behind the masthead for warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(230,180,80,0.10), transparent 70%)",
        }}
      />

      <main className="relative mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <header className="mb-14">
          <div className="flex items-center gap-3">
            <span className="h-px w-10 bg-gold/70" />
            <p className="text-xs font-medium uppercase tracking-[0.35em] text-gold">
              AI&middot;Ingest
            </p>
          </div>
          <h1 className="mt-5 font-display text-5xl font-light leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Your morning brief
          </h1>
          <p className="mt-4 text-sm tracking-wide text-muted">
            {dateStr && <>{dateStr} &middot; </>}
            {items.length} things worth your attention
          </p>
        </header>

        <BriefList items={items} date={brief.date} />

        <footer className="mt-20 border-t border-line pt-8">
          <p className="font-display text-lg italic text-muted">
            Read what matters, then close the tab.
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-faint">
            Back tomorrow morning
          </p>
        </footer>
      </main>
    </div>
  );
}
