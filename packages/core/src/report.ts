import { join } from "pathe";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { listDirs, pathExists, readText } from "./fs.js";
import {
  type ChangeMetrics,
  ChangeMetricsSchema,
  type PhaseMetric,
  emptyChangeMetrics,
} from "./metrics.js";
import { changePath, changesDir, sddRoot } from "./paths.js";
import type { Config } from "./schemas.js";

const RATE_SCALE = 1_000_000_000n;
const USD_DENOM = 1_000_000n * RATE_SCALE;

const PriceCardSchema = z.object({
  input_per_million_usd: z.number().finite().nonnegative(),
  cache_read_per_million_usd: z.number().finite().nonnegative(),
  cache_write_per_million_usd: z.number().finite().nonnegative(),
  output_per_million_usd: z.number().finite().nonnegative(),
});

const PricesSchema = z.object({
  usd_to_inr: z.number().finite().nonnegative().default(84),
  models: z
    .object({
      default: PriceCardSchema,
    })
    .catchall(PriceCardSchema),
});

export type PriceCard = z.infer<typeof PriceCardSchema>;
export type Prices = z.infer<typeof PricesSchema>;

export interface TokenCounts {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  output: number | null;
}

export interface PhaseTimingRow {
  phase: string;
  startedAt: string;
  endedAt?: string;
  activeMs: number;
  open: boolean;
}

export interface PhaseTiming {
  activeMs: number;
  waitMs: number;
  totalMs: number;
  phases: PhaseTimingRow[];
}

export interface ChangePhaseOrder {
  id: string;
  /** First phase start. Null when a valid file has no phases. Ignored when invalid. */
  firstStartedAt: string | null;
  invalid: boolean;
}

export interface RenderChangeReportInput {
  changeId: string;
  metrics: ChangeMetrics;
  prices: Prices | null;
  /** Unicode code points in `.sdd/handoff.md`. Null means that file is missing. */
  handoffCodePoints: number | null;
  now: Date;
}

const TOKEN_HEADER =
  "source  phase  provider  requests  input  cache_read  cache_write  output  usd  inr";

function finiteMs(startIso: string, endMs: number): number {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, endMs - start);
}

/** `Hh Mm Ss` from whole seconds. Negative and non-finite inputs are `0h 0m 0s`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0h 0m 0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

/** Active time per stored visit, plus human wait as the gaps between visits. */
export function phaseTiming(phases: readonly PhaseMetric[], now: Date): PhaseTiming {
  const nowMs = now.getTime();
  let activeMs = 0;
  const rows: PhaseTimingRow[] = phases.map((phase) => {
    const endedAt = phase.endedAt;
    const open = endedAt === undefined;
    const active = finiteMs(phase.startedAt, open ? nowMs : Date.parse(endedAt));
    activeMs += active;
    return {
      phase: phase.phase,
      startedAt: phase.startedAt,
      endedAt: phase.endedAt,
      activeMs: active,
      open,
    };
  });
  let waitMs = 0;
  for (let i = 0; i < phases.length - 1; i++) {
    const phase = phases[i];
    const next = phases[i + 1];
    if (!phase?.endedAt || !next) continue;
    const gap = Date.parse(next.startedAt) - Date.parse(phase.endedAt);
    if (Number.isFinite(gap)) waitMs += Math.max(0, gap);
  }
  return { activeMs, waitMs, totalMs: activeMs + waitMs, phases: rows };
}

function stripLeadingZeros(digits: string): string {
  let i = 0;
  while (i < digits.length - 1 && digits.charCodeAt(i) === 48) i += 1;
  return digits.slice(i);
}

