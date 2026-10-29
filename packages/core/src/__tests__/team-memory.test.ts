import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  addLesson,
  createRole,
  deleteRole,
  initProject,
  migrateTeamMemory,
  pathExists,
  showMemory,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-mem-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

async function team(root: string): Promise<void> {
  await writeFile(
    join(root, ".sdd", "team.yaml"),
    [
      "branch: bot/{bot}/{change}",
      "rooms:",
      "  commit: false",
      "bots:",
      "  - name: builder",
      "    role: builder",
      "    wip: 1",
      "humans: []",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("bot memory", () => {
  it("moves legacy memory, leaves an existing file, and keeps the inbox", async () => {
    const root = await project();
    expect((await migrateTeamMemory(root)).stdout).toBe(
      "No team config. Run sdd team init --template software.",
    );
    await team(root);
    await mkdir(join(root, ".sdd/role-runs/memory/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/memory/builder/memory.md"), "old note\n", "utf8");
    await writeFile(join(root, ".sdd/role-runs/memory/builder/notes.md"), "leave this\n", "utf8");
    await mkdir(join(root, ".sdd/agents/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/agents/builder/inbox.jsonl"), "inbox\n", "utf8");
    const moved = await migrateTeamMemory(root);
    expect(moved.stdout).toBe(
      "moved .sdd/role-runs/memory/builder/memory.md -> .sdd/agents/builder/memory.md",
    );
    expect(await readFile(join(root, ".sdd/agents/builder/memory.md"), "utf8")).toBe("old note\n");
    expect(await readFile(join(root, ".sdd/agents/builder/inbox.jsonl"), "utf8")).toBe("inbox\n");
    expect(await pathExists(join(root, ".sdd/role-runs/memory/builder/notes.md"))).toBe(true);

    await writeFile(join(root, ".sdd/role-runs/memory/builder/memory.md"), "newer\n", "utf8");
    const left = await migrateTeamMemory(root);
    expect(left.stdout).toBe("left .sdd/role-runs/memory/builder/memory.md");
    expect(await readFile(join(root, ".sdd/agents/builder/memory.md"), "utf8")).toBe("old note\n");
    expect((await showMemory(root, "builder")).stdout).toBe("old note");
  });

  it("adds a person's lesson and delete keeps the inbox", async () => {
    const root = await project();
    await createRole(root, { name: "builder", label: "Builder", job: "Implement" });
    await team(root);
    expect((await addLesson(root, "builder", "")).stdout).toBe("A lesson needs text.");
    expect((await addLesson(root, "builder", "one\ntwo")).stdout).toBe("A lesson is one line.");
    expect((await addLesson(root, "builder", "check Node engine range")).stdout).toBe(
      "Lesson added.",
    );
    const lesson = await readFile(join(root, ".sdd/agents/builder/lessons.jsonl"), "utf8");
    expect(lesson).toContain("check Node engine range");
    expect(lesson).toContain('"source":"person"');
    await writeFile(join(root, ".sdd/agents/builder/memory.md"), "keep\n", "utf8");
    await writeFile(join(root, ".sdd/agents/builder/inbox.jsonl"), "inbox\n", "utf8");
    await mkdir(join(root, ".sdd/role-runs/memory/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/memory/builder/notes.md"), "note\n", "utf8");
    expect((await deleteRole(root, "builder")).exitCode).toBe(0);
    expect(await pathExists(join(root, ".sdd/agents/builder/memory.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/agents/builder/lessons.jsonl"))).toBe(false);
    expect(await readFile(join(root, ".sdd/agents/builder/inbox.jsonl"), "utf8")).toBe("inbox\n");
    expect(await pathExists(join(root, ".sdd/role-runs/memory/builder"))).toBe(false);
  });
});
