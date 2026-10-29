import { spawnSync } from "node:child_process";
import { join } from "pathe";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { defaultTeamsDir } from "../defaults.js";
import { listDirs, listFiles, pathExists, readText, writeText } from "../fs.js";
import { checkModels } from "./models/schema.js";
import { createRole, parseRoleDocument, roleFilePath } from "./profile.js";
import { type TeamConfig, TeamSchema, formatTeamError } from "./schema.js";
import type { RoleCommandResult } from "./types.js";

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

export function gitUserName(root: string): string | null {
  const result = spawnSync("git", ["-C", root, "config", "user.name"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const name = result.stdout.trim();
  return name || null;
}

export async function listTeamTemplates(): Promise<string[]> {
  return (await listDirs(defaultTeamsDir())).sort();
}

async function templateRoleFiles(
  template: string,
): Promise<{ name: string; raw: string }[] | null> {
  const dir = join(defaultTeamsDir(), template, "roles");
  if (!(await pathExists(dir))) return null;
  const files = (await listFiles(dir)).filter((file) => file.endsWith(".md")).sort();
  const roles = [];
  for (const file of files) {
    roles.push({ name: file.slice(0, -".md".length), raw: await readText(join(dir, file)) });
  }
  return roles;
}

export async function listRoleTemplates(): Promise<string[]> {
  const ids: string[] = [];
  for (const template of await listTeamTemplates()) {
    const roles = await templateRoleFiles(template);
    if (!roles) continue;
    for (const role of roles) ids.push(`${template}/${role.name}`);
  }
  return ids;
}

async function loadTemplateTeam(template: string): Promise<TeamConfig | string> {
  const path = join(defaultTeamsDir(), template, "team.yaml");
  if (!(await pathExists(path))) return `Team template "${template}" was not found.`;
  let raw: unknown;
  try {
    raw = parseYaml(await readText(path));
  } catch {
    return `Team template "${template}" is invalid.`;
  }
  const parsed = TeamSchema.safeParse(raw);
  if (!parsed.success) return `Team template "${template}" is invalid.`;
  return parsed.data;
}

function availableTeams(names: string[]): string {
  return names.join(", ") || "(none)";
}

export async function initTeam(
  root: string,
  template: string,
  gitUser: string | null,
): Promise<RoleCommandResult> {
  const templates = await listTeamTemplates();
  if (!template.trim()) {
    return fail(`Pass --template. Available: ${availableTeams(templates)}.`);
  }
  if (!templates.includes(template)) {
    return fail(
      `Team template "${template}" was not found. Available: ${availableTeams(templates)}.`,
    );
  }
  const loaded = await loadTemplateTeam(template);
  if (typeof loaded === "string") return fail(loaded);
  const roles = await templateRoleFiles(template);
  if (!roles || roles.length === 0) return fail(`Team template "${template}" is invalid.`);
  for (const role of roles) {
    const parsed = parseRoleDocument(role.name, role.raw);
    if (!parsed || !parsed.job) return fail(`Team template "${template}" is invalid.`);
  }
  const botRoles = new Set(loaded.bots.map((bot) => bot.role));
  for (const roleName of botRoles) {
    if (!roles.some((role) => role.name === roleName)) {
      return fail(`Team template "${template}" is invalid.`);
    }
  }

  const teamPath = join(root, ".sdd", "team.yaml");
  if (await pathExists(teamPath)) {
    return fail("Team config already exists at .sdd/team.yaml. Nothing was written.");
  }
  const routingSrc = join(defaultTeamsDir(), template, "routing.yaml");
  const routingDest = join(root, ".sdd", "routing.yaml");
  const copyRouting = await pathExists(routingSrc);
  if (copyRouting && (await pathExists(routingDest))) {
    return fail("Routing config already exists at .sdd/routing.yaml. Nothing was written.");
  }
  const existing: string[] = [];
  for (const role of roles) {
    if (await pathExists(roleFilePath(root, role.name))) existing.push(role.name);
  }
  if (existing.length > 0) {
    return fail(`Role already exists: ${existing.join(", ")}. Nothing was written.`);
  }

  const humans = loaded.humans.length > 0 ? loaded.humans : gitUser ? [{ name: gitUser }] : [];
  const team: TeamConfig = { ...loaded, template, humans };
  const checked = TeamSchema.safeParse(team);
  if (!checked.success) return fail(formatTeamError(checked.error));

  for (const role of roles) {
    await writeText(join(root, ".sdd", "roles", `${role.name}.md`), role.raw);
  }
  await writeText(teamPath, stringifyYaml(checked.data, { lineWidth: 100 }));
  if (copyRouting) await writeText(routingDest, await readText(routingSrc));
  return ok(`Wrote .sdd/team.yaml from ${template}.`);
}

export async function readTeamConfig(
  root: string,
): Promise<{ team: TeamConfig } | { error: string }> {
  const path = join(root, ".sdd", "team.yaml");
  if (!(await pathExists(path))) {
    return { error: "No team config. Run sdd team init --template software." };
  }
  let raw: unknown;
  try {
    raw = parseYaml(await readText(path));
  } catch {
    return { error: "team.yaml is invalid: team could not be parsed" };
  }
  const parsed = TeamSchema.safeParse(raw);
  if (!parsed.success) return { error: formatTeamError(parsed.error) };
  return { team: parsed.data };
}

export function formatTeam(team: TeamConfig, gitUser: string | null): string {
  const lines = [
    `template: ${team.template ?? ""}`,
    `branch: ${team.branch}`,
    `rooms.commit: ${team.rooms.commit}`,
    "bots:",
  ];
  for (const bot of team.bots) {
    lines.push(`- ${bot.name} role ${bot.role} wip ${bot.wip}`);
  }
  lines.push("humans:");
  if (team.humans.length === 0) lines.push("- (none)");
  for (const human of team.humans) {
    const you = gitUser !== null && human.name === gitUser ? " (you)" : "";
    lines.push(`- ${human.name}${you}`);
  }
  if (team.role_wip && Object.keys(team.role_wip).length > 0) {
    lines.push("role_wip:");
    for (const name of Object.keys(team.role_wip).sort()) {
      lines.push(`- ${name} ${team.role_wip[name]}`);
    }
  }
  if (team.limits?.loop_max_steps) {
    lines.push(`limits.loop_max_steps: ${team.limits.loop_max_steps}`);
  }
  return lines.join("\n");
}

export function resolveBot(
  team: TeamConfig,
  name: string,
): TeamConfig["bots"][number] | { error: string } {
  const byName = team.bots.find((bot) => bot.name === name);
  if (byName) return byName;
  const byRole = team.bots.filter((bot) => bot.role === name);
  if (byRole.length === 1) return byRole[0]!;
  if (byRole.length > 1) return { error: "Name the bot." };
  return { error: "Bot not found." };
}

export async function showTeam(root: string, gitUser: string | null): Promise<RoleCommandResult> {
  const loaded = await readTeamConfig(root);
  if ("error" in loaded) return fail(loaded.error);
  return ok(formatTeam(loaded.team, gitUser));
}

export async function checkTeam(root: string): Promise<RoleCommandResult> {
  const loaded = await readTeamConfig(root);
  if ("error" in loaded) return fail(loaded.error);
  const models = await checkModels(root);
  if (!models.ok) return fail(models.message);
  return ok("Team config is valid.");
}

export async function resolveRoleTemplate(
  template: string,
): Promise<{ id: string; raw: string } | { error: string }> {
  const ids = await listRoleTemplates();
  const trimmed = template.trim();
  if (!trimmed) {
    return { error: `Pass --template. Available: ${ids.join(", ") || "(none)"}.` };
  }
  if (ids.includes(trimmed)) {
    const [team, role] = trimmed.split("/") as [string, string];
    const roles = await templateRoleFiles(team);
    const found = roles?.find((item) => item.name === role);
    if (!found) return { error: `Role template "${trimmed}" was not found.` };
    return { id: trimmed, raw: found.raw };
  }
  const matches = ids.filter((id) => id.endsWith(`/${trimmed}`));
  if (matches.length === 1) {
    const resolved = await resolveRoleTemplate(matches[0]!);
    return resolved;
  }
  if (matches.length > 1) {
    return {
      error: `Role template "${trimmed}" matches ${matches.join(" and ")}. Pass one of those.`,
    };
  }
  return { error: `Role template "${trimmed}" was not found. Available: ${ids.join(", ")}.` };
}

export async function createRoleFromTemplate(
  root: string,
  input: { name: string; template: string; label?: string; job?: string; description?: string },
): Promise<RoleCommandResult> {
  const resolved = await resolveRoleTemplate(input.template);
  if ("error" in resolved) return fail(resolved.error);
  const parsed = parseRoleDocument(input.name, resolved.raw);
  if (!parsed || !parsed.job) return fail(`Role template "${resolved.id}" is invalid.`);
  return createRole(root, {
    name: input.name,
    label: input.label?.trim() || parsed.label,
    job: input.job?.trim() || parsed.job,
    description: input.description?.trim() || parsed.description,
    askFirst: parsed.askFirst,
    owns: parsed.owns,
    inputs: parsed.inputs,
    outputs: parsed.outputs,
    collaborates: parsed.collaborates,
    reviews: parsed.reviews,
    approvers: parsed.approvers,
    never: parsed.never,
    askHumanWhen: parsed.askHumanWhen,
    skills: parsed.skills,
    rules: parsed.rules,
    goals: parsed.goals,
  });
}
