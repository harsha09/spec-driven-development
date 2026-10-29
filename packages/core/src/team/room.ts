import { appendFile } from "node:fs/promises";
import { join } from "pathe";
import { z } from "zod";
import { buildContext, getActiveChangeId } from "../change-context.js";
import { loadConfig } from "../config.js";
import { ensureDir, pathExists, readText } from "../fs.js";
import { getHeadSha } from "../git-head.js";
import { decide } from "../role/models/decide.js";
import { loadModels } from "../role/models/schema.js";
import { readRole, rolesListingStage } from "../role/profile.js";
import { critiquePrompt, revisionPrompt } from "../role/prompts.js";
import type { TeamConfig } from "../role/schema.js";
import { recordDecisionRequest } from "../role/signoff.js";
import { gitUserName, readTeamConfig } from "../role/team.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleModel } from "../role/types.js";
import type { ChangeMeta, Stage, Workflow } from "../schemas.js";
import { nowIso } from "../slug.js";
import { getStage } from "../workflow.js";
import { claimsPass, evidenceSupports, reviewNeedsEvidence } from "./tools.js";

const ROOM_TYPES = ["post", "objection", "agree", "block", "decision"] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export interface RoomEntry {
  ts: string;
  from: string;
  type: RoomType;
  text: string;
  round: number;
  cite?: string;
  sha?: string;
  evidence?: string[];
}

const RoomEntrySchema = z
  .object({
    ts: z.string(),
    from: z.string(),
    type: z.enum(ROOM_TYPES),
    text: z.string(),
    round: z.number().int(),
    cite: z.string().optional(),
    sha: z.string().optional(),
    evidence: z.array(z.string()).optional(),
  })
  .strict();

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function oneLine(
  value: string | undefined,
  empty: string,
  broken: string,
): string | RoleCommandResult {
  const raw = value ?? "";
  if (raw.includes("\n") || raw.includes("\r")) return fail(broken);
  const words = raw.trim();
  if (!words) return fail(empty);
  return words;
}

export function roomPath(root: string, change: string, stage: string): string {
  return join(root, ".sdd", "rooms", change, `${stage}.jsonl`);
}

export function roomRounds(team: TeamConfig): number {
  return team.limits?.room_rounds ?? 2;
}

export function consensus(entries: RoomEntry[]): {
  agreed: string[];
  open: RoomEntry[];
  blocked: boolean;
} {
  const agreed: string[] = [];
  const open: RoomEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "agree" && !agreed.includes(entry.from)) agreed.push(entry.from);
    if (entry.type === "objection" || entry.type === "block") open.push(entry);
  }
  return { agreed, open, blocked: entries.some((entry) => entry.type === "block") };
}

async function readEntries(file: string): Promise<RoomEntry[]> {
  if (!(await pathExists(file))) return [];
  const entries: RoomEntry[] = [];
  for (const line of (await readText(file)).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = RoomEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // A bad line stays in the file and is not an entry.
    }
  }
  return entries;
}

async function headSha(root: string): Promise<string | null> {
  try {
    return await getHeadSha(root);
  } catch {
    return null;
  }
}

interface Opened {
  id: string;
  path: string;
  stage: string;
  workflow: Workflow;
  meta: ChangeMeta;
}

async function openChange(root: string, change?: string): Promise<Opened | RoleCommandResult> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(root);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Config is invalid.");
  }
  const id = (change?.trim() || (await getActiveChangeId(root, config)) || "").trim();
  if (!id) return fail("No active change.");
  if (!safeId(id)) return fail("A change id is not valid.");
  try {
    const ctx = await buildContext(root, config, id);
    return { id, path: ctx.path, stage: ctx.meta.stage, workflow: ctx.workflow, meta: ctx.meta };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Change not found.");
  }
}

function isFailure(value: object): value is RoleCommandResult {
  return "exitCode" in value;
}

export function stageMemberNames(
  stage: { owner?: string; collaborates?: string[] },
  listed: string[],
): string[] {
  const named = [stage.owner, ...(stage.collaborates ?? [])].filter(
    (name): name is string => !!name,
  );
  if (named.length > 0) return named;
  return listed;
}

