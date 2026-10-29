import { appendFile } from "node:fs/promises";
import { isAbsolute, join } from "pathe";
import { loadConfig } from "../config.js";
import { ensureDir, listFiles, pathExists, readText, readYaml, writeText } from "../fs.js";
import { getHeadSha } from "../git-head.js";
import { changesDir, configPath } from "../paths.js";
import {
  allowFilePath,
  canonicalRoleName,
  conversationDir,
  listConversationRoles,
  readAllowFile,
  readRole,
} from "./profile.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleModel, type RoleProfile } from "./types.js";

const DRAFT_KINDS = new Set(["code", "scenario", "release"]);
const FORBIDDEN = new Set([
  "accept_spec",
  "replace_decision",
  "write_qa",
  "generate_release",
  "sdd_next",
  "sdd_complete",
  "create_change",
]);
const UNAVAILABLE = new Set(["commit", "push", "tag", "pull_request", "merge", "deploy"]);
const CLOSED = new Set(["applied", "denied", "rejected", "unavailable", "stopped", "expired"]);

interface AcceptedSection {
  id: string;
  decision: string;
  checks: string[];
  body: string;
}

interface ModelAction {
  name: string;
  words: string;
  inputs: Record<string, unknown>;
}

interface ModelReply {
  text: string;
  gaps: { cite: string; text: string }[];
  changed: string[] | null;
  action: ModelAction | null;
}

interface PendingStop {
  name: string;
  words: string;
  inputs: Record<string, unknown>;
  expiresAt: string;
}

export interface RunRoleInput {
  name: string;
  task?: string;
  withRole?: string;
  kind?: string;
  section?: string;
  change?: string;
  stop?: boolean;
  model?: RoleModel;
  now?: () => Date;
}

export interface AllowRoleInput {
  runId: string;
  mode: "once" | "always" | "deny";
  now?: () => Date;
}

function ok(stdout = "", runId?: string): RoleCommandResult {
  return runId ? { exitCode: 0, stdout, runId } : { exitCode: 0, stdout };
}

function fail(stdout: string, runId?: string): RoleCommandResult {
  return runId ? { exitCode: 1, stdout, runId } : { exitCode: 1, stdout };
}

function linesOf(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("\n");
}

export function runIdFrom(date: Date): string {
  const iso = date.toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) return "unknown";
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}

/** Case-sensitive mention ban. A hit rejects the task wherever the text appears. */
function mentionsX(task: string): boolean {
  return /@X|x\.com|twitter\.com/.test(task);
}

function safeChangeId(id: string): boolean {
  if (!id || id.length > 200) return false;
  if (id === "." || id === "..") return false;
  return !id.includes("/") && !id.includes("\\") && !id.includes("\0");
}

function safeRunId(id: string): boolean {
  if (!id || id.length > 80) return false;
  if (id === "." || id === "..") return false;
  return !id.includes("/") && !id.includes("\\") && !id.includes("\0");
}

/** Last segment, not a suffix. `not-accepted.md` stays writable. */
export function isSafeProductPath(rel: string): boolean {
  if (typeof rel !== "string" || rel.length === 0 || rel.includes("\0")) return false;
  if (isAbsolute(rel) || rel.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split(/[/\\]/);
  for (const part of parts) {
    if (part === "" || part === "." || part === ".." || part === ".active" || part === ".sdd") {
      return false;
    }
  }
  return parts[parts.length - 1] !== "accepted.md";
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rec).sort()) out[key] = sortKeys(rec[key]);
    return out;
  }
  return value;
}

