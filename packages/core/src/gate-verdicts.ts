import { spawn } from "node:child_process";
import { join } from "pathe";
import { buildContext } from "./change-context.js";
import { SddError } from "./errors.js";
import { pathExists, readYaml, writeYaml } from "./fs.js";
import { getHeadSha } from "./git-head.js";
import type { Config, Workflow } from "./schemas.js";
import { nowIso } from "./slug.js";

const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const GATE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const GATE_VERDICTS = ["pass", "fail", "pass-with-notes"] as const;
export type GateVerdict = (typeof GATE_VERDICTS)[number];
export type GateFreshness = "fresh" | "stale" | "missing" | "failed";

export interface GateVerdictRecord {
  gate: string;
  reviewer: string;
  verdict: GateVerdict;
  sha: string;
  at: string;
  evidence: string[];
}

interface GateVerdictFile {
  records: GateVerdictRecord[];
}

export interface RecordGateVerdictInput {
  gate: string;
  reviewer: string;
  verdict: string;
  sha?: string | null;
  evidence?: string[];
  at?: string;
}

export interface GateVerdictHistory {
  verdict: GateVerdict;
  sha: string;
  reviewer: string;
  at: string;
  evidence: string[];
}

export interface GateStatusLine {
  gate: string;
  state: GateFreshness;
  verdict?: GateVerdict;
  sha?: string;
  reviewer?: string;
  at?: string;
  evidence: string[];
  history: GateVerdictHistory[];
}

export interface GateStatusReport {
  changeId: string;
  head: string | null;
  gates: GateStatusLine[];
  ready: boolean;
}

export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  cwd: string,
  command: string,
  args: string[],
) => Promise<CommandOutput>;

export interface MergeChangeOptions {
  projectRoot: string;
  config: Config;
  changeId: string;
  checkOnly?: boolean;
  readHead?: (projectRoot: string) => Promise<string | null>;
  readBranch?: (projectRoot: string) => Promise<string | null>;
  run?: CommandRunner;
}

export interface MergeChangeResult {
  ok: boolean;
  message: string;
}

function verdictError(message: string): SddError {
  return new SddError(message, { code: "GATE_VERDICT" });
}

function verdictPath(changeDir: string): string {
  return join(changeDir, "gate-verdicts.yaml");
}

function normalizeHead(head: string | null): string | null {
  const sha = head?.trim().toLowerCase() ?? "";
  if (!sha) return null;
  if (!SHA_RE.test(sha)) throw verdictError("git rev-parse returned an invalid HEAD SHA.");
  return sha;
}

function isVerdict(value: string): value is GateVerdict {
  return (GATE_VERDICTS as readonly string[]).includes(value);
}

function validEvidence(link: string): boolean {
  if (/^https?:\/\/\S+$/.test(link)) return true;
  if (!/^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(link)) return false;
  return !link.split("/").includes("..");
}

function requiredGateNames(workflow: Workflow): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of workflow.required_gates ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

async function readRecords(changeDir: string): Promise<GateVerdictRecord[]> {
  const path = verdictPath(changeDir);
  if (!(await pathExists(path))) return [];
  const raw = await readYaml<unknown>(path);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  const records = (raw as { records?: unknown }).records;
  if (records === undefined) return [];
  if (!Array.isArray(records)) throw verdictError("gate-verdicts.yaml is invalid.");
  return records.map((item) => parseRecord(item));
}

function parseRecord(item: unknown): GateVerdictRecord {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  const record = item as Record<string, unknown>;
  const gate = typeof record.gate === "string" ? record.gate : "";
  const reviewer = typeof record.reviewer === "string" ? record.reviewer : "";
  const verdict = typeof record.verdict === "string" ? record.verdict : "";
  const sha = typeof record.sha === "string" ? record.sha : "";
  const at = typeof record.at === "string" ? record.at : "";
  const evidence = record.evidence;
  if (!GATE_RE.test(gate) || !reviewer || reviewer.includes("\n") || !isVerdict(verdict)) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  if (!SHA_RE.test(sha) || !AT_RE.test(at) || !Array.isArray(evidence)) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  const links = evidence.map((link) => (typeof link === "string" ? link : ""));
  if (links.some((link) => !validEvidence(link))) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  if (verdict !== "fail" && links.length === 0) {
    throw verdictError("gate-verdicts.yaml is invalid.");
  }
  return {
    gate,
    reviewer,
    verdict,
    sha: sha.toLowerCase(),
    at,
    evidence: links,
  };
}

