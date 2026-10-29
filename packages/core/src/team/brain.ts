import { pathExists, readText } from "../fs.js";
import { roleContextBody } from "../role/context.js";
import { readRole, roleFilePath } from "../role/profile.js";
import type { TeamConfig } from "../role/schema.js";
import { ROLE_TEXT, type RoleProfile } from "../role/types.js";
import { countTokens } from "../search/tokenize.js";
import { type Fact, getFacts } from "./facts.js";
import { type Lesson, readLessons, readMemory } from "./memory.js";

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
  warning: string;
}

const WARNING = "Memory is longer than the budget.";

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
  const roleText = await readText(file);
  const context = await roleContextBody(root, spec.role);
  const memoryAll = await readMemory(root, spec.name);
  const lessonsNewest = (await readLessons(root, spec.name)).slice().reverse();
  const factsNewest = (await getFacts(root, { query: item.text })).slice().reverse();
  const packed = pack({
    roleText,
    context,
    memoryAll,
    lessons: lessonsNewest,
    facts: factsNewest,
    item: item.text,
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
  budget: number;
}): { memory: string; lessons: Lesson[]; facts: Fact[]; prompt: string; warning: string } {
  let memory = input.memoryAll;
  let lessons = input.lessons.slice();
  let facts = input.facts.slice();
  let context = input.context;
  let warning = "";
  const itemBlock = `Item:\n${input.item}`;

  const render = (): string => {
    const parts = [input.roleText.trimEnd()];
    if (warning) parts.push(warning);
    if (context.trim()) parts.push(`Context:\n${context.trimEnd()}`);
    if (memory.trim()) parts.push(`Memory:\n${memory.trimEnd()}`);
    if (lessons.length > 0) {
      parts.push(`Lessons:\n${lessons.map((lesson) => `- ${lesson.text}`).join("\n")}`);
    }
    if (facts.length > 0) {
      parts.push(`Facts:\n${facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n")}`);
    }
    parts.push(itemBlock);
    return parts.join("\n");
  };

  const roleOnly = countTokens(input.roleText) > input.budget;
  if (roleOnly) {
    memory = "";
    lessons = [];
    facts = [];
    context = "";
    warning = input.memoryAll.trim() ? WARNING : "";
    return { memory, lessons, facts, prompt: render(), warning };
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
  return { memory, lessons, facts, prompt: render(), warning };
}