function sameInputs(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameCiteSet(changed: string[], cites: string[]): boolean {
  const left = [...new Set(changed)].sort();
  const right = [...new Set(cites)].sort();
  return left.length === right.length && left.every((cite, index) => cite === right[index]);
}

export function parseSection(markdown: string, sectionId: string): AcceptedSection | null {
  const rows = markdown.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? "";
    if (row.startsWith("## ") && row.slice(3).trim() === sectionId) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = rows.length;
  for (let i = start + 1; i < rows.length; i++) {
    if ((rows[i] ?? "").startsWith("## ")) {
      end = i;
      break;
    }
  }
  const body = rows.slice(start + 1, end);
  let decision = "";
  let accepted = false;
  const checks: string[] = [];
  for (const row of body) {
    const trimmed = row.trim();
    if (!decision && trimmed.startsWith("decision: "))
      decision = trimmed.slice("decision: ".length).trim();
    if (trimmed === "accepted: yes") accepted = true;
    if (trimmed.startsWith("- check: ")) {
      const id = trimmed.slice("- check: ".length).trim();
      if (id) checks.push(id);
    }
  }
  if (!decision || !accepted) return null;
  return { id: sectionId, decision, checks, body: body.join("\n") };
}

export function parseReply(raw: string): ModelReply | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.text !== "string") return null;
  const gaps: { cite: string; text: string }[] = [];
  if (rec.gaps !== undefined) {
    if (!Array.isArray(rec.gaps)) return null;
    for (const gap of rec.gaps) {
      if (!gap || typeof gap !== "object" || Array.isArray(gap)) return null;
      const item = gap as Record<string, unknown>;
      if (typeof item.cite !== "string" || typeof item.text !== "string") return null;
      gaps.push({ cite: item.cite, text: item.text });
    }
  }
  let changed: string[] | null = null;
  if (rec.changed !== undefined) {
    if (!Array.isArray(rec.changed) || rec.changed.some((cite) => typeof cite !== "string"))
      return null;
    changed = rec.changed as string[];
  }
  let action: ModelAction | null = null;
  if (rec.action !== undefined) {
    if (!rec.action || typeof rec.action !== "object" || Array.isArray(rec.action)) return null;
    const item = rec.action as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name) return null;
    if (item.words !== undefined && typeof item.words !== "string") return null;
    if (
      item.inputs !== undefined &&
      (!item.inputs || typeof item.inputs !== "object" || Array.isArray(item.inputs))
    ) {
      return null;
    }
    action = {
      name: item.name,
      words: typeof item.words === "string" ? item.words : "",
      inputs:
        item.inputs && typeof item.inputs === "object" && !Array.isArray(item.inputs)
          ? (item.inputs as Record<string, unknown>)
          : {},
    };
  }
  return { text: rec.text, gaps, changed, action };
}

export async function appendJson(file: string, value: unknown): Promise<void> {
  await ensureDir(join(file, ".."));
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonLines(file: string): Promise<unknown[]> {
  const raw = await readText(file);
  const lines: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      // Keep going. A bad line does not hide a later pending stop.
    }
  }
  return lines;
}

export async function timeoutMinutes(root: string): Promise<number | "invalid"> {
  const path = join(root, ".sdd", "role.yaml");
  if (!(await pathExists(path))) return 10;
  let data: unknown;
  try {
    data = await readYaml(path);
  } catch {
    return "invalid";
  }
  if (data == null) return 10;
  if (typeof data !== "object" || Array.isArray(data)) return "invalid";
  const rec = data as Record<string, unknown>;
  if (!("approval_timeout_minutes" in rec) || rec.approval_timeout_minutes == null) return 10;
  const minutes = rec.approval_timeout_minutes;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "invalid";
  return minutes;
}

function citeOk(cite: string, section: AcceptedSection): boolean {
  return section.checks.includes(cite) || cite === `${section.id}:${section.decision}`;
}

function authorPrompt(
  role: RoleProfile,
  task: string,
  kind: string,
  section?: AcceptedSection,
): string {
  const rows = [
    `Job: ${role.job}`,
    `Description: ${role.description}`,
    `Task: ${task}`,
    `Kind: ${kind}`,
  ];
  if (section) {
    rows.push(
      `Section: ${section.id}`,
      `Decision: ${section.decision}`,
      "Check ids:",
      ...section.checks,
    );
    rows.push("Section text:", section.body);
  }
  return rows.join("\n");
}

function critiquePrompt(role: RoleProfile, section: AcceptedSection, draft: string): string {
  return [
    `Job: ${role.job}`,
    "Check ids:",
    ...section.checks,
    `Cite: ${section.id}:${section.decision}`,
    "Draft:",
    draft,
  ].join("\n");
}