function memberBots(
  team: TeamConfig,
  names: string[],
): TeamConfig["bots"][number][] | { error: string } {
  const bots: TeamConfig["bots"][number][] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const exact = team.bots.find((bot) => bot.name === name);
    const chosen = exact ?? team.bots.find((bot) => bot.role === name);
    if (!chosen) return { error: "Bot not found." };
    if (seen.has(chosen.name)) continue;
    seen.add(chosen.name);
    bots.push(chosen);
  }
  if (bots.length === 0) return { error: "A room needs a member." };
  return bots;
}

async function draftOf(changePath: string, stage: Stage | undefined): Promise<string> {
  const rel = stage?.artifacts[0]?.path;
  if (!rel || rel.includes("..")) return "";
  const file = join(changePath, rel);
  if (!(await pathExists(file))) return "";
  return readText(file);
}

function formatEntry(entry: RoomEntry): string {
  const cite = entry.cite ? ` ${entry.cite}` : "";
  return `${entry.round} ${entry.from} ${entry.type}${cite} ${entry.text}`;
}

async function appendEntry(file: string, entry: RoomEntry): Promise<void> {
  await ensureDir(join(file, ".."));
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
}

async function consensusLine(
  changePath: string,
  stage: string,
  sha: string | null,
  entries: RoomEntry[],
): Promise<void> {
  const found = consensus(entries);
  const agreed = found.agreed.join(",") || "none";
  const open = found.open.map((entry) => entry.cite || entry.text).join(",") || "none";
  await appendFile(
    join(changePath, "decisions.md"),
    `${nowIso()} room ${stage} ${sha ?? "none"} agreed ${agreed} open ${open}\n`,
  );
}

export async function showRoom(
  root: string,
  input: { change?: string; stage?: string },
): Promise<RoleCommandResult> {
  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  const opened = await openChange(root, input.change);
  if (isFailure(opened)) return opened;
  const stage = (input.stage?.trim() || opened.stage).trim();
  if (!safeId(stage)) return fail("A stage id is not valid.");
  const entries = await readEntries(roomPath(root, opened.id, stage));
  if (entries.length === 0) return ok("No room.");
  return ok(entries.map(formatEntry).join("\n"));
}

export async function postRoom(
  root: string,
  input: {
    change?: string;
    stage?: string;
    from?: string;
    type?: string;
    text?: string;
    cite?: string;
    evidence?: string[];
  },
): Promise<RoleCommandResult> {
  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  const opened = await openChange(root, input.change);
  if (isFailure(opened)) return opened;
  const stage = (input.stage?.trim() || opened.stage).trim();
  if (!safeId(stage)) return fail("A stage id is not valid.");
  const text = oneLine(input.text, "A room entry needs text.", "A room entry is one line.");
  if (typeof text !== "string") return text;
  const type = (input.type?.trim() || "post") as RoomType;
  if (!ROOM_TYPES.includes(type)) return fail("A room entry is not valid.");
  const cite = input.cite?.trim() ?? "";
  if (cite && (cite.includes("\n") || cite.includes("\r"))) return fail("A cite is one line.");
  if (type === "objection" && !cite) return fail("An objection needs a cite.");
  const stageDef = getStage(opened.workflow, opened.meta, stage);
  const needed = await reviewNeedsEvidence(
    root,
    opened.id,
    stageDef?.verify?.commands?.length ?? 0,
    type,
    text,
    cite,
  );
  if (needed) return fail(needed);
  const evidence: string[] = [];
  for (const item of input.evidence ?? []) {
    const line = oneLine(item, "Evidence needs text.", "Evidence is one line.");
    if (typeof line !== "string") return line;
    evidence.push(line);
  }
  const file = roomPath(root, opened.id, stage);
  const prior = await readEntries(file);
  const round = prior.reduce((max, entry) => Math.max(max, entry.round), 1);
  const sha = await headSha(root);
  const entry: RoomEntry = {
    ts: nowIso(),
    from: input.from?.trim() || gitUserName(root) || "person",
    type,
    text,
    round: prior.length === 0 ? 1 : round,
  };
  if (cite) entry.cite = cite;
  if (sha) entry.sha = sha;
  if (evidence.length > 0) entry.evidence = evidence;
  await appendEntry(file, entry);
  return ok("Posted.");
}