function validateInput(input: RecordGateVerdictInput): GateVerdictRecord {
  const gate = input.gate.trim();
  if (!GATE_RE.test(gate)) throw verdictError("A gate name is not valid.");
  const reviewer = input.reviewer.trim();
  if (!reviewer || reviewer.includes("\n") || reviewer.includes("\r")) {
    throw verdictError("A verdict needs a reviewer.");
  }
  const verdict = input.verdict.trim();
  if (!isVerdict(verdict)) {
    throw verdictError("A verdict is pass, fail, or pass-with-notes.");
  }
  const sha = (input.sha ?? "").trim();
  if (!sha) {
    throw verdictError(
      verdict === "fail"
        ? "A verdict needs the commit SHA."
        : "A pass verdict needs the commit SHA.",
    );
  }
  if (!SHA_RE.test(sha)) throw verdictError("A commit SHA is 40 or 64 hex characters.");
  const evidence: string[] = [];
  for (const link of input.evidence ?? []) {
    const trimmed = link.trim();
    if (!trimmed || evidence.includes(trimmed)) continue;
    if (!validEvidence(trimmed)) {
      throw verdictError("An evidence link must be a repo-relative path or an http(s) URL.");
    }
    evidence.push(trimmed);
  }
  if (verdict !== "fail" && evidence.length === 0) {
    throw verdictError("A pass verdict needs a link to evidence.");
  }
  const at = input.at ?? nowIso();
  if (!AT_RE.test(at)) throw verdictError("A verdict time is not valid.");
  return { gate, reviewer, verdict, sha: sha.toLowerCase(), at, evidence };
}

/** Latest record for each SHA, in the order that SHA first appeared. */
function latestPerSha(records: GateVerdictRecord[], gate: string): GateVerdictRecord[] {
  const bySha = new Map<string, GateVerdictRecord>();
  const order: string[] = [];
  for (const record of records) {
    if (record.gate !== gate) continue;
    if (!bySha.has(record.sha)) order.push(record.sha);
    bySha.set(record.sha, record);
  }
  return order.map((sha) => bySha.get(sha)!);
}

function toHistory(record: GateVerdictRecord): GateVerdictHistory {
  return {
    verdict: record.verdict,
    sha: record.sha,
    reviewer: record.reviewer,
    at: record.at,
    evidence: record.evidence,
  };
}

function evaluateGate(
  gate: string,
  records: GateVerdictRecord[],
  head: string | null,
): GateStatusLine {
  const perSha = latestPerSha(records, gate);
  if (perSha.length === 0) {
    return { gate, state: "missing", evidence: [], history: [] };
  }
  const onHead = head ? perSha.find((record) => record.sha === head) : undefined;
  const latest = perSha[perSha.length - 1]!;
  const primary = onHead ?? latest;
  let state: GateFreshness = "stale";
  if (head && onHead) state = onHead.verdict === "fail" ? "failed" : "fresh";
  return {
    gate,
    state,
    verdict: primary.verdict,
    sha: primary.sha,
    reviewer: primary.reviewer,
    at: primary.at,
    evidence: primary.evidence,
    history: perSha.filter((record) => record.sha !== primary.sha).map(toHistory),
  };
}

export function formatGateStatus(report: GateStatusReport): string {
  const lines = [`head ${report.head ?? "unavailable"}`];
  if (report.gates.length === 0) {
    lines.push("No required gates.");
    lines.push("ready");
    return lines.join("\n");
  }
  for (const gate of report.gates) {
    if (gate.state === "missing") {
      lines.push(`${gate.gate} missing`);
    } else {
      lines.push(
        `${gate.gate} ${gate.state} ${gate.verdict} ${gate.sha} ${gate.reviewer} ${gate.at}`,
      );
      for (const link of gate.evidence) lines.push(`  evidence ${link}`);
    }
    for (const old of gate.history) {
      lines.push(`${gate.gate} stale ${old.verdict} ${old.sha} ${old.reviewer} ${old.at}`);
      for (const link of old.evidence) lines.push(`  evidence ${link}`);
    }
  }
  lines.push(report.ready ? "ready" : "blocked");
  return lines.join("\n");
}

