import { spawn } from "node:child_process";
import { join } from "pathe";
import { buildContext, saveChangeMeta } from "./change.js";
import { ensureDir, pathExists, readText, writeText } from "./fs.js";
import type { Config } from "./schemas.js";
import { nowIso } from "./slug.js";
import { getStage } from "./workflow.js";

/** pass: every command ran and exited 0 · fail: a command failed · not_run: nothing was executed */
export type VerifyStatus = "pass" | "fail" | "not_run";

export interface VerifyResult {
  stageId: string;
  /** Overall outcome; never "pass" unless at least one command ran and all exited 0 */
  status: VerifyStatus;
  /** Why the status is not "pass" (human readable) */
  reason?: string;
  results: { name: string; command: string; exitCode: number | null; output: string }[];
  checklist: string[];
  /** Path to evidence dir when configured; null when no evidence_dir is set */
  evidencePath: string | null;
  /** local-test-results.md that was written; null when nothing was recorded (wrong stage) */
  resultsPath: string | null;
  /** True only when status is "pass" */
  ok: boolean;
}

function runCommand(
  command: string,
  cwd: string,
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });
    let output = "";
    child.stdout?.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.on("close", (code) => {
      resolve({ exitCode: code, output });
    });
    child.on("error", (err) => {
      resolve({ exitCode: 1, output: String(err) });
    });
  });
}

/** True if file looks like a tool-generated stub / previous verify summary we may overwrite. */
function isToolGeneratedResults(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  // Template stubs often start with placeholders or empty checklist guidance
  if (trimmed.includes("{{") || trimmed.includes("TODO")) return true;
  // Prior tool-generated verify summaries
  if (trimmed.startsWith("# Local verify results")) return true;
  return false;
}

const STATUS_LABEL: Record<VerifyStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  not_run: "NOT RUN",
};

function buildSummaryLines(
  title: string,
  stageId: string,
  status: VerifyStatus,
  reason: string | undefined,
  results: VerifyResult["results"],
  checklist: string[],
): string[] {
  const lines = [
    `# Local verify results`,
    ``,
    `> Change: ${title}`,
    `> Stage: ${stageId}`,
    `> At: ${nowIso()}`,
    `> Overall: ${STATUS_LABEL[status]}${reason ? ` — ${reason}` : ""}`,
    ``,
    `## Commands`,
    ``,
  ];
  if (results.length === 0) {
    lines.push(`_No commands ran. Complete the checklist manually._`);
    lines.push("");
  } else {
    for (const r of results) {
      lines.push(`### ${r.name}`);
      lines.push(`- Command: \`${r.command}\``);
      lines.push(`- Exit: ${r.exitCode}${r.exitCode === 0 ? "" : " (FAILED)"}`);
      lines.push("");
    }
  }
  lines.push(`## Checklist`);
  lines.push("");
  for (const item of checklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");
  lines.push(`## Notes`);
  lines.push("");
  lines.push(`-`);
  lines.push("");
  return lines;
}

export async function runLocalVerify(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { runCommands?: boolean },
): Promise<VerifyResult> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
  if (!stage) {
    throw new Error(`Unknown stage: ${ctx.meta.stage}`);
  }

  // Wrong stage: nothing to verify here. Report NOT RUN and record nothing.
  if (!stage.verify) {
    const verifyStage = ctx.workflow.stages.find((st) => st.verify);
    return {
      stageId: stage.id,
      status: "not_run",
      reason: verifyStage
        ? `stage "${stage.id}" has no verify step; run sdd verify on "${verifyStage.id}"`
        : `workflow "${ctx.workflow.name}" has no verify step`,
      results: [],
      checklist: [],
      evidencePath: null,
      resultsPath: null,
      ok: false,
    };
  }

  const evidenceDirRaw = stage.verify?.evidence_dir?.trim();
  const evidenceDir =
    evidenceDirRaw && evidenceDirRaw.length > 0 ? join(ctx.path, evidenceDirRaw) : null;

  if (evidenceDir) {
    await ensureDir(evidenceDir);
  }

  const results: VerifyResult["results"] = [];
  const runCommands = opts?.runCommands !== false;
  const commands = stage.verify?.commands ?? [];

  if (runCommands && commands.length) {
    for (const cmd of commands) {
      const { exitCode, output } = await runCommand(cmd.run, projectRoot);
      results.push({
        name: cmd.name,
        command: cmd.run,
        exitCode,
        output: output.slice(0, 50_000),
      });
      if (evidenceDir) {
        const logPath = join(evidenceDir, `${cmd.name.replace(/\s+/g, "-")}.log`);
        await writeText(logPath, `# ${cmd.name}\n$ ${cmd.run}\nexit: ${exitCode}\n\n${output}`);
      }
    }
  }

  // No silent PASS: pass only if commands actually ran and every one exited 0.
  let status: VerifyStatus;
  let reason: string | undefined;
  if (!commands.length) {
    status = "not_run";
    reason = `no verify commands configured for stage "${stage.id}"`;
  } else if (!runCommands) {
    status = "not_run";
    reason = "commands not run (--no-run)";
  } else {
    const failed = results.filter((r) => r.exitCode !== 0).map((r) => r.name);
    status = failed.length ? "fail" : "pass";
    reason = failed.length ? `failed: ${failed.join(", ")}` : undefined;
  }
  const ok = status === "pass";

  const checklist = stage.gate?.checklist ?? [];
  const summaryPath = join(ctx.path, "local-test-results.md");
  const lines = buildSummaryLines(ctx.meta.title, stage.id, status, reason, results, checklist);
  const summaryBody = lines.join("\n");

  if (await pathExists(summaryPath)) {
    const existing = await readText(summaryPath);
    if (isToolGeneratedResults(existing)) {
      // Overwrite tool-generated summary so the file stays one document
      await writeText(summaryPath, summaryBody);
    } else {
      // Preserve substantial user notes; append a dated latest-run section
      const stamp = nowIso();
      const append = [
        ``,
        `---`,
        ``,
        `## Latest run (${stamp})`,
        ``,
        `> Overall: ${STATUS_LABEL[status]}${reason ? ` — ${reason}` : ""}`,
        `> Stage: ${stage.id}`,
        ``,
      ];
      if (results.length === 0) {
        append.push(`_No commands ran._`);
        append.push("");
      } else {
        for (const r of results) {
          append.push(`- **${r.name}**: exit ${r.exitCode} (\`${r.command}\`)`);
        }
        append.push("");
      }
      await writeText(summaryPath, existing.trimEnd() + "\n" + append.join("\n"));
    }
    // Opt-in evidence: also dump a dated run snapshot under evidence
    if (evidenceDir) {
      const stamp = nowIso();
      await writeText(join(evidenceDir, `run-${stamp.replace(/[:.]/g, "-")}.md`), summaryBody);
    }
  } else {
    await writeText(summaryPath, summaryBody);
  }

  // Persist for gate / complete checks
  ctx.meta.verify_results = {
    ...ctx.meta.verify_results,
    [stage.id]: {
      ok,
      status,
      at: nowIso(),
      results: results.map((r) => ({ name: r.name, exitCode: r.exitCode })),
    },
  };
  await saveChangeMeta(projectRoot, config, ctx.meta);

  return {
    stageId: stage.id,
    status,
    reason,
    results,
    checklist,
    evidencePath: evidenceDir,
    resultsPath: summaryPath,
    ok,
  };
}
