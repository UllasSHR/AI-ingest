import fs from "node:fs/promises";
import path from "node:path";
import { validateRatePayload } from "../../../../lib/rate-validate.js";

// POST /api/rate
// Appends (or updates) a rating in data/feedback.json at the repo root, so
// brain.js can learn from it on the next run.
//
// NOTE: writes to the local filesystem — works locally (npm run dev / npm start).
// On Vercel the filesystem is read-only; ratings fall back to localStorage only
// until the Supabase write path is wired up (Phase 5).

const FEEDBACK_PATH = path.join(process.cwd(), "..", "data", "feedback.json");
const MAX_ENTRIES = 500;

export async function POST(request) {
  try {
    const entry = await request.json();
    const err = validateRatePayload(entry);
    if (err) return Response.json({ ok: false, error: err }, { status: 400 });

    let list = [];
    try {
      list = JSON.parse(await fs.readFile(FEEDBACK_PATH, "utf8"));
      if (!Array.isArray(list)) list = [];
    } catch {
      /* file doesn't exist yet — start fresh */
    }

    const record = {
      url: entry.url,
      title: (entry.title ?? "").slice(0, 300),
      source: entry.source ?? "",
      rating: entry.rating,
      date: entry.date ?? null,
      ratedAt: new Date().toISOString(),
    };

    const i = list.findIndex((e) => e.url === entry.url);
    if (i >= 0) list[i] = record;
    else list.push(record);

    // Cap list size — drop the oldest entries by ratedAt so the file can't grow forever.
    if (list.length > MAX_ENTRIES) {
      list.sort((a, b) => new Date(a.ratedAt || 0) - new Date(b.ratedAt || 0));
      list = list.slice(list.length - MAX_ENTRIES);
    }

    await fs.writeFile(FEEDBACK_PATH, JSON.stringify(list, null, 2));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
