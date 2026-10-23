import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { pathExists, readText, writeText } from "./fs.js";
import { changePath } from "./paths.js";
import { WORK_TYPES } from "./role/types.js";
import type { Config } from "./schemas.js";

const UtcTimestampSchema = z.string().datetime();

export const PhaseMetricSchema = z
  .object({
    phase: z.string().min(1),
    startedAt: UtcTimestampSchema,
    endedAt: UtcTimestampSchema.optional(),
  })
  .refine((phase) => !phase.endedAt || Date.parse(phase.endedAt) >= Date.parse(phase.startedAt));

export const TokenUsageMetricSchema = z.object({
  provider: z.enum(["claude-code", "codex", "grok"]),
  model: z.string().min(1).nullable().optional(),
  requestId: z.string().min(1),
  phase: z.string().min(1),
  startedAt: UtcTimestampSchema,
  inputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  measured: z.literal(true),
});

export const DecisionMetricSchema = z.object({
  workType: z.enum(WORK_TYPES),
  kind: z.enum(["reason", "decide"]),
  provider: z.enum(["command", "ollama"]),
  model: z.string().min(1).nullable(),
  startedAt: UtcTimestampSchema,
  inputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});

export const ChangeMetricsSchema = z.object({
  version: z.literal(1),
  phases: z.array(PhaseMetricSchema),
  requests: z.array(TokenUsageMetricSchema),
  decisions: z.array(DecisionMetricSchema).optional(),
});

export type PhaseMetric = z.infer<typeof PhaseMetricSchema>;
export type TokenUsageMetric = z.infer<typeof TokenUsageMetricSchema>;
export type DecisionMetric = z.infer<typeof DecisionMetricSchema>;
export type ChangeMetrics = z.infer<typeof ChangeMetricsSchema>;

export interface MetricsImportResult {
  imported: number;
  duplicates: number;
  ignored: number;
  unmatched: number;
  providers: string[];
  incomplete: boolean;
}

interface ParsedRequest {
  provider: "claude-code" | "codex" | "grok";
  model?: string;
  requestId: string;
  startedAt: string;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
}

const MODEL_ID = /^[A-Za-z0-9._:/-]+$/;

function metricsPath(projectRoot: string, config: Config, changeId: string): string {
  return `${changePath(projectRoot, config, changeId)}/metrics.json`;
}

export function emptyChangeMetrics(): ChangeMetrics {
  return { version: 1, phases: [], requests: [] };
}

