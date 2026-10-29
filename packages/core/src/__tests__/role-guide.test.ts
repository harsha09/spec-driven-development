import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, pathExists } from "../index.js";
import { dutyForStage, prepareGuide, runGuide } from "../role/guide.js";
import { createRole, runRole } from "../role/index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function emptyDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-guide-"));
  temps.push(root);
  return root;
}

const DRAFT =
  "Show an empty state when the list has no rows, and keep the person on the same page.";

function model(replies: unknown[] = []): { model: RoleModel; prompts: string[] } {
  const pending = replies.slice();
  const prompts: string[] = [];
  return {
    prompts,
    model: {
      async complete(input) {
        prompts.push(input.prompt);
        const next = pending.shift() ?? { text: DRAFT };
        return typeof next === "string" ? next : JSON.stringify(next);
      },
    },
  };
}

describe("dutyForStage", () => {
  it("keeps plan on planning and features before architecture on planning", () => {
    const team = [
      "requirements",
      "architecture",
      "stories",
      "plan",
      "tasks",
      "implement",
      "pr_review",
      "acceptance",
    ];
    expect(dutyForStage("plan", team)).toBe("planning");
    expect(dutyForStage("stories", team)).toBe("planning");
    expect(dutyForStage("architecture", team)).toBe("architecture");
    expect(dutyForStage("implement", team)).toBe("construction");
    const greenfield = ["vision", "requirements", "features", "architecture"];
    expect(dutyForStage("features", greenfield)).toBe("planning");
  });
});

describe("prepareGuide", () => {
  it("sets up a folder and writes the three roles for feature", async () => {
    const root = await emptyDir();
    const ready = await prepareGuide(root, { workflow: "feature", agents: false });
    expect(ready.exitCode).toBe(0);
    expect(ready.stdout).toContain("planner: intent, clarify_intent, brainstorm");
    expect(ready.stdout).toContain("architect: design, clarify_design");
    expect(ready.stdout).toContain("builder: tasks, clarify_tasks, implement, local_verify");
    const planner = await readFile(join(root, ".sdd/roles/planner.md"), "utf8");
    expect(planner).toContain("write product code");
    expect(planner).toContain("Who is this for?");
    const again = await prepareGuide(root, { workflow: "hotfix", agents: false });
    expect(again.stdout).toContain("Roles are already here.");
    expect(planner).toContain("clarify_intent");
  });
});

