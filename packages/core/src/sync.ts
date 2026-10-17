import { join } from "pathe";
import { buildContext, saveChangeMeta } from "./change.js";
import { pathExists, readText, writeText } from "./fs.js";
import { getHeadSha } from "./git-head.js";
import type { Config } from "./schemas.js";

const VERIFY_MARKER =
  /<!-- sdd:verify stage="([^"]+)" head_sha="(?:none|[0-9a-f]{40}|[0-9a-f]{64})" result_count="(\d+)" -->/gi;

export interface SyncChangeResult {
  changeId: string;
  headSha: string;
  updatedResults: number;
  reportUpdated: boolean;
  reportPreserved: boolean;
}

export async function syncChangeHead(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { headSha?: string | null },
): Promise<SyncChangeResult> {
  const headSha = opts?.headSha !== undefined ? opts.headSha : await getHeadSha(projectRoot);
  if (!headSha) throw new Error("Cannot sync: Git HEAD is unavailable in this project.");

  const ctx = await buildContext(projectRoot, config, changeId);
  let updatedResults = 0;
  for (const result of Object.values(ctx.meta.verify_results ?? {})) {
    if (!result.results.length || result.head_sha === headSha) continue;
    result.head_sha = headSha;
    updatedResults += 1;
  }
  if (updatedResults) await saveChangeMeta(projectRoot, config, ctx.meta);

  const reportPath = join(ctx.path, "local-test-results.md");
  let reportUpdated = false;
  let reportPreserved = false;
  if (await pathExists(reportPath)) {
    const report = await readText(reportPath);
    const markers = [...report.matchAll(VERIFY_MARKER)];
    if (markers.length) {
      const updated = report.replace(
        VERIFY_MARKER,
        (_marker, stage: string, resultCount: string) =>
          `<!-- sdd:verify stage="${stage}" head_sha="${headSha}" result_count="${resultCount}" -->`,
      );
      if (updated !== report) {
        await writeText(reportPath, updated);
        reportUpdated = true;
      }
    } else {
      reportPreserved = true;
    }
  }

  return { changeId, headSha, updatedResults, reportUpdated, reportPreserved };
}