export async function readChangeMetrics(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeMetrics> {
  const path = metricsPath(projectRoot, config, changeId);
  if (!(await pathExists(path))) return emptyChangeMetrics();
  return ChangeMetricsSchema.parse(JSON.parse(await readText(path)));
}

async function writeChangeMetrics(
  projectRoot: string,
  config: Config,
  changeId: string,
  metrics: ChangeMetrics,
): Promise<void> {
  const path = metricsPath(projectRoot, config, changeId);
  const validated = ChangeMetricsSchema.parse(metrics);
  await writeText(path, `${JSON.stringify(validated, null, 2)}\n`);
}

export async function recordDecisionMetric(
  projectRoot: string,
  config: Config,
  changeId: string,
  draft: DecisionMetric,
): Promise<void> {
  if (!config.metrics.enabled) return;
  const metrics = await readChangeMetrics(projectRoot, config, changeId);
  const decisions = [...(metrics.decisions ?? []), DecisionMetricSchema.parse(draft)];
  await writeChangeMetrics(projectRoot, config, changeId, { ...metrics, decisions });
}

export async function startPhase(
  projectRoot: string,
  config: Config,
  changeId: string,
  phase: string,
  startedAt = new Date().toISOString(),
): Promise<void> {
  if (!config.metrics.enabled) return;
  const metrics = await readChangeMetrics(projectRoot, config, changeId);
  const current = metrics.phases.at(-1);
  if (current && !current.endedAt) {
    throw new Error(`Cannot start phase "${phase}" while "${current.phase}" is still open.`);
  }
  metrics.phases.push({ phase, startedAt });
  await writeChangeMetrics(projectRoot, config, changeId, metrics);
}

export async function transitionPhase(
  projectRoot: string,
  config: Config,
  changeId: string,
  fromPhase: string,
  toPhase: string | null,
  at = new Date().toISOString(),
  fromStartedAt = at,
): Promise<void> {
  if (!config.metrics.enabled || fromPhase === toPhase) return;
  const metrics = await readChangeMetrics(projectRoot, config, changeId);
  const current = metrics.phases.at(-1);
  if (current && !current.endedAt) {
    if (current.phase !== fromPhase) {
      if (current.phase === toPhase) return;
      throw new Error(
        `Cannot leave phase "${fromPhase}" while metrics phase "${current.phase}" is open.`,
      );
    }
    current.endedAt = at;
  } else {
    metrics.phases.push({ phase: fromPhase, startedAt: fromStartedAt, endedAt: at });
  }
  if (toPhase) metrics.phases.push({ phase: toPhase, startedAt: at });
  await writeChangeMetrics(projectRoot, config, changeId, metrics);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function stringId(...values: unknown[]): string | null {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" ? value : null;
}

function parseClaudeUsage(record: Record<string, unknown>): ParsedRequest | null {
  const message = asObject(record.message);
  const usage = asObject(message?.usage);
  const requestId = stringId(record.requestId, message?.id);
  const startedAt = isoTimestamp(record.timestamp ?? message?.timestamp);
  if (!usage || !requestId || !startedAt) return null;
  return {
    provider: "claude-code",
    requestId,
    startedAt,
    inputTokens: tokenCount(usage.input_tokens),
    cacheReadTokens: tokenCount(usage.cache_read_input_tokens),
    cacheWriteTokens: tokenCount(usage.cache_creation_input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  };
}

function parseCodexUsage(
  record: Record<string, unknown>,
  state: { turnStartedAt?: string; messageId?: string },
): ParsedRequest | null {
  const payload = asObject(record.payload);
  const payloadType = payload?.type;
  const timestamp = isoTimestamp(record.timestamp);

  if (
    record.type === "event_msg" &&
    (payloadType === "task_started" || payloadType === "turn_started")
  ) {
    if (timestamp) state.turnStartedAt = timestamp;
    state.messageId = undefined;
    return null;
  }

  if (
    record.type === "response_item" &&
    payloadType === "message" &&
    payload?.role === "assistant"
  ) {
    state.messageId = stringId(payload.id, record.id) ?? undefined;
    return null;
  }

  if (record.type !== "event_msg" || payloadType !== "token_count") return null;
  const info = asObject(payload?.info);
  const usage = asObject(info?.last_token_usage);
  const totalInput = tokenCount(usage?.input_tokens);
  const cachedInput = tokenCount(usage?.cached_input_tokens);
  const requestId = stringId(payload?.request_id, info?.request_id, state.messageId);
  const startedAt = state.turnStartedAt;
  if (!usage || !requestId || !startedAt) return null;
  state.turnStartedAt = undefined;
  state.messageId = undefined;
  return {
    provider: "codex",
    requestId,
    startedAt,
    inputTokens: totalInput === null ? null : Math.max(0, totalInput - (cachedInput ?? 0)),
    cacheReadTokens: cachedInput,
    cacheWriteTokens: null,
    outputTokens: tokenCount(usage.output_tokens),
  };
}

function phaseAt(metrics: ChangeMetrics, timestamp: string): PhaseMetric | undefined {
  const requestTime = Date.parse(timestamp);
  return metrics.phases.find((phase) => {
    const start = Date.parse(phase.startedAt);
    const end = phase.endedAt ? Date.parse(phase.endedAt) : Number.POSITIVE_INFINITY;
    return requestTime >= start && requestTime < end;
  });
}

function toForwardSlashes(value: string): string {
  let out = "";
  for (const ch of value) out += ch === "\\" ? "/" : ch;
  return out;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function stripLeadingDotSlash(value: string): string {
  let out = value;
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}

function prefixLooksAbsolute(prefix: string): boolean {
  if (prefix.startsWith("/") || prefix.startsWith("\\")) return true;
  const first = prefix.charCodeAt(0);
  const letter = (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
  return letter && prefix.charCodeAt(1) === 58;
}

/** Repo-relative exclude prefix, or a throw when the prefix cannot be compared safely. */
function normalizeExcludePrefix(prefix: string): string {
  if (isAbsolute(prefix) || prefixLooksAbsolute(prefix)) {
    throw new Error("metrics.exclude prefix is invalid.");
  }
  const slashed = stripLeadingDotSlash(toForwardSlashes(prefix));
  if (prefixLooksAbsolute(slashed)) throw new Error("metrics.exclude prefix is invalid.");
  const trimmed = stripTrailingSlashes(slashed);
  if (!trimmed) throw new Error("metrics.exclude prefix is invalid.");
  for (const segment of trimmed.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error("metrics.exclude prefix is invalid.");
    }
  }
  return trimmed;
}

/**
 * Refuse an in-repo session log under metrics.exclude before the file is opened.
 * Logs outside the project root are not excluded. Invalid prefixes throw first.
 */
export function assertSessionLogAllowed(
  projectRoot: string,
  prefixes: readonly string[],
  sessionLogPath: string,
): void {
  const normalized = prefixes.map(normalizeExcludePrefix);
  const root = resolve(projectRoot);
  const absLog = resolve(root, sessionLogPath);
  const rel = relative(root, absLog);
  if (rel.startsWith("..") || isAbsolute(rel)) return;
  const relPosix = rel.split(sep).join("/");
  for (const prefix of normalized) {
    if (relPosix === prefix || relPosix.startsWith(`${prefix}/`)) {
      throw new Error(`Refusing to import a session log under excluded prefix "${prefix}".`);
    }
  }
}

function recordParsed(
  metrics: ChangeMetrics,
  requestIds: Set<string>,
  result: MetricsImportResult,
  parsed: ParsedRequest,
): void {
  const phase = phaseAt(metrics, parsed.startedAt);
  if (!phase) {
    result.unmatched += 1;
    return;
  }
  const key = `${parsed.provider}\0${parsed.requestId}`;
  if (requestIds.has(key)) {
    result.duplicates += 1;
    return;
  }
  requestIds.add(key);
  const request: TokenUsageMetric = {
    provider: parsed.provider,
    requestId: parsed.requestId,
    phase: phase.phase,
    startedAt: parsed.startedAt,
    inputTokens: parsed.inputTokens,
    cacheReadTokens: parsed.cacheReadTokens,
    cacheWriteTokens: parsed.cacheWriteTokens,
    outputTokens: parsed.outputTokens,
    measured: true,
  };
  if (parsed.model) request.model = parsed.model;
  metrics.requests.push(request);
  result.imported += 1;
}

async function readTurnStarts(directory: string): Promise<Map<number, string>> {
  const starts = new Map<number, string>();
  const path = join(directory, "events.jsonl");
  if (!(await pathExists(path))) return starts;
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record: Record<string, unknown> | null = null;
    try {
      record = asObject(JSON.parse(line));
    } catch {
      continue;
    }
    if (!record || record.type !== "turn_started") continue;
    const turnNumber = tokenCount(record.turn_number);
    const timestamp = isoTimestamp(record.ts);
    if (turnNumber === null || turnNumber < 1 || !timestamp || starts.has(turnNumber)) continue;
    starts.set(turnNumber, timestamp);
  }
  return starts;
}

function grokBucket(value: unknown): {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
} | null {
  const bucket = asObject(value);
  if (!bucket) return null;
  const input = tokenCount(bucket.inputTokens);
  const cacheRead = tokenCount(bucket.cachedReadTokens);
  const cacheWrite = tokenCount(bucket.cacheCreationTokens);
  const output = tokenCount(bucket.outputTokens);
  if (input === null || cacheRead === null || cacheWrite === null || output === null) return null;
  return { input, cacheRead, cacheWrite, output };
}

async function importGrokUsage(
  filePath: string,
  metrics: ChangeMetrics,
  requestIds: Set<string>,
  providers: Set<string>,
  result: MetricsImportResult,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readText(filePath));
  } catch {
    throw new Error("usage.json is not a Grok usage file.");
  }
  const document = asObject(parsed);
  const sessionId = document?.sessionId;
  const turns = document?.turns;
  if (
    !document ||
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    !Array.isArray(turns)
  ) {
    throw new Error("usage.json is not a Grok usage file.");
  }
  providers.add("grok");
  const session = asObject(document.session);
  if (session?.usageIsIncomplete === true) result.incomplete = true;
  const turnStarts = await readTurnStarts(dirname(filePath));

  for (const turnValue of turns) {
    const turn = asObject(turnValue);
    if (!turn) {
      result.ignored += 1;
      continue;
    }
    if (turn.usageIsIncomplete === true) result.incomplete = true;
    const turnNumber = tokenCount(turn.turnNumber);
    const modelUsage = asObject(turn.modelUsage);
    const entries = modelUsage ? Object.entries(modelUsage) : [];
    if (turnNumber === null || turnNumber < 1) {
      result.ignored += 1;
      continue;
    }
    const startedAt = turnStarts.get(turnNumber) ?? isoTimestamp(turn.endedAt);
    if (!startedAt) {
      result.ignored += entries.length;
      continue;
    }
    for (const [model, bucketValue] of entries) {
      if (!MODEL_ID.test(model)) {
        result.ignored += 1;
        continue;
      }
      const bucket = grokBucket(bucketValue);
      if (!bucket) {
        result.ignored += 1;
        continue;
      }
      recordParsed(metrics, requestIds, result, {
        provider: "grok",
        model,
        requestId: `${sessionId}:${turnNumber}:${model}`,
        startedAt,
        inputTokens: Math.max(0, bucket.input - bucket.cacheRead - bucket.cacheWrite),
        cacheReadTokens: bucket.cacheRead,
        cacheWriteTokens: bucket.cacheWrite,
        outputTokens: bucket.output,
      });
    }
  }
}

async function importJsonlUsage(
  sessionLogPath: string,
  metrics: ChangeMetrics,
  requestIds: Set<string>,
  providers: Set<string>,
  result: MetricsImportResult,
): Promise<void> {
  const codexState: { turnStartedAt?: string; messageId?: string } = {};
  const lines = createInterface({
    input: createReadStream(sessionLogPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record: Record<string, unknown> | null = null;
    try {
      record = asObject(JSON.parse(line));
    } catch {
      result.ignored += 1;
      continue;
    }
    if (!record) {
      result.ignored += 1;
      continue;
    }

    const message = asObject(record.message);
    const claudeCandidate = record.type === "assistant" && Boolean(asObject(message?.usage));
    const codexCandidate =
      record.type === "event_msg" && asObject(record.payload)?.type === "token_count";
    const parsed = claudeCandidate ? parseClaudeUsage(record) : parseCodexUsage(record, codexState);
    if (claudeCandidate) providers.add("claude-code");
    else if (codexCandidate) providers.add("codex");
    if (!parsed) {
      if (claudeCandidate || codexCandidate) result.ignored += 1;
      continue;
    }
    recordParsed(metrics, requestIds, result, parsed);
  }
}

async function grokUsagePath(sessionLogPath: string): Promise<string | null> {
  const info = await stat(sessionLogPath);
  if (info.isDirectory()) {
    const filePath = join(sessionLogPath, "usage.json");
    if (!(await pathExists(filePath))) throw new Error("Grok usage.json is missing.");
    return filePath;
  }
  return basename(sessionLogPath) === "usage.json" ? sessionLogPath : null;
}

export async function importSessionMetrics(
  projectRoot: string,
  config: Config,
  changeId: string,
  sessionLogPath: string,
): Promise<MetricsImportResult> {
  if (!config.metrics.enabled) throw new Error("Metrics are disabled in .sdd/config.yaml.");
  assertSessionLogAllowed(projectRoot, config.metrics.exclude, sessionLogPath);

  const metrics = await readChangeMetrics(projectRoot, config, changeId);
  const requestIds = new Set(
    metrics.requests.map((request) => `${request.provider}\0${request.requestId}`),
  );
  const providers = new Set<string>();
  const result: MetricsImportResult = {
    imported: 0,
    duplicates: 0,
    ignored: 0,
    unmatched: 0,
    providers: [],
    incomplete: false,
  };

  const grokPath = await grokUsagePath(sessionLogPath);
  if (grokPath) await importGrokUsage(grokPath, metrics, requestIds, providers, result);
  else await importJsonlUsage(sessionLogPath, metrics, requestIds, providers, result);

  result.providers = [...providers].sort();
  if (result.imported) await writeChangeMetrics(projectRoot, config, changeId, metrics);
  return result;
}
