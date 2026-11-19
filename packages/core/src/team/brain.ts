import { pathExists, readText } from "../fs.js";
import { type PromptSpec, buildPrompt } from "../prompt.js";
import { roleContextBody } from "../role/context.js";
import { readRole, roleFilePath, roleTextForModel } from "../role/profile.js";
import type { TeamConfig } from "../role/schema.js";
import { ROLE_TEXT, type RoleProfile } from "../role/types.js";
import { countTokens } from "../search/tokenize.js";
import { type Fact, getFacts } from "./facts.js";
import { renderLoopContract } from "./loop-contract.js";
import { type Lesson, readLessons, readMemory } from "./memory.js";
import { TOOL_SPECS, allowedChecks } from "./tools.js";

export interface PackedFile {
  path: string;
  text: string;
}

export interface WorkItem {
  text: string;
}

export interface Brain {
  role: RoleProfile;
  bot: TeamConfig["bots"][number];
  memory: string;
  lessons: Lesson[];
  facts: Fact[];
  inputs: PackedFile[];
  prompt: string;
  /** The prompt as sections, so the loop can add room lines and tool results and rebuild it. */
  parts: PromptSpec;
  warning: string;
}

const WARNING = "Memory is longer than the budget.";

const LOOP_GUARDRAILS = [
  "Take one step per turn.",
  "Do not say the work passes unless run_check shows it passing at the current commit.",
  "Ask a person when you are blocked or unsure.",
];

export async function loadBrain(
  root: string,
  cfg: TeamConfig,
  bot: string,
  item: WorkItem,
  budgetTokens: number,
): Promise<Brain | { error: string }> {
  const spec = cfg.bots.find((entry) => entry.name === bot);
  if (!spec) return { error: "Bot not found." };
  const role = await readRole(root, spec.role);
  if (!role) return { error: ROLE_TEXT.notFound };
  const file = roleFilePath(root, spec.role);
  if (!(await pathExists(file))) return { error: ROLE_TEXT.notFound };
  const roleText = roleTextForModel(await readText(file));
  const context = await roleContextBody(root, spec.role);
  const memoryAll = await readMemory(root, spec.name);
  const lessonsNewest = (await readLessons(root, spec.name)).slice().reverse();
  const contract = renderLoopContract({ tools: TOOL_SPECS, checks: await allowedChecks(root) });
  const factsNewest = (await getFacts(root, { query: item.text })).slice().reverse();
  const packed = pack({
    roleText,
    context,
    memoryAll,
    lessons: lessonsNewest,
    facts: factsNewest,
    item: item.text,
    contract,
    budget: budgetTokens,
  });
  return {
    role,
    bot: spec,
    memory: packed.memory,
    lessons: packed.lessons,
    facts: packed.facts,
    inputs: [],
    prompt: packed.prompt,
    parts: packed.parts,
    warning: packed.warning,
  };
}

function pack(input: {
  roleText: string;
  context: string;
  memoryAll: string;
  lessons: Lesson[];
  facts: Fact[];
  item: string;
  contract: string;
  budget: number;
}): {
  memory: string;
  lessons: Lesson[];
  facts: Fact[];
  prompt: string;
  parts: PromptSpec;
  warning: string;
} {
  let memory = input.memoryAll;
  let lessons = input.lessons.slice();
  let facts = input.facts.slice();
  let context = input.context;
  let warning = "";

  const partsNow = (): PromptSpec => {
    const inputs: PromptSpec["inputs"] = [];
    if (context.trim()) inputs.push({ label: "Context", text: context });
    if (memory.trim()) inputs.push({ label: "Memory", text: memory });
    if (lessons.length > 0) {
      inputs.push({
        label: "Lessons",
        text: lessons.map((lesson) => `- ${lesson.text}`).join("\n"),
      });
    }
    if (facts.length > 0) {
      inputs.push({
        label: "Facts",
        text: facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n"),
      });
    }
    return {
      role: [input.roleText.trimEnd()],
      scope: warning ? [warning] : undefined,
      task: [input.item],
      inputs,
      output: input.contract,
      guardrails: LOOP_GUARDRAILS,
    };
  };
  const render = (): string => buildPrompt(partsNow());

  const roleOnly = countTokens(input.roleText) > input.budget;
  if (roleOnly) {
    memory = "";
    lessons = [];
    facts = [];
    context = "";
    warning = input.memoryAll.trim() ? WARNING : "";
    return { memory, lessons, facts, prompt: render(), parts: partsNow(), warning };
  }

  if (countTokens(render()) > input.budget && context.trim()) context = "";

  while (countTokens(render()) > input.budget && facts.length > 0) facts.pop();
  while (countTokens(render()) > input.budget && lessons.length > 0) lessons.pop();
  if (countTokens(render()) > input.budget && memory.trim()) {
    const lines = memory.split(/\r?\n/);
    while (lines.length > 0 && countTokens(render()) > input.budget) {
      lines.shift();
      memory = lines.join("\n");
    }
  }
  if (input.memoryAll.trim() && memory.trim() !== input.memoryAll.trim()) {
    warning = WARNING;
    while (countTokens(render()) > input.budget && facts.length > 0) facts.pop();
    while (countTokens(render()) > input.budget && lessons.length > 0) lessons.pop();
    if (countTokens(render()) > input.budget) memory = "";
  }
  return { memory, lessons, facts, prompt: render(), parts: partsNow(), warning };
}
