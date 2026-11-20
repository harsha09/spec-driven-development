import { join } from "pathe";
import type { AgentTarget } from "../agents.js";
import { h2Title, headingsFilled, isSubstantiveArtifactContent } from "../artifacts.js";
import { type ParseReply, askModel } from "../ask.js";
import { buildContext, getActiveChangeId } from "../change-context.js";
import { advanceStage, createChange, skipStage } from "../change.js";
import { isInitialized, loadConfig } from "../config.js";
import {
  ensureDir,
  listFiles,
  pathExists,
  readText,
  readYaml,
  writeText,
  writeYaml,
} from "../fs.js";
import { initProject } from "../init.js";
import { changePath, templatesDir } from "../paths.js";
import {
  type KindRead,
  type NoteLegacy,
  QUESTION_PREFIX,
  asQuestion,
  legacyLogger,
  projectLegacyLog,
  readKinded,
} from "../reply-kind.js";
import { GUIDE_FAMILY, guideReplySchema } from "../reply-schemas.js";
import type { Stage } from "../schemas.js";
import { getStage, loadWorkflow } from "../workflow.js";
import {
  type ClarifyState,
  answerNext,
  clarifyBody,
  clarifyLimit,
  clarifyQuestionText,
  emptyClarify,
  markChecked,
  parseClarify,
  proposeRemaining,
  recordSkip,
  renderClarifyPage,
  runGapCheck,
  teamClarifyMax,
  unconfirmedLine,
  writeClarifyFile,
} from "./clarify.js";
import { createRole, readRole } from "./profile.js";
import { guideDraftPrompt } from "./prompts.js";
import { matchRoute } from "./routing.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleModel, type RoleProfile } from "./types.js";

const PLANNING = new Set([
  "intent",
  "vision",
  "requirements",
  "feature",
  "stories",
  "clarify_intent",
  "brainstorm",
  "hl_arb",
  "research",
  "outcome",
  "plan",
]);
const ARCHITECTURE = new Set([
  "design",
  "architecture",
  "clarify_design",
  "lld",
  "db_design",
  "code_research",
]);
const CONSTRUCTION = new Set([
  "tasks",
  "clarify_tasks",
  "implement",
  "local_verify",
  "acceptance",
  "pr_review",
]);

export type Duty = "planning" | "architecture" | "construction";

const DUTIES: {
  name: string;
  label: string;
  job: string;
  bucket: Duty;
  owns: string[];
  skills: string[];
  never: string[];
  askHumanWhen: string[];
  description: string;
}[] = [
  {
    name: "planner",
    label: "Planner",
    job: "Plan the change",
    bucket: "planning",
    owns: ["the request", "the plan"],
    skills: ["plan the change"],
    never: ["accept a spec", "write product code"],
    askHumanWhen: ["Who is this for?", "How will you know it worked?"],
    description: "The planner proposes. The person decides.",
  },
  {
    name: "architect",
    label: "Architect",
    job: "Name the modules",
    bucket: "architecture",
    owns: ["the design"],
    skills: ["name the modules"],
    never: ["accept a spec", "write product code"],
    askHumanWhen: ["Which module owns this change?"],
    description: "The architect names the modules. The person decides.",
  },
  {
    name: "builder",
    label: "Builder",
    job: "Build the change",
    bucket: "construction",
    owns: ["the change pack"],
    skills: ["build the change"],
    never: ["accept a spec", "generate a release"],
    askHumanWhen: [],
    description: "The builder builds the change. The person decides.",
  },
];

interface GuideAnswer {
  role: string;
  question: string;
  answer: string;
}

interface GuidePending {
  role: string;
  kind: "role" | "model" | "clarify";
  question: string;
}

interface GuideState {
  change: string;
  request: string;
  answers: GuideAnswer[];
  pending?: GuidePending;
  clarify?: ClarifyState;
}

function ok(stdout: string): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function statePath(root: string): string {
  return join(root, ".sdd", "role-runs", "guide.yaml");
}

