import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { pathExists } from "../index.js";
import { formatSetupStatus, parseSetupStep, readSetupStatus, runSetupStep } from "../role/index.js";

const temps: string[] = [];
const quiet: Record<string, string | undefined> = {};

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function emptyDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-setup-"));
  temps.push(root);
  return root;
}

const validModels = [
  "version: 1",
  "models:",
  "  rules: { kind: decide, provider: rules }",
  "  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
  "defaults:",
  "  by_work_type:",
  "    route: rules",
  "    classify: rules",
  "    check: rules",
  "    draft: strong",
  "    design: strong",
  "    code: strong",
  "    review: strong",
  "  fallback_reason: strong",
  "  fallback_decide: rules",
].join("\n");

describe("setup tour", () => {
  it("reads an empty folder as not set up", async () => {
    const root = await emptyDir();
    const status = await readSetupStatus(root, quiet);
    expect(status).toEqual({ folder: false, host: null, roles: [], model: "missing" });
    expect(formatSetupStatus(status)).toBe(
      [
        "Folder: not set up.",
        "Host: none.",
        "Roles: none.",
        "Model: No role model is configured.",
      ].join("\n"),
    );
    expect(parseSetupStep(" model ")).toBe("model");
    expect(parseSetupStep("no-such")).toBeNull();
  });

  it("initializes the folder once and leaves an edited config in place", async () => {
    const root = await emptyDir();
    const first = await runSetupStep(root, { step: "folder" }, quiet);
    expect(first).toEqual({ exitCode: 0, stdout: "Folder: ready." });
    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(false);
    const config = await readFile(join(root, ".sdd/config.yaml"), "utf8");
    await writeFile(join(root, ".sdd/config.yaml"), `${config}\n# kept\n`);
    const again = await runSetupStep(root, { step: "folder" }, quiet);
    expect(again.exitCode).toBe(0);
    expect(await readFile(join(root, ".sdd/config.yaml"), "utf8")).toContain("# kept");
  });

  it("names a workflow and writes nothing", async () => {
    const root = await emptyDir();
    const named = await runSetupStep(root, { step: "workflow", workflow: "hotfix" }, quiet);
    expect(named).toEqual({ exitCode: 0, stdout: "Workflow: hotfix." });
    expect(await pathExists(join(root, ".sdd"))).toBe(false);
    await mkdir(join(root, ".sdd/roles"), { recursive: true });
    await writeFile(join(root, ".sdd/roles/planner.md"), "job: Plan\n");
    const withRoles = await runSetupStep(root, { step: "workflow" }, quiet);
    expect(withRoles.stdout).toBe("Workflow: feature.\nRoles are already here.");
    expect(await readFile(join(root, ".sdd/roles/planner.md"), "utf8")).toBe("job: Plan\n");
  });

  it("installs a host once and does not switch it", async () => {
    const root = await emptyDir();
    const none = await runSetupStep(root, { step: "host", host: false }, quiet);
    expect(none).toEqual({ exitCode: 0, stdout: "Host: none." });
    expect(await pathExists(join(root, ".sdd"))).toBe(false);

    const installed = await runSetupStep(root, { step: "host", host: "copilot" }, quiet);
    expect(installed).toEqual({ exitCode: 0, stdout: "Host: copilot." });
    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8")) as {
      ai: string;
    };
    expect(snap.ai).toBe("copilot");

    const stayed = await runSetupStep(root, { step: "host", host: "grok" }, quiet);
    expect(stayed).toEqual({ exitCode: 0, stdout: "Host: copilot." });
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(false);
  });

  it("writes the three duties once and leaves a later duty file alone", async () => {
    const root = await emptyDir();
    const ready = await runSetupStep(root, { step: "roles", roles: "duties" }, quiet);
    expect(ready.exitCode).toBe(0);
    expect(ready.stdout).toContain("planner: intent, clarify_intent, brainstorm");
    expect(ready.stdout).toContain("sdd role edit <name> --stages");
    expect(ready.stdout).toContain('sdd role context <name> --text "..."');
    const planner = await readFile(join(root, ".sdd/roles/planner.md"), "utf8");
    const again = await runSetupStep(
      root,
      { step: "roles", roles: "duties", workflow: "hotfix" },
      quiet,
    );
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain("Roles are already here.");
    expect(await readFile(join(root, ".sdd/roles/planner.md"), "utf8")).toBe(planner);
    expect(await pathExists(join(root, ".sdd/team.yaml"))).toBe(false);

    const blocked = await runSetupStep(root, { step: "roles", roles: "software" }, quiet);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stdout).toBe("Role already exists: architect. Nothing was written.");
    expect(await pathExists(join(root, ".sdd/team.yaml"))).toBe(false);
  });

  it("does not fill duties beside an existing role file", async () => {
    const root = await emptyDir();
    await mkdir(join(root, ".sdd/roles"), { recursive: true });
    await writeFile(join(root, ".sdd/roles/note.md"), "job: Note\n");
    const kept = await runSetupStep(root, { step: "roles" }, quiet);
    expect(kept.exitCode).toBe(0);
    expect(kept.stdout).toContain("Roles are already here.");
    expect(await pathExists(join(root, ".sdd/roles/planner.md"))).toBe(false);
  });

  it("treats team.yaml alone as no roles and still writes the three duties", async () => {
    const root = await emptyDir();
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(join(root, ".sdd/team.yaml"), "version: 1\n");
    const ready = await runSetupStep(root, { step: "roles", roles: "duties" }, quiet);
    expect(ready.exitCode).toBe(0);
    expect(await pathExists(join(root, ".sdd/roles/planner.md"))).toBe(true);
    expect(await readFile(join(root, ".sdd/team.yaml"), "utf8")).toBe("version: 1\n");
  });

  it("writes the software team on an empty folder and skips planner", async () => {
    const root = await emptyDir();
    const ready = await runSetupStep(root, { step: "roles", roles: "software" }, quiet);
    expect(ready.exitCode).toBe(0);
    expect(ready.stdout).toContain("Wrote .sdd/team.yaml from software.");
    expect(ready.stdout).toContain("sdd role edit <name> --stages");
    expect(await pathExists(join(root, ".sdd/roles/architect.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/roles/planner.md"))).toBe(false);
  });

  it("keeps an empty roles folder and names the edit commands", async () => {
    const root = await emptyDir();
    const kept = await runSetupStep(root, { step: "roles", roles: "keep" }, quiet);
    expect(kept.exitCode).toBe(0);
    expect(kept.stdout).toContain("Roles: none.");
    expect(kept.stdout).toContain("sdd role edit <name> --stages");
    expect(await pathExists(join(root, ".sdd"))).toBe(false);
  });

  it("reports a missing model without writing models.yaml", async () => {
    const root = await emptyDir();
    const required = await runSetupStep(root, { step: "model", requireModel: true }, quiet);
    expect(required).toEqual({ exitCode: 1, stdout: "No role model is configured." });
    const printed = await runSetupStep(root, { step: "model", requireModel: false }, quiet);
    expect(printed).toEqual({ exitCode: 0, stdout: "No role model is configured." });
    expect(await pathExists(join(root, ".sdd/models.yaml"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(false);

    const configured = await runSetupStep(
      root,
      { step: "model", requireModel: true },
      {
        SDD_ROLE_MODEL: "echo",
      },
    );
    expect(configured).toEqual({ exitCode: 0, stdout: "Model: configured." });
    expect(await pathExists(join(root, ".sdd/models.yaml"))).toBe(false);
  });

  it("reads a valid models file and leaves an invalid one unchanged", async () => {
    const root = await emptyDir();
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(join(root, ".sdd/models.yaml"), validModels);
    const ready = await runSetupStep(root, { step: "model", requireModel: true }, quiet);
    expect(ready).toEqual({ exitCode: 0, stdout: "Model: configured." });

    await writeFile(join(root, ".sdd/models.yaml"), "version: [\n");
    const bad = await runSetupStep(root, { step: "model", requireModel: false }, quiet);
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout).toBe("models.yaml is invalid: models could not be parsed");
    expect(await readFile(join(root, ".sdd/models.yaml"), "utf8")).toBe("version: [\n");
  });

  it("prints status and the next command without opening a change", async () => {
    const root = await emptyDir();
    const check = await runSetupStep(root, { step: "check" }, quiet);
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("Folder: not set up.");
    expect(check.stdout).toContain("Host: none.");
    expect(check.stdout).toContain("Roles: none.");
    expect(check.stdout).toContain("Model: No role model is configured.");
    const start = await runSetupStep(root, { step: "start" }, quiet);
    expect(start).toEqual({
      exitCode: 0,
      stdout: 'Next: sdd go "what you want to build"',
    });
    expect(await pathExists(join(root, "changes"))).toBe(false);
    expect(await pathExists(join(root, ".sdd"))).toBe(false);
  });
});
