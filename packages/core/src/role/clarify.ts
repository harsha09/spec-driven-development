import { join } from "pathe";
import { type ModelLike, askModel, readWith } from "../ask.js";
import { ensureDir, pathExists, readYaml, writeYaml } from "../fs.js";
import { CLARIFY_GAPS, clarifyReplySchema } from "../reply-schemas.js";
import type { Workflow } from "../schemas.js";
import { clarifyGapPrompt } from "./prompts.js";
import type { RoleProfile } from "./types.js";

/**
 * The gap check: ask only where the request has real gaps, a few questions at a time of one,
 * each with a proposed default. The shapes here are plain data so a driver that is not a person
 * can answer them: a question, its proposed default, and an answer that is either confirmed by
 * the person or only proposed.
 */

/** The change-pack file that holds every question and answer. */
export const CLARIFY_FILE = "clarify.yaml";

/** The question limit when a workflow does not set `clarify.max_questions`. */
export const DEFAULT_CLARIFY_MAX = 3;

export type ClarifyGap = (typeof CLARIFY_GAPS)[number];
export type ClarifyStatus = "confirmed" | "proposed";

export interface ClarifyQuestion {
  id: string;
  /** The stage or checkpoint that asked: a clarify stage id, or `start`. */
  stage: string;
  gap: ClarifyGap;
  question: string;
  /** The recommended default. Enter accepts it. */
  proposed: string;
}

export interface ClarifyAnswer extends ClarifyQuestion {
  answer: string;
  /** `confirmed`: the person answered or accepted the default. `proposed`: nobody confirmed it. */
  status: ClarifyStatus;
}

export interface ClarifySkip {
  stage: string;
  reason: string;
}

export interface ClarifyState {
  /** Checkpoints whose gap check already ran. A restart never runs one again. */
  checked: string[];
  /** Asked in this order, one at a time. */
  queue: ClarifyQuestion[];
  answers: ClarifyAnswer[];
  skipped: ClarifySkip[];
}

export function emptyClarify(): ClarifyState {
  return { checked: [], queue: [], answers: [], skipped: [] };
}

/**
 * At most this many questions in a whole change. The workflow sets it, with the shipped defaults
 * in its YAML. A workflow that sets none takes the team's limit, then the default.
 */
export function clarifyLimit(workflow: Pick<Workflow, "clarify">, team?: number | null): number {
  return workflow.clarify?.max_questions ?? team ?? DEFAULT_CLARIFY_MAX;
}

/** The `clarify.max_questions` a project's `.sdd/team.yaml` carries, if any. Reads nothing else. */
export async function teamClarifyMax(root: string): Promise<number | null> {
  const path = join(root, ".sdd", "team.yaml");
  if (!(await pathExists(path))) return null;
  try {
    const raw = (await readYaml(path)) as { clarify?: { max_questions?: unknown } } | null;
    const max = raw?.clarify?.max_questions;
    return typeof max === "number" && Number.isInteger(max) && max >= 0 && max <= 5 ? max : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isGap(value: unknown): value is ClarifyGap {
  return typeof value === "string" && (CLARIFY_GAPS as readonly string[]).includes(value);
}

function readQuestion(item: unknown): ClarifyQuestion | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = text(row.id);
  const stage = text(row.stage);
  const question = text(row.question);
  const proposed = text(row.proposed);
  if (!id || !stage || !question || !proposed || !isGap(row.gap)) return null;
  return { id, stage, gap: row.gap, question, proposed };
}

/** Reads the stored state. Returns null for a shape this version does not write. */
export function parseClarify(value: unknown): ClarifyState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const state = emptyClarify();
  if (Array.isArray(rec.checked)) {
    state.checked = rec.checked.filter((item): item is string => typeof item === "string");
  }
  for (const item of Array.isArray(rec.queue) ? rec.queue : []) {
    const question = readQuestion(item);
    if (!question) return null;
    state.queue.push(question);
  }
  for (const item of Array.isArray(rec.answers) ? rec.answers : []) {
    const question = readQuestion(item);
    const row = item as Record<string, unknown>;
    const answer = text(row.answer);
    if (!question || !answer) return null;
    if (row.status !== "confirmed" && row.status !== "proposed") return null;
    state.answers.push({ ...question, answer, status: row.status });
  }
  for (const item of Array.isArray(rec.skipped) ? rec.skipped : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const stage = text(row.stage);
    const reason = text(row.reason);
    if (!stage || !reason) return null;
    state.skipped.push({ stage, reason });
  }
  return state;
}

export function clarifyBody(state: ClarifyState): Record<string, unknown> {
  return {
    checked: state.checked,
    queue: state.queue,
    answers: state.answers,
    skipped: state.skipped,
  };
}

export async function writeClarifyFile(changeDir: string, state: ClarifyState): Promise<void> {
  await ensureDir(changeDir);
  await writeYaml(join(changeDir, CLARIFY_FILE), clarifyBody(state));
}

export async function readClarifyFile(changeDir: string): Promise<ClarifyState | null> {
  const path = join(changeDir, CLARIFY_FILE);
  if (!(await pathExists(path))) return null;
  try {
    return parseClarify(await readYaml(path));
  } catch {
    return null;
  }
}

