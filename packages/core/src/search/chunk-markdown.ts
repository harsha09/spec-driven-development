export interface MarkdownChunk {
  symbol: string;
  startLine: number;
  endLine: number;
  signature: string;
  body: string;
}

function toLines(text: string): string[] {
  let normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (normalized.endsWith("\n")) normalized = normalized.slice(0, -1);
  if (!normalized) return [];
  return normalized.split("\n");
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i += 1;
  return i;
}

function fenceOpen(line: string): { ch: string; len: number } | null {
  const spaces = leadingSpaces(line);
  if (spaces > 3) return null;
  let i = spaces;
  if (i >= line.length) return null;
  const ch = line[i] ?? "";
  if (ch !== "`" && ch !== "~") return null;
  let len = 0;
  while (i < line.length && line[i] === ch) {
    len += 1;
    i += 1;
  }
  if (len < 3) return null;
  return { ch, len };
}

function fenceClose(line: string, open: { ch: string; len: number }): boolean {
  const spaces = leadingSpaces(line);
  if (spaces > 3) return false;
  let i = spaces;
  let len = 0;
  while (i < line.length && line[i] === open.ch) {
    len += 1;
    i += 1;
  }
  if (len < open.len) return false;
  while (i < line.length) {
    if (line.charCodeAt(i) !== 32) return false;
    i += 1;
  }
  return true;
}

function headingSymbol(line: string): string | null {
  let i = 0;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i += 1;
  let hashes = 0;
  while (i < line.length && line[i] === "#" && hashes < 7) {
    hashes += 1;
    i += 1;
  }
  if (hashes < 1 || hashes > 6) return null;
  if (line[i] !== " ") return null;
  i += 1;
  let text = line.slice(i);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 32) end -= 1;
  text = text.slice(0, end);
  return text;
}

function hasNonWhitespace(lines: string[]): boolean {
  for (const line of lines) {
    for (const ch of line) {
      const code = ch.codePointAt(0) ?? 0;
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) return true;
    }
  }
  return false;
}

export function chunkMarkdown(text: string): MarkdownChunk[] {
  const lines = toLines(text);
  if (!lines.length) return [];
  let open: { ch: string; len: number } | null = null;
  const headings: { line: number; symbol: string; raw: string }[] = [];
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n] ?? "";
    if (open) {
      if (fenceClose(line, open)) open = null;
      continue;
    }
    const fence = fenceOpen(line);
    if (fence) {
      open = fence;
      continue;
    }
    const symbol = headingSymbol(line);
    if (symbol != null) headings.push({ line: n + 1, symbol, raw: line });
  }

  const chunks: MarkdownChunk[] = [];
  const first = headings[0]?.line ?? lines.length + 1;
  if (first > 1) {
    const pre = lines.slice(0, first - 1);
    if (hasNonWhitespace(pre)) {
      chunks.push({
        symbol: "(preamble)",
        startLine: 1,
        endLine: first - 1,
        signature: "(preamble)",
        body: pre.join("\n"),
      });
    }
  }
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]!;
    const next = headings[i + 1]?.line ?? lines.length + 1;
    const start = heading.line;
    const end = next - 1;
    chunks.push({
      symbol: heading.symbol,
      startLine: start,
      endLine: end,
      signature: heading.raw,
      body: lines.slice(start - 1, end).join("\n"),
    });
  }
  return chunks;
}
