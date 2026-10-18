import { encode } from "gpt-tokenizer/encoding/cl100k_base";

export function countTokens(text: string): number {
  return encode(text).length;
}

/** FTS5 tokens. A token character is 0-9, A-Z, a-z, `_`, or a code point above 127. */
export function ftsTokens(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (const ch of query) {
    const code = ch.codePointAt(0) ?? 0;
    const ok =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 95 ||
      code > 127;
    if (ok) {
      current += ch;
    } else if (current) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
