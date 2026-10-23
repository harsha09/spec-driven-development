import { z } from "zod";
import { recordDecisionMetric } from "../../metrics.js";
import type { Config } from "../../schemas.js";
import type { ModelChoice, WorkType } from "../types.js";
import { decideStdin } from "./command.js";
import { ollamaDecision } from "./ollama.js";
import { rulesDecision } from "./rules.js";
import type { ModelEntry, ModelsConfig } from "./schema.js";
import { type ModelContext, selectModel } from "./select.js";

const tokenField = z.number().int().nonnegative().nullable().optional();

const DecisionReplySchema = z
  .object({
    pick: z.string(),
    probs: z.record(z.string(), z.number()),
    model: z.string().trim().min(1).optional(),
    input_tokens: tokenField,
    cache_read_tokens: tokenField,
    cache_write_tokens: tokenField,
    output_tokens: tokenField,
  })
  .strict();

type DecisionReply = z.infer<typeof DecisionReplySchema>;

function minimumOf(entry: ModelEntry | undefined): number | undefined {
  if (!entry || entry.provider === "rules") return undefined;
  return entry.min_confidence;
}

export interface DecideInput<T extends string> {
  models: ModelsConfig | null;
  ctx: ModelContext & { workType: WorkType };
  state: string;
  question: string;
  options: readonly T[];
  env: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  runCommand?: (command: string, stdin: string) => Promise<string>;
  now?: () => Date;
  metrics?: { projectRoot: string; config: Config; changeId: string };
}

export interface DecisionOutcome<T extends string> {
  pick: T | "human";
  source: "rules" | "decide" | "reason" | "human";
  choice: ModelChoice | null;
  confidence: number | null;
}

interface Attempt<T extends string> {
  kept: boolean;
  missing: boolean;
  escalate: boolean;
  confidence: number | null;
  outcome: DecisionOutcome<T>;
}

interface Usage {
  model?: string;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
}

function humanOutcome<T extends string>(
  choice: ModelChoice | null,
  confidence: number | null,
): DecisionOutcome<T> {
  return { pick: "human", source: "human", choice, confidence };
}

function emptyUsage(): Usage {
  return {
    inputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    outputTokens: null,
  };
}

function usageFrom(reply: DecisionReply, base: Usage): Usage {
  return {
    model: reply.model,
    inputTokens: reply.input_tokens === undefined ? base.inputTokens : reply.input_tokens,
    cacheReadTokens:
      reply.cache_read_tokens === undefined ? base.cacheReadTokens : reply.cache_read_tokens,
    cacheWriteTokens:
      reply.cache_write_tokens === undefined ? base.cacheWriteTokens : reply.cache_write_tokens,
    outputTokens: reply.output_tokens === undefined ? base.outputTokens : reply.output_tokens,
  };
}

function scoreReply<T extends string>(
  raw: string,
  options: readonly T[],
  base: Usage,
): { ok: true; pick: T; confidence: number; usage: Usage } | { ok: false; usage: Usage } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, usage: base };
  }
  const parsed = DecisionReplySchema.safeParse(value);
  if (!parsed.success) return { ok: false, usage: base };
  const reply = parsed.data;
  const usage = usageFrom(reply, base);
  if (!options.includes(reply.pick as T)) return { ok: false, usage };
  const keys = Object.keys(reply.probs);
  if (keys.length !== options.length) return { ok: false, usage };
  let sum = 0;
  for (const option of options) {
    const probability = reply.probs[option];
    if (typeof probability !== "number" || probability < 0 || probability > 1) {
      return { ok: false, usage };
    }
    sum += probability;
  }
  if (Math.abs(sum - 1) > 0.01 + 1e-9) return { ok: false, usage };
  const confidence = reply.probs[reply.pick];
  if (typeof confidence !== "number") return { ok: false, usage };
  return { ok: true, pick: reply.pick as T, confidence, usage };
}

function storedModel(entry: ModelEntry, usage: Usage): string | null {
  if (usage.model) return usage.model;
  if (entry.provider === "ollama") return entry.model;
  return null;
}

async function recordCall<T extends string>(
  input: DecideInput<T>,
  entry: ModelEntry,
  usage: Usage,
): Promise<void> {
  if (!input.metrics) return;
  if (entry.provider === "rules") return;
  await recordDecisionMetric(
    input.metrics.projectRoot,
    input.metrics.config,
    input.metrics.changeId,
    {
      workType: input.ctx.workType,
      kind: entry.kind,
      provider: entry.provider,
      model: storedModel(entry, usage),
      startedAt: (input.now ?? (() => new Date()))().toISOString(),
      inputTokens: usage.inputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
    },
  );
}

