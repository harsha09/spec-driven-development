import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { listDirs, pathExists } from "./fs.js";
import {
  type ChangeMetrics,
  type ParsedRequest,
  type SessionRef,
  type TokenUsageMetric,
  assertSessionLogAllowed,
  collectSessionUsage,
  phaseAt,
  readChangeMetrics,
  writeChangeMetrics,
} from "./metrics.js";
import { changesDir } from "./paths.js";
import type { Config } from "./schemas.js";

export type MetricsHost = SessionRef["host"];

export interface DiscoverOptions {
  /** Home directory to search under. Default: the user's home. */
  home?: string;
  /** Environment for host config overrides. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Change ids to write to. Default: every change. Attribution always considers all changes. */
  scope?: readonly string[];
}

export interface DiscoveredSession {
  host: MetricsHost;
  sessionId: string;
  /** JSONL file, or a Grok session directory. */
  logPath: string;
}

export interface DiscoverResult {
  /** Every location looked in, with the home directory shown as `~`. */
  searched: string[];
  sessionsFound: number;
  imported: number;
  duplicates: number;
  unmatched: number;
  ignored: number;
  excluded: number;
  hosts: string[];
  incomplete: boolean;
  /** Changes that received new usage. */
  changes: string[];
}

const MAX_HEAD_LINES = 50;

