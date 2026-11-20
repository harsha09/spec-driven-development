import { join } from "pathe";
import { z } from "zod";
import { ensureDir, listFiles, pathExists, readText, readYaml, writeYaml } from "./fs.js";
import { decisionsDir } from "./paths.js";
import { gitUserName } from "./role/team.js";
import type { RoleCommandResult } from "./role/types.js";

const DECISION_ID = /^[a-z0-9][a-z0-9._-]*$/i;

export const DecisionHistoryEntrySchema = z.object({
  at: z.string(),
  by: z.string(),
  why: z.string().optional(),
  from_rule: z.string(),
  to_rule: z.string(),
});

export const DecisionRecordSchema = z.object({
  id: z.string(),
  rule: z.string(),
  scope: z.array(z.string()).default([]),
  by: z.string(),
  created: z.string(),
  supersedes: z.string().optional(),
  superseded_by: z.string().optional(),
  history: z.array(DecisionHistoryEntrySchema).default([]),
});

export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
export type DecisionHistoryEntry = z.infer<typeof DecisionHistoryEntrySchema>;

/** Markdown and prose: `decision-ref: <id>` */
export const DECISION_REF_LINE = /decision-ref:\s*([a-z0-9][a-z0-9._-]*)/gi;

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

export function isValidDecisionId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed || trimmed.includes("..")) return false;
  return DECISION_ID.test(trimmed);
}

function decisionFile(root: string, id: string): string {
  return join(decisionsDir(root), `${id}.yaml`);
}

export async function loadDecisionRecord(root: string, id: string): Promise<DecisionRecord | null> {
  const file = decisionFile(root, id);
  if (!(await pathExists(file))) return null;
  try {
    return DecisionRecordSchema.parse(await readYaml(file));
  } catch {
    return null;
  }
}

export async function listDecisionIds(root: string): Promise<string[]> {
  const dir = decisionsDir(root);
  if (!(await pathExists(dir))) return [];
  return (await listFiles(dir))
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => name.slice(0, -".yaml".length))
    .sort();
}

export async function addDecision(
  root: string,
  input: {
    id?: string;
    rule?: string;
    scope?: string[];
    supersedes?: string;
    why?: string;
  },
): Promise<RoleCommandResult> {
  const id = (input.id ?? "").trim();
  const rule = (input.rule ?? "").trim();
  if (!id || !rule) return fail("A decision needs an id and a rule.");
  if (!isValidDecisionId(id)) return fail("A decision id is not valid.");
  if (await loadDecisionRecord(root, id)) return fail("That decision id already exists.");

  const scope = (input.scope ?? []).map((item) => item.trim()).filter(Boolean);
  const supersedes = (input.supersedes ?? "").trim();
  const why = (input.why ?? "").trim();
  const by = gitUserName(root) ?? "unknown";
  const created = new Date().toISOString();

  if (supersedes) {
    if (!isValidDecisionId(supersedes)) return fail("supersedes id is not valid.");
    const prior = await loadDecisionRecord(root, supersedes);
    if (!prior) return fail(`No decision record: ${supersedes}`);
    if (prior.superseded_by) {
      return fail(`Decision ${supersedes} is already superseded by ${prior.superseded_by}.`);
    }
    const entry: DecisionHistoryEntry = {
      at: created,
      by,
      why: why || undefined,
      from_rule: prior.rule,
      to_rule: rule,
    };
    const updated: DecisionRecord = {
      ...prior,
      superseded_by: id,
      history: [...(prior.history ?? []), entry],
    };
    await writeYaml(decisionFile(root, supersedes), DecisionRecordSchema.parse(updated));
  }

  const record: DecisionRecord = {
    id,
    rule,
    scope,
    by,
    created,
    supersedes: supersedes || undefined,
    history: [],
  };
  await ensureDir(decisionsDir(root));
  await writeYaml(decisionFile(root, id), record);
  return ok(`Decision ${id} recorded.`);
}

export function formatDecisionRecord(record: DecisionRecord): string {
  const lines: string[] = [];
  lines.push(`id: ${record.id}`);
  lines.push(`rule: ${record.rule}`);
  if (record.scope.length) lines.push(`scope: ${record.scope.join(", ")}`);
  lines.push(`by: ${record.by}`);
  lines.push(`created: ${record.created}`);
  if (record.supersedes) lines.push(`supersedes: ${record.supersedes}`);
  if (record.superseded_by) lines.push(`superseded_by: ${record.superseded_by}`);
  if (record.history.length) {
    lines.push("");
    lines.push("history:");
    for (const entry of record.history) {
      lines.push(`  - at: ${entry.at}`);
      lines.push(`    by: ${entry.by}`);
      if (entry.why) lines.push(`    why: ${entry.why}`);
      lines.push(`    from_rule: ${entry.from_rule.replace(/\n/g, " ")}`);
      lines.push(`    to_rule: ${entry.to_rule.replace(/\n/g, " ")}`);
    }
  }
  return lines.join("\n");
}

export async function showDecision(root: string, id?: string): Promise<RoleCommandResult> {
  const name = (id ?? "").trim();
  if (!name) return fail("A decision id is required.");
  const record = await loadDecisionRecord(root, name);
  if (!record) return fail(`No decision record: ${name}`);
  const lines = [formatDecisionRecord(record)];
  if (record.superseded_by) {
    const next = await loadDecisionRecord(root, record.superseded_by);
    if (next) {
      lines.push("");
      lines.push(`Replacement (${record.superseded_by}):`);
      lines.push(next.rule);
    }
  }
  return ok(lines.join("\n"));
}