function judge<T extends string>(
  choice: ModelChoice,
  entry: ModelEntry,
  scored: { ok: true; pick: T; confidence: number } | { ok: false },
  floor?: number,
): Attempt<T> {
  const minimum = minimumOf(entry) ?? floor;
  if (!scored.ok) {
    return {
      kept: false,
      missing: false,
      escalate: minimum !== undefined,
      confidence: 0,
      outcome: humanOutcome(choice, 0),
    };
  }
  if (minimum !== undefined && scored.confidence < minimum) {
    return {
      kept: false,
      missing: false,
      escalate: true,
      confidence: scored.confidence,
      outcome: humanOutcome(choice, scored.confidence),
    };
  }
  const source = choice.kind === "reason" ? "reason" : "decide";
  return {
    kept: true,
    missing: false,
    escalate: false,
    confidence: scored.confidence,
    outcome: { pick: scored.pick, source, choice, confidence: scored.confidence },
  };
}

async function runOne<T extends string>(
  input: DecideInput<T>,
  choice: ModelChoice,
  floor?: number,
): Promise<Attempt<T>> {
  const entry = input.models?.models[choice.id];
  if (!entry) {
    return {
      kept: false,
      missing: true,
      escalate: false,
      confidence: null,
      outcome: humanOutcome(choice, null),
    };
  }
  if (entry.provider === "rules") {
    rulesDecision(input.options);
    return {
      kept: true,
      missing: false,
      escalate: false,
      confidence: null,
      outcome: { pick: "human", source: "rules", choice, confidence: null },
    };
  }
  if (entry.provider === "command") {
    const command = input.env[entry.command_env]?.trim();
    if (!command || !input.runCommand) {
      return {
        kept: false,
        missing: true,
        escalate: false,
        confidence: null,
        outcome: humanOutcome(choice, null),
      };
    }
    let stdout = "";
    try {
      stdout = await input.runCommand(command, decideStdin(input));
    } catch {
      await recordCall(input, entry, emptyUsage());
      return judge(choice, entry, { ok: false }, floor);
    }
    const scored = scoreReply(stdout, input.options, emptyUsage());
    await recordCall(input, entry, scored.usage);
    return judge(choice, entry, scored, floor);
  }
  const baseUrl = input.env[entry.base_url_env]?.trim();
  if (!baseUrl || !input.fetch) {
    return {
      kept: false,
      missing: true,
      escalate: false,
      confidence: null,
      outcome: humanOutcome(choice, null),
    };
  }
  const remote = await ollamaDecision({
    baseUrl,
    model: entry.model,
    state: input.state,
    question: input.question,
    options: input.options,
    fetch: input.fetch,
  });
  if (!remote.called) {
    return {
      kept: false,
      missing: true,
      escalate: false,
      confidence: null,
      outcome: humanOutcome(choice, null),
    };
  }
  const base: Usage = {
    model: remote.model,
    inputTokens: remote.inputTokens,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    outputTokens: remote.outputTokens,
  };
  const scored = remote.content
    ? scoreReply(remote.content, input.options, base)
    : { ok: false as const, usage: base };
  await recordCall(input, entry, scored.usage);
  return judge(choice, entry, scored, floor);
}

export async function decide<T extends string>(input: DecideInput<T>): Promise<DecisionOutcome<T>> {
  if (!input.models) return { pick: "human", source: "human", choice: null, confidence: null };
  const choice = selectModel(input.models, input.ctx);
  const first = await runOne(input, choice);
  if (first.kept) return first.outcome;
  if (first.missing || !first.escalate) return first.outcome;
  const floor = minimumOf(input.models.models[choice.id]);
  const fallbackId = input.models.defaults.fallback_reason;
  if (choice.id === fallbackId) return first.outcome;
  const fallbackEntry = input.models.models[fallbackId];
  if (!fallbackEntry) return first.outcome;
  const fallback: ModelChoice = {
    id: fallbackId,
    kind: fallbackEntry.kind,
    provider: fallbackEntry.provider,
    why: "fallback",
  };
  const second = await runOne(input, fallback, floor);
  if (second.kept) return second.outcome;
  return second.outcome;
}