describe("runGuide", () => {
  it("asks one question at a time, then hands the next stage to the next role", async () => {
    const root = await emptyDir();
    const fake = model();
    const first = await runGuide(root, {
      title: "Build an empty state",
      workflow: "feature",
      agents: false,
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(first.exitCode).toBe(0);
    expect(first.stdout.startsWith("Question:")).toBe(true);
    expect(first.stdout).toContain("planner asks:\nWho is this for?");
    expect(fake.prompts).toHaveLength(0);

    const second = await runGuide(root, {
      answer: "people tracking expenses",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:01.000Z"),
    });
    expect(second.stdout).toContain("How will you know it worked?");

    const third = await runGuide(root, {
      answer: "an empty list shows a message",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:02.000Z"),
    });
    expect(third.stdout).toContain("Skipped clarify_intent.");
    expect(third.stdout).toContain("Skipped brainstorm.");
    expect(third.stdout).toContain("Handoff: planner to architect.");
    expect(third.stdout).toContain("Which module owns this change?");
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0]).toContain("Stay inside this role.");
    expect(fake.prompts[0]).toContain("people tracking expenses");
    const changeDirs = await readFile(join(root, "changes/.active"), "utf8");
    const drafted = await readFile(join(root, "changes", changeDirs.trim(), "feature.md"), "utf8");
    expect(drafted).toContain("The person has not signed it.");
    expect(drafted).toContain(DRAFT);
  });

  it("waits when the role asks one more question", async () => {
    const root = await emptyDir();
    const fake = model([{ text: "Question: Which list is empty?" }]);
    await runGuide(root, {
      title: "Build an empty state",
      workflow: "feature",
      agents: false,
      model: fake.model,
    });
    await runGuide(root, { answer: "people tracking expenses", model: fake.model });
    const asked = await runGuide(root, {
      answer: "an empty list shows a message",
      model: fake.model,
    });
    expect(asked.stdout).toContain("Which list is empty?");
    const changeId = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const meta = await readFile(join(root, "changes", changeId, "meta.yaml"), "utf8");
    expect(meta).toContain("stage: intent");
  });

  it("hands planning to architecture and then to construction", async () => {
    const root = await emptyDir();
    const fake = model();
    await runGuide(root, {
      title: "Build an empty state",
      workflow: "feature",
      agents: false,
      model: fake.model,
    });
    await runGuide(root, { answer: "people tracking expenses", model: fake.model });
    await runGuide(root, { answer: "an empty list shows a message", model: fake.model });
    const done = await runGuide(root, {
      answer: "the list module",
      model: fake.model,
    });
    expect(done.exitCode).toBe(0);
    expect(done.stdout.startsWith("Done.")).toBe(true);
    expect(done.stdout).toContain("Handoff: architect to builder.");
    expect(done.stdout).toContain("builder drafted implement.");
    expect(done.stdout).toContain("The person has not signed this change.");
    const changeId = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const meta = await readFile(join(root, "changes", changeId, "meta.yaml"), "utf8");
    expect(meta).toContain("stage: local_verify");
    expect(meta).toContain("clarify_design");
  });

  it("stops on a human gate and does not sign it", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    await mkdir(join(root, ".sdd/workflows"), { recursive: true });
    await writeFile(
      join(root, ".sdd/workflows/gated.yaml"),
      [
        "name: gated",
        "description: one human gate",
        "version: 1",
        "stages:",
        "  - id: intent",
        "    title: Intent",
        "    kind: standard",
        "    optional: false",
        "    skippable: false",
        "    artifacts:",
        "      - id: feature",
        "        path: feature.md",
        "        required: true",
        "    gate:",
        "      type: hard",
        "      approvers: [human]",
        "",
      ].join("\n"),
      "utf8",
    );
    await createRole(root, {
      name: "planner",
      label: "Planner",
      job: "Plan the change",
      stages: ["intent"],
      never: ["accept a spec", "write product code"],
    });
    const fake = model();
    const result = await runGuide(root, {
      title: "Build an empty state",
      workflow: "gated",
      model: fake.model,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("Stopped.")).toBe(true);
    expect(result.stdout).toContain("planner drafted intent.");
    const changeId = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    expect(await pathExists(join(root, "changes", changeId, "reviews"))).toBe(false);
  });
});

describe("guide purview", () => {
  it("keeps a planner inside the change and lets a builder write a project file", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    await createRole(root, {
      name: "planner",
      label: "Planner",
      job: "Plan the change",
      never: ["write product code"],
    });
    await createRole(root, {
      name: "builder",
      label: "Builder",
      job: "Build the change",
      never: ["accept a spec"],
    });
    const blocked = await runRole(root, {
      name: "planner",
      task: "write the app",
      guide: { changeDir: "changes/demo" },
      model: {
        async complete() {
          return JSON.stringify({
            text: DRAFT,
            action: {
              name: "write_file",
              words: "Save",
              inputs: { path: "src/app.ts", contents: "export const app = 1;\n" },
            },
          });
        },
      },
    });
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stdout).toBe("That file is outside this role.");
    expect(await pathExists(join(root, "src/app.ts"))).toBe(false);

    const secret = await runRole(root, {
      name: "builder",
      task: "write the env",
      guide: { changeDir: "changes/demo" },
      model: {
        async complete() {
          return JSON.stringify({
            text: DRAFT,
            action: {
              name: "write_file",
              words: "Save",
              inputs: { path: ".env", contents: "SECRET=1\n" },
            },
          });
        },
      },
    });
    expect(secret.exitCode).toBe(1);
    expect(await pathExists(join(root, ".env"))).toBe(false);

    const wrote = await runRole(root, {
      name: "builder",
      task: "write the app",
      guide: { changeDir: "changes/demo" },
      model: {
        async complete() {
          return JSON.stringify({
            text: DRAFT,
            action: {
              name: "write_file",
              words: "Save",
              inputs: { path: "src/app.ts", contents: "export const app = 1;\n" },
            },
          });
        },
      },
    });
    expect(wrote.exitCode).toBe(0);
    expect(await readFile(join(root, "src/app.ts"), "utf8")).toContain("export const app");
  });
});