export function markChecked(state: ClarifyState, checkpoint: string): void {
  if (!state.checked.includes(checkpoint)) state.checked.push(checkpoint);
}

export function recordSkip(state: ClarifyState, stage: string, reason: string): void {
  if (!state.skipped.some((item) => item.stage === stage && item.reason === reason)) {
    state.skipped.push({ stage, reason });
  }
}

function asked(state: ClarifyState): number {
  return state.answers.length + state.queue.length;
}

function sameQuestion(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

export type GapCheck =
  | { ok: true; added: number; reason?: "limit" }
  | { ok: false; reason: "model_error" | "invalid" };

/**
 * Check the request for gaps and queue the questions. Never more than the limit in a whole
 * change, and never a question that was already asked or answered.
 */
export async function runGapCheck(input: {
  model: ModelLike;
  role: RoleProfile;
  request: string;
  stage: string;
  checkpoint: string;
  limit: number;
  earlier: { path: string; body: string }[];
  state: ClarifyState;
}): Promise<GapCheck> {
  const room = input.limit - asked(input.state);
  if (room <= 0) return { ok: true, added: 0, reason: "limit" };
  const result = await askModel({
    model: input.model,
    roleId: input.role.name,
    prompt: clarifyGapPrompt({
      role: input.role,
      request: input.request,
      stageId: input.stage,
      triggers: input.role.askHumanWhen,
      answered: input.state.answers.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
      earlier: input.earlier,
      max: room,
    }),
    parse: readWith(clarifyReplySchema(room)),
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  let added = 0;
  for (const item of result.value.questions) {
    if (added >= room) break;
    const question = item.question.trim();
    const proposed = item.proposed.trim();
    if (!question || !proposed) continue;
    const known = [...input.state.answers, ...input.state.queue];
    if (known.some((other) => sameQuestion(other.question, question))) continue;
    input.state.queue.push({
      id: `q${asked(input.state) + 1}`,
      stage: input.checkpoint,
      gap: item.gap,
      question,
      proposed,
    });
    added += 1;
  }
  return { ok: true, added };
}

/** Record the person's answer to the first queued question. Enter passes no text: the default. */
export function answerNext(state: ClarifyState, given: string): ClarifyAnswer | null {
  const next = state.queue.shift();
  if (!next) return null;
  const answer: ClarifyAnswer = {
    ...next,
    answer: given.trim() || next.proposed,
    status: "confirmed",
  };
  state.answers.push(answer);
  return answer;
}

/** Turn every queued question into its proposed default, marked unconfirmed. */
export function proposeRemaining(state: ClarifyState): number {
  let count = 0;
  for (const next of state.queue.splice(0)) {
    state.answers.push({ ...next, answer: next.proposed, status: "proposed" });
    count += 1;
  }
  return count;
}

export function unconfirmedAnswers(state: ClarifyState | null): ClarifyAnswer[] {
  return state ? state.answers.filter((item) => item.status === "proposed") : [];
}

/** One line for a gate or a stop: how many answers nobody confirmed. Null when none. */
export function unconfirmedLine(state: ClarifyState | null): string | null {
  const open = unconfirmedAnswers(state);
  if (open.length === 0) return null;
  return `Unconfirmed clarify answers: ${open.length} (${open
    .map((item) => item.id)
    .join(", ")}). A role proposed them. The person has not confirmed them.`;
}

export async function unconfirmedClarifyLine(changeDir: string): Promise<string | null> {
  return unconfirmedLine(await readClarifyFile(changeDir));
}

/** The clarify page: what the person confirmed, kept apart from what was only proposed. */
export function renderClarifyPage(
  state: ClarifyState,
  stage: { id: string; title?: string },
): string {
  const here = state.answers.filter((item) => item.stage === stage.id);
  const confirmed = here.filter((item) => item.status === "confirmed");
  const proposed = here.filter((item) => item.status === "proposed");
  const lines = [`# ${stage.title ?? stage.id}`, "", "## Confirmed answers", ""];
  if (confirmed.length === 0) lines.push("None.", "");
  for (const item of confirmed) {
    lines.push(`- **Q (${item.gap}):** ${item.question}`, `  **A:** ${item.answer}`, "");
  }
  lines.push("## Unconfirmed proposals", "");
  if (proposed.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("A role proposed these. The person has not confirmed them.", "");
    for (const item of proposed) {
      lines.push(
        `- **Q (${item.gap}):** ${item.question}`,
        `  **Proposed, unconfirmed:** ${item.answer}`,
        "",
      );
    }
  }
  return lines.join("\n");
}

/** What `sdd go` prints for one queued question. */
export function clarifyQuestionText(state: ClarifyState, lead: string[]): string {
  const next = state.queue[0];
  if (!next) return "";
  const total = state.answers.length + state.queue.length;
  const position = state.answers.length + 1;
  return [
    "Question:",
    ...lead,
    `Clarify (${next.gap}, ${position} of ${total}):`,
    next.question,
    `Default: ${next.proposed}`,
    'Press Enter to accept the default, or answer with: sdd go --answer "..."',
    "Accept it without a terminal: sdd go --accept-default",
  ].join("\n");
}
