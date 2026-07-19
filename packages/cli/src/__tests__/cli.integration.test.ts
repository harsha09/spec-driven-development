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
  const r = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      // Force non-interactive defaults where applicable
      CI: "1",
      FORCE_COLOR: "0",
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

    const r = runSdd(root, ["init", "--here", "--ai", "grok"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await exists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await exists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(await exists(join(root, "AGENTS.md"))).toBe(true);
    expect(await exists(join(root, "memory/index.md"))).toBe(true);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);

    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("grok");
  });

  it("sdd init --here --ai copilot then new/status/next/refresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-cli-flow-"));
    temps.push(root);

    expect(runSdd(root, ["init", "--here", "--ai", "copilot"]).status).toBe(0);
    expect(await exists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);

    const created = runSdd(root, ["new", "CLI integration hotfix typo", "-y", "-w", "hotfix"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);

    const { readdir } = await import("node:fs/promises");
    const changes = join(root, "changes");
    const kids = (await readdir(changes)).filter((n) => n !== ".gitkeep" && n !== ".active");
    expect(kids.length).toBeGreaterThanOrEqual(1);
    const changePath = join(changes, kids[0]!);
    expect(await exists(join(changePath, "meta.yaml"))).toBe(true);
    expect(await exists(join(changePath, "intent.md"))).toBe(true);

    // status may write via consola (not always captured on pipe); exit 0 is enough
    const status = runSdd(root, ["status"]);
    expect(status.status, status.stderr + status.stdout).toBe(0);

    // Ensure intent content for leave checks
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(join(changePath, "intent.md"), "# Intent\n\ncli test\n", "utf8"),
    );

    const next = runSdd(root, ["next"]);
    expect(next.status, next.stderr + next.stdout).toBe(0);

    const refresh = runSdd(root, ["agents", "refresh"]);
    expect(refresh.status, refresh.stderr + refresh.stdout).toBe(0);
    expect(await exists(join(root, ".sdd/active-context.md"))).toBe(true);
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    expect(active).toMatch(/CLI integration|protocol|implement/i);
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
