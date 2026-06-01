import brief from "../brief.json";
import opportunities from "../opportunities.json";
import DashboardTabs from "./dashboard-tabs";

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function Home() {
  const safeBrief = {
    date: brief.date,
    items: Array.isArray(brief.items) ? brief.items : [],
  };
  const safeOpportunities = {
    date: opportunities.date || brief.date,
    items: Array.isArray(opportunities.items) ? opportunities.items : [],
  };

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
          <p
            className="text-sm lowercase text-muted"
            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
          >
            ai-ingest
          </p>
          <h1 className="mt-4 font-display text-5xl font-light leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Your morning brief
          </h1>
          <p className="mt-4 text-sm tracking-wide text-muted">
            {formatDate(safeBrief.date)} &middot; {safeBrief.items.length} brief items &middot;{" "}
            {safeOpportunities.items.length} opportunity leads
          </p>
        </header>

        <DashboardTabs brief={safeBrief} opportunities={safeOpportunities} />

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
