// lib/rate-validate.js
// Shared validation for POST /api/rate — imported by the route and the tests.
// Returns null on valid input, or an error string.
export function validateRatePayload(entry) {
  if (!entry || typeof entry !== 'object') return 'missing payload';
  if (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5) {
    return 'rating must be an integer between 1 and 5';
  }
  try {
    const u = new URL(entry.url);
    if (!['http:', 'https:'].includes(u.protocol)) return 'url must be http or https';
  } catch {
    return 'url must be a valid URL';
  }
  return null;
}