export function dutyForStage(id: string, allIds: string[]): Duty {
  if (PLANNING.has(id)) return "planning";
  if (ARCHITECTURE.has(id)) return "architecture";
  if (CONSTRUCTION.has(id)) return "construction";
  const index = allIds.indexOf(id);
  const archAt = allIds.findIndex((item) => ARCHITECTURE.has(item));
  const buildAt = allIds.findIndex((item) => CONSTRUCTION.has(item));
  if (archAt >= 0 && index >= 0 && index < archAt) return "planning";
  if (buildAt >= 0 && index >= buildAt) return "construction";
  if (archAt >= 0 && (buildAt < 0 || index < buildAt)) return "architecture";
  const third = Math.max(1, Math.ceil(allIds.length / 3));
  if (index < third) return "planning";
  if (index < third * 2) return "architecture";
  return "construction";
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseState(value: unknown): GuideState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const change = asText(rec.change);
  const request = asText(rec.request);
  if (!change || !request || !Array.isArray(rec.answers)) return null;
  const answers: GuideAnswer[] = [];
  for (const item of rec.answers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const role = asText(row.role);
    const question = asText(row.question);
    const answer = asText(row.answer);
    if (!role || !question || !answer) return null;
    answers.push({ role, question, answer });
  }
  let pending: GuidePending | undefined;
  if (rec.pending !== undefined) {
    if (!rec.pending || typeof rec.pending !== "object" || Array.isArray(rec.pending)) return null;
    const row = rec.pending as Record<string, unknown>;
    const role = asText(row.role);
    const question = asText(row.question);
    const kind =
      row.kind === "model"
        ? "model"
        : row.kind === "role"
          ? "role"
          : row.kind === "clarify"
            ? "clarify"
            : "";
    if (!role || !question || !kind) return null;
    pending = { role, kind, question };
  }
  const state: GuideState = { change, request, answers };
  if (pending) state.pending = pending;
  if (rec.clarify !== undefined) {
    const clarify = parseClarify(rec.clarify);
    if (!clarify) return null;
    state.clarify = clarify;
  }
  return state;
}

async function readState(root: string): Promise<GuideState | null | "invalid"> {
  const path = statePath(root);
  if (!(await pathExists(path))) return null;
  try {
    const parsed = parseState(await readYaml(path));
    return parsed ?? "invalid";
  } catch {
    return "invalid";
  }
}

async function writeState(root: string, state: GuideState): Promise<void> {
  await ensureDir(join(root, ".sdd", "role-runs"));
  const body: Record<string, unknown> = {
    change: state.change,
    request: state.request,
    answers: state.answers,
  };
  if (state.pending) body.pending = state.pending;
  if (state.clarify) body.clarify = clarifyBody(state.clarify);
  await writeYaml(statePath(root), body);
}

function questionText(role: string, question: string): string {
  return [`Question:`, `${role} asks:`, question, `Answer with: sdd go --answer "..."`.trim()].join(
    "\n",
  );
}

async function roleFiles(root: string): Promise<string[]> {
  const names = await listFiles(join(root, ".sdd", "roles"));
  return names.filter((name) => name.endsWith(".md"));
}

export async function prepareGuide(
  root: string,
  input: { workflow?: string; agents?: false | AgentTarget } = {},
): Promise<RoleCommandResult> {
  const workflowName = input.workflow?.trim() || "feature";
  try {
    if (!(await isInitialized(root))) {
      await initProject({ projectRoot: root, agents: input.agents ?? false });
    }
    const workflow = await loadWorkflow(root, workflowName);
    const ids = workflow.stages.map((stage) => stage.id);
    const existing = await roleFiles(root);
    if (existing.length === 0) {
      for (const duty of DUTIES) {
        const { bucket, ...role } = duty;
        const stages = ids.filter((id) => dutyForStage(id, ids) === bucket);
        const created = await createRole(root, { ...role, stages });
        if (created.exitCode !== 0) return created;
      }
    }
    const lines = ["Ready.", `Workflow: ${workflowName}.`];
    if (existing.length > 0) {
      lines.push("Roles are already here.");
    } else {
      for (const duty of DUTIES) {
        const stages = ids.filter((id) => dutyForStage(id, ids) === duty.bucket);
        lines.push(`${duty.name}: ${stages.join(", ") || "no stage on this workflow"}`);
      }
    }
    lines.push('Next: sdd go "what you want to build"');
    return ok(lines.join("\n"));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function partText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => h2Title(line) === null)
    .join("\n")
    .trim();
}

function draftHeader(stage: Stage, role: string): string[] {
  return [
    `# ${stage.title ?? stage.id}`,
    "",
    `${role} drafted this stage. The person has not signed it.`,
    "",
  ];
}

function plainBody(stage: Stage, role: string, request: string, text: string): string {
  return [...draftHeader(stage, role), text.trim(), "", `Request: ${request}`, ""].join("\n");
}

