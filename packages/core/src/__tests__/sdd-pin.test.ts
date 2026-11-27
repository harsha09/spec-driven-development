import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { readSddPin, sddPinPath } from "../sdd-pin.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd pin", () => {
  it("is absent until .sdd/sdd-pin.yaml exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-pin-absent-"));
    temps.push(root);
    expect(await readSddPin(root)).toEqual({ state: "absent" });
  });

  it("reads a version and an optional package name", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-pin-ok-"));
    temps.push(root);
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(
      sddPinPath(root),
      '# Compared by sdd --version and sdd doctor.\nversion: 0.24.0\npackage: "@structured-vibe-coding/cli"\n',
    );
    expect(await readSddPin(root)).toEqual({
      state: "ok",
      version: "0.24.0",
      packageName: "@structured-vibe-coding/cli",
    });
  });

  it("reports a pin that has no version", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-pin-bad-"));
    temps.push(root);
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(sddPinPath(root), "package: demo\n");
    const read = await readSddPin(root);
    expect(read.state).toBe("invalid");
    if (read.state === "invalid") expect(read.message).toContain("version");
  });
});
