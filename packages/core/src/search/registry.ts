import type { Config } from "../schemas.js";
import { createBuiltinProvider, keywordHits } from "./builtin.js";
import { type SearchConfig, budgetForStage, loadSearchConfig } from "./config.js";
import { packHits } from "./pack.js";
import type { RawHit, SearchProvider, SearchQuery, SearchResult, SearchScope } from "./types.js";

const extra = new Map<string, SearchProvider>();

export function registerSearchProvider(provider: SearchProvider): void {
  extra.set(provider.id, provider);
}

export function clearRegisteredSearchProviders(): void {
  extra.clear();
}

export function fallbackWarning(name: string): string {
  return `Search provider "${name}" is unavailable. Using built-in keyword search.`;
}

export function resolveSearchProvider(
  projectRoot: string,
  config: Config,
  search: SearchConfig,
): SearchProvider {
  const builtin = createBuiltinProvider(projectRoot, config);
  const name = search.provider || "builtin";
  if (name === "builtin") return builtin;
  const registered = extra.get(name);
  let active: SearchProvider = registered ?? builtin;
  let warning = registered ? undefined : fallbackWarning(name);
  const mark = () => {
    warning = fallbackWarning(name);
    active = builtin;
  };
  return {
    id: active.id,
    async index(changed) {
      try {
        return await active.index(changed);
      } catch (err) {
        if (active.id === "builtin") throw err;
        mark();
        return builtin.index(changed);
      }
    },
    async search(query, options) {
      try {
        const result = await active.search(query, options);
        if (warning) result.warning = warning;
        result.provider = "builtin";
        return result;
      } catch (err) {
        if (active.id === "builtin") throw err;
        mark();
        await builtin.index();
        const result = await builtin.search(query, options);
        result.warning = warning;
        result.provider = "builtin";
        return result;
      }
    },
    stats() {
      return active.stats();
    },
  };
}

const SCOPE_ORDER: Record<SearchScope, number> = { specs: 0, memory: 1, code: 2 };

function safeMessage(err: unknown, projectRoot: string): string {
  const raw = err instanceof Error ? err.message : "Search failed.";
  if (!raw) return "Search failed.";
  if (!projectRoot || !raw.includes(projectRoot)) return raw;
  return raw.split(projectRoot).join("") || "Search failed.";
}

export async function buildRetrievedInner(
  projectRoot: string,
  config: Config,
  title: string,
  stage: string | undefined,
  budget: number | undefined,
): Promise<string> {
  let search: SearchConfig;
  try {
    search = await loadSearchConfig(projectRoot);
  } catch (err) {
    return `Retrieved context skipped: ${safeMessage(err, projectRoot)}.`;
  }
  const limit = budget ?? budgetForStage(search, stage);
  const provider = resolveSearchProvider(projectRoot, config, search);
  try {
    await provider.index();
  } catch (err) {
    const message =
      provider.id === "builtin" ? safeMessage(err, projectRoot) : fallbackWarning(search.provider);
    return `Retrieved context skipped: ${message}.`;
  }
  try {
    const hits: RawHit[] = [];
    for (const scope of ["specs", "memory", "code"] as const) {
      hits.push(...(await keywordHits(projectRoot, title, scope, search.k)));
    }
    hits.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      if (scopeDelta !== 0) return scopeDelta;
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    });
    return packHits({ preamble: "", hits, budget: limit }).text;
  } catch (err) {
    const message =
      search.provider === "builtin"
        ? safeMessage(err, projectRoot)
        : fallbackWarning(search.provider);
    return `Retrieved context skipped: ${message}.`;
  }
}

export async function executeSearch(
  projectRoot: string,
  config: Config,
  query: string,
  scope: SearchScope,
  budget: number | undefined,
): Promise<SearchResult> {
  const search = await loadSearchConfig(projectRoot);
  const provider = resolveSearchProvider(projectRoot, config, search);
  await provider.index();
  const options: SearchQuery = {
    scope,
    k: search.k,
    budget: budget ?? search.budgets.default,
  };
  return provider.search(query, options);
}
