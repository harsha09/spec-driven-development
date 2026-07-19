/**
 * Stable memory (constitution, product, …) must survive sdd init --force.
 */
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, pathExists } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("memory preserve on init --force", () => {
  it("does not overwrite a filled constitution on force re-init", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-mem-"));
    temps.push(root);

    await initProject({ projectRoot: root, agents: false });
    const constitutionPath = join(root, "memory/constitution.md");
    expect(await pathExists(constitutionPath)).toBe(true);

    const custom = `# Constitution

## Principles

- CUSTOM NON-NEGOTIABLE: never force-overwrite this file on sdd init --force
- Agents must honor this filled constitution

## Stack & tooling

- Keep custom content forever

## Testing

- Unit tests lock preserve behavior

## Security

- No secrets

## Process

- Spec-first
`;
    await writeFile(constitutionPath, custom, "utf8");

    await initProject({ projectRoot: root, agents: false, force: true });

    const after = await readFile(constitutionPath, "utf8");
    expect(after).toContain("CUSTOM NON-NEGOTIABLE");
    expect(after).toContain("never force-overwrite");
    expect(after).not.toMatch(/^\s*-\s*$/m); // not blank stub-only bullets only
  });

  it("still adds constitution when missing on force re-init", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-mem-add-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    await rm(join(root, "memory/constitution.md"), { force: true });
    expect(await pathExists(join(root, "memory/constitution.md"))).toBe(false);

    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await pathExists(join(root, "memory/constitution.md"))).toBe(true);
    const body = await readFile(join(root, "memory/constitution.md"), "utf8");
    expect(body).toMatch(/Constitution/i);
  });
});
