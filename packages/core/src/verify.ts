import { spawn } from "node:child_process";
import { join } from "pathe";
import type { Config } from "./schemas.js";
import { buildContext, saveChangeMeta } from "./change.js";
import { getStage } from "./workflow.js";
import { ensureDir, writeText, pathExists } from "./fs.js";
import { nowIso } from "./slug.js";

export interface VerifyResult {
  stageId: string;
  results: { name: string; command: string; exitCode: number | null; output: string }[];
  checklist: string[];
  evidencePath: string;
  /** False if any required command failed or was not run when required */
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

  const evidenceDir =
    stage.verify?.evidence_dir != null
      ? join(ctx.path, stage.verify.evidence_dir)
      : join(ctx.path, "evidence", "local");
  await ensureDir(evidenceDir);

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
      const logPath = join(evidenceDir, `${cmd.name.replace(/\s+/g, "-")}.log`);
      await writeText(
        logPath,
        `# ${cmd.name}\n$ ${cmd.run}\nexit: ${exitCode}\n\n${output}`,
      );
    }
  }

  // ok: all required commands that were configured must have exit 0
  const required = commands.filter((c) => c.required);
  let ok = true;
  if (required.length) {
    if (!runCommands) {
      ok = false;
    } else {
      for (const cmd of required) {
        const r = results.find((x) => x.name === cmd.name);
        if (!r || r.exitCode !== 0) ok = false;
      }
    }
  } else if (commands.length && runCommands) {
    // optional commands: ok if all that ran succeeded (informational)
    ok = results.every((r) => r.exitCode === 0);
  }

  const checklist = stage.gate?.checklist ?? [];
  const summaryPath = join(ctx.path, "local-test-results.md");
  const lines = [
    `# Local verify results`,
    ``,
    `> Change: ${ctx.meta.title}`,
    `> Stage: ${stage.id}`,
    `> At: ${nowIso()}`,
    `> Overall: ${ok ? "PASS" : "FAIL"}`,
    ``,
    `## Commands`,
    ``,
  ];
  if (results.length === 0) {
    lines.push(`_No commands configured for this stage. Complete the checklist manually._`);
    lines.push("");
  } else {
    for (const r of results) {
      lines.push(`### ${r.name}`);
      lines.push(`- Command: \`${r.command}\``);
      lines.push(`- Exit: ${r.exitCode}`);
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

  if (await pathExists(summaryPath)) {
    const stamp = nowIso();
    await writeText(
      join(evidenceDir, `run-${stamp.replace(/[:.]/g, "-")}.md`),
      lines.join("\n"),
    );
  } else {
    await writeText(summaryPath, lines.join("\n"));
  }

  // Persist for gate / complete checks
  ctx.meta.verify_results = {
    ...ctx.meta.verify_results,
    [stage.id]: {
      ok,
      at: nowIso(),
      results: results.map((r) => ({ name: r.name, exitCode: r.exitCode })),
    },
  };
  await saveChangeMeta(projectRoot, config, ctx.meta);

  return {
    stageId: stage.id,
    results,
    checklist,
    evidencePath: evidenceDir,
    ok,
  };
}
