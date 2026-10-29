import { join } from "pathe";
import type { AgentTarget } from "../agents.js";
import { isSubstantiveArtifactContent } from "../artifacts.js";
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
import type { Stage } from "../schemas.js";
import { getStage, loadWorkflow } from "../workflow.js";
import { createRole, readRole } from "./profile.js";
import { matchRoute } from "./routing.js";
import { runRole } from "./run.js";
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
  kind: "role" | "model";
  question: string;
}

interface GuideState {
  change: string;
  request: string;
  answers: GuideAnswer[];
  pending?: GuidePending;
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
    const kind = row.kind === "model" ? "model" : row.kind === "role" ? "role" : "";
    if (!role || !question || !kind) return null;
    pending = { role, kind, question };
  }
  const state: GuideState = { change, request, answers };
  if (pending) state.pending = pending;
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
  await writeYaml(statePath(root), body);
}

function questionText(role: string, question: string): string {
  return [`Question:`, `${role} asks:`, question, `Answer with: sdd go --answer "..."`.trim()].join(
    "\n",
  );
}

function nextRoleQuestion(role: RoleProfile, answers: GuideAnswer[]): string | undefined {
  const answered = new Set(
    answers.filter((item) => item.role === role.name).map((item) => item.question),
  );
  return role.askHumanWhen.find((item) => !answered.has(item));
}

function taskFor(request: string, role: string, answers: GuideAnswer[]): string {
  const rows = [`Request: ${request}`];
  const mine = answers.filter((item) => item.role === role);
  if (mine.length > 0) {
    rows.push("Answers:");
    for (const item of mine) rows.push(`- ${item.question}: ${item.answer}`);
  }
  return rows.join("\n");
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

async function writeDraft(
  ctxPath: string,
  stage: Stage,
  role: string,
  text: string,
  request: string,
): Promise<void> {
  const body = [
    `# ${stage.title ?? stage.id}`,
    "",
    `${role} drafted this stage. The person has not signed it.`,
    "",
    text.trim(),
    "",
    `Request: ${request}`,
    "",
  ].join("\n");
  for (const artifact of stage.artifacts) {
    if (!artifact.required) continue;
    const abs = join(ctxPath, artifact.path);
    if (await pathExists(abs)) {
      const current = await readText(abs);
      if (isSubstantiveArtifactContent(current)) continue;
    }
    await writeText(abs, body);
  }
}

function optionalStage(stage: Stage): boolean {
  return stage.optional || stage.kind === "clarify" || stage.kind === "brainstorm";
}

export async function runGuide(
  root: string,
  input: {
    title?: string;
    answer?: string;
    workflow?: string;
    model?: RoleModel;
    agents?: false | AgentTarget;
    now?: () => Date;
  } = {},
): Promise<RoleCommandResult> {
  const prepared = await prepareGuide(root, {
    workflow: input.workflow,
    agents: input.agents,
  });
  if (prepared.exitCode !== 0) return prepared;

  const title = input.title?.trim() ?? "";
  const answer = input.answer?.trim() ?? "";
  if (input.answer !== undefined && !answer) return fail("An answer needs text.");

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
      state = { change: ctx.id, request: title, answers: [] };
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

  if (answer && !state.pending) return fail("No question is waiting.");
  if (answer && state.pending) {
    state.answers.push({
      role: state.pending.role,
      question: state.pending.question,
      answer,
    });
    state.pending = undefined;
    await writeState(root, state);
  } else if (state.pending) {
    return ok(questionText(state.pending.role, state.pending.question));
  }

  const lines: string[] = [];
  let lastRole = "";
  for (let step = 0; step < 16; step++) {
    let ctx: Awaited<ReturnType<typeof buildContext>>;
    try {
      ctx = await buildContext(root, config, state.change);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
    if (!stage) return fail("No active change.");

    if (optionalStage(stage) && stage.skippable) {
      const before = ctx.meta.stage;
      try {
        await skipStage(root, config, ctx.id, stage.id, "No role runs this optional stage.");
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      const after = await buildContext(root, config, state.change);
      if (after.meta.stage === before) return fail("This stage stayed put.");
      lines.push(`Skipped ${stage.id}.`);
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

    const question = nextRoleQuestion(role, state.answers);
    if (question) {
      state.pending = { role: role.name, kind: "role", question };
      await writeState(root, state);
      return ok(
        [
          "Question:",
          ...lines,
          `${role.name} asks:`,
          question,
          'Answer with: sdd go --answer "..."',
        ].join("\n"),
      );
    }

    if (!input.model) return fail(ROLE_TEXT.noModel);
    const ran = await runRole(root, {
      name: role.name,
      task: taskFor(state.request, role.name, state.answers),
      guide: { changeDir: ctx.displayPath },
      model: input.model,
      now: input.now,
    });
    if (ran.exitCode !== 0) {
      return fail([ran.stdout, ...lines].filter((line) => line.length > 0).join("\n"));
    }
    const text = ran.stdout.trim();
    if (text.startsWith("Question:")) {
      const asked = text.replace(/^Question:\s*/, "").trim();
      state.pending = { role: role.name, kind: "model", question: asked || text };
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

    await writeDraft(ctx.path, stage, role.name, text, state.request);
    try {
      const advanced = await advanceStage(root, config, ctx.id);
      lines.push(`${role.name} drafted ${stage.id}.`);
      lastRole = role.name;
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
    } catch (error) {
      await writeState(root, state);
      const message = error instanceof Error ? error.message : String(error);
      return ok(["Stopped.", `${role.name} drafted ${stage.id}.`, message, ...lines].join("\n"));
    }
  }
  return fail("The guide stopped after 16 steps.");
}
