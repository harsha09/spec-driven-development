import type { Config } from "../schemas.js";
import { createBuiltinProvider, rankScope } from "./builtin.js";
import { type SearchConfig, budgetForStage, loadSearchConfig } from "./config.js";
import { type SearchRuntime, embedSearchQuery, resolveEmbedder } from "./embed.js";
import { packHits } from "./pack.js";
import { mergeRankedHits } from "./rrf.js";
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

function joinWarning(left?: string, right?: string): string | undefined {
  if (left && right) return `${left}\n${right}`;
  return left || right;
}

export function resolveSearchProvider(
  projectRoot: string,
  config: Config,
  search: SearchConfig,
  runtime?: SearchRuntime,
): SearchProvider {
  const builtin = createBuiltinProvider(projectRoot, config, runtime);
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
        result.warning = joinWarning(warning, result.warning);
        result.provider = "builtin";
        return result;
      } catch (err) {
        if (active.id === "builtin") throw err;
        mark();
        await builtin.index();
        const result = await builtin.search(query, options);
        result.warning = joinWarning(warning, result.warning);
        result.provider = "builtin";
        return result;
      }
    },
    stats() {
      return active.stats();
    },
  };
}

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
  runtime?: SearchRuntime,
): Promise<string> {
  let search: SearchConfig;
  try {
    search = await loadSearchConfig(projectRoot);
  } catch (err) {
    return `Retrieved context skipped: ${safeMessage(err, projectRoot)}.`;
  }
  const limit = budget ?? budgetForStage(search, stage);
  const provider = resolveSearchProvider(projectRoot, config, search, runtime);
  try {
    await provider.index();
  } catch (err) {
    const message =
      provider.id === "builtin" ? safeMessage(err, projectRoot) : fallbackWarning(search.provider);
    return `Retrieved context skipped: ${message}.`;
  }
  try {
    const embedder = await resolveEmbedder(projectRoot, search.embeddings, runtime);
    const embedded = await embedSearchQuery(embedder, search.embeddings, title);
    const hits: RawHit[] = [];
    for (const scope of ["specs", "memory", "code"] as const) {
      const ranked = await rankScope(projectRoot, title, scope, search.k, {
        embeddings: search.embeddings,
        queryVec: embedded.queryVec,
        failure: embedded.failure,
      });
      hits.push(...ranked.hits);
    }
    return packHits({ preamble: "", hits: mergeRankedHits(hits), budget: limit }).text;
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
