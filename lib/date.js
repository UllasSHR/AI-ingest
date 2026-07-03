// lib/date.js
// UTC keeps CI (GitHub Actions, always UTC) and local runs consistent.
export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
