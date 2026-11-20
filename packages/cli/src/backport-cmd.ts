import {
  buildContext,
  parseTasksBackportHints,
  resolveBackportTargets,
  resolveChangeId,
  saveChangeMeta,
  tasksMissingTwinPr,
  waiveTwin,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { checkTwinParity, openBackportTwin, refreshTwinGitState } from "./backport-git-ops.js";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

const openCmd = defineCommand({
  meta: {
    name: "open",
    description: "Create twin branch on a backport target and open its pull request",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    target: {
      type: "string",
      description: "Release branch ref (default: first backport_targets entry)",
    },
    base: {
      type: "string",
      description:
        "Branch the change was made against (default: the remote default branch, then main)",
    },
    "dry-pr": {
      type: "boolean",
      description: "Create the twin branch locally only; skip gh pr create",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      const targets = resolveBackportTargets(ctx.meta);
      const target = (args.target?.trim() || targets[0] || "").trim();
      if (!target) {
        emit({
          exitCode: 1,
          stdout: "No backport target. Add backport_targets to meta.yaml or pass --target.",
        });
        return;
      }
      try {
        const opened = await openBackportTwin({
          projectRoot: root,
          meta: ctx.meta,
          target,
          dryPr: args["dry-pr"] === true,
          base: args.base,
        });
        await saveChangeMeta(root, config, opened.meta);
        const lines = [
          `Twin branch: ${opened.branch}`,
          `Cherry-picked ${opened.commitsCherryPicked} commit(s).`,
        ];
        if (opened.prUrl) lines.push(`PR: ${opened.prUrl}`);
        emit({ exitCode: 0, stdout: lines.join("\n") });
      } catch (err) {
        emit({
          exitCode: 1,
          stdout: err instanceof Error ? err.message : String(err),
        });
      }
    });
  },
});

const checkCmd = defineCommand({
  meta: {
    name: "check",
    description: "Compare main vs twin patches; list planning tasks missing a twin PR",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    target: { type: "string", description: "Backport target to check (default: all twins)" },
    plan: {
      type: "boolean",
      description: "Only list tasks tagged needs-backport without a twin PR",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      ctx.meta = await refreshTwinGitState(root, ctx.meta);
      await saveChangeMeta(root, config, ctx.meta);

      const lines: string[] = [];
      let exitCode = 0;

      if (args.plan) {
        const { needsBackport } = await parseTasksBackportHints(ctx.path);
        const missing = tasksMissingTwinPr(ctx.meta, needsBackport);
        if (!missing.length) {
          emit({ exitCode: 0, stdout: "All needs-backport tasks have a twin PR." });
          return;
        }
        for (const task of missing) {
          lines.push(`tasks.md:${task.line} needs-backport ${task.target} — no twin PR`);
        }
        emit({ exitCode: 1, stdout: lines.join("\n") });
        return;
      }

      const twins = ctx.meta.backports ?? [];
      const toCheck = args.target?.trim()
        ? twins.filter((t) => t.target === args.target?.trim())
        : twins;
      if (!toCheck.length) {
        emit({ exitCode: 1, stdout: "No twins to check. Run sdd backport open first." });
        return;
      }

      for (const twin of toCheck) {
        try {
          const { result } = await checkTwinParity(root, ctx.meta, twin.target);
          if (result.ok) {
            lines.push(`${twin.target}: parity ok`);
          } else {
            exitCode = 1;
            lines.push(
              `${twin.target}: parity failed — unlisted: ${result.unlisted.join(", ") || "(none)"}`,
            );
            if (result.allowedDifferent.length) {
              lines.push(`  allowed differences: ${result.allowedDifferent.join(", ")}`);
            }
          }
        } catch (err) {
          exitCode = 1;
          lines.push(`${twin.target}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await saveChangeMeta(root, config, ctx.meta);
      emit({ exitCode, stdout: lines.join("\n") });
    });
  },
});

const waiveCmd = defineCommand({
  meta: {
    name: "waive",
    description: "Mark a backport twin as intentionally not merged",
  },
  args: {
    target: { type: "positional", description: "Backport target ref", required: true },
    change: { type: "string", description: "Change id", alias: "c" },
    reason: { type: "string", description: "Why the twin is waived", alias: "r", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      const target = args.target.trim();
      const reason = (args.reason ?? "").trim();
      if (!reason) {
        emit({ exitCode: 1, stdout: "A reason is required (-r)." });
        return;
      }
      try {
        waiveTwin(ctx.meta, target, reason);
        await saveChangeMeta(root, config, ctx.meta);
        emit({ exitCode: 0, stdout: `Waived backport twin for ${target}.` });
      } catch (err) {
        emit({ exitCode: 1, stdout: err instanceof Error ? err.message : String(err) });
      }
    });
  },
});

export const backportCmd = defineCommand({
  meta: {
    name: "backport",
    description: "Open, check, and track release-branch twin pull requests",
  },
  subCommands: {
    open: openCmd,
    check: checkCmd,
    waive: waiveCmd,
  },
});
