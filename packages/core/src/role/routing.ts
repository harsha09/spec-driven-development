import { join } from "pathe";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { buildContext, getActiveChangeId } from "../change-context.js";
import { loadConfig } from "../config.js";
import { listDirs, listFiles, pathExists, readText } from "../fs.js";
import { type DecideInput, decide } from "./models/decide.js";
import { loadModels } from "./models/schema.js";
import { canonicalRoleName, parseRoleDocument } from "./profile.js";
import { appendJson } from "./run.js";
import { readTeamConfig } from "./team.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleProfile } from "./types.js";

const matcher = z.string().trim().min(1);

const RoutingRuleSchema = z
  .object({
    id: matcher,
    role: matcher,
    stage: matcher.optional(),
    artifact: matcher.optional(),
    owns: matcher.optional(),
    skill: matcher.optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (!rule.stage && !rule.artifact && !rule.owns && !rule.skill) {
      ctx.addIssue({
        code: "custom",
        message: "needs stage, artifact, owns, or skill",
      });
    }
  });

const RoutingSchema = z
  .object({
    rules: z.array(RoutingRuleSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const [index, rule] of file.rules.entries()) {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["rules", index, "id"],
          message: "is repeated",
        });
      }
      seen.add(rule.id);
    }
  });

type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export interface RouteItem {
  id?: string;
  stage?: string;
  artifact?: string;
  skill?: string;
  bot?: string;
}

export interface RouteDeps {
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  runCommand?: (command: string, stdin: string) => Promise<string>;
  now?: () => Date;
}

export type RouteHit =
  | { kind: "role"; role: string; reason: string; rule: string }
  | { kind: "ask"; reason: string };

type InboxEntry =
  | {
      type: "item";
      id: string;
      status: "active" | "done";
      stage?: string;
      artifact?: string;
    }
  | { type: "handoff"; from: string; to: string }
  | { type: "other"; label: string };

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function formatRoutingError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || "routing";
  const message = issue?.message ?? "invalid";
  return `routing.yaml is invalid: ${path} ${message}`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanItem(input: RouteItem): RouteItem {
  const item: RouteItem = {};
  const id = input.id?.trim();
  const stage = input.stage?.trim();
  const artifact = input.artifact?.trim();
  const skill = input.skill?.trim();
  const bot = input.bot?.trim();
  if (id) item.id = id;
  if (stage) item.stage = stage;
  if (artifact) item.artifact = artifact;
  if (skill) item.skill = skill;
  if (bot) item.bot = bot;
  return item;
}

function inboxFile(root: string, name: string): string | null {
  const canonical = canonicalRoleName(name);
  if (!canonical) return null;
  return join(root, ".sdd", "agents", canonical, "inbox.jsonl");
}

export async function writeHandoffInboxes(
  root: string,
  record: Record<string, string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const name of [record.from, record.to]) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const file = inboxFile(root, name);
    if (!file) continue;
    await appendJson(file, record);
  }
}

async function readRouting(root: string): Promise<{ rules: RoutingRule[] } | { error: string }> {
  const path = join(root, ".sdd", "routing.yaml");
  if (!(await pathExists(path))) return { rules: [] };
  let raw: unknown;
  try {
    raw = parseYaml(await readText(path));
  } catch {
    return { error: "routing.yaml is invalid: routing could not be parsed" };
  }
  const parsed = RoutingSchema.safeParse(raw);
  if (!parsed.success) return { error: formatRoutingError(parsed.error) };
  return parsed.data;
}

async function loadRoles(root: string): Promise<RoleProfile[] | { error: string }> {
  const dir = join(root, ".sdd", "roles");
  const files = (await listFiles(dir)).filter((file) => file.endsWith(".md")).sort();
  const roles: RoleProfile[] = [];
  for (const file of files) {
    const name = file.slice(0, -".md".length);
    let parsed: RoleProfile | null;
    try {
      parsed = parseRoleDocument(name, await readText(join(dir, file)));
    } catch {
      return { error: `Role file is invalid: ${name}.` };
    }
    if (!parsed) return { error: `Role file is invalid: ${name}.` };
    roles.push(parsed);
  }
  return roles;
}

