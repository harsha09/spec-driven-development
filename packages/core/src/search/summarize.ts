import { decode, encode } from "gpt-tokenizer/encoding/cl100k_base";
import { countTokens } from "./tokenize.js";

export const SUMMARY_TOKEN_CAP = 80;

function clipToTokens(text: string, cap: number): string {
  const ids = encode(text);
  let n = Math.min(cap, ids.length);
  let clipped = n === 0 ? "" : decode(ids.slice(0, n));
  if (clipped.endsWith("\n")) clipped = clipped.slice(0, -1);
  while (n > 0 && countTokens(clipped) > cap) {
    n -= 1;
    clipped = n === 0 ? "" : decode(ids.slice(0, n));
    if (clipped.endsWith("\n")) clipped = clipped.slice(0, -1);
  }
  return clipped;
}

/** Deterministic extract. Same signature and body always return the same string. */
export function extractiveSummary(signature: string, body: string): string {
  if (countTokens(body) <= SUMMARY_TOKEN_CAP) return body;
  const keepHeading =
    signature.length > 0 &&
    signature !== "(preamble)" &&
    body.startsWith(signature) &&
    (body.length === signature.length || body.charCodeAt(signature.length) === 10) &&
    countTokens(signature) <= SUMMARY_TOKEN_CAP;
  if (!keepHeading) return clipToTokens(body, SUMMARY_TOKEN_CAP);
  const rest = body.slice(signature.length);
  const restIds = encode(rest);
  let lo = 0;
  let hi = restIds.length;
  let best = signature;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const tail = mid === 0 ? "" : decode(restIds.slice(0, mid));
    const candidate = signature + tail;
    if (countTokens(candidate) <= SUMMARY_TOKEN_CAP) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best.endsWith("\n")) {
    const stripped = best.slice(0, -1);
    if (countTokens(stripped) <= SUMMARY_TOKEN_CAP && stripped.startsWith(signature)) {
      best = stripped;
    }
  }
  return best;
}
