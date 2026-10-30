import { callMcpSourceTool, mcpTimeoutMs } from "../mcp/client.js";
import { loadMcpConfig } from "../mcp/sources.js";
import type { McpSource } from "../mcp/types.js";
import type { SearchConfig } from "./config.js";
import { loadExcluder } from "./exclude.js";
import { packHits, searchPreamble } from "./pack.js";
import type {
  IndexStats,
  RawHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchScope,
} from "./types.js";

export interface McpToolResult {
  ok: boolean;
  text: string;
}

export type McpSearchCall = (input: {
  sourceId: string;
  tool: string;
  args: Record<string, unknown>;
}) => Promise<McpToolResult>;

export interface SearchRunOptions {
  mcpCall?: McpSearchCall;
  mcpTimeoutMs?: number;
}

class McpSearchError extends Error {
  constructor() {
    super("Search provider is unavailable.");
    this.name = "McpSearchError";
  }
}

interface Ready {
  sourceId: string;
  tool: string;
  exclude: (rel: string) => boolean;
  call: McpSearchCall;
}

function emptyStats(considered = 0, reindexed = 0): IndexStats {
  return {
    provider: "mcp",
    files: 0,
    chunks: 0,
    lastIndexFilesConsidered: considered,
    lastIndexFilesReindexed: reindexed,
    lastIndexChunksReindexed: 0,
    lastIndexChunksEmbedded: 0,
    indexedCommit: null,
  };
}

/** Relative project path. Absolute paths, `.`, and `..` are refused before any send. */
function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.length >= 2 && path.charCodeAt(1) === 58) {
    const c = path.charCodeAt(0);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return false;
  }
  const parts = path.replaceAll("\\", "/").split("/");
  for (const part of parts) {
    if (part.length === 0 || part === "." || part === "..") return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new McpSearchError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new McpSearchError());
      },
    );
  });
}

function allowedPaths(paths: readonly string[], exclude: (rel: string) => boolean): string[] {
  const kept: string[] = [];
  for (const raw of paths) {
    const path = raw.replaceAll("\\", "/");
    if (!isSafeRelativePath(path) || exclude(path)) continue;
    kept.push(path);
  }
  return kept;
}

function positive(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function firstLine(body: string): string {
  const nl = body.indexOf("\n");
  return nl === -1 ? body : body.slice(0, nl);
}

function asHit(
  value: unknown,
  scope: SearchScope,
  exclude: (rel: string) => boolean,
): RawHit | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rec = value as Record<string, unknown>;
  if (typeof rec.path !== "string") return undefined;
  const path = rec.path.replaceAll("\\", "/");
  if (!isSafeRelativePath(path) || exclude(path)) return undefined;
  const startLine = positive(rec.startLine);
  const endLine = positive(rec.endLine);
  if (startLine === undefined || endLine === undefined || endLine < startLine) return undefined;
  if (typeof rec.symbol !== "string") return undefined;
  const symbol = rec.symbol.trim();
  if (!symbol || typeof rec.body !== "string") return undefined;
  const signature = typeof rec.signature === "string" ? rec.signature : firstLine(rec.body);
  const language = typeof rec.language === "string" ? rec.language : "";
  const score = typeof rec.score === "number" && Number.isFinite(rec.score) ? rec.score : 0;
  return { scope, path, startLine, endLine, symbol, score, signature, body: rec.body, language };
}

/** Empty `hits` is a real answer. Prose and a missing array are not. */
function parseHits(text: string, scope: SearchScope, exclude: (rel: string) => boolean): RawHit[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new McpSearchError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new McpSearchError();
  const hits = (parsed as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) throw new McpSearchError();
  const out: RawHit[] = [];
  for (const hit of hits) {
    const row = asHit(hit, scope, exclude);
    if (row) out.push(row);
  }
  return out;
}

async function connect(input: {
  projectRoot: string;
  search: SearchConfig;
  call?: McpSearchCall;
}): Promise<Ready> {
  const exclude = await loadExcluder(input.projectRoot, input.search.exclude);
  let sources: McpSource[] = [];
  try {
    const cfg = await loadMcpConfig(input.projectRoot);
    sources = cfg.sources.filter((source) => source.enabled);
  } catch {
    throw new McpSearchError();
  }
  const named = input.search.mcp_source;
  const source = named
    ? sources.find((item) => item.id === named)
    : sources.length === 1
      ? sources[0]
      : undefined;
  if (!source) throw new McpSearchError();
  const tool = input.search.mcp_tool || source.invoke?.tool;
  if (!tool) throw new McpSearchError();
  if (source.tools?.length && !source.tools.includes(tool)) throw new McpSearchError();
  const call: McpSearchCall =
    input.call ??
    (async (req) => {
      const result = await callMcpSourceTool(source, input.projectRoot, req.tool, req.args);
      return { ok: result.ok, text: result.text };
    });
  return { sourceId: source.id, tool, exclude, call };
}

export function openMcpSearchProvider(input: {
  projectRoot: string;
  search: SearchConfig;
  call?: McpSearchCall;
  timeoutMs?: number;
}): SearchProvider {
  const timeoutMs = input.timeoutMs ?? mcpTimeoutMs();
  let ready: Ready | undefined;
  async function load(): Promise<Ready> {
    if (ready) return ready;
    ready = await connect(input);
    return ready;
  }
  return {
    id: "mcp",
    async index(changed) {
      const session = await load();
      if (!changed) return emptyStats();
      const paths = allowedPaths(changed, session.exclude);
      if (paths.length === 0) return emptyStats(changed.length);
      const result = await withTimeout(
        session.call({ sourceId: session.sourceId, tool: session.tool, args: { paths } }),
        timeoutMs,
      );
      if (!result.ok) throw new McpSearchError();
      return emptyStats(changed.length, paths.length);
    },
    async search(query: string, options: SearchQuery): Promise<SearchResult> {
      const session = await load();
      const args = { query, scope: options.scope };
      const result = await withTimeout(
        session.call({ sourceId: session.sourceId, tool: session.tool, args }),
        timeoutMs,
      );
      if (!result.ok) throw new McpSearchError();
      const hits = parseHits(result.text, options.scope, session.exclude);
      const preamble = searchPreamble(query, options.scope, options.budget, false, "mcp");
      const packed = packHits({ preamble, hits, budget: options.budget });
      return {
        provider: "mcp",
        query,
        scope: options.scope,
        budget: options.budget,
        usedTokens: packed.usedTokens,
        hits: packed.hits,
        text: packed.text,
      };
    },
    stats() {
      return Promise.resolve(emptyStats());
    },
  };
}
