/**
 * Integration tests against the built CLI binary (node dist/index.js).
 * Requires `pnpm build` in packages/cli (CI builds before test).
 */
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

type RunSddOpts = { stdin?: "ignore" | "pipe"; env?: Record<string, string> };

function runSddOpts(extra: Record<string, string> | RunSddOpts): RunSddOpts {
  if ("stdin" in extra || "env" in extra) return extra as RunSddOpts;
  return { env: extra as Record<string, string> };
}

function runSdd(
  cwd: string,
  args: string[],
  extra: Record<string, string> | RunSddOpts = {},
): { status: number | null; stdout: string; stderr: string } {
  const opts = runSddOpts(extra);
  // Vitest injects NO_COLOR + FORCE_COLOR together; that silences consola in children.
  // Use a minimal env so CLI output is capturable (status/help use consola).
  const r = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    stdio: opts.stdin === "ignore" ? ["ignore", "pipe", "pipe"] : undefined,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
      ...opts.env,
    },
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

beforeAll(async () => {
  if (!(await exists(sddBin))) {
    throw new Error(
      `CLI dist missing at ${sddBin}. Run: pnpm --filter @structured-vibe-coding/cli build`,
    );
  }
});

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("CLI integration", () => {
  it("sdd status with an empty .active does not adopt another pack (#11)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-no-active-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const created = runSdd(root, ["new", "Other pack", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    await writeFile(join(root, "changes/.active"), "\n");

    const status = runSdd(root, ["status"]);
    const out = status.stderr + status.stdout;
    expect(status.status, out).toBe(1);
    expect(out).toContain("No active change. Pass --change <id> or run `sdd new`.");
    expect(out).not.toContain(root);

    const id = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    const selected = runSdd(root, ["status", "--change", id]);
    const selectedOut = selected.stderr + selected.stdout;
    expect(selected.status, selectedOut).toBe(0);
    expect(selectedOut).toContain(`Path: changes/${id}`);
    expect(selectedOut).not.toContain(root);
  });

  it("init --root namespaces project data and warns before merging existing memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-layout-root-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--root", ".sdd", "--no-agent"]).status).toBe(0);

    const config = await readFile(join(root, ".sdd/config.yaml"), "utf8");
    expect(config).toContain("memory_path: .sdd/memory");
    expect(config).toContain("changes_path: .sdd/changes");
    expect(config).toContain("domains_path: .sdd/domains");
    expect(config).toContain("archive_path: .sdd/archive");
    expect(await exists(join(root, ".sdd/changes/.gitkeep"))).toBe(true);
    expect(await exists(join(root, "changes"))).toBe(false);
    expect(await exists(join(root, "memory"))).toBe(false);

    const created = runSdd(root, [
      "new",
      "Namespaced path change",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    expect(created.stdout + created.stderr).toContain(".sdd/changes/");

    const brownfield = await mkdtemp(join(tmpdir(), "sdd-cli-memory-warning-"));
    temps.push(brownfield);
    await mkdir(join(brownfield, "memory"));
    await writeFile(join(brownfield, "memory/PRD.md"), "# Product\n");
    const initialized = runSdd(brownfield, ["init", "--here", "--no-agent"]);
    expect(initialized.status, initialized.stderr + initialized.stdout).toBe(0);
    expect(initialized.stdout + initialized.stderr).toContain(
      "Existing memory/ content will be preserved",
    );
    expect(await readFile(join(brownfield, "memory/PRD.md"), "utf8")).toBe("# Product\n");
  });

  it("sdd sync updates local verify references and never invokes remote services", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-sync-"));
    temps.push(root);
    const fakeBin = join(root, "fake-bin");
    const fakeGit = join(fakeBin, "git");
    await mkdir(fakeBin);
    await mkdir(join(root, ".git"));
    const oldSha = "a".repeat(40);
    const newSha = "b".repeat(40);
    await writeFile(fakeGit, `#!/bin/sh\nprintf '%s\\n' '${oldSha}'\n`);
    await chmod(fakeGit, 0o755);
    const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

    expect(runSdd(root, ["init", "--here", "--no-agent"], env).status).toBe(0);
    await writeFile(
      join(root, ".sdd/workflows/sync-test.yaml"),
      `name: sync-test
version: 1
stages:
  - id: implement
    artifacts: []
  - id: local_verify
    artifacts: []
    verify:
      commands:
        - name: smoke
          run: "true"
          required: true
`,
    );
    const created = runSdd(
      root,
      ["new", "Sync CLI test", "-w", "sync-test", "-y", "--no-agent"],
      env,
    );
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const changeId = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    expect(runSdd(root, ["next", "--no-agent"], env).status).toBe(0);
    expect(runSdd(root, ["verify", "--no-agent"], env).status).toBe(0);

    await writeFile(fakeGit, `#!/bin/sh\nprintf '%s\\n' '${newSha}'\n`);
    const stale = runSdd(root, ["verify", "--no-agent"], env);
    expect(stale.status).toBe(1);
    expect(stale.stdout + stale.stderr).toMatch(/stale SHA/i);

    const synced = runSdd(root, ["sync", changeId], env);
    expect(synced.status, synced.stderr + synced.stdout).toBe(0);
    expect(synced.stdout + synced.stderr).toContain(newSha);
    expect(synced.stdout + synced.stderr).toContain("Updated verification records: 1");
    const status = runSdd(root, ["status"], env);
    expect(status.status, status.stderr + status.stdout).toBe(0);
    expect(status.stdout + status.stderr).toContain(`Verified HEAD (local_verify): ${newSha}`);
    const verified = runSdd(root, ["verify", "--no-agent"], env);
    expect(verified.status, verified.stderr + verified.stdout).toBe(0);
    expect(verified.stdout + verified.stderr).toContain("Verify PASS");
  });

  it("imports session usage idempotently and shows local phase times", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-metrics-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);

    const created = runSdd(root, ["new", "Metrics CLI test", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const changeId = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    const changePath = join(root, "changes", changeId);
    const metricsPath = join(changePath, "metrics.json");
    const phase = JSON.parse(await readFile(metricsPath, "utf8")).phases[0];
    const logPath = join(root, "session.jsonl");
    const row = {
      type: "assistant",
      timestamp: phase.startedAt,
      requestId: "cli-request-1",
      message: {
        usage: {
          input_tokens: 12,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 1,
          output_tokens: 8,
        },
        content: [{ type: "text", text: "PRIVATE SESSION TEXT" }],
      },
    };
    await writeFile(logPath, `${JSON.stringify(row)}\n`);

    const first = runSdd(root, ["metrics", "import", logPath]);
    expect(first.status, first.stderr + first.stdout).toBe(0);
    expect(first.stdout + first.stderr).toContain("Imported 1 measured request");
    const second = runSdd(root, ["metrics", "import", logPath, "--change", changeId]);
    expect(second.status, second.stderr + second.stdout).toBe(0);
    expect(second.stdout + second.stderr).toContain("Duplicates: 1");

    const status = runSdd(root, ["status"]);
    expect(status.status, status.stderr + status.stdout).toBe(0);
    expect(status.stdout + status.stderr).toMatch(/Phase times \(local\):[\s\S]*intent:/);
    const stored = await readFile(metricsPath, "utf8");
    expect(stored).not.toContain("PRIVATE SESSION TEXT");
    expect(stored).not.toContain(logPath);
    expect(JSON.parse(stored).requests).toHaveLength(1);
  });

  it("imports a Grok usage.json per model and warns when usage is incomplete", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-grok-usage-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const created = runSdd(root, ["new", "Grok usage", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const changeId = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    const metricsPath = join(root, "changes", changeId, "metrics.json");
    const startedAt = JSON.parse(await readFile(metricsPath, "utf8")).phases[0].startedAt as string;
    const sessionDir = join(root, "grok-session");
    await mkdir(sessionDir);
    const usagePath = join(sessionDir, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        sessionId: "sess",
        session: { usageIsIncomplete: true, inputTokens: 999999, prompt: "PRIVATE PROMPT CONTENT" },
        turns: [
          {
            turnNumber: 1,
            endedAt: "1999-01-01T00:00:00.000Z",
            modelUsage: {
              "grok-4": {
                inputTokens: 100,
                cachedReadTokens: 40,
                cacheCreationTokens: 10,
                outputTokens: 7,
              },
            },
          },
        ],
      }),
    );
    await writeFile(
      join(sessionDir, "events.jsonl"),
      `${JSON.stringify({
        type: "turn_started",
        turn_number: 1,
        ts: startedAt,
        text: "PRIVATE PROMPT CONTENT",
      })}\n`,
    );

    const imported = runSdd(root, ["metrics", "import", sessionDir, "--change", changeId]);
    expect(imported.status, imported.stderr + imported.stdout).toBe(0);
    expect(imported.stdout + imported.stderr).toContain("Imported 1 measured request");
    expect(imported.stdout + imported.stderr).toContain(
      "Grok usage is incomplete; recorded tokens may under-count.",
    );
    const stored = JSON.parse(await readFile(metricsPath, "utf8")) as {
      requests: Array<{ model?: string; inputTokens: number; requestId: string }>;
    };
    expect(stored.requests).toEqual([
      expect.objectContaining({
        provider: "grok",
        model: "grok-4",
        requestId: "sess:1:grok-4",
        inputTokens: 50,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        outputTokens: 7,
      }),
    ]);
    const raw = await readFile(metricsPath, "utf8");
    expect(raw).not.toContain("PRIVATE PROMPT CONTENT");
    expect(raw).not.toContain(usagePath);
    expect(raw).not.toContain("999999");
  });

  it("sdd init --here --ai grok sets up agents without separate agents install", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-grok-"));
    temps.push(root);

    // Pollute with stale multi-host leftovers (old SDD / mistaken install)
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(root, ".github/agents"), { recursive: true });
    await writeFile(join(root, ".github/agents/sdd.agent.md"), "stale\n");
    await mkdir(join(root, ".claude/agents"), { recursive: true });
    await writeFile(join(root, ".claude/agents/sdd.md"), "stale\n");
    await mkdir(join(root, ".idea"), { recursive: true });
    await writeFile(join(root, ".idea/sdd-agent-notes.md"), "stale\n");

    const r = runSdd(root, ["init", "--here", "--ai", "grok"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await exists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(await exists(join(root, "AGENTS.md"))).toBe(true);
    expect(await exists(join(root, "memory/index.md"))).toBe(true);
    // Unmarked leftovers were not generated by this sdd: never deleted, only reported (#4)
    expect(await readFile(join(root, ".github/agents/sdd.agent.md"), "utf8")).toBe("stale\n");
    expect(await readFile(join(root, ".claude/agents/sdd.md"), "utf8")).toBe("stale\n");
    expect(await readFile(join(root, ".idea/sdd-agent-notes.md"), "utf8")).toBe("stale\n");
    expect(r.stdout).toContain("Kept existing files");

    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("grok");
  });

  it("sdd init --here --ai kilo --ignore-agent-tools sets up kilo host only", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-kilo-"));
    temps.push(root);

    // Seed other hosts with sdd-generated (marked, unedited) files to ensure a clean switch
    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    expect(runSdd(root, ["agents", "install", "--ai", "grok", "--force"]).status).toBe(0);
    expect(await exists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(runSdd(root, ["agents", "install", "--ai", "copilot", "--force"]).status).toBe(0);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);

    const r = runSdd(root, ["init", "--here", "--force", "--ai", "kilo", "--ignore-agent-tools"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await exists(join(root, ".kilo/sdd.md"))).toBe(true);
    expect(await exists(join(root, "AGENTS.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/agents.json"))).toBe(true);
    // Other hosts' sdd-generated files removed
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await exists(join(root, ".grok/rules/sdd.md"))).toBe(false);

    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("kilo");
  });

  it.each([[[]], [["--force"]]])(
    "sdd init %j leaves a brownfield repo's files byte-identical (#4)",
    async (extra) => {
      const root = await mkdtemp(join(tmpdir(), "sdd-cli-brownfield-"));
      temps.push(root);
      const { mkdir, writeFile } = await import("node:fs/promises");
      const files: Record<string, string> = {
        "AGENTS.md": "# Our agent rules\n",
        ".claude/agents/reviewer.md": "my claude reviewer\n",
        ".kilo/config.md": "kilo cfg\n",
        "memory/PRD.md": "# PRD\n",
        "memory/index.md": "# Our map\n",
      };
      for (const [rel, body] of Object.entries(files)) {
        await mkdir(dirname(join(root, rel)), { recursive: true });
        await writeFile(join(root, rel), body);
      }

      const r = runSdd(root, ["init", "--here", "--ai", "copilot", ...extra]);
      expect(r.status, r.stderr + r.stdout).toBe(0);
      for (const [rel, body] of Object.entries(files)) {
        expect(await readFile(join(root, rel), "utf8"), rel).toBe(body);
      }
      expect(r.stdout).toContain("AGENTS.md (not generated by sdd");
      expect(r.stdout).toContain("Your AGENTS.md was left unchanged");
      expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    },
  );

  it("sdd init --force on a host switch lists removed files; bad paths fail clearly", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-removed-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--ai", "kilo", "--ignore-agent-tools"]).status).toBe(0);
    const sw = runSdd(root, ["init", "--here", "--force", "--ai", "copilot"]);
    expect(sw.status, sw.stderr + sw.stdout).toBe(0);
    expect(sw.stdout).toContain("Removed (other AI hosts' sdd-generated files");
    expect(sw.stdout).toContain("- .kilo/sdd.md");

    // A directory where AGENTS.md goes: clear error, exit 1, nothing written
    const bad = await mkdtemp(join(tmpdir(), "sdd-cli-eisdir-"));
    temps.push(bad);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(bad, "AGENTS.md"));
    const r = runSdd(bad, ["init", "--here", "--ai", "copilot"]);
    const out = r.stderr + r.stdout;
    expect(r.status, out).toBe(1);
    expect(out).toContain("Cannot write AGENTS.md: it is a directory");
    expect(out).toContain("Nothing was written");
    expect(await exists(join(bad, ".sdd"))).toBe(false);
  });

  it("sdd init --here --ai copilot then new/status/next/refresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-flow-"));
    temps.push(root);

    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);

    // --no-agent: CI has no TTY agent; still writes handoff
    const created = runSdd(root, [
      "new",
      "CLI integration hotfix typo",
      "-y",
      "-w",
      "hotfix",
      "--no-agent",
    ]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/handoff.md"))).toBe(true);

    const { readdir } = await import("node:fs/promises");
    const changes = join(root, "changes");
    const kids = (await readdir(changes)).filter((n) => !n.startsWith("."));
    expect(kids.length).toBeGreaterThanOrEqual(1);
    const changePath = join(changes, kids[0]!);
    expect(await exists(join(changePath, "meta.yaml"))).toBe(true);
    expect(await exists(join(changePath, "intent.md"))).toBe(true);

    // Bare status: inspect only — must not launch / handoff-kickoff the agent
    const handoffPath = join(root, ".sdd/handoff.md");
    const handoffBefore = await readFile(handoffPath, "utf8");
    const status = runSdd(root, ["status"]);
    expect(status.status, status.stderr + status.stdout).toBe(0);
    const statusOut = status.stderr + status.stdout;
    expect(statusOut).not.toMatch(/Handoff:|Starting |Started |Copilot Chat|Skipped \(--no-agent/i);
    expect(statusOut).toMatch(/Change:|Status:|Workflow:/i);
    // launchConfiguredAgent rewrites handoff; status must not touch it
    expect(await readFile(handoffPath, "utf8")).toBe(handoffBefore);

    const statusList = runSdd(root, ["status", "--list"]);
    expect(statusList.status, statusList.stderr + statusList.stdout).toBe(0);
    const listOut = statusList.stderr + statusList.stdout;
    expect(listOut).not.toMatch(/Handoff:|Starting |Started |Copilot Chat|Skipped \(--no-agent/i);
    expect(listOut).toMatch(/hotfix|intent/i);
    expect(await readFile(handoffPath, "utf8")).toBe(handoffBefore);

    // Ensure intent content for leave checks (must be substantive, not a stub)
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        join(changePath, "intent.md"),
        [
          "# Intent",
          "",
          "Fix a CLI integration regression so bare status does not launch the agent.",
          "Success: sdd status prints stage progress without handoff or agent spawn.",
          "",
        ].join("\n"),
        "utf8",
      ),
    );

    const next = runSdd(root, ["next", "--no-agent"]);
    expect(next.status, next.stderr + next.stdout).toBe(0);
    // handoff rewritten after process commands that still call launchConfiguredAgent
    expect(await exists(handoffPath)).toBe(true);
    const nextOut = next.stderr + next.stdout;
    // next still goes through launchConfiguredAgent; with --no-agent it reports skip / handoff
    expect(nextOut).toMatch(/Handoff:|Skipped \(--no-agent/i);

    const refresh = runSdd(root, ["agents", "refresh", "--no-agent"]);
    expect(refresh.status, refresh.stderr + refresh.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/active-context.md"))).toBe(true);
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    expect(active).toMatch(/CLI integration|protocol|implement/i);
    const handoff = await readFile(join(root, ".sdd/handoff.md"), "utf8");
    expect(handoff.length).toBeGreaterThan(50);
  });

  it("sdd new without a TTY does not prompt (#9)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-new-notty-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);

    const missing = runSdd(root, ["new"], { stdin: "ignore" });
    const missingOut = missing.stderr + missing.stdout;
    expect(missing.status, missingOut).toBe(1);
    expect(missingOut).toMatch(/Title is required/);
    expect(missingOut).toMatch(/sdd new/);
    expect(missingOut).not.toMatch(/uv_tty_init|TTY initialization failed/i);

    const created = runSdd(root, ["new", "Fix lagna list"], { stdin: "ignore" });
    const createdOut = created.stderr + created.stdout;
    expect(created.status, createdOut).toBe(0);
    expect(createdOut).toMatch(/Non-interactive: using recommended workflow/i);
    expect(createdOut).toMatch(/Created change/i);
    expect(createdOut).toMatch(/Path:\s+changes\//);
    expect(createdOut).not.toContain(root);
    expect(createdOut).toContain("Handoff: .sdd/handoff.md");
    expect(createdOut).not.toMatch(/uv_tty_init|TTY initialization failed/i);
  });

  it("sdd status --help does not claim agent launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-status-help-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);

    const help = runSdd(root, ["status", "--help"]);
    expect(help.status, help.stderr + help.stdout).toBe(0);
    const out = help.stderr + help.stdout;
    // Must not advertise status as launching the agent (negative phrases ok)
    expect(out).not.toMatch(/status \+ agent|refresh handoff, launch AI agent/i);
    expect(out).not.toMatch(/(?<!does not )launch(es)? (the )?AI agent/i);
    expect(out).toMatch(/does not launch|active change status/i);
  });

  it("sdd verify exits 1 with NOT RUN when nothing ran (issue #12)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-verify-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    const created = runSdd(root, ["new", "Verify typo hotfix", "-y", "-w", "hotfix", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);

    // Wrong stage (intent has no verify step): NOT RUN, exit 1, nothing recorded
    const wrong = runSdd(root, ["verify"]);
    const wrongOut = wrong.stderr + wrong.stdout;
    expect(wrong.status, wrongOut).toBe(1);
    expect(wrongOut).toMatch(/NOT RUN/);
    expect(wrongOut).toMatch(/local_verify/);
    expect(wrongOut).not.toMatch(/PASS/);

    const { readdir, writeFile } = await import("node:fs/promises");
    const changes = join(root, "changes");
    const kid = (await readdir(changes)).find((n) => !n.startsWith("."));
    const changePath = join(changes, kid!);
    expect(await exists(join(changePath, "local-test-results.md"))).toBe(false);
    await writeFile(
      join(changePath, "intent.md"),
      "# Intent\n\nFix a typo in the README heading so the product name is spelled correctly.\nSuccess: heading reads correctly; no other changes.\n",
      "utf8",
    );
    expect(runSdd(root, ["next", "--no-agent"]).status).toBe(0);
    expect(runSdd(root, ["next", "--no-agent"]).status).toBe(0);

    // local_verify with `commands: []`: zero commands executed → NOT RUN, exit 1
    const none = runSdd(root, ["verify"]);
    const noneOut = none.stderr + none.stdout;
    expect(none.status, noneOut).toBe(1);
    expect(noneOut).toMatch(/NOT RUN/);
    expect(noneOut).toMatch(/no verify commands configured/);
    const md = await readFile(join(changePath, "local-test-results.md"), "utf8");
    expect(md).toContain("Overall: NOT RUN");

    // --no-run is also NOT RUN
    const noRun = runSdd(root, ["verify", "--no-run"]);
    expect(noRun.status, noRun.stderr + noRun.stdout).toBe(1);

    // No required commands → the gate does not block completion
    const done = runSdd(root, ["complete", "--no-agent"]);
    expect(done.status, done.stderr + done.stdout).toBe(0);
  });

  it("sdd verify --no-run does not execute commands (#19)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-norun-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(root, ".sdd/workflows/vt.yaml"),
      `name: vt
description: no-run repro
version: 1
stages:
  - id: local_verify
    artifacts: []
    gate: { type: soft }
    verify:
      commands:
        - name: marker
          run: "touch ran.flag"
          required: true
`,
      "utf8",
    );
    const created = runSdd(root, ["new", "No run repro", "-y", "-w", "vt", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const skipped = runSdd(root, ["verify", "--no-run", "--no-agent"]);
    const skippedOut = skipped.stderr + skipped.stdout;
    expect(skipped.status, skippedOut).toBe(1);
    expect(skippedOut).toMatch(/NOT RUN/);
    expect(skippedOut).toMatch(/--no-run/);
    expect(skippedOut).not.toMatch(/Verify PASS/);
    expect(await exists(join(root, "ran.flag"))).toBe(false);
  });

  it("sdd init --ai copilot then sdd agents install --ai claude switches host", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-late-"));
    temps.push(root);

    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);

    const install = runSdd(root, ["agents", "install", "--ai", "claude", "--force"]);
    expect(install.status, install.stderr + install.stdout).toBe(0);
    expect(await exists(join(root, ".claude/agents/sdd.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
  });

  it("sdd init --ai copilot then sdd agents install --ai kilo --force switches to kilo", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-kilo-switch-"));
    temps.push(root);

    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);

    const install = runSdd(root, [
      "agents",
      "install",
      "--ai",
      "kilo",
      "--force",
      "--ignore-agent-tools",
    ]);
    expect(install.status, install.stderr + install.stdout).toBe(0);
    expect(await exists(join(root, ".kilo/sdd.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("kilo");
  });

  it("sdd init --here --no-agent installs no AI host; doctor passes (#5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-noagent-"));
    temps.push(root);

    const r = runSdd(root, ["init", "--here", "--no-agent"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).not.toContain("Choose your AI");
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/active-context.md"))).toBe(true);
    for (const p of [
      "AGENTS.md",
      ".sdd/agents.json",
      ".github",
      ".claude",
      ".grok",
      ".kilo",
      ".ollama",
    ]) {
      expect(await exists(join(root, p)), p).toBe(false);
    }

    const doctor = runSdd(root, ["doctor"]);
    const supportedNode = Number(process.versions.node.split(".")[0]) >= 24;
    expect(doctor.status, doctor.stdout + doctor.stderr).toBe(supportedNode ? 0 : 1);
    expect(doctor.stdout).toContain("AI host");
    expect(doctor.stdout).toContain("none (no-agent setup");
    expect(doctor.stdout).toContain("24+ required");

    const created = runSdd(root, ["new", "No agent change", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    expect(created.stdout).toContain("No AI host configured");
    expect(await exists(join(root, "AGENTS.md"))).toBe(false);
  });

  it("re-running init --no-agent adds missing ignore lines and leaves config alone (#45)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-noagent-reinit-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const configPath = join(root, ".sdd/config.yaml");
    const workflowPath = join(root, ".sdd/workflows/feature.yaml");
    const ignorePath = join(root, ".sdd/.gitignore");
    const configBefore = await readFile(configPath, "utf8");
    const workflowBefore = await readFile(workflowPath, "utf8");
    await writeFile(ignorePath, "extra\n");
    const again = runSdd(root, ["init", "--here", "--no-agent"]);
    expect(again.status, again.stderr + again.stdout).toBe(0);
    expect(again.stdout).toContain("Added missing ignore lines.");
    const ignore = await readFile(ignorePath, "utf8");
    expect(ignore).toContain("role-runs/");
    expect(ignore.startsWith("extra\n")).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
    expect(await readFile(workflowPath, "utf8")).toBe(workflowBefore);
    const third = runSdd(root, ["init", "--here", "--no-agent"]);
    expect(third.status, third.stderr + third.stdout).toBe(0);
    expect(third.stdout).toContain("Ignore lines are already present.");
    expect(await readFile(ignorePath, "utf8")).toBe(ignore);
  });

  it("names missing bundled workflows and adopts a matching unmarked file (#36)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-missing-workflows-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);

    const wfDir = join(root, ".sdd/workflows");
    for (const name of await readdir(wfDir)) {
      if (name !== "patch.yaml") await rm(join(wfDir, name));
    }
    await rm(join(root, ".sdd/.generated.json"));
    const patchPath = join(wfDir, "patch.yaml");
    const patchBefore = await readFile(patchPath, "utf8");

    const listed = runSdd(root, ["workflows"]);
    expect(listed.status, listed.stderr + listed.stdout).toBe(0);
    expect(listed.stdout).toContain("patch");
    expect(listed.stdout).toContain("Not copied yet:");
    expect(listed.stdout).toContain("feature");
    expect(listed.stdout).toContain("sdd init --here --force");

    const blocked = runSdd(root, ["new", "probe", "-w", "feature", "-y", "--no-agent"]);
    const blockedOut = blocked.stderr + blocked.stdout;
    expect(blocked.status, blockedOut).not.toBe(0);
    expect(blockedOut).toContain('Workflow "feature" is not available. Available: patch');
    expect(blockedOut).toContain("This CLI ships feature");
    expect(blockedOut).toContain("sdd init --here --force");

    const forced = runSdd(root, ["init", "--here", "--force", "--no-agent"]);
    expect(forced.status, forced.stderr + forced.stdout).toBe(0);
    expect(await readFile(patchPath, "utf8")).toBe(patchBefore);
    expect(await exists(join(wfDir, "feature.yaml"))).toBe(true);
    expect(forced.stdout + forced.stderr).not.toContain(
      ".sdd/workflows/patch.yaml (not generated by sdd — left untouched)",
    );
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(manifest.files[".sdd/workflows/patch.yaml"]).toBeTruthy();

    const custom = `${patchBefore}\n# team edit\n`;
    await writeFile(patchPath, custom);
    manifest.files = Object.fromEntries(
      Object.entries(manifest.files).filter(([path]) => path !== ".sdd/workflows/patch.yaml"),
    );
    await writeFile(join(root, ".sdd/.generated.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const again = runSdd(root, ["init", "--here", "--force", "--no-agent"]);
    const againOut = again.stderr + again.stdout;
    expect(again.status, againOut).toBe(0);
    expect(await readFile(patchPath, "utf8")).toBe(custom);
    expect(againOut).toContain(".sdd/workflows/patch.yaml (not generated by sdd — left untouched)");

    const started = runSdd(root, ["new", "probe", "-w", "feature", "-y", "--no-agent"]);
    expect(started.status, started.stderr + started.stdout).toBe(0);
  });

  it("installs a team template and creates a role from one (#59)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-team-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const init = runSdd(root, ["team", "init", "--template", "research"]);
    expect(init.status, init.stderr + init.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/roles/researcher.md"))).toBe(true);
    const shown = runSdd(root, ["team", "show"]);
    expect(shown.status, shown.stderr + shown.stdout).toBe(0);
    expect(shown.stdout).toContain("researcher");
    expect(shown.stdout).toContain("rooms.commit: false");
    const created = runSdd(root, ["role", "create", "notes", "--template", "research/researcher"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const role = await readFile(join(root, ".sdd/roles/notes.md"), "utf8");
    expect(role).toContain("name: notes");
    expect(role).toContain("treat the notes as an accepted spec");
    const again = runSdd(root, ["team", "init", "--template", "research"]);
    expect(again.status).not.toBe(0);
    expect(again.stdout + again.stderr).toContain("Nothing was written");
  });

  it("init --force preserves custom config paths and lists edited workflows/templates (#15)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-force-preserve-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);

    const configPath = join(root, ".sdd/config.yaml");
    const config = (await readFile(configPath, "utf8"))
      .replace(/^changes_path: changes$/m, "changes_path: .sdd/changes")
      .replace(/^(\s*)allow_skip: true$/m, "$1allow_skip: false");
    await writeFile(configPath, config);
    const workflowPath = join(root, ".sdd/workflows/patch.yaml");
    const templatePath = join(root, ".sdd/templates/intent.md");
    const workflow = `${await readFile(workflowPath, "utf8")}\n# Team workflow note\n`;
    const template = `${await readFile(templatePath, "utf8")}\nTeam-specific intent prompt.\n`;
    await writeFile(workflowPath, workflow);
    await writeFile(templatePath, template);

    const forced = runSdd(root, ["init", "--here", "--no-agent", "--force"]);
    expect(forced.status, forced.stderr + forced.stdout).toBe(0);
    const out = forced.stdout + forced.stderr;
    expect(out).toContain(".sdd/workflows/patch.yaml (generated by sdd, then edited — kept)");
    expect(out).toContain(".sdd/templates/intent.md (generated by sdd, then edited — kept)");
    expect(await readFile(configPath, "utf8")).toContain("changes_path: .sdd/changes");
    expect(await readFile(configPath, "utf8")).toContain("allow_skip: false");
    expect(await readFile(workflowPath, "utf8")).toBe(workflow);
    expect(await readFile(templatePath, "utf8")).toBe(template);
    expect(await exists(join(root, ".sdd/changes/.gitkeep"))).toBe(true);
  });

  it("sdd init --no-agent with --ai is rejected (#5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-noagent-ai-"));
    temps.push(root);
    const r = runSdd(root, ["init", "--here", "--no-agent", "--ai", "copilot"]);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toContain("--no-agent cannot be combined with --ai");
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(false);
  });

  it("--no-agent on process commands is honoured (citty parses it as agent=false) (#5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-noagent-flag-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--ai", "grok"]).status).toBe(0);
    const r = runSdd(root, ["new", "Flag check", "-w", "hotfix", "-y", "--no-agent"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("Skipped (--no-agent or SDD_NO_AGENT)");
  });

  it("rejects IDE names for --ai", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-ide-"));
    temps.push(root);
    const r = runSdd(root, ["init", "--here", "--ai", "vscode"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/IDE/i);
  });

  it("sdd greenfield + backlog list/start (feature alias still works)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-gf-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);

    const gf = runSdd(root, ["greenfield", "Shared shopping list for roommates", "--no-agent"]);
    const gfOut = gf.stderr + gf.stdout;
    expect(gf.status, gfOut).toBe(0);
    expect(gfOut).toMatch(/greenfield|vision/i);
    expect(gfOut).toMatch(/backlog start/i);
    expect(gfOut).toMatch(/Path:\s+changes\//);
    expect(gfOut).not.toContain(root);
    expect(await exists(join(root, ".sdd/workflows/greenfield.yaml"))).toBe(true);

    const { readdir, writeFile } = await import("node:fs/promises");
    const kids = (await readdir(join(root, "changes"))).filter((n) => !n.startsWith("."));
    expect(kids.length).toBe(1);
    const changePath = join(root, "changes", kids[0]!);
    const vision = await readFile(join(changePath, "vision.md"), "utf8");
    expect(vision).toContain("Shared shopping list for roommates");
    expect(vision).not.toContain("{{idea}}");

    // Promote a backlog into memory and start F-001 via preferred command
    await writeFile(
      join(root, "memory/features.md"),
      [
        "# Feature backlog",
        "",
        "## F-001: Add item",
        "",
        "- **Status:** planned",
        "- **Priority:** must",
        "- **Workflow:** hotfix",
        "- **Summary:** User adds a grocery item to the shared list with a name.",
        "- **Requirements:** R-001",
        "- **Notes:**",
        "",
      ].join("\n"),
      "utf8",
    );

    const list = runSdd(root, ["backlog", "list"]);
    const listOut = list.stderr + list.stdout;
    expect(list.status, listOut).toBe(0);
    expect(listOut).toMatch(/F-001/);
    expect(listOut).toMatch(/sdd new/i);
    expect(listOut).toContain("memory/features.md");
    expect(listOut).not.toContain(root);

    const start = runSdd(root, ["backlog", "start", "F-001", "--no-agent"]);
    const startOut = start.stderr + start.stdout;
    expect(start.status, startOut).toBe(0);
    expect(startOut).toMatch(/F-001|Started/i);
    expect(startOut).toMatch(/Path:\s+changes\//);
    expect(startOut).not.toContain(root);

    const backlogFile = await readFile(join(root, "memory/features.md"), "utf8");
    expect(backlogFile).toMatch(/\*\*Status:\*\*\s*in_progress/i);

    // Compatibility: sdd feature list still works
    const aliasList = runSdd(root, ["feature", "list"]);
    expect(aliasList.status, aliasList.stderr + aliasList.stdout).toBe(0);
    expect(aliasList.stdout + aliasList.stderr).toMatch(/F-001/);
  });

  it("prints Metrics are disabled and writes nothing when metrics are off", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-report-off-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const created = runSdd(root, ["new", "Disabled report", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const changeId = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    const metricsPath = join(root, "changes", changeId, "metrics.json");
    const pricesPath = join(root, ".sdd/prices.yaml");
    const before = await readFile(metricsPath);
    const configPath = join(root, ".sdd/config.yaml");
    const config = await readFile(configPath, "utf8");
    expect(config).toContain("enabled: true");
    await writeFile(configPath, config.replace("enabled: true", "enabled: false"));
    await rm(pricesPath);

    for (const args of [
      ["report"],
      ["report", "--all"],
      ["cost"],
      ["report", "--change", changeId],
    ]) {
      const result = runSdd(root, args);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, out).toBe(0);
      expect(result.stdout.trim()).toBe("Metrics are disabled");
      expect(out).not.toContain("No active change");
      expect(out).not.toContain("prices.yaml is missing");
    }
    await writeFile(join(root, "changes/.active"), "\n");
    for (const args of [["report"], ["report", "--all"], ["cost"]]) {
      const result = runSdd(root, args);
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout.trim()).toBe("Metrics are disabled");
    }
    expect(await exists(pricesPath)).toBe(false);
    expect(await readFile(metricsPath)).toEqual(before);
  });

  it("sorts sdd report --all and rejects --all with --change", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-report-all-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const writeMetrics = async (id: string, startedAt: string | null) => {
      const dir = join(root, "changes", id);
      await mkdir(dir, { recursive: true });
      if (!startedAt) return;
      await writeFile(
        join(dir, "metrics.json"),
        JSON.stringify({
          version: 1,
          phases: [{ phase: "intent", startedAt, endedAt: startedAt }],
          requests: [],
        }),
      );
    };
    await writeMetrics("change-c", "2026-01-03T00:00:00.000Z");
    await writeMetrics("change-b", "2026-01-02T00:00:00.000Z");
    await writeMetrics("change-a", "2026-01-02T00:00:00.000Z");
    await writeMetrics("change-d", null);

    const listed = runSdd(root, ["report", "--all"]);
    const listedOut = listed.stdout;
    expect(listed.status, listed.stderr + listed.stdout).toBe(0);
    const positions = ["change-a", "change-b", "change-c"].map((id) =>
      listedOut.indexOf(`Change: ${id}`),
    );
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions[0]).toBeLessThan(positions[1]!);
    expect(positions[1]).toBeLessThan(positions[2]!);
    expect(listedOut).not.toContain("change-d");

    const pricesPath = join(root, ".sdd/prices.yaml");
    const pricesBefore = await readFile(pricesPath);
    const both = runSdd(root, ["report", "--all", "--change", "change-a"]);
    expect(both.status).toBe(1);
    expect(both.stdout + both.stderr).toContain("Use either --change or --all, not both.");
    expect(await readFile(pricesPath)).toEqual(pricesBefore);
    expect(await readFile(join(root, "changes", "change-a", "metrics.json"))).toBeTruthy();

    const empty = await mkdtemp(join(tmpdir(), "sdd-cli-report-empty-"));
    temps.push(empty);
    expect(runSdd(empty, ["init", "--here", "--no-agent"]).status).toBe(0);
    const none = runSdd(empty, ["report", "--all"]);
    expect(none.status, none.stderr + none.stdout).toBe(0);
    expect(none.stdout).toContain("No change metrics found.");
  });

  it("prints the same cost text from sdd cost and sdd report", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-cost-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const changeId = "costed";
    await mkdir(join(root, "changes", changeId), { recursive: true });
    await writeFile(join(root, "changes/.active"), `${changeId}\n`);
    await writeFile(
      join(root, "changes", changeId, "metrics.json"),
      JSON.stringify({
        version: 1,
        phases: [
          {
            phase: "intent",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:10:00.000Z",
          },
        ],
        requests: [
          {
            provider: "claude-code",
            requestId: "cost-1",
            phase: "intent",
            startedAt: "2026-01-01T00:00:00.000Z",
            inputTokens: 1_000_000,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            outputTokens: null,
            measured: true,
          },
        ],
      }),
    );
    const report = runSdd(root, ["report"]);
    const cost = runSdd(root, ["cost", "--change", changeId]);
    expect(report.status, report.stderr + report.stdout).toBe(0);
    expect(cost.status, cost.stderr + cost.stdout).toBe(0);
    expect(cost.stdout).toBe(report.stdout);
    expect(report.stdout).toContain("3.0000");
    expect(report.stdout).toContain("252.00");
    expect(report.stdout).not.toContain(root);

    const pricesPath = join(root, ".sdd/prices.yaml");
    const metricsPath = join(root, "changes", changeId, "metrics.json");
    const pricesBefore = await readFile(pricesPath);
    const metricsBefore = await readFile(metricsPath);
    await writeFile(pricesPath, "not: prices\n");
    const invalid = runSdd(root, ["report"]);
    expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).toContain("prices.yaml is invalid");
    expect(invalid.stdout + invalid.stderr).not.toContain("source  phase");
    expect(await readFile(metricsPath)).toEqual(metricsBefore);
    await writeFile(pricesPath, pricesBefore);
  });

  it("reports one measured import and estimates only an unmeasured handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-report-import-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const created = runSdd(root, ["new", "Report import", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const changeId = (await readdir(join(root, "changes"))).find((name) => !name.startsWith("."))!;
    const metricsPath = join(root, "changes", changeId, "metrics.json");
    const handoff = join(root, ".sdd/handoff.md");
    await rm(handoff, { force: true });

    const missing = runSdd(root, ["report"]);
    expect(missing.status, missing.stderr + missing.stdout).toBe(0);
    expect(missing.stdout).toContain("No estimate: .sdd/handoff.md is missing.");
    expect(missing.stdout).not.toContain(root);

    await writeFile(handoff, "abcd😀");
    const estimated = runSdd(root, ["report"]);
    expect(estimated.status, estimated.stderr + estimated.stdout).toBe(0);
    expect(estimated.stdout).toContain("estimated (handoff code points / 4)");
    expect(estimated.stdout).toContain("default  n/a  1  1  n/a");

    await chmod(handoff, 0o000);
    const unreadable = runSdd(root, ["report"]);
    expect(unreadable.status).toBe(1);
    expect(unreadable.stdout + unreadable.stderr).toContain("Could not read .sdd/handoff.md.");
    expect(unreadable.stdout + unreadable.stderr).not.toContain(root);
    await chmod(handoff, 0o644);

    const phase = JSON.parse(await readFile(metricsPath, "utf8")).phases[0];
    const logPath = join(root, "session.jsonl");
    const row = {
      type: "assistant",
      timestamp: phase.startedAt,
      requestId: "report-request-1",
      message: {
        usage: { input_tokens: 12, output_tokens: 8 },
        content: [{ type: "text", text: "PRIVATE PROMPT CONTENT" }],
      },
    };
    await writeFile(logPath, `${JSON.stringify(row)}\n`);
    expect(runSdd(root, ["metrics", "import", logPath]).status).toBe(0);
    expect(runSdd(root, ["metrics", "import", logPath]).status).toBe(0);
    const reported = runSdd(root, ["report"]);
    expect(reported.status, reported.stderr + reported.stdout).toBe(0);
    expect(reported.stdout).toContain("measured  total  all  all  1  12");
    expect(reported.stdout).not.toContain("PRIVATE PROMPT CONTENT");
    expect(reported.stdout).not.toContain(logPath);
    expect(reported.stdout).not.toContain("estimated");
    const stored = await readFile(metricsPath, "utf8");
    expect(stored).not.toContain("PRIVATE PROMPT CONTENT");
    expect(stored).not.toContain(logPath);
    expect(JSON.parse(stored).requests).toHaveLength(1);
  });
});
