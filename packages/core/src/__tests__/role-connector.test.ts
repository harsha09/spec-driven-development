import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { type IssueSource, readConnector, runRoutine } from "../role/connector.js";
import { duplicateRole, editRole, hideRole, pinRole } from "../role/profile.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function source(impl: IssueSource["read"]): { client: IssueSource; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      async read(number) {
        calls += 1;
        return impl(number);
      },
    },
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-connector-"));
  temps.push(root);
  return root;
}

async function writeBuilder(root: string, routines: string): Promise<void> {
  const path = join(root, ".sdd", "roles", "builder.md");
  await mkdir(join(root, ".sdd", "roles"), { recursive: true });
  await writeFile(
    path,
    `---
name: builder
label: Builder
job: Build the change
ask_first: false
pinned: false
hidden: false
${routines}
---
The builder builds the change.
`,
  );
}

describe("sdd role connector", () => {
  it("prints the number, title, and state, and does not invent a missing issue", async () => {
    const ok = source(async (number) => {
      return { ok: true, issue: { number, title: "Role agents", state: "OPEN" } };
    });
    const read = await readConnector({
      verb: "read",
      connector: "github-issue",
      record: "37",
      source: ok.client,
    });
    expect(read).toEqual({ exitCode: 0, stdout: "37\nRole agents\nOPEN" });
    expect(ok.calls()).toBe(1);

    const missing = source(async () => ({ ok: false, missing: true }));
    const gone = await readConnector({
      verb: "read",
      connector: "github-issue",
      record: "37",
      source: missing.client,
    });
    expect(gone).toEqual({ exitCode: 1, stdout: "GitHub issue 37 was not found." });
    expect(gone.stdout).not.toContain("Role agents");
  });

  it("does not call the source for a refusal, a bad number, or another action", async () => {
    const live = source(async () => {
      throw new Error("called");
    });
    const cases: Array<[string, string, string, string]> = [
      ["read", "x", "1", "A connector cannot read or post on X."],
      ["comment", "x", "1", "A connector cannot read or post on X."],
      ["read", "jira", "1", "That connector is not in this slice."],
      ["comment", "github-issue", "37", "That connector action does not run in this slice."],
      ["close", "github-issue", "37", "That connector action does not run in this slice."],
      ["merge", "github-issue", "37", "That connector action does not run in this slice."],
      ["deploy", "github-issue", "37", "That connector action does not run in this slice."],
      ["read", "github-issue", "0", "A GitHub issue number is a positive integer."],
      ["read", "github-issue", "01", "A GitHub issue number is a positive integer."],
    ];
    for (const [verb, connector, record, stdout] of cases) {
      const result = await readConnector({ verb, connector, record, source: live.client });
      expect(result, stdout).toEqual({ exitCode: 1, stdout });
    }
    expect(live.calls()).toBe(0);

    const broken = source(async () => ({
      ok: true,
      issue: { number: 37, title: "", state: "OPEN" },
    }));
    const unread = await readConnector({
      verb: "read",
      connector: "github-issue",
      record: "37",
      source: broken.client,
    });
    expect(unread.stdout).toBe("GitHub issue 37 could not be read.");
    expect(unread.stdout).not.toContain("OPEN");
  });
});

describe("sdd role routine", () => {
  it("repeats the saved read and refuses a write", async () => {
    const root = await tempRoot();
    const live = source(async (number) => {
      return { ok: true, issue: { number, title: "Role agents", state: "OPEN" } };
    });
    await writeBuilder(
      root,
      `routines:
  - name: read-issue-37
    read: github-issue
    record: "37"
  - name: x
    read: github-issue
    record: "37"`,
    );
    const read = await runRoutine(root, "builder", "read-issue-37", live.client);
    expect(read).toEqual({ exitCode: 0, stdout: "37\nRole agents\nOPEN" });
    const namedX = await runRoutine(root, "builder", "x", live.client);
    expect(namedX.exitCode).toBe(0);
    expect(live.calls()).toBe(2);
    expect((await runRoutine(root, "missing", "read-issue-37", live.client)).stdout).toBe(
      "Role not found.",
    );
    expect((await runRoutine(root, "builder", "nope", live.client)).stdout).toBe(
      "That routine is not on this role.",
    );
    expect(live.calls()).toBe(2);

    const missing = source(async () => ({ ok: false, missing: true }));
    const gone = await runRoutine(root, "builder", "read-issue-37", missing.client);
    expect(gone.stdout).toBe("GitHub issue 37 was not found.");

    await writeBuilder(
      root,
      `routines:
  - name: read-issue-37
    read: x
    record: "37"`,
    );
    const refused = await runRoutine(root, "builder", "read-issue-37", live.client);
    expect(refused.stdout).toBe("A connector cannot read or post on X.");
    expect(live.calls()).toBe(2);

    await writeBuilder(
      root,
      `routines:
  - name: read-issue-37
    read: github-issue
    record: "37"
    write: qa`,
    );
    const qa = await runRoutine(root, "builder", "read-issue-37", live.client);
    expect(qa.stdout).toBe("A routine cannot write a QA result.");
    expect(live.calls()).toBe(2);

    await writeBuilder(
      root,
      `routines:
  - name: read-issue-37
    read: github-issue
    record: "37"
    when: daily`,
    );
    const extra = await runRoutine(root, "builder", "read-issue-37", live.client);
    expect(extra.stdout).toBe("Routines on this role are invalid.");
    expect(live.calls()).toBe(2);
  });

  it("keeps the routines block across pin, hide, edit, and duplicate", async () => {
    const root = await tempRoot();
    await writeBuilder(
      root,
      `routines:
  - name: read-issue-37
    read: github-issue
    record: "37"`,
    );
    expect((await pinRole(root, "builder")).exitCode).toBe(0);
    expect((await hideRole(root, "builder")).exitCode).toBe(0);
    expect((await editRole(root, "builder", { job: "Build one change" })).exitCode).toBe(0);
    const live = source(async (number) => {
      return { ok: true, issue: { number, title: "Role agents", state: "OPEN" } };
    });
    expect((await runRoutine(root, "builder", "read-issue-37", live.client)).exitCode).toBe(0);
    expect((await duplicateRole(root, "builder")).exitCode).toBe(0);
    expect((await runRoutine(root, "builder copy", "read-issue-37", live.client)).exitCode).toBe(0);
    expect(live.calls()).toBe(2);
    const raw = await readFile(join(root, ".sdd", "roles", "builder.md"), "utf8");
    expect(raw).toContain("read-issue-37");
    expect(raw).toContain("pinned: true");
    expect(raw).toContain("hidden: true");
    expect(raw).toContain("Build one change");
  });
});
