import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, installAgentIntegration, pathExists } from "../index.js";
import {
  allowRole,
  createRole,
  deleteRole,
  duplicateRole,
  editRole,
  hideRole,
  pinRole,
  runRole,
  showRoles,
} from "../role/index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];
const T0 = "2026-10-19T00:00:00.000Z";
const CHOICE = "Allow once, Always allow, or Deny.";

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-role-"));
  temps.push(root);
  return root;
}

function clock(seconds: number): () => Date {
  return () => new Date(Date.parse(T0) + seconds * 1000);
}

function stamp(seconds: number): string {
  const iso = clock(seconds)().toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) throw new Error("bad clock");
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}

function fake(replies: string[]): {
  model: RoleModel;
  calls: { roleId: string; prompt: string }[];
} {
  const calls: { roleId: string; prompt: string }[] = [];
  return {
    calls,
    model: {
      async complete(input) {
        calls.push(input);
        const next = replies[calls.length - 1];
        if (next === undefined) throw new Error("unexpected model call");
        if (next === "THROW") throw new Error("down");
        return next;
      },
    },
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function builder(root: string, askFirst = false): Promise<void> {
  const result = await createRole(root, {
    name: "builder",
    label: "Builder",
    job: "Implement the accepted change",
    description: "Builds the change",
    askFirst,
  });
  expect(result.exitCode).toBe(0);
}

async function log(root: string, seconds = 0, name = "builder"): Promise<string> {
  return readFile(
    join(root, ".sdd/role-runs/conversation", name, `${stamp(seconds)}.jsonl`),
    "utf8",
  );
}

function recordTypes(body: string): string[] {
  return body
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { type: string }).type);
}

const ACCEPTED = `# Spec

## billing
decision: use-ledger
accepted: yes
- check: CHK-001
- check: CHK-002

## later
decision: wait
accepted: no
- check: CHK-009
`;

async function writeAccepted(root: string): Promise<void> {
  await mkdir(join(root, "changes/issue-37"), { recursive: true });
  await writeFile(join(root, "changes/issue-37/accepted.md"), ACCEPTED, "utf8");
}

