/**
 * Guided setup against the built CLI (node dist/index.js).
 * Requires `pnpm build` in packages/cli.
 */
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  env: Record<string, string> = {},
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
      ...env,
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
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd setup tour", () => {
  it("sdd setup --yes writes the three duties and no team or model file", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-yes-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--yes", "--no-agent"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(0);
    expect(ran.stdout).toContain("planner: intent, clarify_intent, brainstorm");
    expect(ran.stdout).toContain("architect: design, clarify_design");
    expect(ran.stdout).toContain("builder: tasks, clarify_tasks, implement, local_verify");
    expect(await exists(join(root, ".sdd/roles/planner.md"))).toBe(true);
    expect(await exists(join(root, ".sdd/team.yaml"))).toBe(false);
    expect(await exists(join(root, ".sdd/models.yaml"))).toBe(false);
    expect(await exists(join(root, ".sdd/agents.json"))).toBe(false);
    const changes = await readdir(join(root, "changes"));
    expect(changes.filter((name) => !name.startsWith("."))).toEqual([]);
  });

  it("sdd setup --step roles --yes leaves a single role file alone", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-roles-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const planner = join(root, ".sdd/roles/planner.md");
    await mkdir(join(root, ".sdd/roles"), { recursive: true });
    await writeFile(planner, "job: Plan the change\n");
    const ran = runSdd(root, ["setup", "--step", "roles", "--yes"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(0);
    expect(ran.stdout).toContain("Roles are already here.");
    expect(await readFile(planner, "utf8")).toBe("job: Plan the change\n");
    expect(await exists(join(root, ".sdd/roles/architect.md"))).toBe(false);
    expect(await exists(join(root, ".sdd/roles/builder.md"))).toBe(false);
    expect(await exists(join(root, ".sdd/team.yaml"))).toBe(false);
  });

  it("sdd setup --step model --yes exits when no model is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-model-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "model", "--yes"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(1);
    expect(ran.stdout).toContain("No role model is configured.");
    expect(await exists(join(root, ".sdd"))).toBe(false);

    const configured = runSdd(root, ["setup", "--step", "model", "--yes"], {
      SDD_ROLE_MODEL: "echo",
    });
    expect(configured.status, configured.stderr + configured.stdout).toBe(0);
    expect(configured.stdout).toContain("Model: configured.");
    expect(await exists(join(root, ".sdd/models.yaml"))).toBe(false);
  });

  it("sdd setup --step no-such writes nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-bad-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "no-such", "--yes"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(1);
    expect(ran.stdout).toContain(
      "A setup step is not valid. Choose folder, workflow, host, roles, model, check, or start.",
    );
    expect(await exists(join(root, ".sdd"))).toBe(false);
  });

  it("sdd setup --step check prints status and does not initialize", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-check-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "check"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(0);
    expect(ran.stdout).toContain("Folder: not set up.");
    expect(ran.stdout).toContain("Host: none.");
    expect(ran.stdout).toContain("Roles: none.");
    expect(ran.stdout).toContain("Model: No role model is configured.");
    expect(await exists(join(root, ".sdd"))).toBe(false);
  });

  it("a setup step off a terminal asks for --yes and writes nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-tty-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "folder"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(1);
    expect(ran.stdout).toContain("This setup step needs a terminal. Pass --yes.");
    expect(await exists(join(root, ".sdd"))).toBe(false);
  });

  it("sdd setup --step host --yes installs only when --ai is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-host-"));
    temps.push(root);
    const none = runSdd(root, ["setup", "--step", "host", "--yes"]);
    expect(none.status, none.stderr + none.stdout).toBe(0);
    expect(none.stdout).toContain("Host: none.");
    expect(await exists(join(root, ".sdd"))).toBe(false);

    const installed = runSdd(root, ["setup", "--step", "host", "--yes", "--ai", "copilot"]);
    expect(installed.status, installed.stderr + installed.stdout).toBe(0);
    expect(installed.stdout).toContain("Host: copilot.");
    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8")) as {
      ai: string;
    };
    expect(snap.ai).toBe("copilot");

    const stayed = runSdd(root, ["setup", "--step", "host", "--yes", "--ai", "grok"]);
    expect(stayed.status, stayed.stderr + stayed.stdout).toBe(0);
    expect(stayed.stdout).toContain("Host: copilot.");
    expect(await exists(join(root, ".grok/rules/sdd.md"))).toBe(false);
  });

  it("sdd setup --step start --yes does not open a change", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-start-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "start", "--yes"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(0);
    expect(ran.stdout).toContain('Next: sdd go "what you want to build"');
    expect(await exists(join(root, "changes"))).toBe(false);
    expect(await exists(join(root, ".sdd/config.yaml"))).toBe(false);
  });

  it("sdd setup --step workflow --yes writes nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-setup-flow-"));
    temps.push(root);
    const ran = runSdd(root, ["setup", "--step", "workflow", "--yes", "-w", "hotfix"]);
    expect(ran.status, ran.stderr + ran.stdout).toBe(0);
    expect(ran.stdout).toContain("Workflow: hotfix.");
    expect(await exists(join(root, ".sdd"))).toBe(false);
  });
});