function revisionPrompt(
  role: RoleProfile,
  draft: string,
  gaps: { cite: string; text: string }[],
): string {
  return [
    `Job: ${role.job}`,
    "Draft:",
    draft,
    "Gaps:",
    ...gaps.map((gap) => `${gap.cite}: ${gap.text}`),
    "changed must list every gap cite.",
  ].join("\n");
}

export async function acceptedFile(root: string, changeId: string): Promise<string> {
  if (!(await pathExists(configPath(root)))) return join(root, "changes", changeId, "accepted.md");
  const config = await loadConfig(root);
  return join(changesDir(root, config), changeId, "accepted.md");
}

async function callModel(
  model: RoleModel,
  file: string,
  roleId: string,
  prompt: string,
  pass: number,
): Promise<ModelReply | null> {
  let raw: string;
  try {
    raw = await model.complete({ roleId, prompt });
  } catch {
    await appendJson(file, { type: "bad_call", roleId });
    return null;
  }
  const parsed = parseReply(raw);
  if (!parsed) {
    await appendJson(file, { type: "bad_call", roleId });
    return null;
  }
  await appendJson(file, { type: "model", pass, roleId, text: parsed.text });
  return parsed;
}

interface StoredRule {
  name: string;
  inputs: Record<string, unknown>;
}