function ruleMatches(rule: RoutingRule, item: RouteItem): boolean {
  if (rule.stage && rule.stage !== item.stage) return false;
  if (rule.artifact && rule.artifact !== item.artifact) return false;
  if (rule.owns && rule.owns !== item.artifact) return false;
  if (rule.skill && rule.skill !== item.skill) return false;
  return true;
}

function listedOwners(
  roles: RoleProfile[],
  item: RouteItem,
): { rule: "owns" | "skill"; names: string[] } | null {
  if (item.artifact) {
    const names = roles
      .filter((role) => role.owns.includes(item.artifact ?? ""))
      .map((role) => role.name);
    if (names.length > 0) return { rule: "owns", names };
  }
  if (item.skill) {
    const names = roles
      .filter((role) => role.skills.includes(item.skill ?? ""))
      .map((role) => role.name);
    if (names.length > 0) return { rule: "skill", names };
  }
  return null;
}

async function stageOwner(
  root: string,
  stageId: string,
): Promise<string | undefined | { error: string }> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(root);
  } catch {
    return undefined;
  }
  const changeId = await getActiveChangeId(root, config);
  if (!changeId) return undefined;
  try {
    const context = await buildContext(root, config, changeId);
    return context.workflow.stages.find((stage) => stage.id === stageId)?.owner;
  } catch {
    return { error: "Change is unreadable." };
  }
}

export async function matchRoute(
  root: string,
  input: RouteItem,
): Promise<{ ok: true; match: RouteHit } | { ok: false; message: string }> {
  const item = cleanItem(input);
  const routing = await readRouting(root);
  if ("error" in routing) return { ok: false, message: routing.error };
  const rule = routing.rules.find((candidate) => ruleMatches(candidate, item));
  if (rule) {
    return {
      ok: true,
      match: { kind: "role", role: rule.role, reason: `Rule ${rule.id} matches.`, rule: rule.id },
    };
  }

  const roles = await loadRoles(root);
  if ("error" in roles) return { ok: false, message: roles.error };
  const listed = listedOwners(roles, item);
  if (listed && listed.names.length > 1) {
    return { ok: true, match: { kind: "ask", reason: "Two roles own this." } };
  }

  if (listed && listed.names.length === 1) {
    const role = listed.names[0] ?? "";
    if (listed.rule === "owns") {
      return {
        ok: true,
        match: {
          kind: "role",
          role,
          reason: `One role owns ${item.artifact}.`,
          rule: "owns",
        },
      };
    }
    return {
      ok: true,
      match: {
        kind: "role",
        role,
        reason: `One role has skill ${item.skill}.`,
        rule: "skill",
      },
    };
  }

  if (item.stage) {
    const named = roles.filter((role) => role.stages.includes(item.stage ?? ""));
    if (named.length > 1) {
      return { ok: true, match: { kind: "ask", reason: "Two roles list this stage." } };
    }
    if (named.length === 1) {
      const role = named[0]?.name ?? "";
      return {
        ok: true,
        match: {
          kind: "role",
          role,
          reason: `Role ${role} lists stage ${item.stage}.`,
          rule: "role-stage",
        },
      };
    }
  }

  if (item.stage) {
    const owner = await stageOwner(root, item.stage);
    if (owner && typeof owner === "object") return { ok: false, message: owner.error };
    if (typeof owner === "string" && roles.some((role) => role.name === owner)) {
      return {
        ok: true,
        match: {
          kind: "role",
          role: owner,
          reason: `Stage ${item.stage} is owned by ${owner}.`,
          rule: "stage-owner",
        },
      };
    }
  }

  return { ok: true, match: { kind: "ask", reason: "No rule matched." } };
}

async function activeStageItem(root: string): Promise<RouteItem | { error: string }> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(root);
  } catch {
    return { error: "No active change." };
  }
  const changeId = await getActiveChangeId(root, config);
  if (!changeId) return { error: "No active change." };
  try {
    const context = await buildContext(root, config, changeId);
    const stage =
      context.workflow.stages.find((item) => item.id === context.meta.stage) ?? context.active[0];
    if (!stage) return { error: "No active change." };
    const artifact = stage.artifacts.find((item) => !item.path.endsWith("/"))?.path;
    const item: RouteItem = { stage: stage.id };
    if (artifact) item.artifact = artifact;
    return item;
  } catch {
    return { error: "Change is unreadable." };
  }
}

