import { appendFile } from "node:fs/promises";
import { basename, join } from "pathe";
import { z } from "zod";
import { ensureDir, listFiles, pathExists, readText } from "../fs.js";
import { conversationDir } from "../role/profile.js";
import type { TeamConfig } from "../role/schema.js";
import { recordDecisionRequest } from "../role/signoff.js";
import type { RoleCommandResult, RoleModel } from "../role/types.js";
import type { Brain } from "./brain.js";
import { addReviewerLesson } from "./memory.js";
import { postLoopDone, roomForPrompt } from "./room.js";
import { passClaimRefusal, runTool } from "./tools.js";

const planStep = z.object({ step: z.literal("plan"), items: z.array(z.string()) }).strict();
const toolStep = z
  .object({ step: z.literal("tool"), name: z.string().min(1), args: z.unknown() })
  .strict();
const checkStep = z
  .object({
    step: z.literal("check"),
    claim: z.string().min(1),
    evidence: z.array(z.string()).optional(),
  })
  .strict();
const askStep = z
  .object({
    step: z.literal("ask"),
    question: z.string().min(1),
    options: z.array(z.string()),
    suggest: z.string().optional(),
  })
  .strict();
const doneStep = z
  .object({
    step: z.literal("done"),
    summary: z.string(),
    outputs: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  })
  .strict();

export const LoopStepSchema = z.discriminatedUnion("step", [
  planStep,
  toolStep,
  checkStep,
  askStep,
  doneStep,
]);

export type LoopStep = z.infer<typeof LoopStepSchema>;

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