function headedBody(
  stage: Stage,
  role: string,
  request: string,
  headings: string[],
  parts: { heading: string; text: string }[],
): string {
  const matched = new Map<string, string[]>();
  for (const part of parts) {
    const heading = part.heading.trim();
    const text = partText(part.text);
    if (!headings.includes(heading) || !text) continue;
    const list = matched.get(heading) ?? [];
    list.push(text);
    matched.set(heading, list);
  }
  const rows = draftHeader(stage, role);
  for (const heading of headings) {
    rows.push(`## ${heading}`, "", (matched.get(heading) ?? []).join("\n\n"), "");
  }
  rows.push(`Request: ${request}`, "");
  return rows.join("\n");
}

const RESULTS_LINES: Record<string, string> = {
  Results: "No command output is stored for this change.",
  "Commands run": "This guide did not run a verify command.",
  "Sign-off": "The person has not signed it.",
};

function resultsBody(stage: Stage, role: string, request: string, headings: string[]): string {
  if (headings.length === 0) {
    return plainBody(stage, role, request, Object.values(RESULTS_LINES).join(" "));
  }
  return headedBody(
    stage,
    role,
    request,
    headings,
    headings.map((heading) => ({
      heading,
      text: RESULTS_LINES[heading] ?? RESULTS_LINES.Results,
    })),
  );
}

export interface GuideReply {
  text: string;
  parts: { heading: string; text: string }[];
}

/**
 * Reads a guide reply for an artifact with these headings. A part may use only a listed heading,
 * after its spaces are trimmed. A question is read without its parts, and its text gets the
 * `Question:` prefix the guide stores. A reply in an old shape (no `kind`) is read as the draft
 * or question it stands for, and says so in `legacy`.
 */
export function readGuideReply(headings: string[]): ParseReply<KindRead<GuideReply>> {
  const read = readKinded(guideReplySchema(headings), GUIDE_FAMILY, (reply) => {
    if (reply.kind === "question") return { ...reply, parts: undefined };
    if (!Array.isArray(reply.parts)) return reply;
    return {
      ...reply,
      parts: reply.parts.map((part) => {
        const item = part as Record<string, unknown> | null;
        return item && typeof item === "object" && typeof item.heading === "string"
          ? { ...item, heading: item.heading.trim() }
          : part;
      }),
    };
  });
  return (raw) => {
    const parsed = read(raw);
    if (!parsed.ok) return parsed;
    const reply = parsed.value.value as {
      kind: string;
      text: string;
      parts?: GuideReply["parts"];
    };
    const text = reply.kind === "question" ? asQuestion(reply.text) : reply.text;
    return {
      ok: true,
      value: { value: { text, parts: reply.parts ?? [] }, legacy: parsed.value.legacy },
    };
  };
}

function missingHeading(content: string, headings: string[]): string | null {
  for (const heading of headings) {
    if (!headingsFilled(content, [heading])) return heading;
  }
  return null;
}

function isResultsFile(path: string): boolean {
  const name = path.replace(/\\/g, "/");
  return name === "local-test-results.md" || name.endsWith("/local-test-results.md");
}

