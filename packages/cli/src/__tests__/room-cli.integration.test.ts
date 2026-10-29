/**
 * Room command against the built CLI (node dist/index.js).
 * Requires `pnpm build` in packages/cli.
 */
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
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

describe("sdd role room", () => {
  it("prints a change id and a spaced --stage, and asks for TEXT on an empty post", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-room-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    expect(runSdd(root, ["team", "init", "--template", "software"]).status).toBe(0);
    const created = runSdd(root, ["new", "Room line", "-w", "feature", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const ids = (await readdir(join(root, "changes"))).filter((name) => !name.startsWith("."));
    expect(ids).toHaveLength(1);
    const id = ids[0];
    const line = "The list stays empty when the query is blank.";

    const posted = runSdd(root, ["role", "room", "post", line]);
    expect(posted.status, posted.stderr + posted.stdout).toBe(0);
    expect(posted.stdout).toContain("Posted.");

    const byId = runSdd(root, ["role", "room", id]);
    expect(byId.status, byId.stderr + byId.stdout).toBe(0);
    expect(byId.stdout).toContain(line);
    expect(byId.stdout + byId.stderr).not.toContain("Unknown command");

    const spaced = runSdd(root, ["role", "room", "--stage", "intent"]);
    expect(spaced.status, spaced.stderr + spaced.stdout).toBe(0);
    expect(spaced.stdout).toContain(line);

    const equals = runSdd(root, ["role", "room", "--stage=intent"]);
    expect(equals.status, equals.stderr + equals.stdout).toBe(0);
    expect(equals.stdout).toContain(line);

    const active = runSdd(root, ["role", "room"]);
    expect(active.status, active.stderr + active.stdout).toBe(0);
    expect(active.stdout).toContain(line);

    const missing = runSdd(root, ["role", "room", "post", "--stage", "intent"]);
    const missingOut = missing.stderr + missing.stdout;
    expect(missing.status, missingOut).toBe(1);
    expect(missingOut).toContain("TEXT");
    expect(missingOut).not.toContain("Unknown command");

    const unknown = runSdd(root, ["role", "room", "no-such-change"]);
    expect(unknown.status, unknown.stderr + unknown.stdout).not.toBe(0);
    expect(unknown.stdout + unknown.stderr).not.toContain("Unknown command");
  });
});