async function readRule(root: string, roleName: string): Promise<StoredRule | null> {
  const data = await readAllowFile(root);
  if (!data) return null;
  const entry = data[roleName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const rec = entry as Record<string, unknown>;
  const name =
    typeof rec.tool === "string" ? rec.tool : typeof rec.name === "string" ? rec.name : "";
  if (!name) return null;
  if (!rec.inputs || typeof rec.inputs !== "object" || Array.isArray(rec.inputs)) return null;
  const stored = typeof rec.sha === "string" ? rec.sha : "";
  const head = await getHeadSha(root);
  if (head && stored !== head) return null;
  return { name, inputs: rec.inputs as Record<string, unknown> };
}

async function saveRule(root: string, roleName: string, rule: StoredRule): Promise<void> {
  const path = allowFilePath(root);
  const existing = (await readAllowFile(root)) ?? {};
  const head = await getHeadSha(root);
  existing[roleName] = head
    ? { tool: rule.name, inputs: rule.inputs, sha: head }
    : { tool: rule.name, inputs: rule.inputs };
  await writeText(path, `${JSON.stringify(existing, null, 2)}\n`);
}

async function applyAction(
  root: string,
  file: string,
  roleName: string,
  action: ModelAction,
  mode: "once" | "always",
): Promise<{ exitCode: number; stdout: string; applied: boolean }> {
  if (
    FORBIDDEN.has(action.name) ||
    (!UNAVAILABLE.has(action.name) && action.name !== "write_file")
  ) {
    await appendJson(file, { type: "rejected" });
    return { exitCode: 1, stdout: ROLE_TEXT.cannot, applied: false };
  }
  if (UNAVAILABLE.has(action.name)) {
    await appendJson(file, { type: "unavailable" });
    return { exitCode: 0, stdout: ROLE_TEXT.unavailable, applied: false };
  }
  const path = action.inputs.path;
  const contents = action.inputs.contents;
  if (typeof path !== "string" || typeof contents !== "string" || !isSafeProductPath(path)) {
    await appendJson(file, { type: "rejected" });
    return { exitCode: 1, stdout: ROLE_TEXT.cannot, applied: false };
  }
  await writeText(join(root, ...path.split(/[/\\]/)), contents);
  if (mode === "always")
    await saveRule(root, roleName, { name: action.name, inputs: action.inputs });
  await appendJson(file, { type: "applied", name: "write_file" });
  return { exitCode: 0, stdout: "", applied: true };
}

async function finishRun(
  root: string,
  file: string,
  role: RoleProfile,
  final: ModelReply,
  minutes: number,
  now: Date,
  runId: string,
): Promise<RoleCommandResult> {
  const action = final.action;
  if (!action) return ok(final.text, runId);
  if (
    FORBIDDEN.has(action.name) ||
    (!UNAVAILABLE.has(action.name) && action.name !== "write_file")
  ) {
    await appendJson(file, { type: "rejected" });
    return fail(linesOf(final.text, ROLE_TEXT.cannot), runId);
  }
  const rule = await readRule(root, role.name);
  if (
    !role.askFirst &&
    rule &&
    rule.name === action.name &&
    sameInputs(rule.inputs, action.inputs)
  ) {
    const applied = await applyAction(root, file, role.name, action, "always");
    const stdout = applied.applied ? final.text : linesOf(final.text, applied.stdout);
    return applied.exitCode === 0 ? ok(stdout, runId) : fail(stdout, runId);
  }
  const expiresAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  await appendJson(file, {
    type: "pending",
    action: { name: action.name, words: action.words, inputs: action.inputs },
    expiresAt,
  });
  if (role.askFirst) return ok(linesOf(action.words, ROLE_TEXT.askFirst), runId);
  return ok(linesOf(action.words, ROLE_TEXT.choice), runId);
}

/** Apply slice 1 stop rules to one reply. Does not change the critique prompts. */
export async function settleRoleReply(
  root: string,
  file: string,
  role: RoleProfile,
  reply: { text: string; action: ModelReply["action"] },
  now: Date,
  runId: string,
): Promise<RoleCommandResult> {
  const minutes = await timeoutMinutes(root);
  if (minutes === "invalid") return fail(ROLE_TEXT.badYaml, runId);
  return finishRun(
    root,
    file,
    role,
    { text: reply.text, gaps: [], changed: null, action: reply.action },
    minutes,
    now,
    runId,
  );
}

async function latestRunFile(root: string, name: string): Promise<string | null> {
  const dir = conversationDir(root, name);
  const files = (await listFiles(dir)).filter((file) => file.endsWith(".jsonl")).sort();
  const last = files[files.length - 1];
  return last ? join(dir, last) : null;
}

export async function runRole(root: string, input: RunRoleInput): Promise<RoleCommandResult> {
  const name = canonicalRoleName(input.name);
  if (!name) return fail(ROLE_TEXT.badName);
  if (input.stop) {
    if (!(await readRole(root, name))) return fail(ROLE_TEXT.notFound);
    const latest = await latestRunFile(root, name);
    if (!latest) return fail(ROLE_TEXT.runNotFound);
    await appendJson(latest, { type: "stopped" });
    return ok();
  }
  const role = await readRole(root, name);
  if (!role) return fail(ROLE_TEXT.notFound);
  if (!role.job.trim()) return fail(ROLE_TEXT.needsJob);
  const task = input.task ?? "";
  let withName = "";
  if (input.withRole !== undefined && input.withRole.trim() !== "") {
    const canonical = canonicalRoleName(input.withRole);
    if (!canonical) return fail(ROLE_TEXT.badName);
    if (canonical === name) return fail(ROLE_TEXT.self);
    withName = canonical;
  }
  if (mentionsX(task)) return fail(ROLE_TEXT.x);
  const kind = input.kind?.trim() || "reading";
  let section: AcceptedSection | undefined;
  if (kind !== "reading") {
    if (!DRAFT_KINDS.has(kind)) return fail(ROLE_TEXT.needsSection);
    const changeId = input.change?.trim() ?? "";
    const sectionId = input.section?.trim() ?? "";
    if (!safeChangeId(changeId) || !sectionId) return fail(ROLE_TEXT.needsSection);
    const acceptedPath = await acceptedFile(root, changeId);
    if (!(await pathExists(acceptedPath))) return fail(ROLE_TEXT.needsSection);
    const parsed = parseSection(await readText(acceptedPath), sectionId);
    if (!parsed) return fail(ROLE_TEXT.needsSection);
    section = parsed;
  }
  let critic: RoleProfile | null = null;
  if (withName && section) {
    critic = await readRole(root, withName);
    if (!critic) return fail(ROLE_TEXT.notFound);
  }
  const minutes = await timeoutMinutes(root);
  if (minutes === "invalid") return fail(ROLE_TEXT.badYaml);
  if (!input.model) return fail(ROLE_TEXT.noModel);

  const now = (input.now ?? (() => new Date()))();
  const runId = runIdFrom(now);
  const file = join(conversationDir(root, name), `${runId}.jsonl`);
  if (section) {
    await appendJson(file, {
      type: "checks",
      ids: section.checks,
      section: section.id,
      decision: section.decision,
    });
  }

  const draft = await callModel(
    input.model,
    file,
    role.name,
    authorPrompt(role, task, kind, section),
    1,
  );
  if (!draft) return fail("", runId);

  let final = draft;
  if (critic && section) {
    const accepted = section;
    const critique = await callModel(
      input.model,
      file,
      critic.name,
      critiquePrompt(critic, accepted, draft.text),
      2,
    );
    if (!critique) return fail(draft.text, runId);
    if (critique.gaps.some((gap) => !citeOk(gap.cite, accepted))) {
      await appendJson(file, { type: "bad_call", roleId: critic.name });
      return fail(draft.text, runId);
    }
    if (critique.gaps.length > 0) {
      const revision = await callModel(
        input.model,
        file,
        role.name,
        revisionPrompt(role, draft.text, critique.gaps),
        3,
      );
      if (!revision) return fail(draft.text, runId);
      const cites = critique.gaps.map((gap) => gap.cite);
      if (revision.changed === null || !sameCiteSet(revision.changed, cites)) {
        await appendJson(file, { type: "bad_call", roleId: role.name });
        return fail(draft.text, runId);
      }
      final = revision;
    }
  }
  return finishRun(root, file, role, final, minutes, now, runId);
}

function openPending(lines: unknown[]): PendingStop | null {
  let pending: PendingStop | null = null;
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const rec = line as Record<string, unknown>;
    if (rec.type === "pending") {
      const action = rec.action;
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        pending = null;
        continue;
      }
      const item = action as Record<string, unknown>;
      if (typeof item.name !== "string") {
        pending = null;
        continue;
      }
      pending = {
        name: item.name,
        words: typeof item.words === "string" ? item.words : "",
        inputs:
          item.inputs && typeof item.inputs === "object" && !Array.isArray(item.inputs)
            ? (item.inputs as Record<string, unknown>)
            : {},
        expiresAt: typeof rec.expiresAt === "string" ? rec.expiresAt : "",
      };
      continue;
    }
    if (typeof rec.type === "string" && CLOSED.has(rec.type)) pending = null;
  }
  return pending;
}

