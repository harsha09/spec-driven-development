import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  ConfigSchema,
  advanceStage,
  completeChange,
  createChange,
  importSessionMetrics,
  initProject,
  loadConfig,
  pathExists,
  readChangeMetrics,
  skipStage,
  startPhase,
  switchWorkflow,
  transitionPhase,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function setup(metricsEnabled = true) {
  const root = await mkdtemp(join(tmpdir(), "sdd-metrics-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  const config = await loadConfig(root);
  config.metrics.enabled = metricsEnabled;
  const change = await createChange({
    projectRoot: root,
    config,
    title: "Track phase metrics",
    workflowName: "hotfix",
  });
  return { root, config, change };
}

describe("change metrics persistence", () => {
  it("defaults metrics on and accepts an explicit opt-out", () => {
    expect(ConfigSchema.parse({}).metrics.enabled).toBe(true);
    expect(ConfigSchema.parse({}).metrics.exclude).toEqual([]);
    expect(ConfigSchema.parse({ metrics: { enabled: false } }).metrics.enabled).toBe(false);
    expect(ConfigSchema.parse({ metrics: { enabled: false } }).metrics.exclude).toEqual([]);
    expect(() => ConfigSchema.parse({ metrics: { exclude: [""] } })).toThrow();
  });

  it("stores UTC phase intervals and preserves previous visits", async () => {
    const { root, config, change } = await setup();
    const startedAt = (await readChangeMetrics(root, config, change.id)).phases[0]!.startedAt;
    const transitionAt = new Date(Date.parse(startedAt) + 5 * 60_000).toISOString();
    await transitionPhase(root, config, change.id, "intent", "implement", transitionAt);
    await transitionPhase(root, config, change.id, "implement", "intent", transitionAt);

    const metrics = await readChangeMetrics(root, config, change.id);
    expect(metrics.phases).toEqual([
      { phase: "intent", startedAt, endedAt: transitionAt },
      { phase: "implement", startedAt: transitionAt, endedAt: transitionAt },
      { phase: "intent", startedAt: transitionAt },
    ]);
  });

  it("does not create metrics files while disabled", async () => {
    const { root, config, change } = await setup(false);
    await startPhase(root, config, change.id, "intent");
    await transitionPhase(root, config, change.id, "intent", "implement");

    expect(await pathExists(join(change.path, "metrics.json"))).toBe(false);
  });

  it("records initial, advanced, and completed phase boundaries", async () => {
    const { root, config, change } = await setup();
    await writeFile(
      join(change.path, "intent.md"),
      "# Intent\n\nTrack workflow phase timing without recording prompt text. Success means each completed phase has UTC start and end times, and the metrics opt-out creates no file.\n",
    );
    await advanceStage(root, config, change.id);
    await advanceStage(root, config, change.id);
    await writeFile(join(change.path, "local-test-results.md"), "Verified locally.\n");
    await completeChange(root, config, change.id);

    const metrics = await readChangeMetrics(root, config, change.id);
    expect(metrics.phases.map(({ phase }) => phase)).toEqual([
      "intent",
      "implement",
      "local_verify",
    ]);
    expect(
      metrics.phases.every(({ startedAt, endedAt }) => startedAt.endsWith("Z") && endedAt),
    ).toBe(true);
  });

  it("records current-stage skips and workflow switches as phase transitions", async () => {
    const { root, config } = await setup();
    await writeFile(
      join(root, ".sdd/workflows/metrics-flow.yaml"),
      `name: metrics-flow
version: 1
stages:
  - id: research
    skippable: true
    artifacts: []
  - id: implement
    skippable: true
    artifacts: []
`,
    );
    await writeFile(
      join(root, ".sdd/workflows/metrics-done.yaml"),
      `name: metrics-done
version: 1
stages:
  - id: verify
    artifacts: []
`,
    );
    const change = await createChange({
      projectRoot: root,
      config,
      title: "Skip and switch metrics",
      workflowName: "metrics-flow",
    });

    await skipStage(root, config, change.id, "research", "not needed");
    await switchWorkflow(root, config, change.id, "metrics-done", "scope changed");
    const metrics = await readChangeMetrics(root, config, change.id);

    expect(metrics.phases.map(({ phase }) => phase)).toEqual(["research", "implement", "verify"]);
    expect(metrics.phases[0]!.endedAt).toBeTruthy();
    expect(metrics.phases[1]!.endedAt).toBeTruthy();
    expect(metrics.phases[2]!.endedAt).toBeUndefined();
  });

  it("imports Claude usage once without persisting prompt text or the source path", async () => {
    const { root, config, change } = await setup();
    const startedAt = (await readChangeMetrics(root, config, change.id)).phases[0]!.startedAt;
    const logPath = join(root, "private-session.jsonl");
    const row = {
      type: "assistant",
      timestamp: startedAt,
      requestId: "claude-request-1",
      message: {
        id: "claude-message-1",
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 7,
          output_tokens: 30,
        },
        content: [{ type: "text", text: "PRIVATE PROMPT CONTENT" }],
      },
    };
    await writeFile(logPath, `${JSON.stringify(row)}\n`);

    const first = await importSessionMetrics(root, config, change.id, logPath);
    const second = await importSessionMetrics(root, config, change.id, logPath);
    const metrics = await readChangeMetrics(root, config, change.id);
    const serialized = await readFile(join(change.path, "metrics.json"), "utf8");

    expect(first).toMatchObject({ imported: 1, duplicates: 0, providers: ["claude-code"] });
    expect(second).toMatchObject({ imported: 0, duplicates: 1 });
    expect(metrics.requests).toEqual([
      {
        provider: "claude-code",
        requestId: "claude-request-1",
        phase: "intent",
        startedAt,
        inputTokens: 100,
        cacheReadTokens: 20,
        cacheWriteTokens: 7,
        outputTokens: 30,
        measured: true,
      },
    ]);
    expect(serialized).not.toContain("PRIVATE PROMPT CONTENT");
    expect(serialized).not.toContain(logPath);
  });

  it("attributes Codex token_count to task start and marks unreported cache writes unknown", async () => {
    const { root, config, change } = await setup();
    const startedAt = (await readChangeMetrics(root, config, change.id)).phases[0]!.startedAt;
    const logPath = join(root, "codex-session.jsonl");
    await writeFile(
      logPath,
      [
        { timestamp: startedAt, type: "event_msg", payload: { type: "task_started" } },
        {
          timestamp: startedAt,
          type: "response_item",
          payload: { type: "message", role: "assistant", id: "codex-message-1" },
        },
        {
          timestamp: startedAt,
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 120,
                cached_input_tokens: 20,
                output_tokens: 40,
              },
            },
          },
        },
        { timestamp: startedAt, type: "event_msg", payload: { type: "task_started" } },
        {
          timestamp: startedAt,
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { last_token_usage: { input_tokens: 50, output_tokens: 10 } },
          },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n"),
    );

    const result = await importSessionMetrics(root, config, change.id, logPath);
    const metrics = await readChangeMetrics(root, config, change.id);

    expect(result).toMatchObject({ imported: 1, ignored: 1, providers: ["codex"] });
    expect(metrics.requests[0]).toMatchObject({
      provider: "codex",
      requestId: "codex-message-1",
      startedAt,
      inputTokens: 100,
      cacheReadTokens: 20,
      cacheWriteTokens: null,
      outputTokens: 40,
      measured: true,
    });
  });

  it("rejects imports while metrics are disabled without creating a file", async () => {
    const { root, config, change } = await setup(false);
    const logPath = join(root, "session.jsonl");
    await writeFile(logPath, "{}\n");

    await expect(importSessionMetrics(root, config, change.id, logPath)).rejects.toThrow(
      /metrics are disabled/i,
    );
    expect(await pathExists(join(change.path, "metrics.json"))).toBe(false);
  });

  it("refuses an excluded in-repo session log before reading it", async () => {
    const { root, config, change } = await setup();
    config.metrics.exclude = ["secret"];
    const metricsPath = join(change.path, "metrics.json");
    const before = await readFile(metricsPath, "utf8");
    const startedAt = JSON.parse(before).phases[0].startedAt as string;
    const row = (requestId: string) => ({
      type: "assistant",
      timestamp: startedAt,
      requestId,
      message: {
        usage: { input_tokens: 4, output_tokens: 1 },
        content: [{ type: "text", text: "PRIVATE PROMPT CONTENT" }],
      },
    });

    const secretLog = join(root, "secret", "session.jsonl");
    await mkdir(join(root, "secret"), { recursive: true });
    await writeFile(secretLog, `${JSON.stringify(row("excluded-request"))}\n`);
    await chmod(secretLog, 0o000);
    await expect(importSessionMetrics(root, config, change.id, secretLog)).rejects.toThrow(
      'Refusing to import a session log under excluded prefix "secret".',
    );
    expect(await readFile(metricsPath, "utf8")).toBe(before);
    await chmod(secretLog, 0o644);

    config.metrics.exclude = ["secret/"];
    await chmod(secretLog, 0o000);
    await expect(importSessionMetrics(root, config, change.id, secretLog)).rejects.toThrow(
      'Refusing to import a session log under excluded prefix "secret".',
    );
    await chmod(secretLog, 0o644);
    config.metrics.exclude = ["secret"];

    const nearLog = join(root, "secrets", "log.jsonl");
    await mkdir(join(root, "secrets"), { recursive: true });
    await writeFile(nearLog, `${JSON.stringify(row("near-request"))}\n`);
    await expect(importSessionMetrics(root, config, change.id, nearLog)).resolves.toMatchObject({
      imported: 1,
    });

    const siblingLog = join(root, "secret-file.jsonl");
    await writeFile(siblingLog, `${JSON.stringify(row("sibling-request"))}\n`);
    await expect(importSessionMetrics(root, config, change.id, siblingLog)).resolves.toMatchObject({
      imported: 1,
    });

    const outsideLog = join(tmpdir(), `sdd-outside-${Date.now()}.jsonl`);
    await writeFile(outsideLog, `${JSON.stringify(row("outside-request"))}\n`);
    try {
      await expect(
        importSessionMetrics(root, config, change.id, outsideLog),
      ).resolves.toMatchObject({ imported: 1 });
    } finally {
      await rm(outsideLog, { force: true });
    }

    config.metrics.exclude = ["../secret"];
    await expect(importSessionMetrics(root, config, change.id, outsideLog)).rejects.toThrow(
      "metrics.exclude prefix is invalid.",
    );
    config.metrics.exclude = ["/secret"];
    await expect(importSessionMetrics(root, config, change.id, secretLog)).rejects.toThrow(
      "metrics.exclude prefix is invalid.",
    );

    const stored = await readFile(metricsPath, "utf8");
    expect(stored).not.toContain("PRIVATE PROMPT CONTENT");
    expect(stored).not.toContain(secretLog);
    expect(stored).not.toContain("excluded-request");
  });
});
