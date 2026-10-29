const SLUG_MAX = 60;

function isSpace(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  return (
    code === 9 ||
    code === 10 ||
    code === 11 ||
    code === 12 ||
    code === 13 ||
    code === 32 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= "0" && ch <= "9";
}

function isSlugChar(ch: string): boolean {
  return ch.length === 1 && ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9"));
}

/** Trailing `#152` or `(#152)`. Leading zeros are kept. Bare numbers are ordinary tokens. */
function trailingIssueRef(input: string): string | undefined {
  let i = input.length - 1;
  while (i >= 0 && isSpace(input[i] ?? "")) i -= 1;
  if (i >= 0 && input[i] === ")") {
    i -= 1;
    while (i >= 0 && isSpace(input[i] ?? "")) i -= 1;
  }
  const digits: string[] = [];
  while (i >= 0 && isDigit(input[i] ?? "")) {
    digits.push(input[i] ?? "");
    i -= 1;
  }
  if (digits.length === 0) return undefined;
  while (i >= 0 && isSpace(input[i] ?? "")) i -= 1;
  if (input[i] !== "#") return undefined;
  digits.reverse();
  return digits.join("");
}

function collapse(input: string): string {
  let out = "";
  let dash = false;
  for (const ch of input) {
    if (ch === "'" || ch === '"') continue;
    if (isSlugChar(ch)) {
      out += ch;
      dash = false;
      continue;
    }
    if (!dash && out.length > 0) {
      out += "-";
      dash = true;
    }
  }
  if (out.endsWith("-")) return out.slice(0, -1);
  return out;
}

/**
 * Lowercase, strip quotes, collapse non-alphanumerics to `-`.
 * At most 60 characters, cut only on token boundaries.
 * A trailing `#NNN` is kept whole when it fits, never sliced into a shorter number.
 */
export function slugify(input: string): string {
  const normalized = collapse(input.toLowerCase().trim());

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
