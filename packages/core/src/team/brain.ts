import { pathExists } from "../fs.js";
import { type PromptSpec, buildPrompt, roleCard, roleLines, scopeLines } from "../prompt.js";
import { roleContextBody } from "../role/context.js";
import { readRole, roleFilePath } from "../role/profile.js";
import type { TeamConfig } from "../role/schema.js";
import { ROLE_TEXT, type RoleProfile } from "../role/types.js";
import { countTokens } from "../search/tokenize.js";
import { type Fact, getFacts } from "./facts.js";
import { renderLoopContract, renderToolList } from "./loop-contract.js";
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
  "Send one step per reply. Never send a list of steps.",
  "Use only the tools listed.",
  "Do not write pass, works or fixed in a check or done unless you cite an evidence path from run_check at the current commit.",
  "If a step fails, read the error before the next step. Do not repeat the same failing step more than twice.",
  "Do not write secrets or files outside the project.",
  "If you reach the last step and are not done, use ask and say what is left.",
];

function loopTask(maxSteps: number): string[] {
  return [
    `Do the work item. Work in steps. Send exactly one step in each reply. You have at most ${maxSteps} steps.`,
    'Your first step is a "plan" with 2 to 5 short items.',
    'Then use "tool" steps to read, search, write and check. Read a file before you write it.',
    'After a "tool" step, the next prompt shows its result under "Tool results".',
    'Use "check" to state a claim and give its evidence before you finish.',
    'Use "ask" when a fact is missing or an "Ask the person when" line is true. Give 2 to 4 options. Say which you suggest.',
    'End with "done": a one-line summary and the paths you wrote.',
    'Done when: every item under "You produce" exists, and every pass claim has evidence.',
  ];
}

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
  if (!(await pathExists(roleFilePath(root, spec.role)))) return { error: ROLE_TEXT.notFound };
  const card = roleCard(role);
  const context = await roleContextBody(root, spec.role);
  const memoryAll = await readMemory(root, spec.name);
  const lessonsNewest = (await readLessons(root, spec.name)).slice().reverse();
  const tools = renderToolList({ tools: TOOL_SPECS, checks: await allowedChecks(root) });
  const factsNewest = (await getFacts(root, { query: item.text })).slice().reverse();
  const packed = pack({
    role: roleLines(card),
    scope: scopeLines(card, tools),
    task: loopTask(cfg.limits?.loop_max_steps ?? 8),
    context,
    memoryAll,
    lessons: lessonsNewest,
    facts: factsNewest,
    item: item.text,
    contract: renderLoopContract(),
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
  role: string[];
  scope: string[];
  task: string[];
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
    inputs.push({ label: "Work item", source: "the person", text: input.item });
    if (context.trim()) {
      inputs.push({ label: "Context", source: "the role context file", text: context });
    }
    if (memory.trim()) inputs.push({ label: "Memory", source: "the bot memory", text: memory });
    if (lessons.length > 0) {
      inputs.push({
        label: "Lessons",
        source: "earlier runs",
        text: lessons.map((lesson) => `- ${lesson.text}`).join("\n"),
      });
    }
    if (facts.length > 0) {
      inputs.push({
        label: "Facts",
        source: "the fact store",
        text: facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n"),
      });
    }
    return {
      role: input.role,
      scope: input.scope,
      task: warning ? [...input.task, warning] : input.task,
      inputs,
      output: input.contract,
      guardrails: LOOP_GUARDRAILS,
    };
  };
  const render = (): string => buildPrompt(partsNow());

  const roleOnly = countTokens([...input.role, ...input.scope].join("\n")) > input.budget;
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
