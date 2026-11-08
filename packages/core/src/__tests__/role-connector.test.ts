import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, loadConfig } from "../index.js";
import {
  type ActionsSource,
  type IssueSource,
  type TrackerSource,
  readConnector,
  runRoutine,
} from "../role/connector.js";
import { duplicateRole, editRole, hideRole, pinRole } from "../role/profile.js";
import { type Config, ConfigSchema } from "../schemas.js";

const temps: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    if (!server) continue;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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

function actions(impl: ActionsSource["read"]): { client: ActionsSource; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      async read(id) {
        calls += 1;
        return impl(id);
      },
    },
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-connector-"));
  temps.push(root);
  return root;
}

async function withFakeGh(
  root: string,
  input: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    hang?: boolean;
    token?: string;
  },
  run: () => Promise<{ exitCode: number; stdout: string }>,
): Promise<{ exitCode: number; stdout: string; calls: string }> {
  const bin = join(root, "bin");
  const callsPath = join(root, "calls.txt");
  await mkdir(bin, { recursive: true });
  await writeFile(callsPath, "");
  await writeFile(join(root, "out.txt"), input.stdout ?? "");
  await writeFile(join(root, "err.txt"), input.stderr ?? "");
  const script = input.hang
    ? `#!/bin/sh
printf '%s\\n' "$*" >> "${callsPath}"
exec sleep 60
`
    : `#!/bin/sh
printf '%s\\n' "$*" >> "${callsPath}"
cat "${join(root, "err.txt")}" >&2
cat "${join(root, "out.txt")}"
exit ${input.exitCode ?? 0}
`;
  await writeFile(join(bin, "gh"), script);
  await chmod(join(bin, "gh"), 0o755);
  const previousPath = process.env.PATH ?? "";
  const previousGh = process.env.GH_TOKEN;
  const previousGithub = process.env.GITHUB_TOKEN;
  process.env.PATH = `${bin}:${previousPath}`;
  if (input.token) {
    process.env.GH_TOKEN = input.token;
    process.env.GITHUB_TOKEN = input.token;
  }
  try {
    const result = await run();
    let calls = "";
    try {
      calls = await readFile(callsPath, "utf8");
    } catch {
      calls = "";
    }
    return { ...result, calls };
  } finally {
    process.env.PATH = previousPath;
    restoreEnv("GH_TOKEN", previousGh);
    restoreEnv("GITHUB_TOKEN", previousGithub);
  }
}

