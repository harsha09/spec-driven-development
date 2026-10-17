# Code context

> Generated on-demand for agents. Not a substitute for process context
> (.sdd/protocol.md, active-context, change packs).
> Regenerable — run `sdd context --out change` (or pass `--path` / `--symbol`).

## Summary
- Change: Issue #27: synchronize change references to the current commit
- Focus paths: packages/core/src/verify.ts, packages/core/src/change-context.ts, packages/cli/src/commands.ts
- Focus symbols: (none)
- Keywords: recorded, verification, results, git, head, sha, body, gate, status, metadata, sync, issue, synchronize, references, current, commit
- Files analyzed: 3 · Symbols: 16 · Slices: 16
- Truncated: no
- Notes: Focus from explicit paths (3); Change signals from: 2026-10-12-issue-27-synchronize-change-references-to-the-current-commit

## Gaps
_None._

## Slices

### `packages/core/src/verify.ts` · `VerifyStatus` (lines 10–10) · seed-path, hop-0, keyword-name×1, exported
```ts
export type VerifyStatus = "pass" | "fail" | "not_run";
```

### `packages/core/src/verify.ts` · `isToolGeneratedResults` (lines 62–79) · seed-path, hop-0, keyword-name×1
```ts
function isToolGeneratedResults(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.includes("{{")) return true;
  if (trimmed.startsWith("# Local verify results")) return true;
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
```

### `packages/core/src/change-context.ts` · `ChangeContext` (lines 13–20) · seed-path, hop-0, exported
```ts
export interface ChangeContext {
  id: string;
  path: string;
  meta: ChangeMeta;
  workflow: Workflow;
  stages: Stage[];
  active: Stage[];
}
```

### `packages/core/src/change-context.ts` · `loadChangeMeta` (lines 22–32) · seed-path, hop-0, exported
```ts
export async function loadChangeMeta(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeMeta> {
  const path = changeMetaPath(projectRoot, config, changeId);
  if (!(await pathExists(path))) {
    throw new Error(`Change not found: ${changeId}`);
  }
  return ChangeMetaSchema.parse(await readYaml(path));
}
```

### `packages/core/src/change-context.ts` · `saveChangeMeta` (lines 34–41) · seed-path, hop-0, exported
```ts
export async function saveChangeMeta(
  projectRoot: string,
  config: Config,
  meta: ChangeMeta,
): Promise<void> {
  meta.updated = nowIso();
  await writeYaml(changeMetaPath(projectRoot, config, meta.id), ChangeMetaSchema.parse(meta));
}
```

### `packages/core/src/change-context.ts` · `buildContext` (lines 43–58) · seed-path, hop-0, exported
```ts
export async function buildContext(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeContext> {
  const meta = await loadChangeMeta(projectRoot, config, changeId);
  const workflow = await loadWorkflow(projectRoot, meta.workflow);
  return {
    id: changeId,
    path: changePath(projectRoot, config, changeId),
    meta,
    workflow,
    stages: resolveStages(workflow, meta),
    active: activeStages(workflow, meta),
  };
}
```

### `packages/core/src/change-context.ts` · `listChanges` (lines 60–62) · seed-path, hop-0, exported
```ts
export async function listChanges(projectRoot: string, config: Config): Promise<string[]> {
  return listDirs(changesDir(projectRoot, config));
}
```

### `packages/core/src/change-context.ts` · `getActiveChangeId` (lines 64–93) · seed-path, hop-0, exported
```ts
export async function getActiveChangeId(
  projectRoot: string,
  config: Config,
): Promise<string | null> {
  const pointer = activePointerPath(projectRoot, config);
  if (await pathExists(pointer)) {
    const id = (await readText(pointer)).trim();
    if (id && (await pathExists(changePath(projectRoot, config, id)))) {
      return id;
    }
    if (id) {
      await writeText(pointer, "");
    }
  }
  const all = await listChanges(projectRoot, config);
  const inProgress: { id: string; updated: string }[] = [];
  for (const id of all) {
    try {
      const meta = await loadChangeMeta(projectRoot, config, id);
      if (meta.status === "in_progress" || meta.status === "blocked") {
        inProgress.push({ id, updated: meta.updated ?? meta.created });
      }
    } catch {
      // ignore corrupt meta
    }
  }
  if (!inProgress.length) return null;
  inProgress.sort((a, b) => b.updated.localeCompare(a.updated));
  return inProgress[0]!.id;
}
```

### `packages/core/src/change-context.ts` · `clearActiveIf` (lines 95–106) · seed-path, hop-0, exported
```ts
export async function clearActiveIf(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  const pointer = activePointerPath(projectRoot, config);
  if (!(await pathExists(pointer))) return;
  const id = (await readText(pointer)).trim();
  if (id === changeId) {
    await writeText(pointer, "");
  }
}
```

### `packages/core/src/change-context.ts` · `setActiveChange` (lines 108–115) · seed-path, hop-0, exported
```ts
export async function setActiveChange(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  await ensureDir(changesDir(projectRoot, config));
  await writeText(activePointerPath(projectRoot, config), `${changeId}\n`);
}
```

### `packages/core/src/change-context.ts` · `resolveChangeId` (lines 117–128) · seed-path, hop-0, exported
```ts
export async function resolveChangeId(
  projectRoot: string,
  config: Config,
  changeId?: string,
): Promise<string> {
  if (changeId) return changeId;
  const active = await getActiveChangeId(projectRoot, config);
  if (!active) {
    throw new Error("No active change. Pass --change <id> or run `sdd new`.");
  }
  return active;
}
```

### `packages/core/src/verify.ts` · `VerifyResult` (lines 12–26) · seed-path, hop-0, exported
```ts
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
```

### `packages/core/src/verify.ts` · `runLocalVerify` (lines 130–271) · seed-path, hop-0, exported
```ts
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
```

### `packages/core/src/verify.ts` · `runCommand` (lines 28–52) · seed-path, hop-0
```ts
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
```

### `packages/core/src/verify.ts` · `buildSummaryLines` (lines 87–128) · seed-path, hop-0
```ts
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
```

### `packages/cli/src/commands.ts` · `commands` (lines 1259–1282) · seed-path, hop-0, exported, huge-file
```ts
export const commands = {
  init,
  new: newCmd,
  greenfield,
  backlog,
  feature,
  status,
  next,
  skip,
  use,
  gate,
  verify,
  complete,
  workflows,
  agent,
  agents,
  checkout: useChange,
  context: contextCmd,
  mcp: mcpCmd,
  metrics: metricsCmd,
  refine,
  doctor,
  help,
};
```

## Structural notes
- Ranked files (sample): packages/core/src/verify.ts, packages/core/src/change-context.ts, packages/cli/src/commands.ts
