import { type SearchScope, executeSearch } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import { withProject } from "./project.js";

const SCOPES = new Set<SearchScope>(["code", "specs", "memory"]);

/** Missing values are `undefined`. Anything that is not a positive integer is `null`. */
export function parsePositiveInt(value: unknown): number | null | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return null;
  const text = String(value);
  let i = 0;
  if (text.startsWith("+")) return null;
  if (!text) return null;
  if (text[0] === "0") return null;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return null;
    i += 1;
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

export const searchCmd = defineCommand({
  meta: {
    name: "search",
    description: "Keyword search over code, specs, or memory under a token budget",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query",
      required: false,
    },
    scope: {
      type: "string",
      description: "code, specs, or memory",
    },
    budget: {
      type: "string",
      description: "Token budget for the packed stdout (default: budgets.default)",
    },
  },
  async run({ args }) {
    const query = typeof args.query === "string" ? args.query : "";
    if (!query.trim()) fail("Search query is required.");
    if (!SCOPES.has(args.scope as SearchScope)) {
      fail("Search scope must be code, specs, or memory.");
    }
    const budget = parsePositiveInt(args.budget);
    if (budget === null) fail("Budget must be a positive integer.");
    await withProject(async ({ root, config }) => {
      try {
        const result = await executeSearch(root, config, query, args.scope as SearchScope, budget);
        if (result.warning) consola.warn(result.warning);
        process.stdout.write(result.text);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed.";
        const safe = message.includes(root) ? message.split(root).join("") : message;
        fail(safe.trim() || "Search failed.");
      }
    });
  },
});
