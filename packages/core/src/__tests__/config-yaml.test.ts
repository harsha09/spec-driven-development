import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, loadConfig } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("includes the config file path when the YAML is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-config-yaml-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const path = join(root, ".sdd", "config.yaml");
    await writeFile(path, "version: [\n", "utf8");
    await expect(loadConfig(root)).rejects.toThrow(path);
  });
});
