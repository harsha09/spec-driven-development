import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "pathe";
import { z } from "zod";
import { buildContext, getActiveChangeId } from "../change-context.js";
import { generateCodeContext } from "../code-context/index.js";
import { isSecretPath } from "../code-context/secrets.js";
import { loadConfig } from "../config.js";
import { ensureDir, pathExists, readText, readYaml, writeText } from "../fs.js";
import { getHeadSha } from "../git-head.js";
import { changePath } from "../paths.js";
import type { TeamConfig } from "../role/schema.js";
import { searchProject } from "../search/builtin.js";
import type { SearchScope } from "../search/types.js";
import { getStage } from "../workflow.js";

const OUTPUT_CAP = 4000;
const SCOPES = new Set<SearchScope>(["code", "specs", "memory"]);

const ToolsSchema = z
  .object({
    allow: z.array(z.object({ run: z.string().trim().min(1) }).strict()).default([]),
  })
  .strict();

const EvidenceSchema = z
  .object({
    sha: z.string(),
    runs: z.array(
      z
        .object({
          command: z.string(),
          exitCode: z.number().int().nullable(),
          output: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

type EvidenceFile = z.infer<typeof EvidenceSchema>;

export interface ToolResult {
  ok: boolean;
  name: string;
  text: string;
}

const BLOCKED_CHECK =
  /\bsdd\s+(next|complete)\b|\bgit\s+(push|merge)\b|\bgh\s+pr\s+(create|merge)\b/;
const NEGATED =
  /\b(?:not|no|never|cannot|can't|cant|dont|don't|doesnt|doesn't|isnt|isn't)\s+(?:yet\s+)?(?:pass|works|fixed)\b/gi;

export function claimsPass(text: string): boolean {
  return /\b(?:pass|works|fixed)\b/i.test(text.replace(NEGATED, " "));
}

/** Same path rules as isSafeProductPath. Imported from run.ts would cycle through the loop. */
function safePath(rel: string): boolean {
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

function clip(text: string): string {
  return text.length > OUTPUT_CAP ? text.slice(-OUTPUT_CAP) : text;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function result(name: string, ok: boolean, text: string): ToolResult {
  return { ok, name, text: clip(text) };
}

async function git(
  cwd: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: String(error) }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function shell(
  command: string,
  cwd: string,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => resolve({ code: 1, output: String(error) }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function headOf(root: string): Promise<string | null> {
  try {
    return await getHeadSha(root);
  } catch {
    return null;
  }
}

async function activeChange(root: string): Promise<{ id: string; path: string } | null> {
  const config = await loadConfig(root);
  const id = await getActiveChangeId(root, config);
  if (!id) return null;
  return { id, path: changePath(root, config, id) };
}

export function evidenceRel(changesPath: string, changeId: string, sha: string): string {
  return `${changesPath}/${changeId}/evidence/${sha}.json`.replace(/\\/g, "/");
}

async function evidenceFile(root: string, changeId: string, sha: string): Promise<string> {
  const config = await loadConfig(root);
  return join(changePath(root, config, changeId), "evidence", `${sha}.json`);
}

export async function evidenceSupports(
  root: string,
  changeId: string,
  cite: string,
): Promise<boolean> {
  const sha = await headOf(root);
  if (!sha) return false;
  const config = await loadConfig(root);
  const expected = evidenceRel(config.changes_path, changeId, sha);
  if (cite.trim().replace(/\\/g, "/").replace(/^\.\//, "") !== expected) return false;
  const file = join(root, ...expected.split("/"));
  if (!(await pathExists(file))) return false;
  let parsed: EvidenceFile;
  try {
    const value = EvidenceSchema.safeParse(JSON.parse(await readText(file)));
    if (!value.success) return false;
    parsed = value.data;
  } catch {
    return false;
  }
  if (parsed.sha !== sha || parsed.runs.length === 0) return false;
  return parsed.runs[parsed.runs.length - 1]?.exitCode === 0;
}

export async function passClaimRefusal(
  root: string,
  text: string,
  cites: string[],
): Promise<string | null> {
  if (!claimsPass(text)) return null;
  const change = await activeChange(root).catch(() => null);
  if (!change) return "A pass claim needs evidence at this SHA.";
  for (const cite of cites) {
    if (await evidenceSupports(root, change.id, cite)) return null;
  }
  return "A pass claim needs evidence at this SHA.";
}

async function allowList(root: string): Promise<string[] | { error: string }> {
  const change = await activeChange(root);
  const stageRuns: string[] = [];
  if (change) {
    const config = await loadConfig(root);
    const ctx = await buildContext(root, config, change.id);
    const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
    for (const command of stage?.verify?.commands ?? []) stageRuns.push(command.run);
  }
  const file = join(root, ".sdd", "tools.yaml");
  if (!(await pathExists(file))) return stageRuns;
  let raw: unknown;
  try {
    raw = await readYaml(file);
  } catch {
    return { error: "tools.yaml is invalid: tools could not be parsed" };
  }
  const parsed = ToolsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "tools";
    return { error: `tools.yaml is invalid: ${path} ${issue?.message ?? "invalid"}` };
  }
  return [...stageRuns, ...parsed.data.allow.map((entry) => entry.run)];
}

async function readFileTool(root: string, args: Record<string, unknown>): Promise<ToolResult> {
  const rel = typeof args.path === "string" ? args.path : "";
  if (!safePath(rel)) return result("read_file", false, "That path is outside the project.");
  if (isSecretPath(rel)) return result("read_file", false, "That path is not readable.");
  const file = join(root, ...rel.split(/[/\\]/));
  if (!(await pathExists(file))) return result("read_file", false, "That path is not readable.");
  try {
    const text = await readText(file);
    return result("read_file", true, `${rel}\n${text}`);
  } catch {
    return result("read_file", false, "That path is not readable.");
  }
}

async function searchTool(root: string, args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return result("search", false, "A search needs a query.");
  const scope = typeof args.scope === "string" && args.scope ? args.scope : "code";
  if (!SCOPES.has(scope as SearchScope)) {
    return result("search", false, "A search scope is code, specs, or memory.");
  }
  const found = await searchProject(root, query, {
    scope: scope as SearchScope,
    k: 8,
    budget: 2000,
  });
  return result("search", true, found.text || query);
}

async function contextTool(root: string, args: Record<string, unknown>): Promise<ToolResult> {
  const path = typeof args.path === "string" ? args.path : "";
  const query = typeof args.query === "string" ? args.query : "";
  const symbol = typeof args.symbol === "string" ? args.symbol : "";
  const change = await activeChange(root).catch(() => null);
  const found = await generateCodeContext({
    projectRoot: root,
    changeId: change?.id,
    paths: path ? [path] : undefined,
    query: query || undefined,
    symbols: symbol ? [symbol] : undefined,
  });
  return result(
    "context",
    found.ok,
    found.markdown || found.gaps.map((gap) => gap.message).join("\n"),
  );
}

async function appendRun(
  root: string,
  changeId: string,
  sha: string,
  command: string,
  exitCode: number | null,
  output: string,
): Promise<string | { error: string }> {
  const file = await evidenceFile(root, changeId, sha);
  let body: EvidenceFile = { sha, runs: [] };
  if (await pathExists(file)) {
    try {
      const parsed = EvidenceSchema.safeParse(JSON.parse(await readText(file)));
      if (!parsed.success || parsed.data.sha !== sha) {
        return { error: "Evidence at this commit cannot be read." };
      }
      body = parsed.data;
    } catch {
      return { error: "Evidence at this commit cannot be read." };
    }
  }
  body.runs.push({ command, exitCode, output: clip(output) });
  await ensureDir(join(file, ".."));
  await writeText(file, `${JSON.stringify(body, null, 2)}\n`);
  const config = await loadConfig(root);
  return evidenceRel(config.changes_path, changeId, sha);
}

async function runCheck(root: string, args: Record<string, unknown>): Promise<ToolResult> {
  const command = typeof args.run === "string" ? args.run.trim() : "";
  if (!command) return result("run_check", false, "That check is not allowlisted.");
  if (BLOCKED_CHECK.test(command)) {
    return result("run_check", false, "That check cannot run sdd next, sdd complete, or merge.");
  }
  const allowed = await allowList(root);
  if ("error" in allowed) return result("run_check", false, allowed.error);
  if (!allowed.includes(command))
    return result("run_check", false, "That check is not allowlisted.");
  const change = await activeChange(root);
  if (!change) return result("run_check", false, "No active change.");
  const sha = await headOf(root);
  if (!sha) return result("run_check", false, "Git HEAD is unavailable.");
  const dir = await mkdtemp(join(tmpdir(), "sdd-check-"));
  const added = await git(root, ["worktree", "add", "--detach", dir, sha]);
  if (added.code !== 0) {
    await rm(dir, { recursive: true, force: true });
    return result("run_check", false, "Git HEAD is unavailable.");
  }
  let ran: { code: number | null; output: string } = { code: 1, output: "" };
  let removeFailed = false;
  try {
    ran = await shell(command, dir);
  } finally {
    const removed = await git(root, ["worktree", "remove", "--force", dir]);
    await rm(dir, { recursive: true, force: true });
    removeFailed = removed.code !== 0;
  }
  if (removeFailed) return result("run_check", false, "The check worktree could not be removed.");
  const stored = await appendRun(root, change.id, sha, command, ran.code, ran.output);
  if (typeof stored !== "string") return result("run_check", false, stored.error);
  const text = [`${command}`, `exit ${ran.code ?? "none"}`, stored, clip(ran.output)].join("\n");
  return result("run_check", ran.code === 0, text);
}

async function writeFileTool(root: string, args: Record<string, unknown>): Promise<ToolResult> {
  const rel = typeof args.path === "string" ? args.path : "";
  const contents = args.contents;
  if (!safePath(rel) || typeof contents !== "string" || isSecretPath(rel)) {
    return result("write_file", false, "That file cannot be written.");
  }
  await writeText(join(root, ...rel.split(/[/\\]/)), contents);
  return result("write_file", true, `Wrote ${rel}.`);
}

function branchName(team: TeamConfig, bot: string, changeId: string): string {
  return team.branch.replaceAll("{bot}", bot).replaceAll("{change}", changeId);
}

async function currentBranch(root: string): Promise<string> {
  const found = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return found.code === 0 ? found.stdout.trim() : "";
}

async function commitTool(
  root: string,
  team: TeamConfig,
  bot: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const change = await activeChange(root);
  if (!change) return result("commit", false, "No active change.");
  const expected = branchName(team, bot, change.id);
  const branch = await currentBranch(root);
  if (branch !== expected) return result("commit", false, "A bot commits only on its own branch.");
  const message = typeof args.message === "string" ? args.message.trim() : "";
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((item): item is string => typeof item === "string")
    : [];
  if (!message || message.includes("\n") || paths.length === 0) {
    return result("commit", false, "A commit needs a message and a path.");
  }
  for (const rel of paths) {
    if (!safePath(rel) || isSecretPath(rel))
      return result("commit", false, "That path is outside the project.");
  }
  const added = await git(root, ["add", "--", ...paths]);
  if (added.code !== 0) return result("commit", false, clip(added.stderr || added.stdout));
  const committed = await git(root, ["commit", "-m", message]);
  if (committed.code !== 0)
    return result("commit", false, clip(committed.stderr || committed.stdout));
  return result("commit", true, clip(committed.stdout || message));
}

async function refusedShip(root: string, name: string, text: string): Promise<ToolResult> {
  const sha = await headOf(root);
  return result(name, false, text.replace("this SHA", sha ?? "this SHA"));
}

export async function runTool(
  root: string,
  team: TeamConfig,
  bot: string,
  call: { name: string; args: unknown },
): Promise<ToolResult> {
  const args = asRecord(call.args);
  const name = call.name.trim();
  if (name === "read_file") return readFileTool(root, args);
  if (name === "search") return searchTool(root, args);
  if (name === "context") return contextTool(root, args);
  if (name === "run_check") return runCheck(root, args);
  if (name === "write_file") return writeFileTool(root, args);
  if (name === "commit") return commitTool(root, team, bot, args);
  if (name === "push") return refusedShip(root, name, "Push needs a person at this SHA.");
  if (name === "pull_request")
    return refusedShip(root, name, "A pull request needs a person at this SHA.");
  if (name === "merge" || name === "tag" || name === "deploy") {
    return result(name, false, "A bot cannot merge.");
  }
  if (name === "sdd_next" || name === "sdd_complete" || name === "accept_spec") {
    return result(name, false, "A role cannot do that.");
  }
  return result(name, false, "That tool is not available.");
}

export async function reviewNeedsEvidence(
  root: string,
  changeId: string,
  commands: number,
  type: string,
  text: string,
  cite: string,
): Promise<string | null> {
  const claim = claimsPass(text);
  const agree = type === "agree" && commands > 0;
  if (!claim && !agree) return null;
  if (await evidenceSupports(root, changeId, cite)) return null;
  return claim
    ? "A pass claim needs evidence at this SHA."
    : "A review needs evidence at this SHA.";
}
