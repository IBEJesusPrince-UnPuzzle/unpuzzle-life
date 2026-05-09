// parseServerError — shared helper for converting apiRequest errors into a
// human-readable string for toasts.
//
// apiRequest throws errors of the shape `<status>: <body>` (e.g. `400: {"error":"..."}`).
// We pull out the JSON body's `error` field when present; otherwise fall back
// to the original message or the provided fallback.
//
// Originally inlined in project-edit.tsx and responsibility-edit.tsx; extracted
// in PR #26 so new task components can share the same logic.
export function parseServerError(err: Error, fallback: string): string {
  const msg = err.message ?? fallback;
  const m = msg.match(/^\d+:\s*(\{.*\})$/);
  if (!m) return msg || fallback;
  try {
    const body = JSON.parse(m[1]);
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* fall through */
  }
  return fallback;
}
