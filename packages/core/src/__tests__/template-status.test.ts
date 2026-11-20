import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyGeneratedFile,
  collectTemplateStatus,
  contentHash,
  defaultTemplatesDir,
  initProject,
  loadGeneratedManifest,
  saveGeneratedManifest,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function freshProject() {
  const root = await mkdtemp(join(tmpdir(), "sdd-template-status-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

describe("classifyGeneratedFile", () => {
  it("labels the four manifest states", () => {
    const shipped = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const recorded = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(
      classifyGeneratedFile({ currentHash: shipped, manifestHash: shipped, shippedHash: shipped }),
    ).toBe("stock");
    expect(
      classifyGeneratedFile({
        currentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        manifestHash: recorded,
        shippedHash: shipped,
      }),
    ).toBe("customized");
    expect(
      classifyGeneratedFile({
        currentHash: recorded,
        manifestHash: recorded,
        shippedHash: shipped,
      }),
    ).toBe("stock-but-outdated");
    expect(classifyGeneratedFile({ currentHash: shipped, shippedHash: shipped })).toBe("unknown");
  });
});

describe("collectTemplateStatus", () => {
  it("reports stock after init", async () => {
    const root = await freshProject();
    const report = await collectTemplateStatus(root);
    expect(
      report.files.some((f) => f.path === ".sdd/workflows/feature.yaml" && f.state === "stock"),
    ).toBe(true);
    expect(report.summary["stock-but-outdated"]).toBe(0);
  });

  it("reports customized when a file diverges from the manifest", async () => {
    const root = await freshProject();
    const path = join(root, ".sdd/templates/intent.md");
    await writeFile(path, `${await readFile(path, "utf8")}\n# edited\n`);
    const report = await collectTemplateStatus(root);
    const row = report.files.find((f) => f.path === ".sdd/templates/intent.md");
    expect(row?.state).toBe("customized");
    expect(report.summary.customized).toBeGreaterThanOrEqual(1);
  });

  it("reports stock-but-outdated when the manifest records an older shipped body", async () => {
    const root = await freshProject();
    const projectRelative = ".sdd/templates/intent.md";
    const shipped = await readFile(join(defaultTemplatesDir(), "intent.md"), "utf8");
    const shippedHash = contentHash(shipped);
    const stale = `${shipped}\n<!-- test-only older body -->\n`;
    const staleHash = contentHash(stale);
    expect(staleHash).not.toBe(shippedHash);
    await writeFile(join(root, projectRelative), stale);
    const manifestPath = join(root, ".sdd/.generated.json");
    const manifest = await loadGeneratedManifest(manifestPath);
    manifest.files[projectRelative] = staleHash;
    await saveGeneratedManifest(manifestPath, manifest);
    const report = await collectTemplateStatus(root);
    const row = report.files.find((f) => f.path === projectRelative);
    expect(row?.state).toBe("stock-but-outdated");
  });

  it("reports unknown for a role file with no manifest hash", async () => {
    const root = await freshProject();
    const roles = join(root, ".sdd/roles");
    await mkdir(roles, { recursive: true });
    const custom = join(roles, "custom.md");
    await writeFile(custom, "---\nname: custom\nlabel: Custom\njob: Test\n---\n");
    const report = await collectTemplateStatus(root);
    const row = report.files.find((f) => f.path === ".sdd/roles/custom.md");
    expect(row?.state).toBe("unknown");
    expect(row?.kind).toBe("role");
  });

  it("prints stable JSON field order", async () => {
    const root = await freshProject();
    const report = await collectTemplateStatus(root);
    const json = JSON.parse(JSON.stringify(report)) as {
      version: number;
      files: { path: string; kind: string; state: string }[];
      summary: Record<string, number>;
    };
    expect(json.version).toBe(1);
    const paths = json.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
  });
});
