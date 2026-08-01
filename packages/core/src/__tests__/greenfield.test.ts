/**
 * Greenfield bootstrap: idea → stages → promote → feature start
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  completeChange,
  initProject,
  listBacklogFeatures,
  loadConfig,
  parseFeaturesBacklog,
  pathExists,
  promoteGreenfieldToMemory,
  startFeatureFromBacklog,
  startGreenfield,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

function meat(title: string, extra = ""): string {
  return [
    `# ${title}`,
    ``,
    `Real product prose for the greenfield ${title.toLowerCase()} stage.`,
    `We target remote teams who need a minimal expense tracker with receipts.`,
    `Success means a pilot team submits expenses end-to-end without spreadsheets.`,
    extra,
    ``,
  ].join("\n");
}

const sampleBacklog = `# Feature backlog

## F-001: Capture expense

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** User adds amount, category, and photo receipt.
- **Requirements:** R-001
- **Notes:** Mobile first

## F-002: Monthly report

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** CSV export of approved expenses for the month.
- **Requirements:** R-010
- **Notes:**
`;

describe("parseFeaturesBacklog", () => {
  it("parses F-NNN blocks", () => {
    const features = parseFeaturesBacklog(sampleBacklog, "features.md");
    expect(features).toHaveLength(2);
    expect(features[0]!.id).toBe("F-001");
    expect(features[0]!.name).toBe("Capture expense");
    expect(features[0]!.status).toBe("planned");
    expect(features[0]!.priority).toBe("must");
    expect(features[0]!.summary).toMatch(/receipt/);
    expect(features[1]!.id).toBe("F-002");
    expect(features[1]!.workflow).toBe("feature");
  });
});

describe("greenfield lifecycle", () => {
  it("starts with idea seeded into vision.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gf-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });
    const config = await loadConfig(root);

    const idea = "Team expense tracker for remote startups";
    const { ctx, visionPath } = await startGreenfield({
      projectRoot: root,
      config,
      idea,
    });

    expect(ctx.meta.workflow).toBe("greenfield");
    expect(ctx.meta.stage).toBe("vision");
    expect(ctx.meta.flags?.greenfield).toBe(true);
    expect(ctx.meta.flags?.idea).toBe(idea);
    expect(await pathExists(visionPath)).toBe(true);
    const vision = await readFile(visionPath, "utf8");
    expect(vision).toContain(idea);
    expect(vision).not.toContain("{{idea}}");
    expect(await pathExists(join(root, ".sdd/workflows/greenfield.yaml"))).toBe(true);
  });

  it("rejects empty idea", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gf-empty-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });
    const config = await loadConfig(root);
    await expect(startGreenfield({ projectRoot: root, config, idea: "ab" })).rejects.toThrow(
      /one-line product idea/i,
    );
  });

  it("walks stages, promotes to memory, starts F-001", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gf-full-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });
    const config = await loadConfig(root);

    const idea = "Shared shopping list for roommates";
    const { ctx } = await startGreenfield({ projectRoot: root, config, idea });

    await writeFile(join(ctx.path, "vision.md"), meat("Product vision", idea), "utf8");
    let adv = await advanceStage(root, config, ctx.id);
    expect(adv.to).toBe("requirements");

    await writeFile(
      join(ctx.path, "requirements.md"),
      meat("Requirements", "R-001: Users shall add items. R-002: Users shall mark bought."),
      "utf8",
    );
    adv = await advanceStage(root, config, ctx.id);
    expect(adv.to).toBe("features");

    await writeFile(join(ctx.path, "features.md"), sampleBacklog, "utf8");
    adv = await advanceStage(root, config, ctx.id);
    expect(adv.to).toBe("architecture");

    await writeFile(
      join(ctx.path, "architecture.md"),
      meat(
        "High-level architecture",
        "Mobile clients talk to a simple API and Postgres. No microservices in v1.",
      ),
      "utf8",
    );

    const done = await completeChange(root, config, ctx.id);
    expect(done.ctx.meta.status).toBe("completed");
    expect(done.promoted?.length).toBeGreaterThan(0);
    expect(await pathExists(join(root, "memory/product.md"))).toBe(true);
    expect(await pathExists(join(root, "memory/features.md"))).toBe(true);
    expect(await pathExists(join(root, "memory/requirements.md"))).toBe(true);
    expect(await pathExists(join(root, "memory/architecture.md"))).toBe(true);

    const product = await readFile(join(root, "memory/product.md"), "utf8");
    expect(product).toMatch(/Promoted from greenfield/);

    const { path, features } = await listBacklogFeatures(root, config);
    expect(path).toContain("memory/features.md");
    expect(features.map((f) => f.id)).toEqual(["F-001", "F-002"]);

    const started = await startFeatureFromBacklog({
      projectRoot: root,
      config,
      featureId: "F-001",
    });
    expect(started.ctx.meta.title).toMatch(/F-001/);
    expect(started.ctx.meta.workflow).toBe("feature");
    expect(started.ctx.meta.flags?.from_backlog).toBe("F-001");
    expect(started.feature.name).toBe("Capture expense");

    const backlog = await readFile(join(root, "memory/features.md"), "utf8");
    expect(backlog).toMatch(/## F-001:[\s\S]*?\*\*Status:\*\*\s*in_progress/i);

    // Seeded first artifact is substantive
    const featureMd = await readFile(join(started.ctx.path, "feature.md"), "utf8");
    expect(featureMd).toMatch(/Capture expense|F-001/);
    expect(featureMd).toMatch(/receipt/i);
  });

  it("promoteGreenfieldToMemory skips empty stubs", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gf-promote-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });
    const config = await loadConfig(root);
    const { ctx } = await startGreenfield({
      projectRoot: root,
      config,
      idea: "Tiny note app for students",
    });
    // Only fill vision; leave others as templates
    await writeFile(join(ctx.path, "vision.md"), meat("Product vision"), "utf8");
    const written = await promoteGreenfieldToMemory(root, config, ctx.id);
    expect(written.some((p) => p.includes("product.md"))).toBe(true);
    // requirements template alone is not substantive enough
    expect(written.some((p) => p.includes("requirements.md"))).toBe(false);
  });
});
