import { join } from "pathe";
import { resolveFocus } from "../code-context/focus.js";
import { generateCodeContext } from "../code-context/index.js";
import { isSecretPath } from "../code-context/secrets.js";
import { ensureDir, pathExists, readText, removePath, writeText } from "../fs.js";
import { canonicalRoleName, readRole, roleContextDir } from "./profile.js";
import { ROLE_TEXT, type RoleCommandResult } from "./types.js";

const NO_SLICE = "No repo slice matched this role.";

function ok(stdout = ""): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function contextPath(root: string, name: string): string {
  return join(roleContextDir(root, name), "context.md");
}

function knowledgePath(root: string, name: string): string {
  return join(roleContextDir(root, name), "knowledge.md");
}

export async function readStoredContext(
  root: string,
  name: string,
): Promise<{ source: "provided" | "generated"; body: string } | null> {
  const path = contextPath(root, name);
  if (!(await pathExists(path))) return null;
  const raw = await readText(path);
  const match = /^---\r?\nsource: (provided|generated)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { source: "provided", body: raw.replace(/\s*$/, "") };
  const source = match[1] === "generated" ? "generated" : "provided";
  return { source, body: raw.slice(match[0].length).replace(/\s*$/, "") };
}

export async function roleContextBody(root: string, name: string): Promise<string> {
  const stored = await readStoredContext(root, name);
  return stored?.body.trim() ?? "";
}

async function readKnowledge(root: string, name: string): Promise<string> {
  const path = knowledgePath(root, name);
  if (!(await pathExists(path))) return "";
  return (await readText(path)).trim();
}

async function writeKnowledge(root: string, name: string, text: string): Promise<void> {
  await ensureDir(roleContextDir(root, name));
  const body = text.trim();
  if (!body) {
    await removePath(knowledgePath(root, name));
    return;
  }
  await writeText(knowledgePath(root, name), `${body}\n`);
}

function renderStored(source: "provided" | "generated", body: string): string {
  return `---\nsource: ${source}\n---\n${body.trim()}\n`;
}

export function buildGeneratedContext(input: {
  name: string;
  job: string;
  knowledge: string;
  repo: string;
}): string {
  const rows = [`Role: ${input.name}`, `Job: ${input.job}`];
  if (input.knowledge.trim()) rows.push("", "Knowledge:", input.knowledge.trim());
  rows.push("", "Repo:", input.repo.trim() || NO_SLICE);
  return rows.join("\n");
}

async function repoSlice(
  root: string,
  name: string,
  job: string,
  knowledge: string,
): Promise<string> {
  const query = [name, job, knowledge].filter((part) => part.trim()).join("\n");
  let seeds: string[] = [];
  try {
    const focused = await resolveFocus({ projectRoot: root, query });
    seeds = focused.plan.seedPaths.filter((rel) => !isSecretPath(rel)).slice(0, 12);
  } catch {
    seeds = [];
  }
  try {
    const found = await generateCodeContext({
      projectRoot: root,
      query,
      paths: seeds.length > 0 ? seeds : undefined,
      caps: { maxSlices: 8, maxTokensApprox: 2000, maxLinesPerSlice: 40, maxFiles: 12 },
    });
    if (found.ok && found.slices.length > 0 && found.markdown.trim()) return found.markdown.trim();
  } catch {
    // A search miss still leaves the matching file text below.
  }
  const blocks: string[] = [];
  for (const rel of seeds) {
    const abs = join(root, rel);
    if (!(await pathExists(abs))) continue;
    let text = "";
    try {
      text = await readText(abs);
    } catch {
      continue;
    }
    const body = text.split(/\r?\n/).slice(0, 40).join("\n").trim();
    if (!body) continue;
    blocks.push(`${rel}\n${body}`);
    if (blocks.length >= 8) break;
  }
  return blocks.join("\n\n") || NO_SLICE;
}

export async function setRoleContext(
  root: string,
  input: { name: string; text?: string; knowledge?: string; generate?: boolean },
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(input.name);
  if (!name) return fail(ROLE_TEXT.badName);
  const role = await readRole(root, name);
  if (!role) return fail(ROLE_TEXT.notFound);

  if (input.knowledge !== undefined) await writeKnowledge(root, name, input.knowledge);
  let knowledge = await readKnowledge(root, name);
  const extra = input.generate && input.text !== undefined ? input.text.trim() : "";
  if (extra && input.knowledge === undefined) {
    await writeKnowledge(root, name, extra);
    knowledge = extra;
  } else if (extra) {
    knowledge = [knowledge, extra].filter((part) => part.length > 0).join("\n");
  }

  if (input.text !== undefined && !input.generate) {
    const text = input.text.trim();
    if (!text) return fail("A context needs text.");
    await ensureDir(roleContextDir(root, name));
    await writeText(contextPath(root, name), renderStored("provided", text));
    return ok(text);
  }

  const saved = await readStoredContext(root, name);
  if (!input.generate && input.knowledge !== undefined) return ok(saved?.body || knowledge);
  if (!input.generate && saved) return ok(saved.body);

  const repo = await repoSlice(root, name, role.job, knowledge);
  const body = buildGeneratedContext({ name: role.name, job: role.job, knowledge, repo });
  await ensureDir(roleContextDir(root, name));
  await writeText(contextPath(root, name), renderStored("generated", body));
  return ok(body);
}
