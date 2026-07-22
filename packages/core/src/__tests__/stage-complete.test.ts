/**
 * Incomplete design must not advance to tasks; fallback restores incomplete stage.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  buildContext,
  canLeaveStage,
  createChange,
  initProject,
  isSubstantiveArtifactContent,
  loadConfig,
  saveChangeMeta,
  skipStage,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function featureProject() {
  const root = await mkdtemp(join(tmpdir(), "sdd-stage-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  const config = await loadConfig(root);
  const ctx = await createChange({
    projectRoot: root,
    config,
    title: "Add export feature",
    workflowName: "feature",
  });
  return { root, config, ctx };
}

describe("isSubstantiveArtifactContent", () => {
  it("rejects empty / template stubs", () => {
    expect(isSubstantiveArtifactContent("# Design\n\n## Approach\n\n-\n")).toBe(false);
    expect(isSubstantiveArtifactContent("<!-- todo -->\n# X\n\n- TBD\n")).toBe(false);
  });

  it("accepts real content", () => {
    const body = `
# Design
## Approach
We will add a CSV exporter service behind the existing reports API, reusing the auth middleware
and streaming rows from the query layer to avoid loading the full result set in memory.
## Risks
Memory pressure on large exports; mitigated by streaming.
`;
    expect(isSubstantiveArtifactContent(body)).toBe(true);
  });
});

describe("cannot leave incomplete design for tasks", () => {
  it("blocks sdd next from design when design.md is still a stub", async () => {
    const { root, config, ctx } = await featureProject();

    // Complete intent with substance
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Feature\n\nUsers need CSV export of reports for offline analysis. Non-goals: PDF. Success: download works for 10k rows.\n",
      "utf8",
    );
    // Skip optional clarify + brainstorm to land on design
    await skipStage(root, config, ctx.id, "clarify_intent", "clear");
    await skipStage(root, config, ctx.id, "brainstorm", "single approach");

    // Advance intent → design (or whatever is next after skips)
    let cur = await buildContext(root, config, ctx.id);
    while (cur.meta.stage !== "design" && cur.meta.stage !== "tasks") {
      const r = await advanceStage(root, config, ctx.id);
      if (!r.to) break;
      cur = r.ctx;
    }
    expect(cur.meta.stage).toBe("design");

    // design.md was materialized as stub — leaving must fail
    const check = await canLeaveStage(cur, config);
    expect(check.ok).toBe(false);
    expect(check.errors.join("\n")).toMatch(/design\.md|incomplete/i);

    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/incomplete|design/i);
  });

  it("falls back to design if meta points at tasks with empty design", async () => {
    const { root, config, ctx } = await featureProject();
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Feature\n\nExport reports as CSV for finance ops. Scope is read-only export of existing report queries only.\n",
      "utf8",
    );
    await skipStage(root, config, ctx.id, "clarify_intent", "clear");
    await skipStage(root, config, ctx.id, "brainstorm", "n/a");

    // Move to design normally
    let cur = await buildContext(root, config, ctx.id);
    while (cur.meta.stage !== "design") {
      const r = await advanceStage(root, config, ctx.id);
      if (!r.to) break;
      cur = r.ctx;
    }

    // Corrupt pointer: jump to tasks without filling design
    cur.meta.stage = "tasks";
    await saveChangeMeta(root, config, cur.meta);

    const result = await advanceStage(root, config, ctx.id);
    expect(result.to).toBe("design");
    expect(result.warnings.join(" ")).toMatch(/Fell back|design/i);
    expect(result.ctx.meta.stage).toBe("design");
  });

  it("allows next after substantive design", async () => {
    const { root, config, ctx } = await featureProject();
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Feature\n\nCSV export for reports used by finance weekly. Must support filters already on the UI.\n",
      "utf8",
    );
    await skipStage(root, config, ctx.id, "clarify_intent", "clear");
    await skipStage(root, config, ctx.id, "brainstorm", "n/a");

    let cur = await buildContext(root, config, ctx.id);
    while (cur.meta.stage !== "design") {
      const r = await advanceStage(root, config, ctx.id);
      if (!r.to) break;
      cur = r.ctx;
    }

    await writeFile(
      join(ctx.path, "design.md"),
      `# Design

## Approach
Stream CSV from the reports query service using the existing ReportQuery API and auth middleware.
Add an ExportController that accepts the same filters as the list endpoint.

## Components
- ExportController
- CsvStreamWriter
- Reuse ReportQueryRepository

## Risks
Large exports — use streaming; timeout for >100k rows with a clear error.
`,
      "utf8",
    );

    await skipStage(root, config, ctx.id, "clarify_design", "clear");
    const next = await advanceStage(root, config, ctx.id);
    expect(["tasks", "clarify_tasks", "implement"]).toContain(next.to);
  });
});