async function prepareItem(root: string, input: RouteItem): Promise<RouteItem | { error: string }> {
  const item = cleanItem(input);
  if (item.stage || item.artifact || item.skill) return item;
  const active = await activeStageItem(root);
  if ("error" in active) return active;
  const merged: RouteItem = { ...active };
  if (item.id) merged.id = item.id;
  if (item.bot) merged.bot = item.bot;
  return merged;
}

function formatHit(match: RouteHit): string {
  if (match.kind === "ask") return `Ask the human.\n${match.reason}`;
  return `role ${match.role}\nreason ${match.reason}\nrule ${match.rule}`;
}

function routeState(item: RouteItem): string {
  return JSON.stringify({
    stage: item.stage ?? null,
    artifact: item.artifact ?? null,
    skill: item.skill ?? null,
    id: item.id ?? null,
  });
}

async function routeMetrics(root: string): Promise<DecideInput<string>["metrics"]> {
  try {
    const config = await loadConfig(root);
    const changeId = await getActiveChangeId(root, config);
    if (!changeId) return undefined;
    return { projectRoot: root, config, changeId };
  } catch {
    return undefined;
  }
}

export async function routeRole(
  root: string,
  input: RouteItem,
  deps?: RouteDeps,
): Promise<RoleCommandResult> {
  const item = await prepareItem(root, input);
  if ("error" in item) return fail(item.error);
  const matched = await matchRoute(root, item);
  if (!matched.ok) return fail(matched.message);
  if (matched.match.kind !== "ask" || matched.match.reason !== "No rule matched.") {
    return ok(formatHit(matched.match));
  }
  const loaded = await loadModels(root);
  if (loaded === null) return ok(formatHit(matched.match));
  if ("error" in loaded) return fail(loaded.error);
  const roles = await loadRoles(root);
  if ("error" in roles) return fail(roles.error);
  const names = roles.map((role) => role.name).sort((left, right) => left.localeCompare(right));
  const options = names.includes("human") ? names : [...names, "human"];
  const decision = await decide({
    models: loaded.config,
    ctx: { workType: "route", stage: item.stage, bot: item.bot },
    state: routeState(item),
    question: "No rule matched.",
    options,
    env: deps?.env ?? {},
    fetch: deps?.fetch,
    runCommand: deps?.runCommand,
    now: deps?.now,
    metrics: await routeMetrics(root),
  });
  if (decision.pick !== "human" && names.includes(decision.pick)) {
    const id = decision.choice?.id ?? "model";
    return ok(`role ${decision.pick}\nreason Model ${id} picked ${decision.pick}.`);
  }
  return ok("Ask the human.\nNo rule matched.");
}

async function readInbox(root: string, name: string): Promise<InboxEntry[] | { error: string }> {
  const file = inboxFile(root, name);
  if (!file) return { error: ROLE_TEXT.badName };
  if (!(await pathExists(file))) return [];
  let raw: string;
  try {
    raw = await readText(file);
  } catch {
    return { error: "inbox.jsonl is invalid" };
  }
  const entries: InboxEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return { error: "inbox.jsonl is invalid" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { error: "inbox.jsonl is invalid" };
    }
    const record = value as Record<string, unknown>;
    if (record.type === "item") {
      const id = text(record.id);
      if (!id || (record.status !== "active" && record.status !== "done")) {
        return { error: "inbox.jsonl is invalid" };
      }
      entries.push({
        type: "item",
        id,
        status: record.status,
        stage: text(record.stage),
        artifact: text(record.artifact),
      });
      continue;
    }
    if (record.type === "handoff") {
      const from = text(record.from);
      const to = text(record.to);
      if (!from || !to) return { error: "inbox.jsonl is invalid" };
      entries.push({ type: "handoff", from, to });
      continue;
    }
    if (typeof record.type === "string" && record.type.trim()) {
      entries.push({ type: "other", label: record.type.trim() });
      continue;
    }
    return { error: "inbox.jsonl is invalid" };
  }
  return entries;
}

function formatInbox(name: string, entries: InboxEntry[]): string {
  if (entries.length === 0) return `${name}\n- (empty)`;
  const lines = entries.map((entry) => {
    if (entry.type === "item") {
      const stage = entry.stage ? ` ${entry.stage}` : "";
      const artifact = entry.artifact ? ` ${entry.artifact}` : "";
      return `- ${entry.id} ${entry.status}${stage}${artifact}`;
    }
    if (entry.type === "handoff") return `- handoff from ${entry.from} to ${entry.to}`;
    return `- ${entry.label}`;
  });
  return `${name}\n${lines.join("\n")}`;
}

