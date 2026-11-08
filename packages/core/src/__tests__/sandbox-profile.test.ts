import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_PROFILE,
  loadSandboxProfile,
  parseSandboxProfile,
  profileEnv,
  rejectWrite,
} from "../sandbox/profile.js";

const temps: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function sddDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-profile-"));
  temps.push(root);
  await mkdir(join(root, ".sdd"));
  return root;
}

describe("sandbox isolation profile", () => {
  it("defaults to devbox when .sdd/sandbox.yaml is missing", async () => {
    const root = await sddDir();
    const profile = await loadSandboxProfile(root);
    expect(profile).toEqual({
      ...DEFAULT_SANDBOX_PROFILE,
      env: ["PATH"],
    });
    expect("error" in profile).toBe(false);
  });

  it("rejects yaml that does not parse", async () => {
    const root = await sddDir();
    await writeFile(join(root, ".sdd", "sandbox.yaml"), "profile: [\n");
    const profile = await loadSandboxProfile(root);
    expect(profile).toEqual({ error: ".sdd/sandbox.yaml is not valid YAML.\n" });
  });

  it("rejects unknown keys", () => {
    const profile = parseSandboxProfile({ profile: "devbox", nope: 1 });
    expect(profile).toEqual({
      error: ".sdd/sandbox.yaml is invalid: Unrecognized key(s) in object: 'nope'\n",
    });
  });

  it("stores environment variable names and never a secret value", () => {
    const secret = "s3cret-value-profile";
    const assigned = parseSandboxProfile({
      profile: "devbox",
      env: { NPM_TOKEN: secret },
    });
    expect("error" in assigned).toBe(true);
    if ("error" in assigned) {
      expect(assigned.error).toContain("variable names only");
      expect(assigned.error).not.toContain(secret);
    }

    const inline = parseSandboxProfile({
      profile: "workspace",
      env: [`NPM_TOKEN=${secret}`],
    });
    expect("error" in inline).toBe(true);
    if ("error" in inline) {
      expect(inline.error).toContain("variable name, not a value");
      expect(inline.error).not.toContain(secret);
    }

    const named = parseSandboxProfile({
      profile: "devbox",
      env: ["PATH", "NPM_TOKEN"],
    });
    expect(named).toEqual({
      name: "devbox",
      env: ["PATH", "NPM_TOKEN"],
      caches: [],
      network: [],
    });
    expect(JSON.stringify(named)).not.toContain(secret);
    if (!("error" in named)) {
      const projected = profileEnv(named, {
        PATH: "/usr/bin",
        NPM_TOKEN: secret,
        UNLISTED: secret,
      });
      expect(projected).toEqual({ PATH: "/usr/bin", NPM_TOKEN: secret });
      expect(projected.UNLISTED).toBeUndefined();
    }
  });

  it("rejects a write when the profile is read-only", () => {
    const readOnly = parseSandboxProfile({ profile: "read-only" });
    const devbox = parseSandboxProfile({});
    expect("error" in readOnly).toBe(false);
    expect("error" in devbox).toBe(false);
    if (!("error" in readOnly) && !("error" in devbox)) {
      expect(rejectWrite(readOnly, "src/app.ts")).toBe(
        "A read-only sandbox cannot write src/app.ts.\n",
      );
      expect(rejectWrite(devbox, "src/app.ts")).toBeNull();
      expect(devbox.name).toBe("devbox");
      expect(devbox.env).toEqual(["PATH"]);
    }
  });
});
