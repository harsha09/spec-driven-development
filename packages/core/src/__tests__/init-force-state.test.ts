/**
 * #15: `sdd init --force` keeps the user's .sdd/ state — config values win, and
 * workflows/templates are refreshed only while unchanged since sdd wrote them
 * (hash manifest `.sdd/.generated.json`).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultTemplatesDir,
  defaultWorkflowsDir,
  initProject,
  installAgentIntegration,
  loadConfig,
  loadManifest,
  pathExists,
  sha256,
} from "../index.js";

const temps: string[] = [];
afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function fresh(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-force-state-"));
  temps.push(dir);
  return dir;
}

const read = (root: string, rel: string) => readFile(join(root, rel), "utf8");

describe("init --force keeps .sdd/ state (#15)", () => {
  it("records every shipped workflow and template in .sdd/.generated.json", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root });
    const m = await loadManifest(root);
    const hotfix = await read(root, ".sdd/workflows/hotfix.yaml");
    expect(m.files[".sdd/workflows/hotfix.yaml"]).toBe(sha256(hotfix));
    expect(m.files[".sdd/templates/intent.md"]).toBe(
      sha256(await read(root, ".sdd/templates/intent.md")),
    );
    expect(Object.keys(m.files).length).toBeGreaterThanOrEqual(20);
  });

  it("keeps an edited workflow, an edited template and custom config values", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root });
    const cfg = (await read(root, ".sdd/config.yaml"))
      .replace("changes_path: changes", "changes_path: .sdd/changes")
      .replace("memory_path: memory", "memory_path: docs/memory");
    await writeFile(join(root, ".sdd/config.yaml"), `# team config\n${cfg}`);
    const wf = `${await read(root, ".sdd/workflows/patch.yaml")}# team note\n`;
    await writeFile(join(root, ".sdd/workflows/patch.yaml"), wf);
    const tpl = `${await read(root, ".sdd/templates/intent.md")}Team-specific intent prompt.\n`;
    await writeFile(join(root, ".sdd/templates/intent.md"), tpl);
    const cfgBefore = await read(root, ".sdd/config.yaml");

    const res = await initProject({ projectRoot: root, force: true });

    expect(await read(root, ".sdd/workflows/patch.yaml")).toBe(wf);
    expect(await read(root, ".sdd/templates/intent.md")).toBe(tpl);
    // nothing missing → config.yaml byte-identical (comment kept)
    expect(await read(root, ".sdd/config.yaml")).toBe(cfgBefore);
    const config = await loadConfig(root);
    expect(config.changes_path).toBe(".sdd/changes");
    expect(config.memory_path).toBe("docs/memory");
    expect(res.config.changes_path).toBe(".sdd/changes");
    expect(await pathExists(join(root, ".sdd/changes"))).toBe(true);
    expect(res.stateKept).toEqual(
      expect.arrayContaining([
        { path: ".sdd/workflows/patch.yaml", reason: "edited" },
        { path: ".sdd/templates/intent.md", reason: "edited" },
      ]),
    );
    expect(res.configAdded).toEqual([]);
  });

  it("adds missing default keys to config.yaml without touching user values or comments", async () => {
    const root = await fresh();
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(
      join(root, ".sdd/config.yaml"),
      "# ours\nversion: 1\nchanges_path: work/changes\npolicy:\n  gates: hard # strict\n",
    );
    const res = await initProject({ projectRoot: root, force: true });
    const text = await read(root, ".sdd/config.yaml");
    expect(text).toContain("# ours");
    expect(text).toContain("gates: hard # strict");
    expect(text).toContain("changes_path: work/changes");
    expect(res.configAdded).toEqual(expect.arrayContaining(["memory_path", "persistence"]));
    expect(res.configAdded).not.toContain("changes_path");
    const config = await loadConfig(root);
    expect(config.policy.gates).toBe("hard");
    expect(config.changes_path).toBe("work/changes");
  });

  it("refreshes unedited files only with --force", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root });
    // Simulate an older shipped default: sdd wrote this content and recorded its hash.
    const old = "name: hotfix\n# older default\n";
    await writeFile(join(root, ".sdd/workflows/hotfix.yaml"), old);
    const manifestPath = join(root, ".sdd/.generated.json");
    const m = JSON.parse(await readFile(manifestPath, "utf8"));
    m.files[".sdd/workflows/hotfix.yaml"] = sha256(old);
    await writeFile(manifestPath, JSON.stringify(m));
    const shipped = await readFile(join(defaultWorkflowsDir(), "hotfix.yaml"), "utf8");

    // No --force (fresh init path: config.yaml missing) → left alone, reported as skipped
    await rm(join(root, ".sdd/config.yaml"));
    const noForce = await initProject({ projectRoot: root });
    expect(await read(root, ".sdd/workflows/hotfix.yaml")).toBe(old);
    expect(noForce.stateSkipped).toContain(".sdd/workflows/hotfix.yaml");

    const forced = await initProject({ projectRoot: root, force: true });
    expect(await read(root, ".sdd/workflows/hotfix.yaml")).toBe(shipped);
    expect(forced.stateKept.map((k) => k.path)).not.toContain(".sdd/workflows/hotfix.yaml");
    expect((await loadManifest(root)).files[".sdd/workflows/hotfix.yaml"]).toBe(sha256(shipped));
  });

  it("fresh init without --force never overwrites existing .sdd/ workflows or templates (F2)", async () => {
    const root = await fresh();
    await mkdir(join(root, ".sdd/workflows"), { recursive: true });
    await mkdir(join(root, ".sdd/templates"), { recursive: true });
    await writeFile(join(root, ".sdd/workflows/hotfix.yaml"), "# mine\n");
    await writeFile(join(root, ".sdd/templates/intent.md"), "# mine\n");
    const res = await initProject({ projectRoot: root });
    expect(await read(root, ".sdd/workflows/hotfix.yaml")).toBe("# mine\n");
    expect(await read(root, ".sdd/templates/intent.md")).toBe("# mine\n");
    expect(res.stateKept).toEqual(
      expect.arrayContaining([
        { path: ".sdd/workflows/hotfix.yaml", reason: "not-generated" },
        { path: ".sdd/templates/intent.md", reason: "not-generated" },
      ]),
    );
    // and they stay the user's under --force too (no record of sdd writing them)
    await initProject({ projectRoot: root, force: true });
    expect(await read(root, ".sdd/workflows/hotfix.yaml")).toBe("# mine\n");
  });

  it("adopts files identical to the shipped default (upgrade from a version without a manifest)", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root });
    await rm(join(root, ".sdd/.generated.json"));
    const res = await initProject({ projectRoot: root, force: true });
    expect(res.stateKept).toEqual([]);
    const m = await loadManifest(root);
    expect(m.files[".sdd/templates/intent.md"]).toBe(
      sha256(await readFile(join(defaultTemplatesDir(), "intent.md"))),
    );
  });

  it("invalid config.yaml fails clearly and changes nothing", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root });
    await writeFile(join(root, ".sdd/config.yaml"), "version: 1\n  bad: [\n");
    await writeFile(join(root, ".sdd/workflows/patch.yaml"), "# mine\n");
    await expect(initProject({ projectRoot: root, force: true })).rejects.toThrow(
      /config\.yaml is not valid YAML.*Nothing was changed/,
    );
    expect(await read(root, ".sdd/config.yaml")).toBe("version: 1\n  bad: [\n");
  });

  it("agents.json keeps keys sdd does not own when re-installed with --force", async () => {
    const root = await fresh();
    await initProject({ projectRoot: root, agents: "copilot" });
    const snap = JSON.parse(await read(root, ".sdd/agents.json"));
    await writeFile(join(root, ".sdd/agents.json"), JSON.stringify({ ...snap, myKey: 1 }));
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const after = JSON.parse(await read(root, ".sdd/agents.json"));
    expect(after.myKey).toBe(1);
    expect(after.ai).toBe("grok");
  });
});
