import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, relative } from "pathe";
import { parseDocument } from "yaml";
import { SddError } from "./errors.js";
import { ensureDir, pathExists, readText, writeText } from "./fs.js";
import { sddRoot } from "./paths.js";
import { type Config, ConfigSchema } from "./schemas.js";

/**
 * `.sdd/.generated.json` records the sha256 of every `.sdd/` state file sdd wrote
 * (workflows, templates). Unlike agent files, these can't carry an in-file
 * marker: templates are copied into change packs and the marker would leak.
 *
 * On re-init a file is refreshed only while its content still matches the hash
 * sdd recorded. Edited files, and files sdd has no record of, are kept.
 */
export const MANIFEST_FILE = ".generated.json";

export interface GeneratedManifest {
  version: 1;
  /** Project-relative path (e.g. `.sdd/workflows/hotfix.yaml`) → sha256 of what sdd wrote */
  files: Record<string, string>;
}

/** Why an `.sdd/` state file was left alone on init. */
export interface KeptStateFile {
  /** Project-relative path */
  path: string;
  /** edited: sdd wrote it, then it changed · not-generated: sdd has no record of writing it */
  reason: "edited" | "not-generated";
}

export function describeKeptState(k: KeptStateFile): string {
  return k.reason === "edited"
    ? `${k.path} (edited since sdd wrote it — kept)`
    : `${k.path} (no record of sdd writing it — kept)`;
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function manifestPath(projectRoot: string): string {
  return join(sddRoot(projectRoot), MANIFEST_FILE);
}

export async function loadManifest(projectRoot: string): Promise<GeneratedManifest> {
  const path = manifestPath(projectRoot);
  if (!(await pathExists(path))) return { version: 1, files: {} };
  try {
    const raw = JSON.parse(await readText(path)) as Partial<GeneratedManifest>;
    const files: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.files ?? {})) {
      if (typeof v === "string" && /^[0-9a-f]{64}$/.test(v)) files[k] = v;
    }
    return { version: 1, files };
  } catch {
    // A corrupt manifest means no record: every existing file is treated as the user's.
    return { version: 1, files: {} };
  }
}

export async function saveManifest(
  projectRoot: string,
  manifest: GeneratedManifest,
): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeText(
    manifestPath(projectRoot),
    `${JSON.stringify({ version: 1, files: sorted }, null, 2)}\n`,
  );
}

export interface ManagedCopyResult {
  /** Files written (new, or refreshed under force) */
  written: string[];
  /** Unedited files left as they were because force was not set */
  skipped: string[];
  kept: KeptStateFile[];
}

/**
 * Copy a defaults tree into `.sdd/` using the manifest:
 * - missing file → write it and record its hash
 * - identical to the default → record the hash (adopts files from older versions)
 * - unchanged since sdd wrote it (hash matches the record) → refresh only with `force`
 * - anything else (edited, or no record) → keep and report; never overwritten
 */
export async function copyDefaultsManaged(
  projectRoot: string,
  srcDir: string,
  destDir: string,
  manifest: GeneratedManifest,
  opts: { force: boolean },
): Promise<ManagedCopyResult> {
  const out: ManagedCopyResult = { written: [], skipped: [], kept: [] };
  const walk = async (src: string, dest: string): Promise<void> => {
    await ensureDir(dest);
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      const from = join(src, entry.name);
      const to = join(dest, entry.name);
      if (entry.isDirectory()) {
        await walk(from, to);
        continue;
      }
      const rel = relative(projectRoot, to);
      const fresh = await fs.readFile(from);
      const freshHash = sha256(fresh);
      if (!(await pathExists(to))) {
        await fs.writeFile(to, fresh);
        manifest.files[rel] = freshHash;
        out.written.push(rel);
        continue;
      }
      const currentHash = sha256(await fs.readFile(to));
      if (currentHash === freshHash) {
        manifest.files[rel] = freshHash;
        continue;
      }
      const recorded = manifest.files[rel];
      if (recorded && recorded === currentHash) {
        if (opts.force) {
          await fs.writeFile(to, fresh);
          manifest.files[rel] = freshHash;
          out.written.push(rel);
        } else {
          out.skipped.push(rel);
        }
        continue;
      }
      out.kept.push({ path: rel, reason: recorded ? "edited" : "not-generated" });
    }
  };
  await walk(srcDir, destDir);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Key paths present in `defaults` but missing from `user` (objects recurse; arrays are values). */
function missingPaths(
  defaults: Record<string, unknown>,
  user: Record<string, unknown>,
  prefix: string[] = [],
): { path: string[]; value: unknown }[] {
  const out: { path: string[]; value: unknown }[] = [];
  for (const [k, v] of Object.entries(defaults)) {
    if (v === undefined) continue;
    if (!(k in user)) out.push({ path: [...prefix, k], value: v });
    else if (isPlainObject(v) && isPlainObject(user[k])) {
      out.push(...missingPaths(v, user[k] as Record<string, unknown>, [...prefix, k]));
    }
  }
  return out;
}

export interface ConfigMergeResult {
  config: Config;
  /** Dotted keys added from the current defaults (user values are never changed) */
  added: string[];
  /** True when config.yaml was (re)written */
  written: boolean;
}

/**
 * Merge `defaults` into an existing `.sdd/config.yaml`: the user's values always win,
 * only missing keys are added, and comments/ordering are preserved. The file is
 * not touched when nothing is missing.
 */
export async function mergeConfigFile(path: string, defaults: Config): Promise<ConfigMergeResult> {
  const text = await readText(path);
  const doc = parseDocument(text);
  if (doc.errors.length) {
    throw new SddError(
      `${path} is not valid YAML (${doc.errors[0]!.message.split("\n")[0]}). Fix it or move it away, then re-run sdd init --force. Nothing was changed.`,
      { code: "CONFIG_INVALID" },
    );
  }
  const userRaw = doc.toJS() ?? {};
  if (!isPlainObject(userRaw)) {
    throw new SddError(`${path} must be a YAML mapping. Nothing was changed.`, {
      code: "CONFIG_INVALID",
    });
  }
  const missing = missingPaths(defaults as unknown as Record<string, unknown>, userRaw);
  for (const m of missing) doc.setIn(m.path, m.value);
  const parsed = ConfigSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SddError(
      `${path} has an invalid value at "${issue?.path.join(".")}": ${issue?.message}. Fix it, then re-run. Nothing was changed.`,
      { code: "CONFIG_INVALID" },
    );
  }
  if (missing.length) await writeText(path, doc.toString());
  return {
    config: parsed.data,
    added: missing.map((m) => m.path.join(".")),
    written: missing.length > 0,
  };
}
