import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

function runSdd(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

beforeAll(async () => {
  await readFile(sddBin, "utf8");
});

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd role", () => {
  it("creates, lists, and runs a role with SDD_ROLE_MODEL", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-role-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const created = runSdd(root, [
      "role",
      "create",
      "--name",
      "builder",
      "--label",
      "Builder",
      "--job",
      "Implement the accepted change",
    ]);
    expect(created.status).toBe(0);
    const shown = runSdd(root, ["role", "show"]);
    expect(shown.stdout.trim()).toBe("builder Builder");

    const script = join(root, "fake-model.js");
    await writeFile(
      script,
      `let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  process.stdout.write(JSON.stringify({ text: "hello " + input.roleId }));
});
`,
    );
    const ran = runSdd(root, ["role", "run", "builder", "--task", "say hi"], {
      SDD_ROLE_MODEL: `${process.execPath} ${JSON.stringify(script)}`,
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout.trim()).toBe("hello builder");
    const runs = await readdir(join(root, ".sdd/role-runs/conversation/builder"));
    expect(runs.some((name) => name.endsWith(".jsonl"))).toBe(true);

    const missing = runSdd(root, ["role", "run", "builder", "--task", "again"]);
    expect(missing.status).toBe(1);
    expect(missing.stdout.trim()).toBe("No role model is configured.");
  });

  it("describes agents install as one host", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-role-help-"));
    temps.push(root);
    const help = runSdd(root, ["agents", "install", "--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("ONE host");
  });
});
