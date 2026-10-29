import { appendFile } from "node:fs/promises";
import { join } from "pathe";
import { getActiveChangeId } from "../change-context.js";
import { loadConfig } from "../config.js";
import { ensureDir, pathExists, readText } from "../fs.js";
import { guidancePaths } from "../paths.js";
import { recordDecisionRequest } from "../role/signoff.js";
import { gitUserName } from "../role/team.js";
import type { RoleCommandResult } from "../role/types.js";

export interface Fact {
  key: string;
  value: string;
  ts: string;
  by: string;
  source: string;
}

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

export function factsPath(root: string): string {
  return join(root, ".sdd", "facts.jsonl");
}

export function sharesWords(left: string, right: string): boolean {
  const bag = wordsOf(left);
  for (const word of wordsOf(right)) {
    if (bag.has(word)) return true;
  }
  return false;
}

function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? []);
}

export async function readFactLines(root: string): Promise<Fact[]> {
  const file = factsPath(root);
  if (!(await pathExists(file))) return [];
  const out: Fact[] = [];
  for (const line of (await readText(file)).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const rec = value as Record<string, unknown>;
      if (typeof rec.key !== "string" || typeof rec.value !== "string") continue;
      out.push({
        key: rec.key,
        value: rec.value,
        ts: typeof rec.ts === "string" ? rec.ts : "",
        by: typeof rec.by === "string" ? rec.by : "",
        source: typeof rec.source === "string" ? rec.source : "",
      });
    } catch {
      // A bad line stays in the file and is not a fact.
    }
  }
  return out;
}

export async function getFacts(
  root: string,
  query?: { keys?: string[]; query?: string },
): Promise<Fact[]> {
  const lines = await readFactLines(root);
  const order: string[] = [];
  const newest = new Map<string, Fact>();
  for (const fact of lines) {
    if (!newest.has(fact.key)) order.push(fact.key);
    newest.set(fact.key, fact);
  }
  let facts = order.map((key) => newest.get(key)!);
  if (query?.keys) {
    const want = new Set(query.keys);
    facts = facts.filter((fact) => want.has(fact.key));
  }
  if (query?.query) {
    const text = query.query;
    facts = facts.filter((fact) => sharesWords(text, `${fact.key} ${fact.value}`));
  }
  return facts;
}

export async function setFact(
  root: string,
  input: { key?: string; value?: string; source?: string },
): Promise<RoleCommandResult> {
  const rawKey = input.key ?? "";
  const rawValue = input.value ?? "";
  const rawSource = input.source ?? "";
  if (
    rawKey.includes("\n") ||
    rawKey.includes("\r") ||
    rawValue.includes("\n") ||
    rawValue.includes("\r") ||
    rawSource.includes("\n") ||
    rawSource.includes("\r")
  ) {
    return fail("A fact is one line.");
  }
  const key = rawKey.trim();
  const value = rawValue.trim();
  if (!key || !value) return fail("A fact needs a key and a value.");
  if (key.includes("/") || key.includes("\\") || key.includes("\0")) {
    return fail("A fact key is not valid.");
  }
  if (await contradicts(root, value)) return escalate(root, key);
  const fact: Fact = {
    key,
    value,
    ts: new Date().toISOString(),
    by: gitUserName(root) ?? "unknown",
    source: rawSource.trim() || "person",
  };
  const file = factsPath(root);
  await ensureDir(join(file, ".."));
  await appendFile(file, `${JSON.stringify(fact)}\n`, "utf8");
  return ok("Fact set.");
}

export async function showFact(root: string, key?: string): Promise<RoleCommandResult> {
  const name = (key ?? "").trim();
  if (!name) return fail("A fact needs a key and a value.");
  const facts = await getFacts(root, { keys: [name] });
  const hit = facts[0];
  if (!hit) return fail("Fact not set.");
  return ok(hit.value);
}

export async function listFacts(root: string, query?: string): Promise<RoleCommandResult> {
  const facts = await getFacts(root, query ? { query } : undefined);
  if (facts.length === 0) return ok("No facts.");
  return ok(facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n"));
}

async function contradicts(root: string, value: string): Promise<boolean> {
  if (!/\b(ignore|skip|override)\b/i.test(value)) return false;
  let text = "";
  try {
    const config = await loadConfig(root);
    const file = join(root, guidancePaths(config).constitution);
    if (await pathExists(file)) text = await readText(file);
  } catch {
    const file = join(root, "memory", "constitution.md");
    if (await pathExists(file)) text = await readText(file);
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("- ")) continue;
    const bullet = line.slice(2).trim();
    if (bullet.length >= 12 && value.includes(bullet)) return true;
  }
  return false;
}

async function escalate(root: string, key: string): Promise<RoleCommandResult> {
  const note = `fact ${key} contradicts constitution`;
  let changeId: string | null = null;
  try {
    const config = await loadConfig(root);
    changeId = await getActiveChangeId(root, config);
  } catch {
    changeId = null;
  }
  if (!changeId) return fail("A fact contradicts the constitution.");
  return recordDecisionRequest(root, { note, change: changeId });
}
