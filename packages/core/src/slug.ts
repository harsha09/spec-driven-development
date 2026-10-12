const SLUG_MAX = 60;

/** Trailing `#152` or `(#152)`. Leading zeros are kept. Bare numbers are ordinary tokens. */
function trailingIssueRef(input: string): string | undefined {
  return input.match(/#\s*(\d+)\s*\)?\s*$/)?.[1];
}

/**
 * Lowercase, strip quotes, collapse non-alphanumerics to `-`.
 * At most 60 characters, cut only on token boundaries.
 * A trailing `#NNN` is kept whole when it fits, never sliced into a shorter number.
 */
export function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length <= SLUG_MAX) return normalized;

  const issue = trailingIssueRef(input);
  const tokens = normalized.split("-").filter(Boolean);
  const body = issue && tokens.at(-1) === issue ? tokens.slice(0, -1) : tokens;
  const reserve = issue && issue.length <= SLUG_MAX ? issue.length + 1 : 0;

  const kept: string[] = [];
  let length = 0;
  for (const token of body) {
    const next = length === 0 ? token.length : length + 1 + token.length;
    if (next + reserve > SLUG_MAX) break;
    kept.push(token);
    length = next;
  }

  if (reserve && issue) {
    if (kept.length === 0) return issue;
    return `${kept.join("-")}-${issue}`;
  }

  return kept.join("-");
}

export function todayIsoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function nowIso(d = new Date()): string {
  return d.toISOString();
}

export function changeDirName(title: string, d = new Date()): string {
  const slug = slugify(title) || "change";
  return `${todayIsoDate(d)}-${slug}`;
}

/** Append -2, -3, … when base id is already taken. */
export function uniqueChangeDirName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