function restoreEnv(name: "GH_TOKEN" | "GITHUB_TOKEN", previous: string | undefined): void {
  if (previous === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = previous;
}

async function readThroughGh(input: {
  connector: string;
  record: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  hang?: boolean;
  ghDeadlineMs?: number;
}): Promise<{ exitCode: number; stdout: string; calls: string }> {
  const root = await tempRoot();
  return withFakeGh(root, input, () =>
    readConnector({
      verb: "read",
      connector: input.connector,
      record: input.record,
      ghDeadlineMs: input.ghDeadlineMs,
    }),
  );
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
      ["read", "jira", "1", "Jira record 1 could not be read."],
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

  it("opens one feature change at intent and does not accept the spec", async () => {
    const root = await tempRoot();
    await initProject({ projectRoot: root, agents: false });
    const live = source(async (number) => {
      return { ok: true, issue: { number, title: "Role agents", state: "OPEN" } };
    });
    const config = await loadConfig(root);
    const opened = await readConnector({
      verb: "seed",
      connector: "github-issue",
      record: "37",
      source: live.client,
      projectRoot: root,
      config,
    });
    expect(opened.exitCode).toBe(0);
    const [number, id, stage] = opened.stdout.split("\n");
    expect(number).toBe("37");
    expect(stage).toBe("intent");
    expect(id?.length).toBeGreaterThan(0);
    const meta = await readFile(join(root, "changes", id ?? "", "meta.yaml"), "utf8");
    expect(meta).toContain("title: Role agents");
    expect(meta).toContain("epic: issue-37");
    expect(meta).toContain("stage: intent");
    expect(meta).not.toContain("story:");
    const feature = await readFile(join(root, "changes", id ?? "", "feature.md"), "utf8");
    expect(feature).toContain("## Problem / opportunity\n\n-\n");
    expect(feature).not.toContain("OPEN");
    expect(live.calls()).toBe(1);

    const again = await readConnector({
      verb: "seed",
      connector: "github-issue",
      record: "37",
      source: live.client,
      projectRoot: root,
      config,
    });
    expect(again.exitCode).toBe(0);
    expect(again.stdout.split("\n")[1]).not.toBe(id);
    expect(live.calls()).toBe(2);

    const missing = source(async () => ({ ok: false, missing: true }));
    const before = await readdir(join(root, "changes"));
    const gone = await readConnector({
      verb: "seed",
      connector: "github-issue",
      record: "99",
      source: missing.client,
      projectRoot: root,
      config,
    });
    expect(gone).toEqual({ exitCode: 1, stdout: "GitHub issue 99 was not found." });
    expect(await readdir(join(root, "changes"))).toEqual(before);

    const bare = await tempRoot();
    const failed = await readConnector({
      verb: "seed",
      connector: "github-issue",
      record: "37",
      source: live.client,
      projectRoot: bare,
      config,
    });
    expect(failed).toEqual({
      exitCode: 1,
      stdout: "A change could not be opened for GitHub issue 37.",
    });
    expect(failed.stdout).not.toContain(bare);
  });

  it("prints a Slack or Teams draft and does not send it", async () => {
    const live = source(async () => {
      throw new Error("called");
    });
    const slack = await readConnector({
      verb: "draft",
      connector: "slack",
      record: "The reading is ready",
      source: live.client,
    });
    expect(slack).toEqual({
      exitCode: 0,
      stdout: "slack\nThe reading is ready\nnot sent",
    });
    const teams = await readConnector({
      verb: "draft",
      connector: "teams",
      record: "The reading is ready",
      source: live.client,
    });
    expect(teams).toEqual({
      exitCode: 0,
      stdout: "teams\nThe reading is ready\nnot sent",
    });
    const posted = await readConnector({
      verb: "post",
      connector: "slack",
      record: "The reading is ready",
      source: live.client,
    });
    expect(posted).toEqual({
      exitCode: 1,
      stdout: "That connector action does not run in this slice.",
    });
    expect(posted.stdout).not.toContain("not sent");
    const sent = await readConnector({
      verb: "send",
      connector: "teams",
      record: "The reading is ready",
    });
    expect(sent.stdout).toBe("That connector action does not run in this slice.");
    const namedX = await readConnector({
      verb: "draft",
      connector: "x",
      record: "The reading is ready",
    });
    expect(namedX.stdout).toBe("A connector cannot read or post on X.");
    const empty = await readConnector({ verb: "draft", connector: "slack", record: "  " });
    expect(empty.stdout).toBe("A draft needs text.");
    const other = await readConnector({
      verb: "draft",
      connector: "jira",
      record: "The reading is ready",
      source: live.client,
    });
    expect(other.stdout).toBe("That connector is not in this slice.");
    expect(live.calls()).toBe(0);
  });

  it("reports a missing tracker record and does not invent one", async () => {
    const live = source(async () => {
      throw new Error("called");
    });
    const unread = await readConnector({
      verb: "read",
      connector: "azure-devops",
      record: "42",
      source: live.client,
    });
    expect(unread).toEqual({
      exitCode: 1,
      stdout: "Azure DevOps record 42 could not be read.",
    });
    expect(unread.stdout).not.toContain("title");

    const missing: TrackerSource = {
      async read() {
        return { ok: false, missing: true };
      },
    };
    const gone = await readConnector({
      verb: "read",
      connector: "aha",
      record: "IDEA-9",
      tracker: missing,
      source: live.client,
    });
    expect(gone).toEqual({ exitCode: 1, stdout: "Aha record IDEA-9 was not found." });
    expect(gone.stdout).not.toContain("Idea");

    const found: TrackerSource = {
      async read(id) {
        return { ok: true, record: { id, title: "Role agents", state: "OPEN" } };
      },
    };
    const read = await readConnector({
      verb: "read",
      connector: "asana",
      record: "task-1",
      tracker: found,
      source: live.client,
    });
    expect(read).toEqual({ exitCode: 0, stdout: "task-1\nRole agents\nOPEN" });

    const empty = await readConnector({ verb: "read", connector: "jira", record: " " });
    expect(empty.stdout).toBe("A tracker record id is one line of text.");
    const seeded = await readConnector({
      verb: "seed",
      connector: "jira",
      record: "PROJ-1",
      source: live.client,
    });
    expect(seeded.stdout).toBe("That connector is not in this slice.");
    expect(live.calls()).toBe(0);
  });

  it("prints a failed Actions conclusion and does not invent a missing run", async () => {
    const failed = actions(async (id) => {
      return { ok: true, run: { id, status: "completed", conclusion: "failure" } };
    });
    const read = await readConnector({
      verb: "read",
      connector: "github-actions",
      record: "42",
      actions: failed.client,
    });
    expect(read).toEqual({ exitCode: 0, stdout: "42\ncompleted\nfailure" });
    expect(failed.calls()).toBe(1);

    const missing = actions(async () => ({ ok: false, missing: true }));
    const gone = await readConnector({
      verb: "read",
      connector: "github-actions",
      record: "42",
      actions: missing.client,
    });
    expect(gone).toEqual({ exitCode: 1, stdout: "GitHub Actions run 42 was not found." });
    expect(gone.stdout.toLowerCase()).not.toContain("success");
    expect(missing.calls()).toBe(1);

    const unread = actions(async () => {
      return { ok: true, run: { id: "99", status: "completed", conclusion: "success" } };
    });
    const hidden = await readConnector({
      verb: "read",
      connector: "github-actions",
      record: "42",
      actions: unread.client,
    });
    expect(hidden).toEqual({ exitCode: 1, stdout: "GitHub Actions run 42 could not be read." });
    expect(hidden.stdout.toLowerCase()).not.toContain("success");

    const blank = actions(async (id) => {
      return { ok: true, run: { id, status: "completed", conclusion: "" } };
    });
    const empty = await readConnector({
      verb: "read",
      connector: "github-actions",
      record: "42",
      actions: blank.client,
    });
    expect(empty.exitCode).toBe(1);
    expect(empty.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(empty.stdout.toLowerCase()).not.toContain("success");

    const thrown = actions(async () => {
      throw new Error("success");
    });
    const broke = await readConnector({
      verb: "read",
      connector: "github-actions",
      record: "42",
      actions: thrown.client,
    });
    expect(broke).toEqual({ exitCode: 1, stdout: "GitHub Actions run 42 could not be read." });
    expect(broke.stdout.toLowerCase()).not.toContain("success");

    const live = actions(async () => {
      throw new Error("called");
    });
    const issue = source(async () => {
      throw new Error("called");
    });
    const stopped = [
      ["merge", "That connector action does not run in this slice."],
      ["deploy", "That connector action does not run in this slice."],
      ["promote", "That connector action does not run in this slice."],
      ["seed", "That connector is not in this slice."],
      ["read", "A GitHub Actions run id is a positive integer."],
    ] as const;
    for (const [verb, stdout] of stopped) {
      const record = verb === "read" ? "0" : "42";
      const result = await readConnector({
        verb,
        connector: "github-actions",
        record,
        actions: live.client,
        source: issue.client,
      });
      expect(result, stdout).toEqual({ exitCode: 1, stdout });
    }
    expect(live.calls()).toBe(0);
    expect(issue.calls()).toBe(0);
  });

  it("prints a null conclusion for an in-progress or queued run", async () => {
    const running = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stdout: JSON.stringify({ databaseId: 42, status: "in_progress", conclusion: null }),
    });
    expect(running.exitCode).toBe(0);
    expect(running.stdout).toBe("42\nin_progress\nnull");
    expect(running.stdout.toLowerCase()).not.toMatch(/success|green/);
    expect(running.calls).toContain("run view 42");

    const queued = await readThroughGh({
      connector: "github-actions",
      record: "43",
      stdout: JSON.stringify({ databaseId: 43, status: "queued", conclusion: null }),
    });
    expect(queued.exitCode).toBe(0);
    expect(queued.stdout).toBe("43\nqueued\nnull");
    expect(queued.stdout.toLowerCase()).not.toMatch(/success|green/);
    expect(queued.calls).toContain("run view 43");

    const blank = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stdout: JSON.stringify({ databaseId: 42, status: "completed", conclusion: "" }),
    });
    expect(blank.exitCode).toBe(1);
    expect(blank.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(blank.stdout.toLowerCase()).not.toMatch(/success|green/);

    const garbled = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stdout: JSON.stringify({ databaseId: 42, status: "completed", conclusion: "success\nbad" }),
    });
    expect(garbled.exitCode).toBe(1);
    expect(garbled.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(garbled.stdout.toLowerCase()).not.toMatch(/success|green/);
  });

  it("kills a hung gh and reports the run unreadable", async () => {
    const started = Date.now();
    const hung = await readThroughGh({
      connector: "github-actions",
      record: "42",
      hang: true,
      ghDeadlineMs: 200,
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hung.exitCode).toBe(1);
    expect(hung.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(hung.stdout.toLowerCase()).not.toMatch(/success|green/);
    expect(hung.calls).toContain("run view 42");
  });

  it("treats host resolution as unreadable and HTTP 404 as missing", async () => {
    const host = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stderr: "could not resolve host: api.github.com",
      exitCode: 1,
    });
    expect(host.exitCode).toBe(1);
    expect(host.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(host.stdout).not.toContain("was not found");

    const lookup = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stderr: "dial tcp: lookup api.github.com: no such host",
      exitCode: 1,
    });
    expect(lookup.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(lookup.stdout).not.toContain("was not found");

    const named = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stderr: "host not found",
      exitCode: 1,
    });
    expect(named.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(named.stdout).not.toContain("was not found");

    const missing = await readThroughGh({
      connector: "github-actions",
      record: "99",
      stderr: "failed to get run: HTTP 404",
      exitCode: 1,
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("GitHub Actions run 99 was not found.");

    const namedMissing = await readThroughGh({
      connector: "github-actions",
      record: "99",
      stderr: "run 99 not found",
      exitCode: 1,
    });
    expect(namedMissing.stdout).toBe("GitHub Actions run 99 was not found.");
  });

  it("reports bad JSON as unreadable", async () => {
    const bad = await readThroughGh({
      connector: "github-actions",
      record: "42",
      stdout: "{not json",
    });
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(bad.stdout.toLowerCase()).not.toMatch(/success|green/);
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

  it("repeats a GitHub Actions read and refuses a write", async () => {
    const root = await tempRoot();
    const token = "sdd-routine-token-do-not-print";
    await writeBuilder(
      root,
      `routines:
  - name: read-run-42
    read: github-actions
    record: "42"`,
    );
    const succeeded = await withFakeGh(
      root,
      {
        stdout: JSON.stringify({ databaseId: 42, status: "completed", conclusion: "success" }),
        token,
      },
      () => runRoutine(root, "builder", "read-run-42"),
    );
    expect(succeeded.exitCode).toBe(0);
    expect(succeeded.stdout).toBe("42\ncompleted\nsuccess");
    expect(succeeded.calls).toContain("run view 42");
    expect(succeeded.stdout).not.toContain(token);
    expect(succeeded.calls).not.toContain(token);
    const role = await readFile(join(root, ".sdd", "roles", "builder.md"), "utf8");
    expect(role).not.toContain(token);

    const running = await withFakeGh(
      root,
      {
        stdout: JSON.stringify({ databaseId: 42, status: "in_progress", conclusion: null }),
      },
      () => runRoutine(root, "builder", "read-run-42"),
    );
    expect(running.exitCode).toBe(0);
    expect(running.stdout).toBe("42\nin_progress\nnull");
    expect(running.stdout.toLowerCase()).not.toMatch(/success|green/);

    const missing = await withFakeGh(root, { stderr: "run 42 not found", exitCode: 1 }, () =>
      runRoutine(root, "builder", "read-run-42"),
    );
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("GitHub Actions run 42 was not found.");
    expect(missing.stdout.toLowerCase()).not.toMatch(/success|green/);

    const httpMissing = await withFakeGh(
      root,
      { stderr: "failed to get run: HTTP 404", exitCode: 1 },
      () => runRoutine(root, "builder", "read-run-42"),
    );
    expect(httpMissing.stdout).toBe("GitHub Actions run 42 was not found.");

    const unread = await withFakeGh(root, { stdout: "{not json" }, () =>
      runRoutine(root, "builder", "read-run-42"),
    );
    expect(unread.exitCode).toBe(1);
    expect(unread.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(unread.stdout.toLowerCase()).not.toMatch(/success|green/);

    const host = await withFakeGh(
      root,
      { stderr: "could not resolve host: api.github.com", exitCode: 1 },
      () => runRoutine(root, "builder", "read-run-42"),
    );
    expect(host.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(host.stdout).not.toContain("was not found");

    const started = Date.now();
    const hung = await withFakeGh(root, { hang: true }, () =>
      runRoutine(root, "builder", "read-run-42", undefined, undefined, 200),
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hung.exitCode).toBe(1);
    expect(hung.stdout).toBe("GitHub Actions run 42 could not be read.");
    expect(hung.calls).toContain("run view 42");
    expect(hung.stdout.toLowerCase()).not.toMatch(/success|green/);

    const live = actions(async () => {
      throw new Error("called");
    });
    await writeBuilder(
      root,
      `routines:
  - name: read-run-42
    read: github-actions
    record: "42"
    write: qa`,
    );
    const qa = await runRoutine(root, "builder", "read-run-42", undefined, live.client);
    expect(qa.stdout).toBe("A routine cannot write a QA result.");
    expect(live.calls()).toBe(0);

    await writeBuilder(
      root,
      `routines:
  - name: read-run-42
    read: github-actions
    record: "42"
    when: daily`,
    );
    const scheduled = await runRoutine(root, "builder", "read-run-42", undefined, live.client);
    expect(scheduled.stdout).toBe("Routines on this role are invalid.");
    expect(live.calls()).toBe(0);
  });
});

const JENKINS_TOKEN = "sdd-jenkins-token-do-not-print";

function jenkinsConfig(url: string, tokenEnv = "JENKINS_TOKEN", userEnv?: string): Config {
  return ConfigSchema.parse({
    jenkins: {
      url,
      token_env: tokenEnv,
      ...(userEnv ? { user_env: userEnv } : {}),
    },
  });
}

async function jenkinsServer(
  respond: (req: IncomingMessage, res: ServerResponse, hit: { url: string }) => void,
): Promise<{ url: string; requests: { method: string; url: string; authorization: string }[] }> {
  const requests: { method: string; url: string; authorization: string }[] = [];
  const server = createServer((req, res) => {
    const hit = {
      method: req.method ?? "",
      url: req.url ?? "",
      authorization: req.headers.authorization ?? "",
    };
    requests.push(hit);
    respond(req, res, hit);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function captured(
  run: () => Promise<{ exitCode: number; stdout: string }>,
): Promise<{ exitCode: number; stdout: string; logged: string }> {
  const logged: string[] = [];
  const writeOut = process.stdout.write;
  const writeErr = process.stderr.write;
  const record = (chunk: string | Uint8Array) => {
    logged.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    const result = await run();
    return { ...result, logged: logged.join("") };
  } finally {
    process.stdout.write = writeOut;
    process.stderr.write = writeErr;
  }
}

describe("sdd role connector jenkins", () => {
  it("prints a completed build and does not leak the token", async () => {
    const root = await tempRoot();
    const live = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: false, result: "FAILURE" });
    });
    const read = await captured(() =>
      readConnector({
        verb: "read",
        connector: "jenkins",
        record: "my-job/42",
        projectRoot: root,
        config: jenkinsConfig(live.url),
        env: { JENKINS_TOKEN },
      }),
    );
    expect(read.exitCode).toBe(0);
    expect(read.stdout).toBe("my-job/42\ncompleted\nfailure");
    expect(read.stdout).not.toContain(JENKINS_TOKEN);
    expect(read.logged).not.toContain(JENKINS_TOKEN);
    expect(live.requests).toEqual([
      {
        method: "GET",
        url: "/job/my-job/42/api/json?tree=number,building,result",
        authorization: `Bearer ${JENKINS_TOKEN}`,
      },
    ]);
    expect(live.requests[0]?.url).not.toContain(JENKINS_TOKEN);
    expect(await treeHas(root, JENKINS_TOKEN)).toBe(false);

    const passed = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: false, result: "SUCCESS" });
    });
    const success = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(passed.url),
      env: { JENKINS_TOKEN },
    });
    expect(success).toEqual({ exitCode: 0, stdout: "my-job/42\ncompleted\nsuccess" });
  });

  it("prints an in-progress build without calling it a success", async () => {
    const running = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: true, result: null });
    });
    const read = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(running.url),
      env: { JENKINS_TOKEN },
    });
    expect(read).toEqual({ exitCode: 0, stdout: "my-job/42\nin_progress\nnull" });
    expect(read.stdout.toLowerCase()).not.toMatch(/success|green/);

    const claimed = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: true, result: "SUCCESS" });
    });
    const hidden = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(claimed.url),
      env: { JENKINS_TOKEN },
    });
    expect(hidden.exitCode).toBe(0);
    expect(hidden.stdout).toBe("my-job/42\nin_progress\nnull");
    expect(hidden.stdout.toLowerCase()).not.toMatch(/success|green/);
  });

  it("reports a missing build, an unreadable body, and a timeout", async () => {
    const missing = await jenkinsServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const gone = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(missing.url),
      env: { JENKINS_TOKEN },
    });
    expect(gone).toEqual({ exitCode: 1, stdout: "Jenkins build my-job/42 was not found." });
    expect(gone.stdout.toLowerCase()).not.toMatch(/success|green/);

    const broken = await jenkinsServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not json");
    });
    const unread = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(broken.url),
      env: { JENKINS_TOKEN },
    });
    expect(unread).toEqual({ exitCode: 1, stdout: "Jenkins build my-job/42 could not be read." });
    expect(unread.stdout).not.toContain(JENKINS_TOKEN);

    const failed = await jenkinsServer((_req, res) => {
      res.writeHead(500);
      res.end(JENKINS_TOKEN);
    });
    const status = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(failed.url),
      env: { JENKINS_TOKEN },
    });
    expect(status.stdout).toBe("Jenkins build my-job/42 could not be read.");
    expect(status.stdout).not.toContain(JENKINS_TOKEN);

    const hanging = await jenkinsServer(() => {
      // Leave the socket open until the deadline aborts the read.
    });
    const started = Date.now();
    const timed = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(hanging.url),
      env: { JENKINS_TOKEN },
      jenkinsDeadlineMs: 200,
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(timed).toEqual({ exitCode: 1, stdout: "Jenkins build my-job/42 could not be read." });
    expect(timed.stdout).not.toContain(JENKINS_TOKEN);
    expect(hanging.requests[0]?.url).not.toContain(JENKINS_TOKEN);
  });

  it("refuses a bad id, a non-HTTPS URL, and a write before any request", async () => {
    const live = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: false, result: "FAILURE" });
    });
    const config = jenkinsConfig(live.url);
    const env = { JENKINS_TOKEN, JENKINS_USER: "alice" };
    for (const record of [
      "../admin/1",
      "my-job/../1",
      "my-job/0",
      "my-job/01",
      "my job/1",
      "my-job",
    ]) {
      const result = await readConnector({
        verb: "read",
        connector: "jenkins",
        record,
        config,
        env,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).not.toContain(JENKINS_TOKEN);
    }
    expect(live.requests).toHaveLength(0);

    const remote = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig("http://jenkins.example.com"),
      env,
      jenkinsDeadlineMs: 200,
    });
    expect(remote).toEqual({ exitCode: 1, stdout: "A Jenkins URL must use HTTPS." });
    expect(live.requests).toHaveLength(0);

    const embedded = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(`https://alice:${JENKINS_TOKEN}@jenkins.example.com`),
      env,
      jenkinsDeadlineMs: 200,
    });
    expect(embedded.exitCode).toBe(1);
    expect(embedded.stdout).toBe("A Jenkins URL must not include credentials.");
    expect(embedded.stdout).not.toContain(JENKINS_TOKEN);

    const named = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: { ...config, jenkins: { url: live.url, token_env: JENKINS_TOKEN } },
      env,
    });
    expect(named.stdout).toBe("A Jenkins token_env must name an environment variable.");
    expect(named.stdout).not.toContain(JENKINS_TOKEN);
    expect(live.requests).toHaveLength(0);

    for (const verb of ["deploy", "trigger", "abort", "build"]) {
      const stopped = await readConnector({
        verb,
        connector: "jenkins",
        record: "my-job/42",
        config,
        env,
      });
      expect(stopped).toEqual({
        exitCode: 1,
        stdout: "That connector action does not run in this slice.",
      });
    }
    expect(live.requests).toHaveLength(0);

    const basic = await jenkinsServer((_req, res) => {
      sendJson(res, 200, { number: 42, building: false, result: "FAILURE" });
    });
    const authed = await readConnector({
      verb: "read",
      connector: "jenkins",
      record: "my-job/42",
      config: jenkinsConfig(basic.url, "JENKINS_TOKEN", "JENKINS_USER"),
      env,
    });
    expect(authed.stdout).toBe("my-job/42\ncompleted\nfailure");
    const header = basic.requests[0]?.authorization ?? "";
    expect(header.startsWith("Basic ")).toBe(true);
    expect(Buffer.from(header.slice("Basic ".length), "base64").toString("utf8")).toBe(
      `alice:${JENKINS_TOKEN}`,
    );
    expect(authed.stdout).not.toContain(JENKINS_TOKEN);
  });
});

async function treeHas(dir: string, needle: string): Promise<boolean> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return false;
  }
  for (const name of names) {
    const path = join(dir, name);
    const text = await readFile(path, "utf8").catch(() => "");
    if (text.includes(needle)) return true;
  }
  return false;
}