async function queueNames(root: string, bot?: string): Promise<string[] | { error: string }> {
  if (bot) {
    if (!canonicalRoleName(bot)) return { error: ROLE_TEXT.badName };
    return [bot];
  }
  const team = await readTeamConfig(root);
  if ("team" in team) return team.team.bots.map((item) => item.name);
  const dirs = (await listDirs(join(root, ".sdd", "agents"))).sort();
  if (dirs.length === 0) return { error: team.error };
  return dirs;
}

export async function queueRole(root: string, bot?: string): Promise<RoleCommandResult> {
  const names = await queueNames(root, bot?.trim());
  if ("error" in names) return fail(names.error);
  const blocks: string[] = [];
  for (const name of names) {
    const entries = await readInbox(root, name);
    if ("error" in entries) return fail(entries.error);
    blocks.push(formatInbox(name, entries));
  }
  return ok(blocks.join("\n\n"));
}

function itemId(item: RouteItem): string | null {
  if (item.id) return item.id;
  if (item.artifact) {
    const base = item.artifact.split("/").pop() ?? "";
    const stem = base.replace(/\.[A-Za-z0-9]+$/, "");
    if (stem) return stem;
  }
  return item.stage ?? null;
}

export async function takeRole(root: string, input: RouteItem): Promise<RoleCommandResult> {
  const item = await prepareItem(root, input);
  if ("error" in item) return fail(item.error);
  const matched = await matchRoute(root, item);
  if (!matched.ok) return fail(matched.message);
  const match = matched.match;
  if (match.kind === "ask") return fail(formatHit(match));

  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  const bots = team.team.bots.filter((bot) => bot.role === match.role);
  if (bots.length === 0) return fail(`No bot has role ${match.role}.`);

  const requested = input.bot?.trim();
  if (requested && !canonicalRoleName(requested)) return fail(ROLE_TEXT.badName);
  if (requested && !bots.some((bot) => bot.name === requested)) {
    const known = team.team.bots.some((bot) => bot.name === requested);
    if (!known) return fail("Bot not found.");
    return fail(`${requested} is not a ${match.role}.`);
  }

  const counts = new Map<string, number>();
  for (const bot of team.team.bots) {
    const entries = await readInbox(root, bot.name);
    if ("error" in entries) return fail(entries.error);
    counts.set(
      bot.name,
      entries.filter((entry) => entry.type === "item" && entry.status === "active").length,
    );
  }
  const roleCount = bots.reduce((sum, bot) => sum + (counts.get(bot.name) ?? 0), 0);
  const roleCap = team.team.role_wip?.[match.role];
  if (roleCap !== undefined && roleCount >= roleCap) {
    return fail(`${match.role} is at the limit.`);
  }

  const chosen = requested
    ? bots.find((bot) => bot.name === requested)
    : bots.find((bot) => (counts.get(bot.name) ?? 0) < bot.wip);
  if (!chosen || (counts.get(chosen.name) ?? 0) >= chosen.wip) {
    return fail(`${requested || bots[0]?.name || match.role} is at the limit.`);
  }

  const id = itemId(item);
  if (!id) return fail("An item needs an id.");
  for (const bot of team.team.bots) {
    const entries = await readInbox(root, bot.name);
    if ("error" in entries) return fail(entries.error);
    if (
      entries.some((entry) => entry.type === "item" && entry.status === "active" && entry.id === id)
    ) {
      return fail(`${id} is already active.`);
    }
  }

  const record: Record<string, string> = {
    type: "item",
    id,
    status: "active",
    role: match.role,
    rule: match.rule,
    reason: match.reason,
  };
  if (item.stage) record.stage = item.stage;
  if (item.artifact) record.artifact = item.artifact;
  if (item.skill) record.skill = item.skill;
  const file = inboxFile(root, chosen.name);
  if (!file) return fail(ROLE_TEXT.badName);
  await appendJson(file, record);
  return ok(`${chosen.name} took ${id}\nrole ${match.role}\nrule ${match.rule}`);
}