export async function recordGateVerdict(
  projectRoot: string,
  config: Config,
  changeId: string,
  input: RecordGateVerdictInput,
): Promise<GateVerdictRecord> {
  const record = validateInput(input);
  const ctx = await buildContext(projectRoot, config, changeId);
  const records = await readRecords(ctx.path);
  records.push(record);
  const file: GateVerdictFile = { records };
  await writeYaml(verdictPath(ctx.path), file);
  return record;
}

export async function gateVerdictStatus(
  projectRoot: string,
  config: Config,
  changeId: string,
  readHead: (root: string) => Promise<string | null> = getHeadSha,
): Promise<GateStatusReport> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const head = normalizeHead(await readHead(projectRoot));
  const records = await readRecords(ctx.path);
  const gates = requiredGateNames(ctx.workflow).map((gate) => evaluateGate(gate, records, head));
  return {
    changeId,
    head,
    gates,
    ready: gates.every((gate) => gate.state === "fresh"),
  };
}

function spawnCommand(cwd: string, command: string, args: string[]): Promise<CommandOutput> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CommandOutput) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        exitCode: 127,
        stdout,
        stderr: error.code === "ENOENT" ? `${command} is not available.` : error.message,
      });
    });
    child.on("close", (code) => {
      finish({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

async function currentBranch(projectRoot: string): Promise<string | null> {
  const result = await spawnCommand(projectRoot, "git", ["branch", "--show-current"]);
  if (result.exitCode !== 0) return null;
  const name = result.stdout.trim();
  return name.length > 0 ? name : null;
}

function gateBlock(report: GateStatusReport): string | null {
  if (report.ready) return null;
  if (!report.head) return "Merge blocked: Git HEAD is unavailable.";
  const parts = report.gates
    .filter((gate) => gate.state !== "fresh")
    .map((gate) => `${gate.gate} ${gate.state}`);
  return `Merge blocked: ${parts.join(", ")}.`;
}

export async function mergeChange(options: MergeChangeOptions): Promise<MergeChangeResult> {
  const readHead = options.readHead ?? getHeadSha;
  const readBranch = options.readBranch ?? currentBranch;
  const run = options.run ?? spawnCommand;
  const ctx = await buildContext(options.projectRoot, options.config, options.changeId);
  if (ctx.meta.branch) {
    const current = await readBranch(options.projectRoot);
    if (current !== ctx.meta.branch) {
      return {
        ok: false,
        message: `Merge blocked: current branch is ${current ?? "(detached)"}, not ${ctx.meta.branch}.`,
      };
    }
  }
  const head = normalizeHead(await readHead(options.projectRoot));
  const report = await gateVerdictStatus(
    options.projectRoot,
    options.config,
    options.changeId,
    async () => head,
  );
  const blocked = gateBlock(report);
  if (blocked) return { ok: false, message: blocked };
  if (options.checkOnly) {
    return {
      ok: true,
      message: head ? `Merge allowed at ${head}.` : "No required gates.",
    };
  }
  if (!head) return { ok: false, message: "Merge blocked: Git HEAD is unavailable." };
  const again = normalizeHead(await readHead(options.projectRoot));
  if (again !== head) {
    return {
      ok: false,
      message: `Merge blocked: head moved from ${head} to ${again ?? "unavailable"}.`,
    };
  }
  const number = ctx.meta.pr?.number;
  if (!Number.isInteger(number) || (number ?? 0) <= 0) {
    return { ok: false, message: "Merge blocked: this change has no pull request." };
  }
  const merged = await run(options.projectRoot, "gh", [
    "pr",
    "merge",
    String(number),
    "--match-head-commit",
    head,
  ]);
  if (merged.exitCode !== 0) {
    const detail = merged.stderr.trim() || merged.stdout.trim() || "The merge did not complete.";
    return { ok: false, message: `Merge failed: ${detail}` };
  }
  return { ok: true, message: merged.stdout.trim() || `Merged ${head}.` };
}
