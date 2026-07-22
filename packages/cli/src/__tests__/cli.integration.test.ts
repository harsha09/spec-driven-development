/**
 * Integration tests against the built CLI binary (node dist/index.js).
 * Requires `pnpm build` in packages/cli (CI builds before test).
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
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

function runSdd(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  // Vitest injects NO_COLOR + FORCE_COLOR together; that silences consola in children.
  // Use a minimal env so CLI output is capturable (status/help use consola).
  const r = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
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
    // Only grok host — stale copilot/claude/idea agent files removed
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await exists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await exists(join(root, ".idea/sdd-agent-notes.md"))).toBe(false);

    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("grok");
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
    const kids = (await readdir(changes)).filter((n) => n !== ".gitkeep" && n !== ".active");
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

  it("sdd init --no-agents then sdd agents install --ai claude", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-late-"));
    temps.push(root);

    expect(runSdd(root, ["init", "--here", "--no-agents"]).status).toBe(0);
    expect(await exists(join(root, ".claude/agents/sdd.md"))).toBe(false);

    const install = runSdd(root, ["agents", "install", "--ai", "claude", "--force"]);
    expect(install.status, install.stderr + install.stdout).toBe(0);
    expect(await exists(join(root, ".claude/agents/sdd.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
  });

  it("rejects IDE names for --ai", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-ide-"));
    temps.push(root);
    const r = runSdd(root, ["init", "--here", "--ai", "vscode"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/IDE/i);
  });
});
