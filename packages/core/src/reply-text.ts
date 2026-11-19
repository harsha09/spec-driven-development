const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

function withoutThink(raw: string): string {
  let text = raw;
  for (;;) {
    const lower = text.toLowerCase();
    const open = lower.indexOf(THINK_OPEN);
    if (open < 0) return text;
    const close = lower.indexOf(THINK_CLOSE, open + THINK_OPEN.length);
    if (close < 0) return text;
    text = text.slice(0, open) + text.slice(close + THINK_CLOSE.length);
  }
}

function withoutFence(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith("```") || !text.endsWith("```") || text.length < 6) return text;
  const newline = text.indexOf("\n");
  if (newline < 0) return text;
  return text.slice(newline + 1, text.length - 3).trim();
}

/**
 * A model reply as the parsers should read it: without any `<think>...</think>` block and
 * without one surrounding code fence. A reply that needs nothing removed comes back trimmed.
 */
export function cleanReply(raw: string): string {
  return withoutFence(withoutThink(raw));
}
