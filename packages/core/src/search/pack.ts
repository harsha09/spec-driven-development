import { countTokens } from "./tokenize.js";
import type { RawHit, SearchHit } from "./types.js";

const EN_DASH = "\u2013";

export function searchPreamble(query: string, scope: string, budget: number): string {
  return `# Search\nQuery: ${query}\nScope: ${scope}\nProvider: builtin\nBudget: ${budget}\n\n`;
}

export function renderBlock(hit: RawHit, form: "full" | "signature"): string {
  const fence = hit.language ? `\`\`\`${hit.language}` : "```";
  const body = form === "full" ? hit.body : hit.signature;
  return (
    `### \`${hit.path}\` · \`${hit.symbol}\` (lines ${hit.startLine}${EN_DASH}${hit.endLine}) · ${form}\n` +
    `${fence}\n${body}\n\`\`\`\n`
  );
}

function contains(outer: RawHit, inner: RawHit): boolean {
  return (
    outer.path === inner.path &&
    inner.startLine >= outer.startLine &&
    inner.endLine <= outer.endLine
  );
}

export function packHits(input: {
  preamble: string;
  hits: readonly RawHit[];
  budget: number;
}): { text: string; usedTokens: number; hits: SearchHit[] } {
  const { preamble, hits, budget } = input;
  if (countTokens(preamble) > budget) {
    return { text: "", usedTokens: 0, hits: [] };
  }

  let text = preamble;
  const packed: SearchHit[] = [];
  const full: RawHit[] = [];

  for (const hit of hits) {
    if (full.some((outer) => contains(outer, hit))) continue;
    const fullBlock = renderBlock(hit, "full");
    const fullText = text + fullBlock;
    if (countTokens(fullText) <= budget) {
      text = fullText;
      full.push(hit);
      packed.push({ ...hit, form: "full", text: fullBlock });
      continue;
    }
    const signatureBlock = renderBlock(hit, "signature");
    const signatureText = text + signatureBlock;
    if (countTokens(signatureText) <= budget) {
      text = signatureText;
      packed.push({ ...hit, form: "signature", text: signatureBlock });
    }
  }

  if (!text) return { text: "", usedTokens: 0, hits: packed };
  return { text, usedTokens: countTokens(text), hits: packed };
}
