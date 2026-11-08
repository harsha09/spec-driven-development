/**
 * Isolation profile from `.sdd/sandbox.yaml`. Names of environment variables
 * are stored. Secret values are not.
 */
import "../zod-v3-messages.js";
import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "pathe";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CACHE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const HOST_NAME = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/;

export const SANDBOX_PROFILE_NAMES = ["workspace", "devbox", "read-only"] as const;

export type SandboxProfileName = (typeof SANDBOX_PROFILE_NAMES)[number];

export interface SandboxProfile {
  name: SandboxProfileName;
  /** Environment variable names. Never values. */
  env: string[];
  caches: string[];
  network: string[];
}

export const DEFAULT_SANDBOX_PROFILE: SandboxProfile = {
  name: "devbox",
  env: ["PATH"],
  caches: [],
  network: [],
};

const EnvName = z
  .string()
  .regex(ENV_NAME, "An environment entry must be a variable name, not a value.");

const SandboxProfileSchema = z
  .object({
    profile: z.enum(SANDBOX_PROFILE_NAMES).default("devbox"),
    env: z.unknown().optional(),
    caches: z
      .array(z.string().regex(CACHE_NAME, "A cache entry must be a name, not a path."))
      .default([]),
    network: z
      .array(
        z.string().regex(HOST_NAME, "A network entry must be a host name, not a URL or a secret."),
      )
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.env === undefined) return;
    if (value.env && typeof value.env === "object" && !Array.isArray(value.env)) {
      ctx.addIssue({
        code: "custom",
        path: ["env"],
        message: "Environment entries are variable names only. A secret value is not stored.",
      });
      return;
    }
    if (!Array.isArray(value.env)) {
      ctx.addIssue({
        code: "custom",
        path: ["env"],
        message: "Environment entries must be a list of variable names.",
      });
      return;
    }
    for (const [index, item] of value.env.entries()) {
      const parsed = EnvName.safeParse(item);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["env", index],
          message: "An environment entry must be a variable name, not a value.",
        });
      }
    }
  })
  .transform((value): SandboxProfile => {
    const env = Array.isArray(value.env)
      ? value.env.filter((item): item is string => typeof item === "string" && ENV_NAME.test(item))
      : [...DEFAULT_SANDBOX_PROFILE.env];
    return {
      name: value.profile,
      env,
      caches: value.caches,
      network: value.network,
    };
  });

function errnoCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String(err.code) : "";
}

export function formatSandboxProfileError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "";
  const message = issue?.message ?? "invalid";
  if (!path) return `.sdd/sandbox.yaml is invalid: ${message}`;
  return `.sdd/sandbox.yaml is invalid: ${path} ${message}`;
}

export function parseSandboxProfile(raw: unknown): SandboxProfile | { error: string } {
  if (raw == null) return { ...DEFAULT_SANDBOX_PROFILE, env: [...DEFAULT_SANDBOX_PROFILE.env] };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: ".sdd/sandbox.yaml is invalid: the file must be a map of settings.\n" };
  }
  const parsed = SandboxProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: `${formatSandboxProfileError(parsed.error)}\n` };
  return parsed.data;
}

/** Copy only the named variables. Unlisted names, including secrets, are absent. */
export function profileEnv(
  profile: SandboxProfile,
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of profile.env) {
    const value = source[name];
    if (typeof value === "string") out[name] = value;
  }
  return out;
}

/** A read-only profile cannot write. workspace and devbox can write a relative path. */
export function rejectWrite(profile: SandboxProfile, relPath: string): string | null {
  if (profile.name !== "read-only") return null;
  return `A read-only sandbox cannot write ${relPath || "that path"}.\n`;
}

async function readProfileText(file: string): Promise<string | { error: string }> {
  let st: Stats;
  try {
    st = await lstat(file);
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return { error: "missing" };
    throw err;
  }
  if (st.isSymbolicLink() || !st.isFile()) {
    return { error: "A sandbox path cannot leave the repository.\n" };
  }
  try {
    const fh = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      return await fh.readFile({ encoding: "utf8" });
    } finally {
      await fh.close();
    }
  } catch {
    return { error: "A sandbox path cannot leave the repository.\n" };
  }
}

export async function loadSandboxProfile(
  projectRoot: string,
): Promise<SandboxProfile | { error: string }> {
  const file = join(projectRoot, ".sdd", "sandbox.yaml");
  const text = await readProfileText(file);
  if (typeof text !== "string") {
    if (text.error === "missing") {
      return { ...DEFAULT_SANDBOX_PROFILE, env: [...DEFAULT_SANDBOX_PROFILE.env] };
    }
    return text;
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    return { error: ".sdd/sandbox.yaml is not valid YAML.\n" };
  }
  return parseSandboxProfile(raw);
}
