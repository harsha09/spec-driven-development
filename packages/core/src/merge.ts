import { spawnSync } from "node:child_process";
import { assertMergeGates } from "./gate-verdicts.js";
import { getHeadSha } from "./git-head.js";
import type { Config } from "./schemas.js";

function git(root: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export interface MergeWithGatesInput {
  projectRoot: string;
  config: Config;
  changeId: string;
  branch: string;
}

export interface MergeWithGatesResult {
  exitCode: number;
  stdout: string;
}

/** Merge a branch only when merge gates pass and HEAD has not moved during the check. */
export async function mergeWithGateGuard(
  input: MergeWithGatesInput,
): Promise<MergeWithGatesResult> {
  const branch = input.branch.trim();
  if (!branch) return { exitCode: 1, stdout: "A branch name is required." };

  const verifyBranch = git(input.projectRoot, ["rev-parse", "--verify", branch]);
  if (!verifyBranch.ok) {
    return { exitCode: 1, stdout: verifyBranch.stderr || `Branch "${branch}" was not found.` };
  }
  const branchHead = verifyBranch.stdout.toLowerCase();

  const allowed = await assertMergeGates(input.projectRoot, input.config, input.changeId, {
    headSha: branchHead,
  });
  if (!allowed.ok) return { exitCode: 1, stdout: allowed.message };

  const headBefore = allowed.headSha;
  const branchAgain = git(input.projectRoot, ["rev-parse", "--verify", branch]);
  if (!branchAgain.ok || branchAgain.stdout.toLowerCase() !== headBefore) {
    const moved = branchAgain.ok ? branchAgain.stdout.toLowerCase() : "unknown";
    return {
      exitCode: 1,
      stdout: `Merge aborted: ${branch} moved from ${headBefore} to ${moved} while merge gates were checked. Re-run \`sdd gate status\` on that branch and try again.`,
    };
  }

  const merge = git(input.projectRoot, ["merge", "--no-edit", branch]);
  if (!merge.ok) {
    return { exitCode: 1, stdout: merge.stderr || merge.stdout || "git merge failed." };
  }

  const after = await getHeadSha(input.projectRoot);
  return {
    exitCode: 0,
    stdout:
      `Merged ${branch} at ${headBefore} with gate guard. Checkout HEAD: ${after ?? "unknown"}.\n${merge.stdout}`.trim(),
  };
}