async function appendLine(file: string, value: unknown): Promise<void> {
  await ensureDir(join(file, ".."));
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

export async function runLoop(input: {
  root: string;
  cfg: TeamConfig;
  brain: Brain;
  model: RoleModel;
  file: string;
  roleName: string;
  logName: string;
}): Promise<RoleCommandResult> {
  const max = input.cfg.limits?.loop_max_steps ?? 8;
  const room = await roomForPrompt(input.root);
  const base = room ? `${input.brain.prompt}\nRoom:\n${room}` : input.brain.prompt;
  let tools = "";
  const promptFor = (): string => (tools ? `${base}\nTools:\n${tools}` : base);
  const remember = (text: string): void => {
    const piece = text.trim().slice(-4000);
    tools = `${tools}\n${piece}`.trim().slice(-8000);
  };
  let taken = 0;
  let copied = false;
  const copyReviewer = async (): Promise<void> => {
    if (copied) return;
    copied = true;
    const lesson = await priorLesson(input.root, input.logName, input.file, input.roleName);
    if (!lesson) return;
    await addReviewerLesson(input.root, input.brain.bot.name, lesson);
  };

  while (taken < max) {
    let raw: string;
    try {
      raw = await input.model.complete({ roleId: input.roleName, prompt: promptFor() });
    } catch {
      await appendLine(input.file, { type: "bad_call", roleId: input.roleName });
      return fail("A loop step is not valid.");
    }
    taken += 1;
    const step = parseStep(raw);
    if (!step) {
      await appendLine(input.file, { type: "bad_call", roleId: input.roleName });
      return fail("A loop step is not valid.");
    }
    if (step.kind === "understand") {
      await appendLine(input.file, { type: "step", step: "understand" });
      continue;
    }
    if (step.kind === "reflect") {
      await appendLine(input.file, { type: "step", step: "reflect" });
      await copyReviewer();
      continue;
    }
    if (step.kind === "schema") {
      const body = step.step;
      if (body.step === "plan") {
        await appendLine(input.file, { type: "step", step: "plan", items: body.items });
        continue;
      }
      if (body.step === "tool") {
        const ran = await runTool(input.root, input.cfg, input.brain.bot.name, {
          name: body.name,
          args: body.args,
        });
        remember(ran.text);
        await appendLine(input.file, { type: "step", step: "tool", name: body.name, ok: ran.ok });
        continue;
      }
      if (body.step === "check") {
        const refusal = await passClaimRefusal(input.root, body.claim, body.evidence ?? []);
        if (refusal) {
          remember(refusal);
          await appendLine(input.file, { type: "step", step: "refused", text: refusal });
          continue;
        }
        await appendLine(input.file, {
          type: "step",
          step: "check",
          claim: body.claim,
          evidence: body.evidence ?? [],
        });
        continue;
      }
      if (body.step === "ask") return ask(input.root, input.file, body.question, body.options);
      const cites = body.evidence ?? [];
      const refusal = await passClaimRefusal(input.root, body.summary, cites);
      if (refusal) {
        remember(refusal);
        await appendLine(input.file, { type: "step", step: "refused", text: refusal });
        continue;
      }
      await appendLine(input.file, { type: "step", step: "done", summary: body.summary });
      await copyReviewer();
      await postLoopDone(input.root, input.brain.bot.name, body.summary, cites[0]);
      return ok(body.summary);
    }
  }
  return ask(input.root, input.file, `Stopped after ${max} steps.`, ["continue", "stop"]);
}

async function ask(
  root: string,
  file: string,
  question: string,
  options: string[],
): Promise<RoleCommandResult> {
  await appendLine(file, { type: "step", step: "ask", question, options });
  const note = question.trim();
  if (note && !note.includes("\n") && !note.includes("\r")) {
    await recordDecisionRequest(root, { note });
  }
  return ok(question);
}

type Parsed = { kind: "understand" } | { kind: "reflect" } | { kind: "schema"; step: LoopStep };

function parseStep(raw: string): Parsed | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = { ...(value as Record<string, unknown>) };
  if (rec.step === "understand") return { kind: "understand" };
  if (rec.step === "reflect") return { kind: "reflect" };
  if (rec.step === "stop") {
    rec.step = "done";
    if (typeof rec.summary !== "string") rec.summary = typeof rec.text === "string" ? rec.text : "";
    if (!Array.isArray(rec.outputs)) rec.outputs = [];
  }
  if (rec.step === "act") {
    rec.step = "tool";
    if (typeof rec.name !== "string" || !rec.name) rec.name = "act";
    if (rec.args === undefined) rec.args = {};
  }
  if (rec.step === undefined && typeof rec.text === "string") {
    const summary = rec.text;
    const { text: _ignored, ...rest } = rec;
    const done = LoopStepSchema.safeParse({ ...rest, step: "done", summary, outputs: [] });
    if (!done.success) return null;
    return { kind: "schema", step: done.data };
  }
  const parsed = LoopStepSchema.safeParse(rec);
  if (!parsed.success) return null;
  return { kind: "schema", step: parsed.data };
}

async function priorLesson(
  root: string,
  logName: string,
  file: string,
  roleName: string,
): Promise<{ by: string; text: string } | null> {
  const dir = conversationDir(root, logName);
  const names = (await listFiles(dir)).filter((item) => item.endsWith(".jsonl")).sort();
  const index = names.indexOf(basename(file));
  if (index <= 0) return null;
  const prior = join(dir, names[index - 1]!);
  if (!(await pathExists(prior))) return null;
  let fromChange: { by: string; text: string } | null = null;
  let fromOther: { by: string; text: string } | null = null;
  for (const line of (await readText(prior)).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    if (rec.type !== "model") continue;
    const roleId = typeof rec.roleId === "string" ? rec.roleId : "reviewer";
    const changed = Array.isArray(rec.changed)
      ? rec.changed.filter((cite): cite is string => typeof cite === "string" && cite.trim() !== "")
      : [];
    if (changed.length > 0) fromChange = { by: roleId, text: changed.join(", ") };
    else if (roleId !== roleName && typeof rec.text === "string" && !rec.text.includes("\n")) {
      fromOther = { by: roleId, text: rec.text };
    }
  }
  return fromChange ?? fromOther;
}