async function realOrResolved(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function insideAny(roots: readonly string[], candidate: string): boolean {
  return roots.some((root) => {
    const rel = relative(root, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}

function shorten(path: string, home: string): string {
  const rel = relative(home, path);
  if (rel === "") return "~";
  if (!rel.startsWith("..") && !isAbsolute(rel)) return `~/${rel.split("\\").join("/")}`;
  return path;
}

/** Claude Code names a project folder after the working directory, with symbols turned into dashes. */
export function claudeProjectDirName(cwd: string): string {
  let out = "";
  for (const ch of cwd) out += /[A-Za-z0-9]/.test(ch) ? ch : "-";
  return out;
}

async function listNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** First `MAX_HEAD_LINES` JSON records of a JSONL file. Stops early when `take` returns a value. */
async function scanHead<T>(
  path: string,
  take: (record: Record<string, unknown>) => T | undefined,
): Promise<T | undefined> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let seen = 0;
  try {
    for await (const line of lines) {
      if (++seen > MAX_HEAD_LINES) break;
      if (!line.trim()) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const found = take(parsed as Record<string, unknown>);
          if (found !== undefined) return found;
        }
      } catch {
        // Not a JSON line. Skip it.
      }
    }
  } catch {
    // Unreadable or truncated JSONL: skip this file and keep scanning other hosts.
    return undefined;
  } finally {
    lines.close();
    stream.destroy();
  }
  return undefined;
}

async function mtimeMs(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

async function discoverClaude(
  roots: readonly string[],
  base: string,
  since: number,
  searched: string[],
  home: string,
): Promise<DiscoveredSession[]> {
  const projects = join(base, "projects");
  searched.push(`${shorten(projects, home)}/ (Claude Code)`);
  const prefixes = roots.map(claudeProjectDirName);
  const found: DiscoveredSession[] = [];
  for (const name of await listNames(projects)) {
    if (!prefixes.some((p) => name === p || name.startsWith(`${p}-`))) continue;
    const dir = join(projects, name);
    for (const file of await listNames(dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const logPath = join(dir, file);
      if ((await mtimeMs(logPath)) < since) continue;
      const cwd = await scanHead(logPath, (r) => (typeof r.cwd === "string" ? r.cwd : undefined));
      if (cwd === undefined) continue;
      if (!insideAny(roots, await realOrResolved(cwd)) && !insideAny(roots, resolve(cwd))) continue;
      found.push({ host: "claude-code", sessionId: basename(file, ".jsonl"), logPath });
    }
  }
  return found;
}

async function walkRollouts(dir: string, depth: number): Promise<string[]> {
  if (depth > 5) return [];
  const out: string[] = [];
  for (const name of await listNames(dir)) {
    const path = join(dir, name);
    if (/^rollout-.*\.jsonl$/.test(name)) out.push(path);
    else if (!name.includes(".")) out.push(...(await walkRollouts(path, depth + 1)));
  }
  return out;
}

async function discoverCodex(
  roots: readonly string[],
  base: string,
  since: number,
  searched: string[],
  home: string,
): Promise<DiscoveredSession[]> {
  const sessions = join(base, "sessions");
  searched.push(`${shorten(sessions, home)}/ (Codex)`);
  const found: DiscoveredSession[] = [];
  for (const logPath of await walkRollouts(sessions, 0)) {
    if ((await mtimeMs(logPath)) < since) continue;
    const meta = await scanHead(logPath, (r) => {
      const payload = r.payload as Record<string, unknown> | undefined;
      if (r.type !== "session_meta" || !payload) return undefined;
      return typeof payload.id === "string" && typeof payload.cwd === "string"
        ? { id: payload.id, cwd: payload.cwd }
        : undefined;
    });
    if (!meta) continue;
    if (!insideAny(roots, await realOrResolved(meta.cwd)) && !insideAny(roots, resolve(meta.cwd))) {
      continue;
    }
    found.push({ host: "codex", sessionId: meta.id, logPath });
  }
  return found;
}

async function discoverGrok(
  roots: readonly string[],
  base: string,
  since: number,
  searched: string[],
  home: string,
): Promise<DiscoveredSession[]> {
  const sessions = join(base, "sessions");
  searched.push(`${shorten(sessions, home)}/ (Grok)`);
  const found: DiscoveredSession[] = [];
  for (const name of await listNames(sessions)) {
    let cwd: string;
    try {
      cwd = decodeURIComponent(name);
    } catch {
      continue;
    }
    if (!isAbsolute(cwd) || !insideAny(roots, resolve(cwd))) continue;
    const dir = join(sessions, name);
    for (const id of await listNames(dir)) {
      const usage = join(dir, id, "usage.json");
      if (!(await pathExists(usage))) continue;
      if ((await mtimeMs(usage)) < since) continue;
      found.push({ host: "grok", sessionId: id, logPath: join(dir, id) });
    }
  }
  return found;
}

/** Find agent sessions for this project in each supported host's default log locations. */
export async function discoverSessions(
  projectRoot: string,
  options: DiscoverOptions & { since?: number } = {},
): Promise<{ sessions: DiscoveredSession[]; searched: string[] }> {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const roots = [...new Set([resolve(projectRoot), await realOrResolved(projectRoot)])];
  const since = options.since ?? 0;
  const searched: string[] = [];
  const claudeBase = env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
  const codexBase = env.CODEX_HOME?.trim() || join(home, ".codex");
  const grokBase = join(home, ".grok");
  const sessions = [
    ...(await discoverClaude(roots, claudeBase, since, searched, home)),
    ...(await discoverCodex(roots, codexBase, since, searched, home)),
    ...(await discoverGrok(roots, grokBase, since, searched, home)),
  ];
  return { sessions, searched };
}

interface ChangeState {
  id: string;
  metrics: ChangeMetrics;
  dirty: boolean;
}

function assignChange(
  states: readonly ChangeState[],
  session: DiscoveredSession,
  request: ParsedRequest,
): ChangeState | undefined {
  const at = Date.parse(request.startedAt);
  const byId = states.find((s) =>
    s.metrics.sessions?.some((r) => r.host === session.host && r.sessionId === session.sessionId),
  );
  if (byId) return byId;

  let launchWinner: { state: ChangeState; launchedAt: number } | undefined;
  for (const state of states) {
    for (const ref of state.metrics.sessions ?? []) {
      if (ref.host !== session.host || ref.sessionId) continue;
      const start = Date.parse(ref.launchedAt);
      const end = ref.endedAt ? Date.parse(ref.endedAt) : Number.POSITIVE_INFINITY;
      if (at >= start && at <= end && (!launchWinner || start > launchWinner.launchedAt)) {
        launchWinner = { state, launchedAt: start };
      }
    }
  }
  if (launchWinner) return launchWinner.state;

  let winner: { state: ChangeState; startedAt: number } | undefined;
  for (const state of states) {
    const phase = phaseAt(state.metrics, request.startedAt);
    if (!phase) continue;
    const start = Date.parse(phase.startedAt);
    if (!winner || start > winner.startedAt) winner = { state, startedAt: start };
  }
  return winner?.state;
}

/**
 * Auto-discover agent sessions for this project and import new usage into the matching
 * changes. Idempotent: a request already stored for any change is never added twice.
 */
export async function discoverAndImportMetrics(
  projectRoot: string,
  config: Config,
  options: DiscoverOptions = {},
): Promise<DiscoverResult> {
  if (!config.metrics.enabled) throw new Error("Metrics are disabled in .sdd/config.yaml.");
  const ids = await listDirs(changesDir(projectRoot, config));
  const states: ChangeState[] = [];
  for (const id of ids) {
    try {
      const metrics = await readChangeMetrics(projectRoot, config, id);
      if (metrics.phases.length || metrics.sessions?.length) {
        states.push({ id, metrics, dirty: false });
      }
    } catch {
      // An unreadable metrics.json is reported by `sdd report`. Discovery leaves it alone.
    }
  }
  const earliest = Math.min(
    ...states.flatMap((s) => s.metrics.phases.map((p) => Date.parse(p.startedAt))),
  );
  const since = Number.isFinite(earliest) ? earliest : 0;

  const { sessions, searched } = await discoverSessions(projectRoot, { ...options, since });
  const result: DiscoverResult = {
    searched,
    sessionsFound: sessions.length,
    imported: 0,
    duplicates: 0,
    unmatched: 0,
    ignored: 0,
    excluded: 0,
    hosts: [],
    incomplete: false,
    changes: [],
  };
  const hosts = new Set<string>();
  const seen = new Set(
    states.flatMap((s) => s.metrics.requests.map((r) => `${r.provider}\0${r.requestId}`)),
  );
  const scope = options.scope ? new Set(options.scope) : undefined;

  for (const session of sessions) {
    try {
      assertSessionLogAllowed(projectRoot, config.metrics.exclude, session.logPath);
    } catch {
      result.excluded += 1;
      continue;
    }
    let usage: Awaited<ReturnType<typeof collectSessionUsage>>;
    try {
      usage = await collectSessionUsage(session.logPath);
    } catch {
      result.ignored += 1;
      continue;
    }
    result.ignored += usage.ignored;
    if (usage.incomplete) result.incomplete = true;
    for (const request of usage.requests) {
      const key = `${request.provider}\0${request.requestId}`;
      if (seen.has(key)) {
        result.duplicates += 1;
        continue;
      }
      const state = assignChange(states, session, request);
      const phase = state ? phaseAt(state.metrics, request.startedAt) : undefined;
      if (!state || !phase) {
        result.unmatched += 1;
        continue;
      }
      if (scope && !scope.has(state.id)) continue;
      seen.add(key);
      const row: TokenUsageMetric = {
        provider: request.provider,
        requestId: request.requestId,
        phase: phase.phase,
        startedAt: request.startedAt,
        inputTokens: request.inputTokens,
        cacheReadTokens: request.cacheReadTokens,
        cacheWriteTokens: request.cacheWriteTokens,
        outputTokens: request.outputTokens,
        measured: true,
      };
      if (request.model) row.model = request.model;
      state.metrics.requests.push(row);
      state.dirty = true;
      result.imported += 1;
      hosts.add(request.provider);
      if (!result.changes.includes(state.id)) result.changes.push(state.id);
    }
  }

  for (const state of states) {
    if (state.dirty) await writeChangeMetrics(projectRoot, config, state.id, state.metrics);
  }
  result.hosts = [...hosts].sort();
  return result;
}