async function templateHeadings(root: string, template: string | undefined): Promise<string[]> {
  const name = template?.trim();
  if (!name) return [];
  const path = join(templatesDir(root), name.replace(/^templates\//, ""));
  if (!(await pathExists(path))) return [];
  const headings: string[] = [];
  for (const line of (await readText(path)).split(/\r?\n/)) {
    const title = h2Title(line);
    if (title) headings.push(title);
  }
  return headings;
}

async function artifactReady(abs: string, headings: string[]): Promise<boolean> {
  if (!(await pathExists(abs))) return false;
  const current = await readText(abs);
  if (!isSubstantiveArtifactContent(current)) return false;
  return headings.length === 0 || headingsFilled(current, headings);
}

async function readyArtifacts(
  changeDir: string,
  stages: Stage[],
  currentPath: string,
): Promise<{ path: string; body: string }[]> {
  const files: { path: string; body: string }[] = [];
  for (const stage of stages) {
    for (const artifact of stage.artifacts) {
      if (artifact.required === false || artifact.path === currentPath) continue;
      const abs = join(changeDir, artifact.path);
      if (!(await pathExists(abs))) continue;
      const body = await readText(abs);
      if (!isSubstantiveArtifactContent(body)) continue;
      files.push({ path: artifact.path, body });
    }
  }
  return files;
}

async function writeOne(abs: string, body: string): Promise<void> {
  await ensureDir(join(abs, ".."));
  await writeText(abs, body);
}

function optionalStage(stage: Stage): boolean {
  return stage.optional || stage.kind === "clarify" || stage.kind === "brainstorm";
}

async function leaveStage(
  root: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  changeId: string,
  stageId: string,
  roleName: string,
  drafted: boolean,
  lines: string[],
  state: GuideState,
): Promise<RoleCommandResult | "next"> {
  const note = drafted ? `${roleName} drafted ${stageId}.` : `${roleName} left ${stageId}.`;
  try {
    const advanced = await advanceStage(root, config, changeId);
    lines.push(note);
    if (!advanced.to) {
      await writeState(root, state);
      return ok(
        [
          "Done.",
          ...lines,
          "No further stages. Run `sdd complete` when ready.",
          "The person has not signed this change.",
        ].join("\n"),
      );
    }
    return "next";
  } catch (error) {
    await writeState(root, state);
    const message = error instanceof Error ? error.message : String(error);
    return ok(["Stopped.", note, message, ...lines].join("\n"));
  }
}

async function draftStage(
  root: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  ctx: Awaited<ReturnType<typeof buildContext>>,
  state: GuideState,
  stage: Stage,
  role: RoleProfile,
  required: Stage["artifacts"],
  input: { model?: RoleModel },
  lines: string[],
  legacy: NoteLegacy,
): Promise<RoleCommandResult | "next"> {
  if (required.length === 0) {
    return leaveStage(root, config, ctx.id, stage.id, role.name, false, lines, state);
  }
  const answers: { question: string; answer: string; status?: "confirmed" | "proposed" }[] = [
    ...state.answers.filter((item) => item.role === role.name),
    ...(state.clarify?.answers ?? []).map((item) => ({
      question: item.question,
      answer: item.answer,
      status: item.status,
    })),
  ];
  for (const artifact of required) {
    const headings = await templateHeadings(root, artifact.template);
    const abs = join(ctx.path, artifact.path);
    if (await artifactReady(abs, headings)) continue;
    if (isResultsFile(artifact.path)) {
      await writeOne(abs, resultsBody(stage, role.name, state.request, headings));
      continue;
    }
    if (!input.model) return fail(ROLE_TEXT.noModel);
    const asked = await askModel({
      model: input.model,
      roleId: role.name,
      prompt: guideDraftPrompt({
        role,
        request: state.request,
        answers,
        stageId: stage.id,
        summary: stage.summary ?? "",
        instructions: stage.agent_context?.instructions ?? "",
        artifactPath: artifact.path,
        headings,
        earlier: await readyArtifacts(ctx.path, ctx.workflow.stages, artifact.path),
      }),
      parse: readGuideReply(headings),
    });
    if (!asked.ok) return fail("A draft is not valid.");
    const parsed = asked.value.value;
    if (asked.value.legacy) await legacy(role.name, asked.value.legacy);
    const said = parsed.text.trim();
    if (said.startsWith(QUESTION_PREFIX)) {
      state.pending = {
        role: role.name,
        kind: "model",
        question: said.slice(QUESTION_PREFIX.length).trim() || said,
      };
      await writeState(root, state);
      return ok(
        [
          "Question:",
          ...lines,
          `${role.name} asks:`,
          state.pending.question,
          'Answer with: sdd go --answer "..."',
        ].join("\n"),
      );
    }
    const body =
      headings.length > 0
        ? headedBody(stage, role.name, state.request, headings, parsed.parts)
        : plainBody(stage, role.name, state.request, parsed.text);
    const missing = headings.length > 0 ? missingHeading(body, headings) : null;
    if (missing) {
      await writeState(root, state);
      return ok(["Stopped.", `${missing} is still empty.`, ...lines].join("\n"));
    }
    await writeOne(abs, body);
  }
  return leaveStage(root, config, ctx.id, stage.id, role.name, true, lines, state);
}

export interface GuideInput {
  title?: string;
  answer?: string;
  /** Take the proposed default of the question that is waiting (Enter on a terminal). */
  acceptDefault?: boolean;
  /** Skip the gap check for this run. The skip is recorded. */
  noClarify?: boolean;
  workflow?: string;
  model?: RoleModel;
  agents?: false | AgentTarget;
  now?: () => Date;
}

/**
 * Open a change and let each role ask, draft, and hand off. Questions come from a gap check on
 * the request, not from the role files: ask only where the request has real gaps, one at a time,
 * each with a proposed default.
 */
export async function runGuide(root: string, input: GuideInput = {}): Promise<RoleCommandResult> {
  const result = await runGuideSteps(root, input);
  if (result.exitCode !== 0 || result.stdout.startsWith("Question:")) return result;
  try {
    const state = await readState(root);
    const line = state && state !== "invalid" ? unconfirmedLine(state.clarify ?? null) : null;
    if (line) return { ...result, stdout: `${result.stdout}\n${line}` };
  } catch {
    // The note is extra. Never fail a run for it.
  }
  return result;
}

async function gapRole(root: string, stageId: string): Promise<RoleProfile | undefined> {
  const routed = await matchRoute(root, { stage: stageId });
  if (routed.ok && routed.match.kind !== "ask") {
    const role = await readRole(root, routed.match.role);
    if (role) return role;
  }
  const first = (await roleFiles(root)).sort()[0];
  return first ? ((await readRole(root, first.replace(/\.md$/, ""))) ?? undefined) : undefined;
}

async function runGuideSteps(root: string, input: GuideInput): Promise<RoleCommandResult> {
  const prepared = await prepareGuide(root, {
    workflow: input.workflow,
    agents: input.agents,
  });
  if (prepared.exitCode !== 0) return prepared;

  const title = input.title?.trim() ?? "";
  const answer = input.answer?.trim() ?? "";
  if (input.answer !== undefined && !answer && !input.acceptDefault) {
    return fail("An answer needs text.");
  }

  let loaded: GuideState | null | "invalid";
  try {
    loaded = await readState(root);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (loaded === "invalid") return fail("The guide file is invalid.");

  const config = await loadConfig(root);
  let state = loaded;
  if (title) {
    try {
      const ctx = await createChange({
        projectRoot: root,
        config,
        title,
        workflowName: input.workflow?.trim() || "feature",
      });
      state = { change: ctx.id, request: title, answers: [], clarify: emptyClarify() };
      await writeState(root, state);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  } else if (!state) {
    const active = await getActiveChangeId(root, config);
    if (!active) return prepared;
    try {
      const ctx = await buildContext(root, config, active);
      state = { change: active, request: ctx.meta.title, answers: [] };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }
  const clarify = state.clarify ?? emptyClarify();
  state.clarify = clarify;
  const mirror = async () => {
    await writeState(root, state);
    await writeClarifyFile(changePath(root, config, state.change), clarify);
  };

  const waiting = answer.length > 0 || input.acceptDefault === true;
  if (waiting && !state.pending) return fail("No question is waiting.");
  if (input.noClarify && state.pending?.kind === "clarify") {
    const count = proposeRemaining(clarify);
    recordSkip(clarify, state.pending.role, "--no-clarify");
    state.pending = undefined;
    await mirror();
    if (count === 0 && !waiting) {
      // Nothing queued any more. Carry on.
    }
  } else if (waiting && state.pending) {
    if (state.pending.kind === "clarify") {
      if (!answerNext(clarify, answer)) return fail("No question is waiting.");
    } else if (input.acceptDefault && !answer) {
      return fail("This question has no default. Answer with text.");
    } else {
      state.answers.push({
        role: state.pending.role,
        question: state.pending.question,
        answer,
      });
    }
    state.pending = undefined;
    await mirror();
  } else if (state.pending) {
    if (state.pending.kind === "clarify") {
      return ok(clarifyQuestionText(clarify, []));
    }
    return ok(questionText(state.pending.role, state.pending.question));
  }

  const askNext = async (lines: string[]): Promise<RoleCommandResult> => {
    const next = clarify.queue[0];
    if (!next) return fail("No question is waiting.");
    state.pending = { role: next.stage, kind: "clarify", question: next.question };
    await mirror();
    return ok(clarifyQuestionText(clarify, lines));
  };

  const lines: string[] = [];
  let lastRole = "";
  const legacy = legacyLogger(projectLegacyLog(root), { stamp: () => new Date().toISOString() });
  for (let step = 0; step < 16; step++) {
    let ctx: Awaited<ReturnType<typeof buildContext>>;
    try {
      ctx = await buildContext(root, config, state.change);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
    if (!stage) return fail("No active change.");
    const limit = clarifyLimit(ctx.workflow, await teamClarifyMax(root));
    const hasClarifyStage = ctx.workflow.stages.some((item) => item.kind === "clarify");

    const skipHere = async (reason: string, note: string): Promise<RoleCommandResult | null> => {
      const before = ctx.meta.stage;
      try {
        await skipStage(root, config, ctx.id, stage.id, reason);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      const after = await buildContext(root, config, state.change);
      if (after.meta.stage === before) return fail("This stage stayed put.");
      lines.push(note);
      return null;
    };

    if (stage.kind === "clarify" && stage.skippable) {
      // A clarify stage runs when the request has open questions. It is skipped, with the
      // reason, only when there are none.
      if (input.noClarify) {
        recordSkip(clarify, stage.id, "--no-clarify");
        markChecked(clarify, stage.id);
        await mirror();
        if (!clarify.answers.some((item) => item.stage === stage.id)) {
          const stopped = await skipHere(
            "Clarify was turned off for this run (--no-clarify).",
            `Skipped ${stage.id}: --no-clarify.`,
          );
          if (stopped) return stopped;
          continue;
        }
      }
      if (!clarify.checked.includes(stage.id)) {
        const role = input.model ? await gapRole(root, stage.id) : undefined;
        if (!input.model || !role) {
          markChecked(clarify, stage.id);
          recordSkip(clarify, stage.id, "no model to check the request for gaps");
          await mirror();
        } else {
          const found = await runGapCheck({
            model: input.model,
            role,
            request: state.request,
            stage: stage.id,
            checkpoint: stage.id,
            limit,
            earlier: await readyArtifacts(ctx.path, ctx.workflow.stages, ""),
            state: clarify,
          });
          markChecked(clarify, stage.id);
          if (!found.ok) {
            recordSkip(clarify, stage.id, "the gap check reply was not valid");
            lines.push(`The gap check for ${stage.id} did not return a valid reply.`);
          } else if (found.added === 0 && found.reason === "limit") {
            recordSkip(clarify, stage.id, "question limit reached");
          }
          await mirror();
        }
      }
      if (clarify.queue.length > 0) return askNext(lines);
      if (clarify.answers.some((item) => item.stage === stage.id)) {
        const artifact = stage.artifacts[0]?.path ?? `${stage.id}.md`;
        await writeOne(join(ctx.path, artifact), renderClarifyPage(clarify, stage));
        const moved = await leaveStage(
          root,
          config,
          ctx.id,
          stage.id,
          "clarify",
          true,
          lines,
          state,
        );
        if (moved !== "next") return moved;
        continue;
      }
      const why = clarify.skipped.find((item) => item.stage === stage.id)?.reason;
      const stopped = await skipHere(
        why ? `No questions: ${why}.` : "No gaps found in the request.",
        why ? `Skipped ${stage.id}: ${why}.` : `Skipped ${stage.id}: no gaps found.`,
      );
      if (stopped) return stopped;
      continue;
    }

    if (optionalStage(stage) && stage.skippable) {
      const stopped = await skipHere("No role runs this optional stage.", `Skipped ${stage.id}.`);
      if (stopped) return stopped;
      continue;
    }

    const routed = await matchRoute(root, { stage: stage.id });
    if (!routed.ok) return fail(routed.message);
    if (routed.match.kind === "ask") {
      return ok(["Stopped.", "Ask the human.", routed.match.reason, ...lines].join("\n"));
    }
    const role = await readRole(root, routed.match.role);
    if (!role) return fail(ROLE_TEXT.notFound);
    if (lastRole && lastRole !== role.name) lines.push(`Handoff: ${lastRole} to ${role.name}.`);

    if (!hasClarifyStage && !clarify.checked.includes("start")) {
      // No clarify stage: the gap check runs once, before the first drafting stage.
      markChecked(clarify, "start");
      if (input.noClarify) {
        recordSkip(clarify, "start", "--no-clarify");
      } else if (!input.model) {
        recordSkip(clarify, "start", "no model to check the request for gaps");
      } else {
        const found = await runGapCheck({
          model: input.model,
          role,
          request: state.request,
          stage: stage.id,
          checkpoint: "start",
          limit,
          earlier: [],
          state: clarify,
        });
        if (!found.ok) {
          recordSkip(clarify, "start", "the gap check reply was not valid");
          lines.push("The gap check did not return a valid reply.");
        }
      }
      await mirror();
    }
    if (!hasClarifyStage && clarify.queue.length > 0) return askNext(lines);

    const required = stage.artifacts.filter((artifact) => artifact.required !== false);
    const moved = await draftStage(
      root,
      config,
      ctx,
      state,
      stage,
      role,
      required,
      input,
      lines,
      legacy,
    );
    if (moved !== "next") return moved;
    lastRole = role.name;
  }
  return fail("The guide stopped after 16 steps.");
}
