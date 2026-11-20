import { readdir } from "node:fs/promises";
import { join } from "pathe";
import { buildContext } from "./change-context.js";
import { pathExists, readText } from "./fs.js";
import { getHeadSha } from "./git-head.js";
import { isPassVerdict, parseSignoff, signoffFileName } from "./role/signoff.js";
import type { Config, Workflow } from "./schemas.js";

export type GateVerdictState = "fresh" | "stale" | "missing" | "fail";

export interface GateVerdictRow {
  gate: string;
  required: true;
  state: GateVerdictState;
  sha?: string;
  reviewer?: string;
  verdict?: string;
  stale_sha?: string;
  evidence?: string;
}

export interface GateStatusReport {
  changeId: string;
  headSha: string | null;
  gates: GateVerdictRow[];
  mergeReady: boolean;
}

const SHA_IN_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export function mergeRequiredGateIds(workflow: Workflow): string[] {
  const listed = workflow.merge?.gates ?? [];
  if (listed.length) return [...listed];
  return workflow.stages
    .filter((stage) => stage.gate?.approvers?.includes("human") && stage.gate.type === "hard")
    .map((stage) => stage.id);
}

async function signoffFilesForStage(
  changePath: string,
  stageId: string,
): Promise<Array<{ sha: string; path: string }>> {
  const dir = join(changePath, "reviews");
  if (!(await pathExists(dir))) return [];
  const found: Array<{ sha: string; path: string }> = [];
  const prefix = `${stageId}-`;
  for (const name of await readdir(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
    const sha = name.slice(prefix.length, -3);
    if (!SHA_IN_NAME.test(sha)) continue;
    found.push({ sha: sha.toLowerCase(), path: join(dir, name) });
  }
  return found;
}

async function loadSignoff(path: string) {
  return parseSignoff(await readText(path));
}

export async function evaluateGateVerdict(
  changePath: string,
  stageId: string,
  headSha: string,
): Promise<GateVerdictRow> {
  const head = headSha.toLowerCase();
  const direct = join(changePath, signoffFileName(stageId, head));
  if (await pathExists(direct)) {
    const parsed = await loadSignoff(direct);
    if (parsed && parsed.kind === stageId && parsed.sha === head) {
      if (isPassVerdict(parsed.verdict)) {
        return {
          gate: stageId,
          required: true,
          state: "fresh",
          sha: head,
          reviewer: parsed.reviewer,
          verdict: parsed.verdict,
          evidence: parsed.evidence,
        };
      }
      return {
        gate: stageId,
        required: true,
        state: "fail",
        sha: head,
        reviewer: parsed.reviewer,
        verdict: parsed.verdict,
        evidence: parsed.evidence,
      };
    }
  }
  const files = await signoffFilesForStage(changePath, stageId);
  let staleSha: string | undefined;
  for (const file of files) {
    const parsed = await loadSignoff(file.path);
    if (!parsed || parsed.kind !== stageId) continue;
    if (parsed.sha === head && isPassVerdict(parsed.verdict)) {
      return {
        gate: stageId,
        required: true,
        state: "fresh",
        sha: head,
        reviewer: parsed.reviewer,
        verdict: parsed.verdict,
        evidence: parsed.evidence,
      };
    }
    if (parsed.sha !== head && isPassVerdict(parsed.verdict)) {
      staleSha = parsed.sha;
    }
  }
  if (staleSha) {
    return { gate: stageId, required: true, state: "stale", stale_sha: staleSha };
  }
  return { gate: stageId, required: true, state: "missing" };
}

export async function gateStatusReport(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { headSha?: string | null },
): Promise<GateStatusReport> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const headSha = opts?.headSha !== undefined ? opts.headSha : await getHeadSha(projectRoot);
  const gateIds = mergeRequiredGateIds(ctx.workflow);
  const gates: GateVerdictRow[] = [];
  if (!headSha) {
    for (const gate of gateIds) {
      gates.push({ gate, required: true, state: "missing" });
    }
    return { changeId, headSha: null, gates, mergeReady: false };
  }
  for (const gate of gateIds) {
    gates.push(await evaluateGateVerdict(ctx.path, gate, headSha));
  }
  const mergeReady = gates.length > 0 && gates.every((row) => row.state === "fresh");
  return { changeId, headSha, gates, mergeReady: gates.length === 0 ? true : mergeReady };
}

export function formatGateStatusReport(report: GateStatusReport): string {
  const lines: string[] = [];
  lines.push(`Change: ${report.changeId}`);
  lines.push(report.headSha ? `HEAD: ${report.headSha}` : "HEAD: unavailable");
  if (!report.gates.length) {
    lines.push("Merge gates: (none configured)");
    lines.push("Merge ready: yes");
    return `${lines.join("\n")}\n`;
  }
  lines.push("Required gates:");
  for (const row of report.gates) {
    if (row.state === "fresh") {
      lines.push(
        `  ${row.gate}: pass on ${row.sha} (${row.reviewer ?? "unknown"}; verdict ${row.verdict})`,
      );
    } else if (row.state === "stale") {
      lines.push(`  ${row.gate}: stale (last pass on ${row.stale_sha})`);
    } else if (row.state === "fail") {
      lines.push(`  ${row.gate}: fail on ${row.sha} (${row.verdict})`);
    } else {
      lines.push(`  ${row.gate}: missing for this HEAD`);
    }
  }
  lines.push(`Merge ready: ${report.mergeReady ? "yes" : "no"}`);
  return `${lines.join("\n")}\n`;
}

export async function assertMergeGates(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { headSha?: string | null },
): Promise<{ ok: true; headSha: string } | { ok: false; message: string }> {
  const report = await gateStatusReport(projectRoot, config, changeId, opts);
  if (!report.headSha) {
    return { ok: false, message: "Cannot merge: Git HEAD is unavailable." };
  }
  if (!report.gates.length) {
    return { ok: true, headSha: report.headSha };
  }
  const blockers = report.gates.filter((row) => row.state !== "fresh");
  if (blockers.length) {
    const parts = blockers.map((row) => {
      if (row.state === "stale") return `${row.gate} (stale at ${row.stale_sha})`;
      if (row.state === "fail") return `${row.gate} (fail)`;
      return `${row.gate} (missing)`;
    });
    return {
      ok: false,
      message: `Merge blocked: required gates are not fresh on HEAD ${report.headSha}: ${parts.join(", ")}. Run \`sdd gate status ${changeId}\`.`,
    };
  }
  return { ok: true, headSha: report.headSha };
}
