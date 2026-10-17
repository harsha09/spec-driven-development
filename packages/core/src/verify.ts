import { spawn } from "node:child_process";
import { join } from "pathe";
import { buildContext, saveChangeMeta } from "./change.js";
import { ensureDir, pathExists, readText, writeText } from "./fs.js";
import { getHeadSha } from "./git-head.js";
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

/**
 * True when the results file is still an empty template or a previous
 * tool-written summary, so verify may replace it.
 *
 * A filled report is preserved even when it keeps the template heading
 * ("# Local test results"). Appending a second summary under that heading
 * duplicates the document and hides the notes the human already wrote.
 */
function isToolGeneratedResults(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.includes("{{")) return true;
  if (trimmed.startsWith("# Local verify results")) {
    return false;
  }
  if (trimmed.startsWith("<!-- sdd:verify-report:start -->")) {
    return (
      trimmed.includes("<!-- sdd:verify-report:end -->") &&
      /<!-- sdd:verify stage="[^"]+" head_sha="(?:none|[0-9a-f]{40}|[0-9a-f]{64})" result_count="\d+" -->/i.test(
        trimmed,
      )
    );
  }
  if (trimmed.startsWith("# Local test results")) {
    const body = trimmed.replace(/^# Local test results\s*/, "");
    // The shipped template is only a heading, a placeholder table, and sign-off blanks.
    const filled =
      !body.includes("{{") &&
      !body.includes("| 1 | PASS / FAIL |") &&
      !/\bTODO\b/.test(body) &&
      body.length > 80;
    return !filled;
  }
  if (/\bTODO\b/.test(trimmed)) return true;
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
  headSha: string | null,
  status: VerifyStatus,
  reason: string | undefined,
  results: VerifyResult["results"],
  checklist: string[],
): string[] {
  const lines = [
    `<!-- sdd:verify-report:start -->`,
    ``,
    `# Local verify results`,
    ``,
    `> Change: ${title}`,
    `> Stage: ${stageId}`,
    `<!-- sdd:verify stage="${stageId}" head_sha="${headSha ?? "none"}" result_count="${results.length}" -->`,
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
  lines.push(`<!-- sdd:verify-report:end -->`);
  lines.push("");
  return lines;
}

export async function runLocalVerify(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { runCommands?: boolean; headSha?: string | null },
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

  const headSha = opts?.headSha !== undefined ? opts.headSha : await getHeadSha(projectRoot);
  const anyRecordedSha = Object.entries(ctx.meta.verify_results ?? {}).find(
    ([, recorded]) => recorded.head_sha,
  );
  if (anyRecordedSha && !headSha) {
    throw new Error(
      `Cannot validate recorded SHA in ${join(ctx.path, "meta.yaml")} at verify_results.${anyRecordedSha[0]}.head_sha because Git HEAD is unavailable.`,
    );
  }
  for (const [resultStage, recorded] of Object.entries(ctx.meta.verify_results ?? {})) {
    if (recorded.head_sha && headSha && recorded.head_sha !== headSha) {
      throw new Error(
        `Stale SHA in ${join(ctx.path, "meta.yaml")} at verify_results.${resultStage}.head_sha: recorded ${recorded.head_sha}, current HEAD ${headSha}. Run sdd sync ${changeId}.`,
      );
    }
  }

  const summaryPath = join(ctx.path, "local-test-results.md");
  if (await pathExists(summaryPath)) {
    const existing = await readText(summaryPath);
    const markerPattern =
      /<!-- sdd:verify stage="([^"]+)" head_sha="(none|[0-9a-f]{40}|[0-9a-f]{64})" result_count="(\d+)" -->/gi;
    for (const marker of existing.matchAll(markerPattern)) {
      const line = existing.slice(0, marker.index).split("\n").length;
      const reportStage = marker[1]!;
      const reportSha = marker[2]!.toLowerCase();
      const reportResult = ctx.meta.verify_results?.[reportStage];
      if (!reportResult) {
        throw new Error(
          `Missing verification metadata in ${join(ctx.path, "meta.yaml")} for ${summaryPath}:${line} (${reportStage}).`,
        );
      }
      if (reportSha !== "none" && !headSha) {
        throw new Error(
          `Cannot validate SHA in ${summaryPath}:${line} because Git HEAD is unavailable.`,
        );
      }
      if (headSha && reportSha !== "none" && reportSha !== headSha) {
        throw new Error(
          `Stale SHA in ${summaryPath}:${line}: recorded ${reportSha}, current HEAD ${headSha}. Run sdd sync ${changeId}.`,
        );
      }
      if (reportResult && Number(marker[3]) !== reportResult.results.length) {
        throw new Error(
          `Recorded result count mismatch in ${summaryPath}:${line}: report has ${marker[3]}, metadata has ${reportResult.results.length}.`,
        );
      }
      if (reportResult?.head_sha && reportSha !== reportResult.head_sha) {
        throw new Error(
          `SHA mismatch between ${join(ctx.path, "meta.yaml")} and ${summaryPath}:${line}.`,
        );
      }
    }
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
  const lines = buildSummaryLines(
    ctx.meta.title,
    stage.id,
    results.length ? headSha : null,
    status,
    reason,
    results,
    checklist,
  );
  const summaryBody = lines.join("\n");

  if (await pathExists(summaryPath)) {
    const existing = await readText(summaryPath);
    if (isToolGeneratedResults(existing)) {
      // Overwrite tool-generated summary so the file stays one document
      await writeText(summaryPath, summaryBody);
    } else if (results.length === 0) {
      // A filled report plus a run that executed no commands must stay as written.
      // Appending "no commands configured" hides the notes under a second summary.
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
        `<!-- sdd:verify stage="${stage.id}" head_sha="${results.length ? (headSha ?? "none") : "none"}" result_count="${results.length}" -->`,
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
      ...(results.length && headSha ? { head_sha: headSha } : {}),
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
