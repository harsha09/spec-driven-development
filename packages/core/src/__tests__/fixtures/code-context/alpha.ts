import { helper } from "./beta.js";

/** Primary export used in dogfood / ranker tests. */
export function buildAgentPrompt(name: string): string {
  return helper(name) + "!";
}

export const unusedLocal = 1;

export class AlphaService {
  run(): string {
    return buildAgentPrompt("alpha");
  }
}
