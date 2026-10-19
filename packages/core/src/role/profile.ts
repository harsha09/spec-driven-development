import { readFile, writeFile } from "node:fs/promises";
import { join } from "pathe";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { listDirs, listFiles, pathExists, readText, removePath, writeText } from "../fs.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleProfile } from "./types.js";

const NAME_LIMIT = 80;

export function canonicalRoleName(input: string): string | null {
  const name = input.trim();
  if (!name || name === "." || name === "..") return null;
  if (name.length > NAME_LIMIT) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  return name;
}

export function roleFilePath(root: string, name: string): string {
  return join(root, ".sdd", "roles", `${name}.md`);
}

export function conversationDir(root: string, name: string): string {
  return join(root, ".sdd", "role-runs", "conversation", name);
}

export function memoryDir(root: string, name: string): string {
  return join(root, ".sdd", "role-runs", "memory", name);
}

export function allowFilePath(root: string): string {
  return join(root, ".sdd", "role-runs", "allow.json");
}

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseRoleDocument(name: string, raw: string): RoleProfile | null {
  const text = raw.replace(/^\uFEFF/, "");
  const nl = text.indexOf("\n");
  if (nl < 0 || text.slice(0, nl).trim() !== "---") return null;
  const rest = text.slice(nl + 1);
  const close = /\r?\n---\s*(?:\r?\n|$)/.exec(rest);
  if (!close) return null;
  let data: unknown;
  try {
    data = parseYaml(rest.slice(0, close.index));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  const body = rest.slice(close.index + close[0].length).trim();
  return {
    name,
    label: asText(rec.label),
    job: asText(rec.job),
    description: body,
    askFirst: rec.ask_first === true,
    pinned: rec.pinned === true,
    hidden: rec.hidden === true,
  };
}

export function renderRole(role: RoleProfile): string {
  const front = stringifyYaml(
    {
      name: role.name,
      label: role.label,
      job: role.job,
      ask_first: role.askFirst,
      pinned: role.pinned,
      hidden: role.hidden,
    },
    { lineWidth: 100 },
  ).trimEnd();
  const description = role.description.trim();
  if (!description) return `---\n${front}\n---\n`;
  return `---\n${front}\n---\n${description}\n`;
}

export async function readRole(root: string, name: string): Promise<RoleProfile | null> {
  const canonical = canonicalRoleName(name);
  if (!canonical) return null;
  const path = roleFilePath(root, canonical);
  if (!(await pathExists(path))) return null;
  try {
    return parseRoleDocument(canonical, await readText(path));
  } catch {
    return null;
  }
}

async function writeRole(root: string, role: RoleProfile): Promise<void> {
  await writeText(roleFilePath(root, role.name), renderRole(role));
}

export async function createRole(
  root: string,
  input: { name: string; label: string; job: string; description?: string; askFirst?: boolean },
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(input.name);
  if (!name) return fail(ROLE_TEXT.badName);
  const job = input.job.trim();
  if (!job) return fail(ROLE_TEXT.needsJob);
  if (await pathExists(roleFilePath(root, name))) return fail(ROLE_TEXT.exists);
  await writeRole(root, {
    name,
    label: input.label.trim(),
    job,
    description: (input.description ?? "").trim(),
    askFirst: input.askFirst === true,
    pinned: false,
    hidden: false,
  });
  return ok();
}

export async function editRole(
  root: string,
  nameInput: string,
  patch: { label?: string; job?: string; description?: string; askFirst?: boolean },
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(nameInput);
  if (!name) return fail(ROLE_TEXT.badName);
  const role = await readRole(root, name);
  if (!role) return fail(ROLE_TEXT.notFound);
  if (patch.job !== undefined && !patch.job.trim()) return fail(ROLE_TEXT.needsJob);
  if (patch.label !== undefined) role.label = patch.label.trim();
  if (patch.job !== undefined) role.job = patch.job.trim();
  if (patch.description !== undefined) role.description = patch.description.trim();
  if (patch.askFirst !== undefined) role.askFirst = patch.askFirst;
  await writeRole(root, role);
  return ok();
}

async function setFlag(
  root: string,
  nameInput: string,
  flag: "pinned" | "hidden",
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(nameInput);
  if (!name) return fail(ROLE_TEXT.badName);
  const role = await readRole(root, name);
  if (!role) return fail(ROLE_TEXT.notFound);
  role[flag] = true;
  await writeRole(root, role);
  return ok();
}

export function pinRole(root: string, name: string): Promise<RoleCommandResult> {
  return setFlag(root, name, "pinned");
}

export function hideRole(root: string, name: string): Promise<RoleCommandResult> {
  return setFlag(root, name, "hidden");
}

export async function showRoles(
  root: string,
  opts: { name?: string; all?: boolean } = {},
): Promise<RoleCommandResult> {
  if (opts.name !== undefined) {
    const name = canonicalRoleName(opts.name);
    if (!name) return fail(ROLE_TEXT.badName);
    const path = roleFilePath(root, name);
    if (!(await pathExists(path)) || !(await readRole(root, name))) return fail(ROLE_TEXT.notFound);
    return ok((await readText(path)).replace(/\s*$/, ""));
  }
  const dir = join(root, ".sdd", "roles");
  if (!(await pathExists(dir))) return ok();
  const roles: RoleProfile[] = [];
  for (const file of await listFiles(dir)) {
    if (!file.endsWith(".md")) continue;
    const role = await readRole(root, file.slice(0, -".md".length));
    if (!role) continue;
    if (role.hidden && !opts.all) continue;
    roles.push(role);
  }
  roles.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  return ok(roles.map((role) => `${role.name} ${role.label}`).join("\n"));
}

export async function duplicateRole(root: string, nameInput: string): Promise<RoleCommandResult> {
  const name = canonicalRoleName(nameInput);
  if (!name) return fail(ROLE_TEXT.badName);
  const source = await readRole(root, name);
  if (!source) return fail(ROLE_TEXT.notFound);
  const copyName = canonicalRoleName(`${name} copy`);
  if (!copyName) return fail(ROLE_TEXT.badName);
  if (await pathExists(roleFilePath(root, copyName))) return fail(ROLE_TEXT.exists);
  await writeRole(root, { ...source, name: copyName });
  return ok();
}

export async function deleteRole(root: string, nameInput: string): Promise<RoleCommandResult> {
  const name = canonicalRoleName(nameInput);
  if (!name) return fail(ROLE_TEXT.badName);
  const path = roleFilePath(root, name);
  if (!(await pathExists(path))) return fail(ROLE_TEXT.notFound);
  await removePath(path);
  await removePath(conversationDir(root, name));
  await removePath(memoryDir(root, name));
  await removeAllowKey(root, name);
  return ok();
}

async function removeAllowKey(root: string, name: string): Promise<void> {
  const path = allowFilePath(root);
  if (!(await pathExists(path))) return;
  let data: unknown;
  try {
    data = JSON.parse(await readText(path));
  } catch {
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const rec = data as Record<string, unknown>;
  if (!(name in rec)) return;
  delete rec[name];
  await writeFile(path, `${JSON.stringify(rec, null, 2)}\n`, "utf8");
}

/** Directories under the conversation root. Used to find a run id. */
export async function listConversationRoles(root: string): Promise<string[]> {
  return listDirs(join(root, ".sdd", "role-runs", "conversation"));
}

export async function readAllowFile(root: string): Promise<Record<string, unknown> | null> {
  const path = allowFilePath(root);
  if (!(await pathExists(path))) return null;
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}
