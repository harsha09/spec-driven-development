import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  claudeProjectDirName,
  closeSessionLaunch,
  createChange,
  discoverAndImportMetrics,
  discoverSessions,
  initProject,
  loadConfig,
  readChangeMetrics,
  recordSession,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

const SECRET = "PRIVATE PROMPT AND RESPONSE TEXT";

async function setup() {
  const base = await mkdtemp(join(tmpdir(), "sdd-discover-"));
  temps.push(base);
  const root = join(base, "project");
  const home = join(base, "home");
  await mkdir(root, { recursive: true });
  await mkdir(home, { recursive: true });
  await initProject({ projectRoot: root, agents: false });
  const config = await loadConfig(root);
  const change = await createChange({
    projectRoot: root,
    config,
    title: "Discover usage",
    workflowName: "hotfix",
  });
  return { base, root, home, config, change };
}

function later(ms = 5000): string {
  return new Date(Date.now() + ms).toISOString();
}

function claudeRow(requestId: string, timestamp: string, cwd: string, sessionId: string) {
  return {
    type: "assistant",
    timestamp,
    requestId,
    cwd,
    sessionId,
    message: {
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 1,
        output_tokens: 7,
      },
      content: [{ type: "text", text: SECRET }],
    },
  };
}

async function writeClaudeLog(
  home: string,
  cwd: string,
  sessionId: string,
  rows: unknown[],
): Promise<string> {
  const dir = join(home, ".claude", "projects", claudeProjectDirName(cwd));
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  await writeFile(path, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  return path;
}

async function writeCodexLog(home: string, cwd: string, id: string, at: string): Promise<void> {
  const dir = join(home, ".codex", "sessions", "2026", "11", "20");
  await mkdir(dir, { recursive: true });
  const lines = [
    { type: "session_meta", payload: { id, cwd, instructions: SECRET } },
    { type: "event_msg", timestamp: at, payload: { type: "task_started" } },
    { type: "response_item", payload: { type: "message", role: "assistant", id: `${id}-m1` } },
    {
      type: "event_msg",
      timestamp: at,
      payload: {
        type: "token_count",
        info: { last_token_usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 9 } },
      },
    },
  ];
  await writeFile(
    join(dir, `rollout-${id}.jsonl`),
    `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
  );
}

async function writeGrokSession(home: string, cwd: string, id: string, at: string): Promise<void> {
  const dir = join(home, ".grok", "sessions", encodeURIComponent(cwd), id);
  await mkdir(dir, { recursive: true });
  const bucket = { inputTokens: 30, cachedReadTokens: 4, cacheCreationTokens: 2, outputTokens: 6 };
  await writeFile(
    join(dir, "usage.json"),
    JSON.stringify({
      sessionId: id,
      session: {},
      turns: [{ turnNumber: 1, endedAt: at, modelUsage: { "grok-build": bucket } }],
    }),
  );
  await writeFile(join(dir, "chat_history.jsonl"), `${JSON.stringify({ text: SECRET })}\n`);
}

describe("metrics auto-discovery", () => {
  it("imports a Claude Code session for the active change with no arguments, twice identically", async () => {
    const { root, home, config, change } = await setup();
    await writeClaudeLog(home, root, "sess-1", [claudeRow("req-1", later(), root, "sess-1")]);

    const first = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(first.imported).toBe(1);
    expect(first.hosts).toEqual(["claude-code"]);
    const metricsPath = join(change.path, "metrics.json");
    const afterFirst = await readFile(metricsPath, "utf8");

    const second = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await readFile(metricsPath, "utf8")).toBe(afterFirst);
    const stored = (await readChangeMetrics(root, config, change.id)).requests;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      provider: "claude-code",
      requestId: "req-1",
      inputTokens: 10,
    });
  });

  it("finds Codex and Grok sessions by working directory", async () => {
    const { root, home, config, change } = await setup();
    await writeCodexLog(home, root, "codex-1", later());
    await writeGrokSession(home, root, "grok-1", later());

    const result = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(result.sessionsFound).toBe(2);
    expect(result.hosts).toEqual(["codex", "grok"]);
    const requests = (await readChangeMetrics(root, config, change.id)).requests;
    expect(requests.map((r) => r.provider).sort()).toEqual(["codex", "grok"]);
  });

  it("ignores sessions from other working directories", async () => {
    const { base, root, home, config, change } = await setup();
    const other = join(base, "other-project");
    await mkdir(other, { recursive: true });
    await writeClaudeLog(home, other, "sess-x", [claudeRow("req-x", later(), other, "sess-x")]);
    await writeCodexLog(home, other, "codex-x", later());
    await writeGrokSession(home, other, "grok-x", later());

    const result = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(result.sessionsFound).toBe(0);
    expect((await readChangeMetrics(root, config, change.id)).requests).toEqual([]);
  });

  it("names every searched location when no logs exist", async () => {
    const { root, home } = await setup();
    const found = await discoverSessions(root, { home, env: {} });
    expect(found.sessions).toEqual([]);
    expect(found.searched).toEqual([
      "~/.claude/projects/ (Claude Code)",
      "~/.codex/sessions/ (Codex)",
      "~/.grok/sessions/ (Grok)",
    ]);
  });

  it("honours CLAUDE_CONFIG_DIR and CODEX_HOME", async () => {
    const { base, root, home } = await setup();
    const claudeDir = join(base, "claude-cfg");
    const codexDir = join(base, "codex-cfg");
    const found = await discoverSessions(root, {
      home,
      env: { CLAUDE_CONFIG_DIR: claudeDir, CODEX_HOME: codexDir },
    });
    expect(found.searched[0]).toContain(join(claudeDir, "projects"));
    expect(found.searched[1]).toContain(join(codexDir, "sessions"));
  });

  it("attributes a session recorded at launch to its change even when windows overlap", async () => {
    const { root, home, config, change } = await setup();
    const second = await createChange({
      projectRoot: root,
      config,
      title: "Overlapping change",
      workflowName: "hotfix",
    });
    await recordSession(root, config, change.id, {
      host: "claude-code",
      sessionId: "sess-a",
      launchedAt: new Date().toISOString(),
    });
    await writeClaudeLog(home, root, "sess-a", [claudeRow("req-a", later(), root, "sess-a")]);
    await writeClaudeLog(home, root, "sess-b", [claudeRow("req-b", later(), root, "sess-b")]);

    await discoverAndImportMetrics(root, config, { home, env: {} });
    const first = await readChangeMetrics(root, config, change.id);
    const other = await readChangeMetrics(root, config, second.id);
    expect(first.requests.map((r) => r.requestId)).toEqual(["req-a"]);
    expect(other.requests.map((r) => r.requestId)).toEqual(["req-b"]);
  });

  it("attributes usage inside a recorded launch window to that change", async () => {
    const { root, home, config, change } = await setup();
    const second = await createChange({
      projectRoot: root,
      config,
      title: "Later change",
      workflowName: "hotfix",
    });
    const launchedAt = new Date().toISOString();
    await recordSession(root, config, change.id, { host: "grok", launchedAt });
    await closeSessionLaunch(root, config, change.id, "grok", launchedAt, later(60_000));
    await writeGrokSession(home, root, "grok-w", later());

    await discoverAndImportMetrics(root, config, { home, env: {} });
    expect((await readChangeMetrics(root, config, change.id)).requests).toHaveLength(1);
    expect((await readChangeMetrics(root, config, second.id)).requests).toHaveLength(0);
  });

  it("writes only to the scoped change but never reassigns another change's usage", async () => {
    const { root, home, config, change } = await setup();
    const second = await createChange({
      projectRoot: root,
      config,
      title: "Scoped",
      workflowName: "hotfix",
    });
    await writeClaudeLog(home, root, "sess-s", [claudeRow("req-s", later(), root, "sess-s")]);

    const result = await discoverAndImportMetrics(root, config, {
      home,
      env: {},
      scope: [change.id],
    });
    expect(result.imported).toBe(0);
    expect((await readChangeMetrics(root, config, second.id)).requests).toHaveLength(0);
    const all = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(all.imported).toBe(1);
    expect((await readChangeMetrics(root, config, second.id)).requests).toHaveLength(1);
  });

  it("never stores prompt or response text, paths or other session content", async () => {
    const { root, home, config, change } = await setup();
    const claudePath = await writeClaudeLog(home, root, "sess-p", [
      claudeRow("req-p", later(), root, "sess-p"),
    ]);
    await writeCodexLog(home, root, "codex-p", later());
    await writeGrokSession(home, root, "grok-p", later());
    await recordSession(root, config, change.id, { host: "claude-code", launchedAt: later(-1000) });

    await discoverAndImportMetrics(root, config, { home, env: {} });
    const stored = await readFile(join(change.path, "metrics.json"), "utf8");
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain(claudePath);
    expect(stored).not.toContain(home);
    expect(JSON.parse(stored).requests).toHaveLength(3);
  });

  it("skips logs under metrics.exclude and counts them", async () => {
    const { root, config, change } = await setup();
    config.metrics.exclude = [".claude"];
    const home = root; // logs live inside the project, under an excluded prefix
    await writeClaudeLog(home, root, "sess-e", [claudeRow("req-e", later(), root, "sess-e")]);
    const result = await discoverAndImportMetrics(root, config, { home, env: {} });
    expect(result.excluded).toBe(1);
    expect((await readChangeMetrics(root, config, change.id)).requests).toEqual([]);
  });

  it("refuses when metrics are disabled", async () => {
    const { root, home, config } = await setup();
    config.metrics.enabled = false;
    await expect(discoverAndImportMetrics(root, config, { home, env: {} })).rejects.toThrow(
      "Metrics are disabled",
    );
  });
});

describe("recorded sessions", () => {
  it("records a launch window once per session id and closes it", async () => {
    const { root, config, change } = await setup();
    const launchedAt = new Date().toISOString();
    await recordSession(root, config, change.id, { host: "grok", sessionId: "s1", launchedAt });
    await recordSession(root, config, change.id, { host: "grok", sessionId: "s1", launchedAt });
    await recordSession(root, config, change.id, { host: "claude-code", launchedAt });
    await closeSessionLaunch(root, config, change.id, "claude-code", launchedAt);
    const sessions = (await readChangeMetrics(root, config, change.id)).sessions ?? [];
    expect(sessions).toHaveLength(2);
    expect(sessions[1]?.endedAt).toBeDefined();
  });

  it("writes nothing while metrics are disabled", async () => {
    const { root, config, change } = await setup();
    config.metrics.enabled = false;
    await recordSession(root, config, change.id, {
      host: "grok",
      launchedAt: new Date().toISOString(),
    });
    expect((await readChangeMetrics(root, config, change.id)).sessions).toBeUndefined();
  });
});