async function classifyReply(
  root: string,
  text: string,
  env: Readonly<Record<string, string | undefined>>,
  runCommand?: (command: string, stdin: string) => Promise<string>,
): Promise<RoomType | RoleCommandResult> {
  const loaded = await loadModels(root);
  if (loaded === null) return "post";
  if ("error" in loaded) return fail(loaded.error);
  const decision = await decide({
    models: loaded.config,
    ctx: { workType: "classify" },
    state: text,
    question: "What kind of room entry is this?",
    options: ROOM_TYPES,
    env,
    runCommand,
  });
  if (decision.pick === "human") return "post";
  return decision.pick;
}

export async function reviewRoom(
  root: string,
  input: {
    change?: string;
    stage?: string;
    roles?: string[];
    model?: RoleModel;
    env?: Readonly<Record<string, string | undefined>>;
    runCommand?: (command: string, stdin: string) => Promise<string>;
  },
): Promise<RoleCommandResult> {
  if (!input.model) return fail(ROLE_TEXT.noModel);
  const loaded = await readTeamConfig(root);
  if ("error" in loaded) return fail(loaded.error);
  const opened = await openChange(root, input.change);
  if (isFailure(opened)) return opened;
  const stageId = (input.stage?.trim() || opened.stage).trim();
  if (!safeId(stageId)) return fail("A stage id is not valid.");
  const stage = getStage(opened.workflow, opened.meta, stageId);
  if (!stage) return fail("Stage not found.");
  const baked = stageMemberNames(stage, []);
  let listed: string[] = [];
  if ((!input.roles || input.roles.length === 0) && baked.length === 0) {
    const found = await rolesListingStage(root, stageId);
    if ("error" in found) return fail(found.error);
    listed = found;
  }
  const names =
    input.roles && input.roles.length > 0 ? input.roles : stageMemberNames(stage, listed);
  const bots = memberBots(loaded.team, names);
  if ("error" in bots) return fail(bots.error);
  const file = roomPath(root, opened.id, stageId);
  const prior = await readEntries(file);
  const highest = prior.reduce((max, entry) => Math.max(max, entry.round), 0);
  const round = highest + 1;
  const cap = roomRounds(loaded.team);
  if (round > cap) return ok("Round limit reached.");
  const draft = await draftOf(opened.path, stage);
  const before = consensus(prior.filter((entry) => entry.round === highest));
  const sha = await headSha(root);
  const written: RoomEntry[] = [];
  for (const bot of bots) {
    const role = await readRole(root, bot.role);
    if (!role) return fail(ROLE_TEXT.notFound);
    const section = {
      id: stageId,
      decision: "room",
      checks: before.open.map((entry) => entry.cite || "room"),
      body: draft,
    };
    if (section.checks.length === 0) section.checks = ["room"];
    const rows = [critiquePrompt(role, section, draft || "(none)"), "Room:"];
    for (const entry of prior) rows.push(formatEntry(entry));
    const listedOwner = stage.owner ?? (listed.length === 1 ? listed[0] : undefined);
    const owner = listedOwner === bot.role || listedOwner === bot.name;
    if (owner && before.open.length > 0) {
      rows.push(
        revisionPrompt(
          role,
          draft || "(none)",
          before.open.map((entry) => ({ cite: entry.cite || "room", text: entry.text })),
        ),
      );
    }
    rows.push('Reply with JSON {"type":"post","text":"...","cite":"..."}');
    rows.push("An objection needs a cite.");
    let raw = "";
    try {
      raw = await input.model.complete({ roleId: role.name, prompt: rows.join("\n") });
    } catch {
      return fail("A room entry is not valid.");
    }
    const stored = await entryFromReply(root, raw, input.env, input.runCommand);
    if (isFailure(stored)) return stored;
    const needed = await reviewNeedsEvidence(
      root,
      opened.id,
      stage.verify?.commands?.length ?? 0,
      stored.type,
      stored.text,
      stored.cite ?? "",
    );
    if (needed) return fail(needed);
    const entry: RoomEntry = {
      ts: nowIso(),
      from: bot.name,
      type: stored.type,
      text: stored.text,
      round,
    };
    if (stored.cite) entry.cite = stored.cite;
    if (sha) entry.sha = sha;
    await appendEntry(file, entry);
    written.push(entry);
  }
  const latest = written;
  await consensusLine(opened.path, stageId, sha, latest);
  if (round >= cap && consensus(latest).open.length > 0) {
    const asked = await recordDecisionRequest(root, {
      change: opened.id,
      note: `Room ${stageId} still open after ${round} rounds.`,
    });
    if (asked.exitCode !== 0) return asked;
    return ok("Decision needed.");
  }
  return ok(`Round ${round}.`);
}

