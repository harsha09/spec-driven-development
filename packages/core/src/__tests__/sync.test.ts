import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { createChange, initProject, loadConfig, saveChangeMeta, syncChangeHead } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "sdd-sync-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  const config = await loadConfig(root);
  const change = await createChange({
    projectRoot: root,
    config,
    title: "Sync verify references",
    workflowName: "hotfix",
  });
  const context = await import("../change-context.js").then(({ loadChangeMeta }) =>
    loadChangeMeta(root, config, change.id),
  );
  context.verify_results = {
    build: {
      ok: true,
      status: "pass",
      head_sha: "a".repeat(40),
      at: context.created,
      results: [{ name: "build", exitCode: 0 }],
    },
    local_verify: {
      ok: true,
      status: "pass",
      head_sha: "a".repeat(40),
      at: context.created,
      results: [{ name: "tests", exitCode: 0 }],
    },
  };
  await saveChangeMeta(root, config, context);
  return { root, config, change };
}

describe("syncChangeHead", () => {
  it("updates metadata and only the marked SDD report region", async () => {
    const { root, config, change } = await setup();
    const oldSha = "a".repeat(40);
    const newSha = "b".repeat(40);
    const reportPath = join(change.path, "local-test-results.md");
    await writeFile(
      reportPath,
      `# Local verify results\n\nHuman note stays.\n<!-- sdd:verify stage="build" head_sha="${oldSha}" result_count="1" -->\n<!-- sdd:verify stage="local_verify" head_sha="${oldSha}" result_count="1" -->\nFooter stays.\n`,
    );

    const result = await syncChangeHead(root, config, change.id, { headSha: newSha });
    const synced = await import("../change-context.js").then(({ loadChangeMeta }) =>
      loadChangeMeta(root, config, change.id),
    );
    const report = await readFile(reportPath, "utf8");

    expect(result).toMatchObject({
      headSha: newSha,
      updatedResults: 2,
      reportUpdated: true,
      reportPreserved: false,
    });
    expect(synced.verify_results.local_verify?.head_sha).toBe(newSha);
    expect(synced.verify_results.local_verify?.results).toEqual([{ name: "tests", exitCode: 0 }]);
    expect(report).toContain("Human note stays.");
    expect(report).toContain(`stage="build" head_sha="${newSha}" result_count="1"`);
    expect(report).toContain(`stage="local_verify" head_sha="${newSha}" result_count="1"`);
    expect(report).toContain("Footer stays.");
  });

  it("leaves an unmarked human-authored report byte-identical", async () => {
    const { root, config, change } = await setup();
    const reportPath = join(change.path, "local-test-results.md");
    const humanReport = "# My verification notes\n\nKeep this SHA: " + "a".repeat(40) + "\n";
    await writeFile(reportPath, humanReport);

    const result = await syncChangeHead(root, config, change.id, { headSha: "b".repeat(40) });

    expect(result).toMatchObject({
      updatedResults: 2,
      reportUpdated: false,
      reportPreserved: true,
    });
    expect(await readFile(reportPath, "utf8")).toBe(humanReport);
  });
});
