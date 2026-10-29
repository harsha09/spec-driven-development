/**
 * Artifact content quality — existence alone is not "stage complete"
 * (templates are materialized on stage entry and would otherwise auto-pass).
 */

const PLACEHOLDER_WORD = /^(?:TBD|TODO|N\/A|NA|none|tbd|todo|n\/a|\.{3}|…|-|—|–|_|\*)$/i;

/** A table cell that is only a row number, blank, or a placeholder word. */
function isPlaceholderCell(cell: string): boolean {
  const text = cell.trim();
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (PLACEHOLDER_WORD.test(text)) return true;
  if (/^[-–—_.:]+$/.test(text)) return true;
  return false;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && /^\|.*\|$/.test(trimmed);
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Meaningful cell text from a body row. Blank cells, placeholders, and row
 * numbers alone are dropped. Header rows are excluded by the caller (the row
 * immediately before a `|---|` separator).
 */
function tableRowToText(line: string): string {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.filter((cell) => !isPlaceholderCell(cell)).join(" ");
}

/** Instructional prose, empty field labels, and default checkbox choices. */
function isInstructionalLine(line: string): boolean {
  const text = line
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!text) return true;
  if (PLACEHOLDER_WORD.test(text)) return true;
  if (/^[-–—_.*\s]+$/.test(text)) return true;
  if (/^\{\{[^}]+\}\}$/.test(text)) return true;
  if (/^<[^>\n]+>$/.test(text)) return true;
  if (/^<!--/.test(text)) return true;
  if (/^[^:]{1,48}:\s*$/.test(text)) return true;
  if (/^(?:Q|A):\s*$/i.test(text)) return true;
  // Default checkbox choices are the template, not a recorded decision.
  if (
    /^(?:Approve(?: with conditions)?|Reject|Promote to feature change|Abandon|Needs more research)$/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/^No blocking unknowns remain\b/i.test(text)) return true;
  // Short questions are writer prompts ("What just finished?").
  if (/\?\s*$/.test(text) && text.length < 140) return true;
  if (/^(?:As a|I want|So that)\b/i.test(text) && /…|\.\.\./.test(text)) return true;
  if (/^sdd (?:skip|backlog)\b/i.test(text)) return true;
  if (/^Optional stage\b/i.test(text)) return true;
  if (/^skip if nothing is ambiguous\b/i.test(text)) return true;
  if (/^Copy the block below\b/i.test(text)) return true;
  if (/^Keep Status\b/i.test(text)) return true;
  if (/^Each feature should fit\b/i.test(text)) return true;
  if (/^Greenfield —/i.test(text)) return true;
  if (/^MVP only\b/i.test(text)) return true;
  if (/^US-\d+:/i.test(text) && /…|\.\.\./.test(text)) return true;
  if (/^F-\d+:\s*</i.test(text)) return true;
  // Unfilled field labels only. A filled "Summary: User adds a receipt." is content.
  if (/^(?:Status|Priority|Workflow|Summary|Requirements|Notes):\s*$/i.test(text)) return true;
  if (
    /^(?:Status|Priority|Workflow):\s*(?:planned|must|should|could|feature|hotfix|patch|spike)\s*$/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/^Summary:\s*One or two sentences\b/i.test(text)) return true;
  if (/^Requirements:\s*R-\d+\s*$/i.test(text)) return true;
  if (/^One or two sentences\b/i.test(text)) return true;
  if (/^R-\d+$/i.test(text)) return true;
  if (/^(?:planned|must|should|feature)$/i.test(text)) return true;
  if (/^How to write a feature$/i.test(text)) return true;
  if (/^paste local commands$/i.test(text)) return true;
  return false;
}

/** Strip comments/headings/empty bullets/instructional template prose; require real prose. */
export function isSubstantiveArtifactContent(content: string): boolean {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, "");
  const rawLines = withoutComments.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]?.replace(/`+/g, "") ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^>\s/.test(trimmed)) continue;
    if (isTableRow(trimmed)) {
      const next = rawLines[i + 1]?.replace(/`+/g, "").trim() ?? "";
      // Header row sits immediately above the separator; neither is content.
      if (isSeparatorRow(trimmed) || isSeparatorRow(next)) continue;
      const kept = tableRowToText(trimmed);
      if (kept) lines.push(kept);
      continue;
    }
    if (isInstructionalLine(line)) continue;
    lines.push(line);
  }

  const stripped = lines.join("\n").trim();

  // Require enough non-placeholder body
  if (stripped.length < 48) return false;

  // Reject if almost only dashes/placeholders
  const meaningful = stripped
    .replace(/[-–—_.\s|#*`]/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\b(TBD|TODO|N\/A|none|n\/a)\b/gi, "");
  return meaningful.length >= 32;
}

function isTaskStub(line: string): boolean {
  const text = line
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .trim();
  return /^Task \d+$/i.test(text);
}

function h2Sections(content: string): Map<string, string> {
  const buffers = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (match?.[1]) {
      current = match[1];
      if (!buffers.has(current)) buffers.set(current, []);
      continue;
    }
    if (current) buffers.get(current)?.push(line);
  }
  const sections = new Map<string, string>();
  for (const [heading, lines] of buffers) sections.set(heading, lines.join("\n"));
  return sections;
}

function sectionHasLine(body: string): boolean {
  const rawLines = body.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || /^Request:/.test(trimmed) || /^#{1,6}\s+/.test(trimmed)) continue;
    if (isTableRow(trimmed)) {
      const next = rawLines[i + 1]?.trim() ?? "";
      if (isSeparatorRow(trimmed) || isSeparatorRow(next)) continue;
      const kept = tableRowToText(trimmed);
      if (!kept || isTaskStub(kept) || isInstructionalLine(kept)) continue;
      return true;
    }
    if (isInstructionalLine(line) || isTaskStub(line)) continue;
    return true;
  }
  return false;
}

/** Guide-only. `sdd next` keeps using `isSubstantiveArtifactContent`. */
export function headingsFilled(content: string, headings: string[]): boolean {
  if (headings.length === 0) return true;
  const sections = h2Sections(content);
  for (const heading of headings) {
    const body = sections.get(heading);
    if (body === undefined || !sectionHasLine(body)) return false;
  }
  return true;
}

export function incompleteArtifactReason(path: string, content: string | null): string | null {
  if (content == null) {
    return `Missing required artifact: ${path}`;
  }
  if (!isSubstantiveArtifactContent(content)) {
    return [
      `Required artifact still incomplete (looks like empty template/stub): ${path}`,
      ``,
      `Open that file and replace the template with a few real sentences, for example:`,
      `  - What is broken or missing?`,
      `  - What will you change?`,
      `  - How will you know it worked?`,
      ``,
      `Then run: sdd next`,
      `Optional stages only: sdd skip <stage> -r "not needed"`,
    ].join("\n");
  }
  return null;
}
