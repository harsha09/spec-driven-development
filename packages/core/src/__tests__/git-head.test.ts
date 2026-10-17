import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { getHeadSha } from "../git-head.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("getHeadSha", () => {
  it("does not invoke Git for a non-repository directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-no-git-"));
    temps.push(root);
    const runner = async () => {
      throw new Error("must not run");
    };

    await expect(getHeadSha(root, runner)).resolves.toBeNull();
  });

  it("returns a validated SHA using the injected Git runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-git-head-"));
    temps.push(root);
    await mkdir(join(root, ".git"));

    await expect(getHeadSha(root, async () => "A".repeat(40))).resolves.toBe("a".repeat(40));
    await expect(getHeadSha(root, async () => "not-a-sha")).rejects.toThrow(/invalid HEAD SHA/i);
  });

  it("reports an unavailable Git executable without fabricating a SHA", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-git-unavailable-"));
    temps.push(root);
    await mkdir(join(root, ".git"));

    await expect(
      getHeadSha(root, async () => Promise.reject(new Error("license unavailable"))),
    ).resolves.toBeNull();
  });
});