describe("role profile", () => {
  it("rejects an empty job and an illegal name without writing a file", async () => {
    const root = await project();
    const empty = await createRole(root, { name: "builder", label: "Builder", job: "  " });
    expect(empty).toEqual({ exitCode: 1, stdout: "A role needs a job." });
    expect(await pathExists(join(root, ".sdd/roles"))).toBe(false);
    expect((await createRole(root, { name: "../builder", label: "B", job: "Work" })).stdout).toBe(
      "A role name is not valid.",
    );
    expect((await createRole(root, { name: ".".repeat(81), label: "B", job: "Work" })).stdout).toBe(
      "A role name is not valid.",
    );
  });

  it("hides without a paused flag, pins first, and duplicates only the profile", async () => {
    const root = await project();
    await builder(root);
    await createRole(root, { name: "aaa", label: "Aaa", job: "Write" });
    await pinRole(root, "builder");
    await hideRole(root, "aaa");
    const hidden = await readFile(join(root, ".sdd/roles/aaa.md"), "utf8");
    expect(hidden).toContain("hidden: true");
    expect(hidden).not.toContain("paused");
    expect(hidden).not.toContain("routine");
    expect((await showRoles(root)).stdout).toBe("builder Builder");
    expect((await showRoles(root, { all: true })).stdout).toBe("builder Builder\naaa Aaa");

    await mkdir(join(root, ".sdd/role-runs/conversation/builder"), { recursive: true });
    await mkdir(join(root, ".sdd/role-runs/memory/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/conversation/builder/old.jsonl"), "{}\n");
    await writeFile(join(root, ".sdd/role-runs/memory/builder/notes.md"), "secret note\n");
    expect((await duplicateRole(root, "builder")).exitCode).toBe(0);
    const copy = await readFile(join(root, ".sdd/roles/builder copy.md"), "utf8");
    expect(copy).toContain("name: builder copy");
    expect(copy).toContain("job: Implement the accepted change");
    expect(copy).toContain("pinned: true");
    expect(await pathExists(join(root, ".sdd/role-runs/conversation/builder copy"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/role-runs/memory/builder copy"))).toBe(false);
    expect((await duplicateRole(root, "builder")).stdout).toBe("Role already exists.");
    const before = await readFile(join(root, ".sdd/roles/builder.md"), "utf8");
    expect((await editRole(root, "builder", { job: " " })).stdout).toBe("A role needs a job.");
    expect(await readFile(join(root, ".sdd/roles/builder.md"), "utf8")).toBe(before);
  });

  it("deletes one role's file, conversation, memory, and allow key", async () => {
    const root = await project();
    await builder(root);
    await createRole(root, { name: "critic", label: "Critic", job: "Review" });
    await mkdir(join(root, ".sdd/role-runs/conversation/builder"), { recursive: true });
    await mkdir(join(root, ".sdd/role-runs/memory/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/conversation/builder/old.jsonl"), "{}\n");
    await writeFile(join(root, ".sdd/role-runs/memory/builder/notes.md"), "note\n");
    await mkdir(join(root, ".sdd/role-runs"), { recursive: true });
    await writeFile(
      join(root, ".sdd/role-runs/allow.json"),
      `${JSON.stringify({
        builder: { name: "write_file", inputs: { path: "a.txt", contents: "a" } },
        critic: { name: "write_file", inputs: { path: "b.txt", contents: "b" } },
      })}\n`,
    );
    await writeFile(join(root, "keep.txt"), "keep\n");
    await mkdir(join(root, "changes"), { recursive: true });
    await writeFile(join(root, "changes/keep.txt"), "keep\n");
    expect((await deleteRole(root, "builder")).exitCode).toBe(0);
    expect(await pathExists(join(root, ".sdd/roles/builder.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/role-runs/conversation/builder"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/role-runs/memory/builder"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/roles/critic.md"))).toBe(true);
    const allow = JSON.parse(await readFile(join(root, ".sdd/role-runs/allow.json"), "utf8")) as {
      critic?: unknown;
      builder?: unknown;
    };
    expect(allow.builder).toBeUndefined();
    expect(allow.critic).toBeTruthy();
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep\n");
    expect(await readFile(join(root, "changes/keep.txt"), "utf8")).toBe("keep\n");
    expect((await deleteRole(root, "missing")).stdout).toBe("Role not found.");
  });
});

describe("role run", () => {
  it("stops before a model call and writes no record", async () => {
    const root = await project();
    await builder(root);
    const { model, calls } = fake([json({ text: "nope" })]);
    const self = await runRole(root, {
      name: "builder",
      task: "look",
      withRole: "builder",
      model,
      now: clock(0),
    });
    expect(self).toEqual({ exitCode: 1, stdout: "A role cannot review itself." });
    for (const task of ["see @X", "https://x.com/a", "https://twitter.com/a"]) {
      const result = await runRole(root, { name: "builder", task, model, now: clock(0) });
      expect(result).toEqual({ exitCode: 1, stdout: "X is not a role tool." });
    }
    const draft = await runRole(root, {
      name: "builder",
      task: "ship",
      kind: "code",
      model,
      now: clock(0),
    });
    expect(draft.stdout).toBe("This needs an accepted section before a draft.");
    expect(draft.stdout).not.toContain("Allow once");
    expect(draft.stdout).not.toContain("Always allow");
    expect(draft.stdout).not.toContain("Deny");
    expect(calls).toEqual([]);
    expect(await pathExists(join(root, ".sdd/role-runs"))).toBe(false);

    await mkdir(join(root, ".sdd/roles"), { recursive: true });
    await writeFile(
      join(root, ".sdd/roles/empty.md"),
      '---\nname: empty\nlabel: Empty\njob: ""\n---\n',
    );
    const empty = await runRole(root, { name: "empty", task: "go", model, now: clock(0) });
    expect(empty.stdout).toBe("A role needs a job.");
    expect(calls).toEqual([]);
  });

  it("drafts a reading and does not write accepted.md or the active pointer", async () => {
    const root = await project();
    await builder(root);
    await mkdir(join(root, "changes"), { recursive: true });
    await writeFile(join(root, "changes/.active"), "missing-change\n");
    const { model } = fake([json({ text: "hello" })]);
    const result = await runRole(root, { name: "builder", task: "say hi", model, now: clock(0) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(result.stdout).not.toContain(CHOICE);
    expect(result.runId).toBe("20261019T000000Z");
    expect(await pathExists(join(root, "changes/issue-37/accepted.md"))).toBe(false);
    expect(await readFile(join(root, "changes/.active"), "utf8")).toBe("missing-change\n");
    expect(await pathExists(join(root, ".sdd/handoff.md"))).toBe(false);
  });

  it("requires a configured model only when a call would run", async () => {
    const root = await project();
    await builder(root);
    const missing = await runRole(root, { name: "builder", task: "hi", now: clock(0) });
    expect(missing).toEqual({ exitCode: 1, stdout: "No role model is configured." });
    expect(await pathExists(join(root, ".sdd/role-runs"))).toBe(false);
    await writeFile(join(root, ".sdd/role.yaml"), "approval_timeout_minutes: -1\n");
    const { model, calls } = fake([json({ text: "nope" })]);
    const invalid = await runRole(root, { name: "builder", task: "hi", model, now: clock(0) });
    expect(invalid.stdout).toBe("role.yaml is invalid");
    await writeFile(join(root, ".sdd/role.yaml"), 'approval_timeout_minutes: "10"\n');
    const quoted = await runRole(root, { name: "builder", task: "hi", model, now: clock(0) });
    expect(quoted.stdout).toBe("role.yaml is invalid");
    expect(calls).toEqual([]);
    expect(await pathExists(join(root, ".sdd/role-runs"))).toBe(false);
  });

  it("stores check ids before the model and caps the accuracy loop at three calls", async () => {
    const root = await project();
    await builder(root);
    await createRole(root, { name: "critic", label: "Critic", job: "Find gaps" });
    await writeAccepted(root);
    const before = await readFile(join(root, "changes/issue-37/accepted.md"), "utf8");
    await mkdir(join(root, "changes"), { recursive: true });
    await writeFile(join(root, "changes/.active"), "missing-change\n");
    const replies = [
      json({ text: "draft one" }),
      json({ text: "gap", gaps: [{ cite: "CHK-001", text: "missing state" }] }),
      json({
        text: "draft two",
        changed: ["CHK-001"],
        action: {
          name: "write_file",
          words: "Save src/a.ts",
          inputs: { path: "src/a.ts", contents: "ok\n" },
        },
      }),
      json({ text: "pass four" }),
    ];
    const calls: { roleId: string; prompt: string }[] = [];
    const model: RoleModel = {
      async complete(input) {
        if (calls.length === 0) {
          const stored = await readFile(
            join(root, ".sdd/role-runs/conversation/builder/20261019T000000Z.jsonl"),
            "utf8",
          );
          expect(stored).toContain("CHK-001");
          expect(stored).toContain("CHK-002");
        }
        calls.push(input);
        const next = replies[calls.length - 1];
        if (next === undefined) throw new Error("pass 4 started");
        return next;
      },
    };
    const result = await runRole(root, {
      name: "builder",
      task: "add the empty state",
      withRole: "critic",
      kind: "code",
      section: "billing",
      change: "issue-37",
      model,
      now: clock(0),
    });
    expect(calls.map((call) => call.roleId)).toEqual(["builder", "critic", "builder"]);
    expect(calls[1]?.prompt).toContain("CHK-001");
    expect(calls[1]?.prompt).toContain("CHK-002");
    expect(calls[1]?.prompt).toContain("draft one");
    expect(result.stdout).toBe(`Save src/a.ts\n${CHOICE}`);
    expect(recordTypes(await log(root))).toContain("pending");
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    expect(await readFile(join(root, "changes/issue-37/accepted.md"), "utf8")).toBe(before);
    expect(await readFile(join(root, "changes/.active"), "utf8")).toBe("missing-change\n");

    const allowed = await allowRole(root, { runId: stamp(0), mode: "once", now: clock(60) });
    expect(allowed.exitCode).toBe(0);
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    expect(recordTypes(await log(root))).toContain("applied");
    expect(await readFile(join(root, "changes/.active"), "utf8")).toBe("missing-change\n");
  });

  it("rejects a bad cite, skips revision when there are no gaps, and does not start pass 4", async () => {
    const root = await project();
    await builder(root);
    await createRole(root, { name: "critic", label: "Critic", job: "Find gaps" });
    await writeAccepted(root);
    const bad = fake([
      json({
        text: "draft one",
        action: { name: "write_file", words: "Save", inputs: { path: "src/a.ts", contents: "x" } },
      }),
      json({ text: "no", gaps: [{ cite: "NOPE", text: "missing" }] }),
      json({ text: "should not run" }),
    ]);
    const badResult = await runRole(root, {
      name: "builder",
      task: "check",
      withRole: "critic",
      kind: "scenario",
      section: "billing",
      change: "issue-37",
      model: bad.model,
      now: clock(0),
    });
    expect(bad.calls).toHaveLength(2);
    expect(badResult.exitCode).toBe(1);
    expect(badResult.stdout).toBe("draft one");
    expect(badResult.stdout).not.toContain(CHOICE);
    expect(recordTypes(await log(root))).not.toContain("pending");

    const empty = fake([
      json({
        text: "draft one",
        action: { name: "write_file", words: "Save", inputs: { path: "src/b.ts", contents: "b" } },
      }),
      json({ text: "no gaps", gaps: [] }),
      json({ text: "should not run" }),
    ]);
    const emptyResult = await runRole(root, {
      name: "builder",
      task: "check",
      withRole: "critic",
      kind: "release",
      section: "billing",
      change: "issue-37",
      model: empty.model,
      now: clock(1),
    });
    expect(empty.calls).toHaveLength(2);
    expect(emptyResult.stdout).toBe(`Save\n${CHOICE}`);

    const mismatch = fake([
      json({ text: "draft one" }),
      json({ text: "gap", gaps: [{ cite: "billing:use-ledger", text: "cite the decision" }] }),
      json({ text: "draft two", changed: ["CHK-001"] }),
      json({ text: "pass four" }),
    ]);
    const mismatchResult = await runRole(root, {
      name: "builder",
      task: "check",
      withRole: "critic",
      kind: "code",
      section: "billing",
      change: "issue-37",
      model: mismatch.model,
      now: clock(2),
    });
    expect(mismatch.calls).toHaveLength(3);
    expect(mismatchResult.exitCode).toBe(1);
    expect(mismatchResult.stdout).toBe("draft one");
    expect(recordTypes(await log(root, 2))).not.toContain("pending");

    const cited = fake([
      json({ text: "draft one" }),
      json({ text: "gap", gaps: [{ cite: "billing:use-ledger", text: "cite the decision" }] }),
      json({ text: "draft two", changed: ["billing:use-ledger"] }),
      json({ text: "pass four" }),
    ]);
    const citedResult = await runRole(root, {
      name: "builder",
      task: "check",
      withRole: "critic",
      kind: "code",
      section: "billing",
      change: "issue-37",
      model: cited.model,
      now: clock(3),
    });
    expect(cited.calls).toHaveLength(3);
    expect(citedResult.exitCode).toBe(0);
    expect(citedResult.stdout).toBe("draft two");
  });

  it("rejects forbidden actions before they run", async () => {
    const root = await project();
    await builder(root);
    const names = [
      "accept_spec",
      "replace_decision",
      "write_qa",
      "generate_release",
      "sdd_next",
      "sdd_complete",
      "create_change",
    ];
    for (let i = 0; i < names.length; i++) {
      const { model } = fake([
        json({ text: "draft", action: { name: names[i], words: "Do it", inputs: {} } }),
      ]);
      const result = await runRole(root, { name: "builder", task: "go", model, now: clock(i) });
      expect(result.stdout).toBe("draft\nA role cannot do that.");
      expect(result.stdout).not.toContain(CHOICE);
      expect(recordTypes(await log(root, i))).toContain("rejected");
      expect(recordTypes(await log(root, i))).not.toContain("pending");
    }
  });

  it("allows write_file once, matches always-allow inputs, and denies without writing", async () => {
    const root = await project();
    await builder(root);
    const action = {
      name: "write_file",
      words: "Save the empty state",
      inputs: { path: "src/a.ts", contents: "ok\n" },
    };
    const first = fake([json({ text: "draft", action })]);
    const opened = await runRole(root, {
      name: "builder",
      task: "save",
      model: first.model,
      now: clock(0),
    });
    expect(opened.stdout).toBe(`Save the empty state\n${CHOICE}`);
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    await allowRole(root, { runId: stamp(0), mode: "always", now: clock(30) });
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    expect(await readFile(join(root, ".sdd/role-runs/allow.json"), "utf8")).toContain(
      '"tool": "write_file"',
    );

    const second = fake([
      json({
        text: "again",
        action: { ...action, inputs: { contents: "ok\n", path: "src/a.ts" } },
      }),
    ]);
    const repeated = await runRole(root, {
      name: "builder",
      task: "save",
      model: second.model,
      now: clock(1),
    });
    expect(repeated.stdout).toBe("again");
    expect(repeated.stdout).not.toContain(CHOICE);
    expect(recordTypes(await log(root, 1))).toContain("applied");
    expect(recordTypes(await log(root, 1))).not.toContain("pending");

    const third = fake([
      json({
        text: "other",
        action: { ...action, inputs: { path: "src/a.ts", contents: "no\n" } },
      }),
    ]);
    const different = await runRole(root, {
      name: "builder",
      task: "save",
      model: third.model,
      now: clock(2),
    });
    expect(different.stdout).toContain(CHOICE);
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    await allowRole(root, { runId: stamp(2), mode: "deny", now: clock(40) });
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    expect(recordTypes(await log(root, 2))).toContain("denied");

    const safe = fake([
      json({
        text: "note",
        action: {
          name: "write_file",
          words: "Save note",
          inputs: { path: "notes/not-accepted.md", contents: "note\n" },
        },
      }),
    ]);
    await runRole(root, { name: "builder", task: "note", model: safe.model, now: clock(3) });
    expect(
      (await allowRole(root, { runId: stamp(3), mode: "once", now: clock(50) })).exitCode,
    ).toBe(0);
    expect(await readFile(join(root, "notes/not-accepted.md"), "utf8")).toBe("note\n");

    const blocked = [
      "changes/issue-37/accepted.md",
      "changes/.active",
      ".sdd/roles/extra.md",
      "../sdd-role-not-written.txt",
      "/tmp/sdd-role-not-written.txt",
    ];
    for (let i = 0; i < blocked.length; i++) {
      const target = blocked[i] ?? "";
      const { model } = fake([
        json({
          text: "no",
          action: {
            name: "write_file",
            words: "Write",
            inputs: { path: target, contents: "no\n" },
          },
        }),
      ]);
      await runRole(root, { name: "builder", task: "no", model, now: clock(10 + i) });
      const refused = await allowRole(root, {
        runId: stamp(10 + i),
        mode: "once",
        now: clock(20 + i),
      });
      expect(refused.stdout).toBe("A role cannot do that.");
      if (target.startsWith("/") || target.startsWith("..")) {
        expect(await pathExists(join(tmpdir(), "sdd-role-not-written.txt"))).toBe(false);
        expect(await pathExists("/tmp/sdd-role-not-written.txt")).toBe(false);
      } else {
        expect(await pathExists(join(root, target))).toBe(false);
      }
    }
  });

  it("stays stopped when ask first is set, even if an always-allow rule matches", async () => {
    const root = await project();
    await builder(root, true);
    await mkdir(join(root, ".sdd/role-runs"), { recursive: true });
    await writeFile(
      join(root, ".sdd/role-runs/allow.json"),
      `${JSON.stringify({
        builder: { name: "write_file", inputs: { contents: "ok\n", path: "src/a.ts" } },
      })}\n`,
    );
    const { model } = fake([
      json({
        text: "draft",
        action: {
          name: "write_file",
          words: "Save src/a.ts",
          inputs: { path: "src/a.ts", contents: "ok\n" },
        },
      }),
    ]);
    const result = await runRole(root, { name: "builder", task: "save", model, now: clock(0) });
    expect(result.stdout).toBe("Save src/a.ts\nAsk first. This stays stopped.");
    expect(result.stdout).not.toContain(CHOICE);
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    const again = await allowRole(root, { runId: stamp(0), mode: "always", now: clock(30) });
    expect(again.stdout).toBe("Ask first. This stays stopped.");
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    await allowRole(root, { runId: stamp(0), mode: "deny", now: clock(40) });
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    expect(recordTypes(await log(root))).toContain("denied");
  });

  it("expires an approval and does not save a rule from an expired stop", async () => {
    const root = await project();
    await builder(root);
    const { model } = fake([
      json({
        text: "draft",
        action: {
          name: "write_file",
          words: "Save",
          inputs: { path: "src/a.ts", contents: "ok\n" },
        },
      }),
    ]);
    await runRole(root, { name: "builder", task: "save", model, now: clock(0) });
    const pending = JSON.parse((await log(root)).trim().split("\n").at(-1) ?? "{}") as {
      expiresAt?: string;
    };
    expect(pending.expiresAt).toBe("2026-10-19T00:10:00.000Z");
    const expired = await allowRole(root, { runId: stamp(0), mode: "always", now: clock(600) });
    expect(expired.stdout).toBe("Expired. The action did not run.");
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/role-runs/allow.json"))).toBe(false);

    await writeFile(join(root, ".sdd/role.yaml"), "approval_timeout_minutes: 0\n");
    const zero = fake([
      json({
        text: "draft",
        action: {
          name: "write_file",
          words: "Save",
          inputs: { path: "src/b.ts", contents: "b\n" },
        },
      }),
    ]);
    await runRole(root, { name: "builder", task: "save", model: zero.model, now: clock(1) });
    const immediate = await allowRole(root, { runId: stamp(1), mode: "once", now: clock(1) });
    expect(immediate.stdout).toBe("Expired. The action did not run.");
    expect(await pathExists(join(root, "src/b.ts"))).toBe(false);
  });

  it("records commit as unavailable and stop leaves an applied file in place", async () => {
    const root = await project();
    await builder(root);
    const { model, calls } = fake([
      json({ text: "draft", action: { name: "commit", words: "Commit the change", inputs: {} } }),
    ]);
    const result = await runRole(root, { name: "builder", task: "ship", model, now: clock(0) });
    expect(result.stdout).toBe(`Commit the change\n${CHOICE}`);
    const allowed = await allowRole(root, { runId: stamp(0), mode: "once", now: clock(30) });
    expect(allowed.stdout).toBe("This action is not available in this slice.");
    expect(recordTypes(await log(root))).toContain("unavailable");
    expect(await pathExists(join(root, "src/a.ts"))).toBe(false);

    const write = fake([
      json({
        text: "draft",
        action: {
          name: "write_file",
          words: "Save",
          inputs: { path: "src/a.ts", contents: "ok\n" },
        },
      }),
    ]);
    await runRole(root, { name: "builder", task: "save", model: write.model, now: clock(1) });
    await allowRole(root, { runId: stamp(1), mode: "once", now: clock(40) });
    const before = calls.length + write.calls.length;
    const stopped = await runRole(root, { name: "builder", stop: true });
    expect(stopped.exitCode).toBe(0);
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    expect(recordTypes(await log(root, 1))).toContain("stopped");
    expect(calls.length + write.calls.length).toBe(before);
    for (const [index, name] of ["push", "tag", "pull_request", "merge", "deploy"].entries()) {
      const extra = fake([json({ text: "draft", action: { name, words: "Run it", inputs: {} } })]);
      await runRole(root, {
        name: "builder",
        task: name,
        model: extra.model,
        now: clock(10 + index),
      });
      const refused = await allowRole(root, {
        runId: stamp(10 + index),
        mode: "always",
        now: clock(30),
      });
      expect(refused.stdout).toBe("This action is not available in this slice.");
      expect(await pathExists(join(root, ".sdd/role-runs/allow.json"))).toBe(false);
    }
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("ok\n");
    expect((await runRole(root, { name: "critic", stop: true })).stdout).toBe("Role not found.");
    await deleteRole(root, "builder");
    await builder(root);
    expect((await runRole(root, { name: "builder", stop: true })).stdout).toBe("Run not found.");
    expect((await allowRole(root, { runId: "missing", mode: "once" })).stdout).toBe(
      "Run not found.",
    );
  });

  it("uses one author call when the other role is not reviewing an accepted section", async () => {
    const root = await project();
    await builder(root);
    await createRole(root, { name: "critic", label: "Critic", job: "Find gaps" });
    const { model, calls } = fake([json({ text: "note" })]);
    const result = await runRole(root, {
      name: "builder",
      task: "read this",
      withRole: "critic",
      kind: "reading",
      model,
      now: clock(0),
    });
    expect(result.stdout).toBe("note");
    expect(calls.map((call) => call.roleId)).toEqual(["builder"]);
  });

  it("spends a bad model call and does not retry it", async () => {
    const root = await project();
    await builder(root);
    const { model, calls } = fake(["not-json", json({ text: "retry" })]);
    const result = await runRole(root, { name: "builder", task: "hi", model, now: clock(0) });
    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await log(root)).toContain('{"type":"bad_call","roleId":"builder"}');
  });

  it("still installs only a host stub", async () => {
    const root = await project();
    await initProject({ projectRoot: root, agents: false });
    await installAgentIntegration({ projectRoot: root, target: "copilot", force: true });
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/roles"))).toBe(false);
  });
});
