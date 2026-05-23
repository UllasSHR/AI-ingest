import fs from "node:fs/promises";
import path from "node:path";

// POST /api/rate
// Appends (or updates) a rating in data/feedback.json at the repo root, so
// brain.js can learn from it on the next run.
//
// NOTE: this writes to the local filesystem. It works when the app is run
// locally (npm run dev / npm start). On Vercel the filesystem is read-only
// and ephemeral, so ratings made on the deployed site live in the browser
// (localStorage) only — see CLAUDE.md for how the loop closes.

const FEEDBACK_PATH = path.join(process.cwd(), "..", "data", "feedback.json");

export async function POST(request) {
  try {
    const entry = await request.json();
    if (!entry?.url || typeof entry.rating !== "number") {
      return Response.json({ ok: false, error: "bad payload" }, { status: 400 });
    }

    let list = [];
    try {
      list = JSON.parse(await fs.readFile(FEEDBACK_PATH, "utf8"));
      if (!Array.isArray(list)) list = [];
    } catch {
      /* file doesn't exist yet — start fresh */
    }

    const record = {
      url: entry.url,
      title: entry.title ?? "",
      source: entry.source ?? "",
      rating: entry.rating,
      date: entry.date ?? null,
      ratedAt: new Date().toISOString(),
    };

    const i = list.findIndex((e) => e.url === entry.url);
    if (i >= 0) list[i] = record;
    else list.push(record);

    await fs.writeFile(FEEDBACK_PATH, JSON.stringify(list, null, 2));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