/** Per-million USD rate as an integer with 9 decimal places. */
function rateUnits(rate: number): bigint {
  if (!Number.isFinite(rate) || rate < 0) throw new Error("prices.yaml is invalid");
  let text: string;
  try {
    text = rate.toFixed(9);
  } catch {
    throw new Error("prices.yaml is invalid");
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const dot = unsigned.indexOf(".");
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? "" : unsigned.slice(dot + 1, dot + 10);
  const units = BigInt(stripLeadingZeros(`${whole}${frac.padEnd(9, "0")}`));
  return negative ? -units : units;
}

function formatRatio(numerator: bigint, denominator: bigint, decimals: number): string {
  const negative = numerator < 0n;
  const scale = 10n ** BigInt(decimals);
  const num = (negative ? -numerator : numerator) * scale;
  const quot = num / denominator;
  const rem = num % denominator;
  const rounded = rem * 2n >= denominator ? quot + 1n : quot;
  const digits = rounded.toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  return `${negative ? "-" : ""}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/**
 * Sum category USD from numeric token counts only, then round once.
 * INR multiplies the unrounded USD sum by `usdToInr`, then rounds once.
 */
export function costFor(
  counts: TokenCounts,
  card: PriceCard,
  usdToInr: number,
): { usd: string; inr: string } {
  const parts: Array<[number | null, number]> = [
    [counts.input, card.input_per_million_usd],
    [counts.cacheRead, card.cache_read_per_million_usd],
    [counts.cacheWrite, card.cache_write_per_million_usd],
    [counts.output, card.output_per_million_usd],
  ];
  let numerator = 0n;
  let any = false;
  for (const [tokens, rate] of parts) {
    if (tokens === null) continue;
    any = true;
    numerator += BigInt(tokens) * rateUnits(rate);
  }
  if (!any) return { usd: "n/a", inr: "n/a" };
  const inrNumerator = numerator * rateUnits(usdToInr);
  return {
    usd: formatRatio(numerator, USD_DENOM, 4),
    inr: formatRatio(inrNumerator, USD_DENOM * RATE_SCALE, 2),
  };
}

/** Parsed prices, null when `.sdd/prices.yaml` is missing, or a throw when it is invalid. */
export async function loadPrices(projectRoot: string): Promise<Prices | null> {
  const path = join(sddRoot(projectRoot), "prices.yaml");
  if (!(await pathExists(path))) return null;
  try {
    return PricesSchema.parse(parseYaml(await readText(path)));
  } catch {
    throw new Error("prices.yaml is invalid");
  }
}

function cardFor(prices: Prices, provider: string): PriceCard {
  const models: Record<string, PriceCard> = prices.models;
  return models[provider] ?? prices.models.default;
}

interface Totals extends TokenCounts {
  requests: number;
}

function emptyTotals(): Totals {
  return { requests: 0, input: null, cacheRead: null, cacheWrite: null, output: null };
}

function addCount(current: number | null, value: number | null): number | null {
  if (typeof value !== "number") return current;
  return (current ?? 0) + value;
}

function addRequest(totals: Totals, request: ChangeMetrics["requests"][number]): void {
  totals.requests += 1;
  totals.input = addCount(totals.input, request.inputTokens);
  totals.cacheRead = addCount(totals.cacheRead, request.cacheReadTokens);
  totals.cacheWrite = addCount(totals.cacheWrite, request.cacheWriteTokens);
  totals.output = addCount(totals.output, request.outputTokens);
}

function cell(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function tokenLine(
  source: string,
  phase: string,
  provider: string,
  totals: Totals,
  prices: Prices | null,
  card: PriceCard | null,
): string {
  const cost =
    prices && card ? costFor(totals, card, prices.usd_to_inr) : { usd: "n/a", inr: "n/a" };
  return [
    source,
    phase,
    provider,
    String(totals.requests),
    cell(totals.input),
    cell(totals.cacheRead),
    cell(totals.cacheWrite),
    cell(totals.output),
    cost.usd,
    cost.inr,
  ].join("  ");
}

interface RequestGroup {
  phase: string;
  provider: string;
  totals: Totals;
}

function groupRequests(metrics: ChangeMetrics): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const request of metrics.requests) {
    const key = `${request.phase}\0${request.provider}`;
    let group = groups.get(key);
    if (!group) {
      group = { phase: request.phase, provider: request.provider, totals: emptyTotals() };
      groups.set(key, group);
    }
    addRequest(group.totals, request);
  }
  const phaseOrder: string[] = [];
  for (const phase of metrics.phases) {
    if (!phaseOrder.includes(phase.phase)) phaseOrder.push(phase.phase);
  }
  for (const request of metrics.requests) {
    if (!phaseOrder.includes(request.phase)) phaseOrder.push(request.phase);
  }
  return [...groups.values()].sort((left, right) => {
    const phaseDelta = phaseOrder.indexOf(left.phase) - phaseOrder.indexOf(right.phase);
    if (phaseDelta !== 0) return phaseDelta;
    return left.provider.localeCompare(right.provider);
  });
}

/** Plain-text one-change report. Does not read or write the filesystem. */
export function renderChangeReport(input: RenderChangeReportInput): string {
  const timing = phaseTiming(input.metrics.phases, input.now);
  const lines = [
    `Change: ${input.changeId}`,
    `Active: ${formatDuration(timing.activeMs)}`,
    `Human wait: ${formatDuration(timing.waitMs)}`,
    `Total: ${formatDuration(timing.totalMs)}`,
    "Phases:",
  ];
  if (timing.phases.length === 0) {
    lines.push("  (none)");
  } else {
    for (const phase of timing.phases) {
      const start = new Date(phase.startedAt).toLocaleString();
      const end = phase.open ? "in progress" : new Date(phase.endedAt ?? "").toLocaleString();
      lines.push(`  ${phase.phase}  ${start} → ${end}  active ${formatDuration(phase.activeMs)}`);
    }
  }
  lines.push("Tokens:");
  lines.push(`  ${TOKEN_HEADER}`);
  if (input.metrics.requests.length === 0) {
    if (input.handoffCodePoints === null) {
      lines.push("  (none)");
      lines.push("No estimate: .sdd/handoff.md is missing.");
    } else {
      const estimated = Math.floor(input.handoffCodePoints / 4);
      lines.push(
        `  ${tokenLine(
          "estimated (handoff code points / 4)",
          "n/a",
          "default",
          {
            requests: 1,
            input: estimated,
            cacheRead: null,
            cacheWrite: null,
            output: null,
          },
          input.prices,
          input.prices?.models.default ?? null,
        )}`,
      );
    }
  } else {
    for (const group of groupRequests(input.metrics)) {
      const card = input.prices ? cardFor(input.prices, group.provider) : null;
      lines.push(
        `  ${tokenLine("measured", group.phase, group.provider, group.totals, input.prices, card)}`,
      );
    }
    const total = emptyTotals();
    for (const request of input.metrics.requests) addRequest(total, request);
    lines.push(`  ${totalLine(total, input.metrics, input.prices)}`);
  }
  if (input.prices === null) lines.push("prices.yaml is missing");
  return lines.join("\n");
}

function requestUsdNumerator(request: ChangeMetrics["requests"][number], card: PriceCard): bigint {
  const parts: Array<[number | null, number]> = [
    [request.inputTokens, card.input_per_million_usd],
    [request.cacheReadTokens, card.cache_read_per_million_usd],
    [request.cacheWriteTokens, card.cache_write_per_million_usd],
    [request.outputTokens, card.output_per_million_usd],
  ];
  let numerator = 0n;
  for (const [tokens, rate] of parts) {
    if (tokens === null) continue;
    numerator += BigInt(tokens) * rateUnits(rate);
  }
  return numerator;
}

function requestHasNumericToken(request: ChangeMetrics["requests"][number]): boolean {
  return (
    request.inputTokens !== null ||
    request.cacheReadTokens !== null ||
    request.cacheWriteTokens !== null ||
    request.outputTokens !== null
  );
}

/** Total cost sums each request at its own provider card. Token cells stay a plain sum. */
function totalLine(totals: Totals, metrics: ChangeMetrics, prices: Prices | null): string {
  if (!prices) return tokenLine("measured", "total", "all", totals, null, null);
  let numerator = 0n;
  let any = false;
  for (const request of metrics.requests) {
    if (!requestHasNumericToken(request)) continue;
    any = true;
    numerator += requestUsdNumerator(request, cardFor(prices, request.provider));
  }
  const cost = !any
    ? { usd: "n/a", inr: "n/a" }
    : {
        usd: formatRatio(numerator, USD_DENOM, 4),
        inr: formatRatio(numerator * rateUnits(prices.usd_to_inr), USD_DENOM * RATE_SCALE, 2),
      };
  return [
    "measured",
    "total",
    "all",
    String(totals.requests),
    cell(totals.input),
    cell(totals.cacheRead),
    cell(totals.cacheWrite),
    cell(totals.output),
    cost.usd,
    cost.inr,
  ].join("  ");
}

/** Valid files with a first start, then empty phases, then invalid files. Tie-break by id. */
export function compareChangesByFirstPhase(
  left: ChangePhaseOrder,
  right: ChangePhaseOrder,
): number {
  if (left.invalid !== right.invalid) return left.invalid ? 1 : -1;
  const leftStart = left.invalid ? null : left.firstStartedAt;
  const rightStart = right.invalid ? null : right.firstStartedAt;
  if ((leftStart === null) !== (rightStart === null)) return leftStart === null ? 1 : -1;
  if (leftStart !== null && rightStart !== null && leftStart !== rightStart) {
    return leftStart < rightStart ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

export async function readHandoffCodePoints(projectRoot: string): Promise<number | null> {
  try {
    const text = await readText(join(sddRoot(projectRoot), "handoff.md"));
    return Array.from(text).length;
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    if (code === "ENOENT") return null;
    throw new Error("Could not read .sdd/handoff.md.");
  }
}

async function readReportMetrics(
  path: string,
): Promise<
  { status: "missing" } | { status: "invalid" } | { status: "ok"; metrics: ChangeMetrics }
> {
  if (!(await pathExists(path))) return { status: "missing" };
  try {
    return { status: "ok", metrics: ChangeMetricsSchema.parse(JSON.parse(await readText(path))) };
  } catch {
    return { status: "invalid" };
  }
}

/** One-change report. Reads metrics and, when unmeasured, the handoff. Writes nothing. */
export async function reportChange(input: {
  projectRoot: string;
  config: Config;
  changeId: string;
  prices: Prices | null;
  now: Date;
}): Promise<string> {
  const found = await readReportMetrics(
    join(changePath(input.projectRoot, input.config, input.changeId), "metrics.json"),
  );
  if (found.status === "invalid") throw new Error("metrics.json is invalid");
  const metrics = found.status === "ok" ? found.metrics : emptyChangeMetrics();
  const handoffCodePoints =
    metrics.requests.length === 0 ? await readHandoffCodePoints(input.projectRoot) : null;
  return renderChangeReport({
    changeId: input.changeId,
    metrics,
    prices: input.prices,
    handoffCodePoints,
    now: input.now,
  });
}

/** Every direct child that has metrics.json, or the empty-result sentence. Writes nothing. */
export async function reportAllChanges(
  projectRoot: string,
  config: Config,
  prices: Prices | null,
  now: Date,
): Promise<string> {
  const ids = await listDirs(changesDir(projectRoot, config));
  const blocks: Array<ChangePhaseOrder & { text: string }> = [];
  let handoff: number | null | undefined;
  for (const id of ids) {
    const found = await readReportMetrics(
      join(changePath(projectRoot, config, id), "metrics.json"),
    );
    if (found.status === "missing") continue;
    if (found.status === "invalid") {
      blocks.push({
        id,
        invalid: true,
        firstStartedAt: null,
        text: `Change: ${id}\nmetrics.json is invalid`,
      });
      continue;
    }
    let handoffCodePoints: number | null = null;
    if (found.metrics.requests.length === 0) {
      if (handoff === undefined) handoff = await readHandoffCodePoints(projectRoot);
      handoffCodePoints = handoff;
    }
    blocks.push({
      id,
      invalid: false,
      firstStartedAt: found.metrics.phases[0]?.startedAt ?? null,
      text: renderChangeReport({
        changeId: id,
        metrics: found.metrics,
        prices,
        handoffCodePoints,
        now,
      }),
    });
  }
  if (!blocks.length) return "No change metrics found.";
  blocks.sort(compareChangesByFirstPhase);
  return blocks.map((block) => block.text).join("\n\n");
}
