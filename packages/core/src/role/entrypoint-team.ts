import { homedir } from "node:os";
import { join } from "pathe";
import { listFiles, pathExists } from "../fs.js";
import { canonicalRoleName, readRole } from "./profile.js";
import { readTeamConfig } from "./team.js";
import type { RoleProfile } from "./types.js";

/** One product role, in the order the host agent must run. */
export interface ProductTeamMember {
  order: number;
  name: string;
  job: string;
  accepts: string;
  file: string;
  source: "repo" | "user";
}

/**
 * Directory whose `.sdd/` holds a user-default team.
 * `SDD_HOME` overrides the home directory so a test does not read a real `~/.sdd`.
 */
export function productTeamHome(): string {
  const fromEnv = process.env.SDD_HOME?.trim();
  if (fromEnv) return fromEnv;
  return homedir();
}

function oneLine(value: string): string {
  const text = value.replace(/\s+/g, " ").replaceAll("|", "/").trim();
  return text || "not named";
}

function toMember(
  role: RoleProfile | null,
  name: string,
  order: number,
  source: ProductTeamMember["source"],
): ProductTeamMember {
  return {
    order,
    name,
    job: oneLine(role?.job ?? ""),
    accepts: role && role.approvers.length > 0 ? oneLine(role.approvers.join(", ")) : "not named",
    file: source === "repo" ? `.sdd/roles/${name}.md` : `~/.sdd/roles/${name}.md`,
    source,
  };
}

async function listedRoles(root: string): Promise<{ name: string; role: RoleProfile | null }[]> {
  const dir = join(root, ".sdd", "roles");
  if (!(await pathExists(dir))) return [];
  const listed: { name: string; role: RoleProfile | null }[] = [];
  for (const file of await listFiles(dir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -".md".length);
    if (canonicalRoleName(name) !== name) continue;
    listed.push({ name, role: await readRole(root, name) });
  }
  return listed;
}

function byName(listed: { name: string; role: RoleProfile | null }[]): string[] {
  return listed
    .filter((item) => !item.role?.hidden)
    .map((item) => item.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Team for one root. `null` means this root has no team file and no canonical
 * role file, so a caller may look at the user default. A role file that does
 * not parse still counts. An empty list means a team file or a role file is
 * present and the other source must not replace it.
 */
async function membersFrom(
  root: string,
  source: ProductTeamMember["source"],
): Promise<ProductTeamMember[] | null> {
  const listed = await listedRoles(root);
  const teamFile = await pathExists(join(root, ".sdd", "team.yaml"));
  if (!teamFile && listed.length === 0) return null;
  const known = new Map(listed.map((item) => [item.name, item.role]));
  let names: string[];
  if (teamFile) {
    const loaded = await readTeamConfig(root);
    if ("team" in loaded) {
      const seen = new Set<string>();
      names = [];
      for (const bot of loaded.team.bots) {
        if (seen.has(bot.role)) continue;
        seen.add(bot.role);
        names.push(bot.role);
      }
    } else {
      names = byName(listed);
    }
  } else {
    names = byName(listed);
  }
  return names.map((name, index) => toMember(known.get(name) ?? null, name, index + 1, source));
}

/**
 * Product team for the host entrypoint.
 * A repo `team.yaml` sets the order. Role files in name order are the fallback.
 * A user-global team is used only when the repo has neither.
 */
export async function loadProductTeam(projectRoot: string): Promise<ProductTeamMember[]> {
  const repo = await membersFrom(projectRoot, "repo");
  if (repo) return repo;
  const user = await membersFrom(productTeamHome(), "user");
  return user ?? [];
}

/** Markdown block for protocol, AGENTS.md, the host rule, and the handoff. */
export function renderProductTeamSection(members: ProductTeamMember[]): string {
  if (members.length === 0) return "";
  const lines = [
    "## Product team",
    "",
    "Run these product roles in order. The stage hat (planner, implementer, reviewer) is how the host behaves inside one role's turn. It does not replace this team. Do not ask the human to repeat this roster.",
    "",
  ];
  if (members[0]?.source === "user") {
    lines.push(
      "Source: user default (`~/.sdd`). It applies only because this repo has no product team.",
      "",
    );
  }
  for (const member of members) {
    lines.push(
      `${member.order}. \`${member.name}\` — ${member.job}. Accepts: ${member.accepts}. File: \`${member.file}\``,
    );
  }
  return lines.join("\n");
}
