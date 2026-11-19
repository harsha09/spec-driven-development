import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Every script under docs/examples must run, and the documented command that uses the
 * example model must work end to end with the real sdd build.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../../..");
const examples = join(repo, "docs", "examples");
const sddBin = join(here, "../../dist/index.js");
const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function sdd(cwd: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      CI: "1",
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("docs/examples", () => {
  it("runs every example script and prints one JSON object", async () => {
    const scripts = (await readdir(examples)).filter((name) => name.endsWith(".mjs"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      const result = spawnSync(process.execPath, [join(examples, name)], {
        input: JSON.stringify({ roleId: "builder", prompt: "Job: Build\nTask: write the page\n" }),
        encoding: "utf8",
      });
      expect(result.status, `${name}: ${result.stderr}`).toBe(0);
      const parsed: unknown = JSON.parse(result.stdout);
      expect(typeof parsed, name).toBe("object");
    }
  });

  it("runs the documented sdd role run command with the example model", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "sdd-docs-example-")));
    temps.push(root);
    expect(sdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    expect(
      sdd(root, [
        "role",
        "create",
        "builder",
        "--label",
        "Builder",
        "--job",
        "Build the change",
        "--stages",
        "implement",
      ]).status,
    ).toBe(0);
    const dir = join(root, "changes", "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "accepted.md"),
      "# Spec\n\n## billing\ndecision: use-ledger\naccepted: yes\n- check: CHK-001\n- check: CHK-002\n",
    );
    const ran = sdd(
      root,
      [
        "role",
        "run",
        "builder",
        "--kind",
        "code",
        "--change",
        "demo",
        "--section",
        "billing",
        "--task",
        "Write the page",
      ],
      { SDD_ROLE_MODEL: `node ${join(examples, "role-model.mjs")}` },
    );
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout).toContain("Draft from the local example.");
  });
});
