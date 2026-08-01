/**
 * Sanitize env maps for child processes (MCP stdio, verify commands).
 */

/** Drop undefined; coerce values to strings for spawn env. */
export function toProcessEnv(
  base: NodeJS.ProcessEnv | Record<string, string | undefined>,
  extra?: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) out[k] = String(v);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) out[k] = String(v);
    }
  }
  return out;
}
