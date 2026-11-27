import {
  type RequestedScope,
  SEARCH_SCOPES,
  type SearchScope,
  executeSearch,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import { withProject } from "./project.js";

const SCOPES = new Set<string>(SEARCH_SCOPES);

const SCOPE_ERROR =
  'Search scope must be code, specs, memory, or all. Add --scope code|specs|memory, for example: sdd search "todo" --scope code';

/** Omitted scope searches every index. An unknown value is rejected. */
export function resolveSearchScope(value: unknown): RequestedScope | null {
  if (value == null || value === "" || value === "all") return "all";
  if (typeof value === "string" && SCOPES.has(value)) return value as SearchScope;
  return null;
}

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
    description:
      'Keyword search over code, specs, and memory under a token budget, or one opt-in MCP source. Example: sdd search "todo" --scope code',
  },
  args: {
    query: {
      type: "positional",
      description: "Search query",
      required: false,
    },
    scope: {
      type: "string",
      description:
        'code, specs, memory, or all (default: all). Example: sdd search "todo" --scope code',
    },
    budget: {
      type: "string",
      description: "Token budget for the packed stdout (default: budgets.default)",
    },
  },
  async run({ args }) {
    const query = typeof args.query === "string" ? args.query : "";
    if (!query.trim()) fail("Search query is required.");
    const scope = resolveSearchScope(args.scope);
    if (!scope) fail(SCOPE_ERROR);
    const budget = parsePositiveInt(args.budget);
    if (budget === null) fail("Budget must be a positive integer.");
    await withProject(async ({ root, config }) => {
      try {
        const result = await executeSearch(root, config, query, scope, budget);
        if (result.warning) {
          for (const line of result.warning.split("\n")) {
            if (line) consola.warn(line);
          }
        }
        process.stdout.write(result.text);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed.";
        const safe = message.includes(root) ? message.split(root).join("") : message;
        fail(safe.trim() || "Search failed.");
      }
    });
  },
});
