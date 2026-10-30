import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
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
    timeout: 15000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
    },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd role connector", () => {
  it("refuses X and does not run another action", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-connector-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const refused = runSdd(root, ["role", "connector", "read", "x", "1"]);
    expect(refused.status).toBe(1);
    expect(refused.stdout.trim()).toBe("A connector cannot read or post on X.");
    const comment = runSdd(root, ["role", "connector", "comment", "github-issue", "37"]);
    expect(comment.status).toBe(1);
    expect(comment.stdout.trim()).toBe("That connector action does not run in this slice.");
    const other = runSdd(root, ["role", "connector", "read", "jira", "1"]);
    expect(other.status).toBe(1);
    expect(other.stdout.trim()).toBe("That connector is not in this slice.");
  });
});