export async function listDecisions(root: string, query?: string): Promise<RoleCommandResult> {
  const ids = await listDecisionIds(root);
  if (!ids.length) return ok("No decision records.");
  const q = (query ?? "").trim().toLowerCase();
  const rows: string[] = [];
  for (const id of ids) {
    const record = await loadDecisionRecord(root, id);
    if (!record) continue;
    const hay = `${id} ${record.rule} ${record.scope.join(" ")}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const mark = record.superseded_by ? " (superseded)" : "";
    rows.push(`${id}${mark}: ${record.rule.split(/\n/)[0]}`);
  }
  if (!rows.length) return ok("No decision records.");
  return ok(rows.join("\n"));
}

export function extractDecisionRefs(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(DECISION_REF_LINE)) {
    const id = match[1];
    if (id) found.add(id);
  }
  return [...found];
}

/** Expand decision-ref lines with linked ruling text for display. */
export async function resolveDecisionRefsInText(
  root: string,
  text: string,
): Promise<{ body: string; resolved: string[]; missing: string[] }> {
  const ids = extractDecisionRefs(text);
  const missing: string[] = [];
  const resolved: string[] = [];
  for (const id of ids) {
    const record = await loadDecisionRecord(root, id);
    if (!record) {
      missing.push(id);
      continue;
    }
    let block = `[${id}] ${record.rule}`;
    if (record.superseded_by) {
      block += ` (superseded by ${record.superseded_by})`;
      const next = await loadDecisionRecord(root, record.superseded_by);
      if (next) block += `\n  → ${next.rule}`;
    }
    resolved.push(block);
  }
  let body = text;
  if (resolved.length) {
    body += `\n\n## Linked decisions\n\n${resolved.join("\n\n")}\n`;
  }
  return { body, resolved, missing };
}

export async function showDecisionResolved(
  root: string,
  relPath: string,
): Promise<RoleCommandResult> {
  const file = join(root, relPath);
  if (!(await pathExists(file))) return fail(`File not found: ${relPath}`);
  const text = await readText(file);
  const { body, missing } = await resolveDecisionRefsInText(root, text);
  if (missing.length) {
    return fail(`Unknown decision ids: ${missing.join(", ")}`);
  }
  return ok(body);
}

function isTestLikePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  return (
    lower.includes("acceptance") ||
    lower.includes("local-test") ||
    lower.includes("/test") ||
    lower.endsWith(".test.ts") ||
    lower.endsWith(".test.md") ||
    lower.endsWith(".spec.ts")
  );
}

async function collectMarkdownFiles(root: string, dirs: string[]): Promise<string[]> {
  const { promises: fs } = await import("node:fs");
  const out: string[] = [];

  async function walkDir(abs: string, prefix: string): Promise<void> {
    if (!(await pathExists(abs))) return;
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(abs, entry.name);
      if (entry.isDirectory()) {
        await walkDir(full, rel);
      } else if (/\.(md|ya?ml)$/i.test(entry.name)) {
        out.push(rel.split("\\").join("/"));
      }
    }
  }

  for (const dir of dirs) {
    await walkDir(join(root, dir), dir);
  }
  return out;
}

export interface DecisionCheckResult {
  unknownRefs: { file: string; id: string }[];
  unreferencedInTests: string[];
  referenced: Set<string>;
}

export async function checkDecisionReferences(
  root: string,
  config: { memory_path: string; changes_path: string; domains_path: string },
): Promise<DecisionCheckResult> {
  const scanRoots = [config.changes_path, config.memory_path, config.domains_path];
  const files = await collectMarkdownFiles(root, scanRoots);
  const ids = new Set(await listDecisionIds(root));
  const referenced = new Set<string>();
  const referencedInTests = new Set<string>();
  const unknownRefs: { file: string; id: string }[] = [];

  for (const rel of files) {
    const text = await readText(join(root, rel));
    for (const id of extractDecisionRefs(text)) {
      referenced.add(id);
      if (isTestLikePath(rel)) referencedInTests.add(id);
      if (!ids.has(id)) unknownRefs.push({ file: rel, id });
    }
  }

  // Only list active decisions with no test reference (informational)
  const active = new Set(await listDecisionIds(root));
  for (const id of [...active]) {
    const rec = await loadDecisionRecord(root, id);
    if (rec?.superseded_by) active.delete(id);
  }
  const unreferencedInTestsFiltered = [...active].filter((id) => !referencedInTests.has(id));

  return {
    unknownRefs,
    unreferencedInTests: unreferencedInTestsFiltered,
    referenced,
  };
}

export async function runDecisionCheck(
  root: string,
  config: { memory_path: string; changes_path: string; domains_path: string },
): Promise<RoleCommandResult> {
  const result = await checkDecisionReferences(root, config);
  const lines: string[] = [];
  if (result.unknownRefs.length) {
    for (const row of result.unknownRefs) {
      lines.push(`warning: unknown decision-ref ${row.id} in ${row.file}`);
    }
  }
  if (result.unreferencedInTests.length) {
    lines.push(`note: no test references yet for: ${result.unreferencedInTests.join(", ")}`);
  }
  if (!lines.length) return ok("Decision references look good.");
  if (result.unknownRefs.length) return fail(lines.join("\n"));
  return ok(lines.join("\n"));
}
