import { appendFile } from "node:fs/promises";
import { join } from "pathe";
import {
  ensureDir,
  listDirs,
  listFiles,
  pathExists,
  readText,
  removePath,
  writeText,
} from "../fs.js";
import { canonicalRoleName, memoryDir } from "../role/profile.js";
import { gitUserName, readTeamConfig } from "../role/team.js";
import { ROLE_TEXT, type RoleCommandResult } from "../role/types.js";

export interface Lesson {
  ts: string;
  by: string;
  text: string;
  source?: string;
  tags?: string[];
}

const BRAIN_FILES = ["memory.md", "lessons.jsonl"] as const;

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

async function knownBot(root: string, name: string): Promise<RoleCommandResult | null> {
  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  if (!team.team.bots.some((bot) => bot.name === name)) return fail("Bot not found.");
  return null;
}

export async function readMemory(root: string, bot: string): Promise<string> {
  const file = join(memoryDir(root, bot, true), "memory.md");
  if (!(await pathExists(file))) return "";
  return readText(file);
}

export async function readLessons(root: string, bot: string): Promise<Lesson[]> {
  const file = join(memoryDir(root, bot, true), "lessons.jsonl");
  if (!(await pathExists(file))) return [];
  const lessons: Lesson[] = [];
  for (const line of (await readText(file)).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const rec = value as Record<string, unknown>;
      if (typeof rec.text !== "string" || !rec.text.trim()) continue;
      const tags = Array.isArray(rec.tags)
        ? rec.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined;
      lessons.push({
        ts: typeof rec.ts === "string" ? rec.ts : "",
        by: typeof rec.by === "string" ? rec.by : "",
        text: rec.text,
        source: typeof rec.source === "string" ? rec.source : undefined,
        tags,
      });
    } catch {
      // A bad line stays in the file and is not a lesson.
    }
  }
  return lessons;
}

async function appendLesson(root: string, bot: string, lesson: Lesson): Promise<void> {
  const file = join(memoryDir(root, bot, true), "lessons.jsonl");
  await ensureDir(join(file, ".."));
  await appendFile(file, `${JSON.stringify(lesson)}\n`, "utf8");
}

export async function showMemory(root: string, bot: string): Promise<RoleCommandResult> {
  const name = canonicalRoleName(bot);
  if (!name) return fail(ROLE_TEXT.badName);
  const missing = await knownBot(root, name);
  if (missing) return missing;
  const text = await readMemory(root, name);
  if (!text) return ok("No memory.");
  return ok(text.endsWith("\n") ? text.slice(0, -1) : text);
}

export async function addLesson(
  root: string,
  bot: string,
  text: string,
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(bot);
  if (!name) return fail(ROLE_TEXT.badName);
  const missing = await knownBot(root, name);
  if (missing) return missing;
  if (text.includes("\n") || text.includes("\r")) return fail("A lesson is one line.");
  const words = text.trim();
  if (!words) return fail("A lesson needs text.");
  await appendLesson(root, name, {
    ts: new Date().toISOString(),
    by: gitUserName(root) ?? "unknown",
    text: words,
    source: "person",
  });
  return ok("Lesson added.");
}

export async function addReviewerLesson(
  root: string,
  bot: string,
  lesson: { by: string; text: string },
): Promise<void> {
  const text = lesson.text.trim();
  if (!text || text.includes("\n") || text.includes("\r")) return;
  const existing = await readLessons(root, bot);
  if (existing.some((item) => item.text === text)) return;
  await appendLesson(root, bot, {
    ts: new Date().toISOString(),
    by: lesson.by || "reviewer",
    text,
    source: "reviewer",
  });
}

export async function migrateTeamMemory(root: string): Promise<RoleCommandResult> {
  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  const base = join(root, ".sdd", "role-runs", "memory");
  const lines: string[] = [];
  for (const name of (await listDirs(base)).sort()) {
    if (!canonicalRoleName(name)) continue;
    for (const file of BRAIN_FILES) {
      const from = join(base, name, file);
      if (!(await pathExists(from))) continue;
      const fromRel = `.sdd/role-runs/memory/${name}/${file}`;
      const toRel = `.sdd/agents/${name}/${file}`;
      const to = join(memoryDir(root, name, true), file);
      if (await pathExists(to)) {
        lines.push(`left ${fromRel}`);
        continue;
      }
      await ensureDir(join(to, ".."));
      await writeText(to, await readText(from));
      await removePath(from);
      lines.push(`moved ${fromRel} -> ${toRel}`);
    }
    if ((await listFiles(join(base, name))).length === 0) await removePath(join(base, name));
  }
  if (lines.length === 0) return ok("Nothing to migrate.");
  return ok(lines.join("\n"));
}