async function entryFromReply(
  root: string,
  raw: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  runCommand?: (command: string, stdin: string) => Promise<string>,
): Promise<{ type: RoomType; text: string; cite?: string } | RoleCommandResult> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.type === "string" && typeof rec.text === "string") {
      return checked(rec.type, rec.text, typeof rec.cite === "string" ? rec.cite : "");
    }
  }
  const text = raw.trim();
  if (!text || text.includes("\n") || text.includes("\r"))
    return fail("A room entry is not valid.");
  const typed = await classifyReply(root, text, env, runCommand);
  if (typeof typed !== "string") return typed;
  return checked(typed, text, "");
}

function checked(
  type: string,
  text: string,
  cite: string,
): { type: RoomType; text: string; cite?: string } | RoleCommandResult {
  if (!ROOM_TYPES.includes(type as RoomType)) return fail("A room entry is not valid.");
  const words = oneLine(text, "A room entry needs text.", "A room entry is one line.");
  if (typeof words !== "string") return words;
  const citeWords = cite.trim();
  if (citeWords && (cite.includes("\n") || cite.includes("\r"))) return fail("A cite is one line.");
  if (type === "objection" && !citeWords) return fail("An objection needs a cite.");
  return citeWords
    ? { type: type as RoomType, text: words, cite: citeWords }
    : { type: type as RoomType, text: words };
}

async function activeRoom(root: string): Promise<{ file: string; text: string } | null> {
  try {
    const config = await loadConfig(root);
    const id = await getActiveChangeId(root, config);
    if (!id || !safeId(id)) return null;
    const ctx = await buildContext(root, config, id);
    const stage = ctx.meta.stage;
    if (!safeId(stage)) return null;
    const file = roomPath(root, id, stage);
    if (!(await pathExists(file))) return null;
    return { file, text: await readText(file) };
  } catch {
    return null;
  }
}

/** Room lines for a loop prompt. Missing room returns an empty string. */
export async function roomForPrompt(root: string): Promise<string> {
  const room = await activeRoom(root);
  return room?.text.trim() ?? "";
}

/** A done step posts into a room that already exists. It does not create one. */
export async function postLoopDone(
  root: string,
  bot: string,
  text: string,
  cite?: string,
): Promise<void> {
  const words = text.trim();
  if (!words || words.includes("\n") || words.includes("\r")) return;
  const room = await activeRoom(root);
  if (!room) return;
  let storedCite = "";
  if (claimsPass(words)) {
    try {
      const config = await loadConfig(root);
      const id = await getActiveChangeId(root, config);
      if (!id || !cite || !(await evidenceSupports(root, id, cite))) return;
      storedCite = cite;
    } catch {
      return;
    }
  }
  const prior = await readEntries(room.file);
  const round = prior.reduce((max, entry) => Math.max(max, entry.round), 1);
  const sha = await headSha(root);
  const entry: RoomEntry = {
    ts: nowIso(),
    from: bot,
    type: "post",
    text: words,
    round: prior.length === 0 ? 1 : round,
  };
  if (storedCite) entry.cite = storedCite;
  if (sha) entry.sha = sha;
  await appendEntry(room.file, entry);
}