async function findRun(
  root: string,
  runId: string,
): Promise<{ file: string; roleName: string } | null> {
  if (!safeRunId(runId)) return null;
  const hits: { file: string; roleName: string }[] = [];
  for (const roleName of await listConversationRoles(root)) {
    const file = join(conversationDir(root, roleName), `${runId}.jsonl`);
    if (await pathExists(file)) hits.push({ file, roleName });
  }
  if (hits.length === 1) return hits[0]!;
  const pendingHits: { file: string; roleName: string }[] = [];
  for (const hit of hits) {
    if (openPending(await readJsonLines(hit.file))) pendingHits.push(hit);
  }
  return pendingHits.length === 1 ? pendingHits[0]! : null;
}

export async function allowRole(root: string, input: AllowRoleInput): Promise<RoleCommandResult> {
  const found = await findRun(root, input.runId);
  if (!found) return fail(ROLE_TEXT.runNotFound);
  const pending = openPending(await readJsonLines(found.file));
  if (!pending) return fail(ROLE_TEXT.runNotFound);
  const now = (input.now ?? (() => new Date()))();
  const expires = Date.parse(pending.expiresAt);
  if (!Number.isFinite(expires) || now.getTime() >= expires) {
    await appendJson(found.file, { type: "expired" });
    return fail(ROLE_TEXT.expired);
  }
  if (input.mode === "deny") {
    await appendJson(found.file, { type: "denied" });
    return ok("", input.runId);
  }
  const role = await readRole(root, found.roleName);
  if (!role) return fail(ROLE_TEXT.notFound);
  if (role.askFirst) return ok(ROLE_TEXT.askFirst, input.runId);
  const applied = await applyAction(root, found.file, found.roleName, pending, input.mode);
  return applied.exitCode === 0
    ? ok(applied.stdout, input.runId)
    : fail(applied.stdout, input.runId);
}
