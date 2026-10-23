import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join } from "pathe";
import { z } from "zod";
import { listDirs, listFiles, pathExists, readText, writeText } from "./fs.js";

/**
 * Markers for files sdd generates outside its own state (AGENTS.md, host agent
 * stubs, protocol). The marker carries a sha256 of the generated body, so sdd
 * can tell three cases apart:
 *
 * - `unmodified`: sdd wrote it and nobody changed it. Safe to regenerate or remove.
 * - `edited`: sdd wrote it, then someone edited it. Never overwrite or delete.
 * - `not-generated`: no marker (a user's own file, another tool's, or an old sdd
 *   version's). Never overwrite or delete.
 */
export type GeneratedState = "unmodified" | "edited" | "not-generated";

// Trailing spaces/tabs after `-->` and CRLF line endings are tolerated.
const MARKER_RE = /^<!-- sdd:generated sha256=([0-9a-f]{64})\b[^\n]*-->[ \t]*\r?\n/m;

/** Line endings are normalized (CRLF → LF) so a Windows/autocrlf checkout is not "edited". */
export function contentHash(body: string): string {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function markerLine(hash: string): string {
  return `<!-- sdd:generated sha256=${hash} (sdd regenerates this file only while it is unchanged; edit freely) -->\n`;
}

/** Insert the marker after YAML front matter (agent hosts parse it) or at the top. */
export function markGenerated(body: string): string {
  const line = markerLine(contentHash(body));
  if (body.startsWith("---\n")) {
    const close = body.indexOf("\n---\n", 3);
    if (close !== -1) {
      const at = close + "\n---\n".length;
      return body.slice(0, at) + line + body.slice(at);
    }
  }
  return line + body;
}

export function generatedState(content: string): GeneratedState {
  const m = MARKER_RE.exec(content);
  if (!m) return "not-generated";
  const body = content.slice(0, m.index) + content.slice(m.index + m[0].length);
  return contentHash(body) === m[1] ? "unmodified" : "edited";
}

/**
 * Why a file was left alone:
 * - `not-generated` / `edited`: see {@link GeneratedState}
 * - `symlink`: a symbolic link (or a path through one); sdd never follows, writes
 *   through, or deletes through links
 * - `unreadable`: could not be read, so sdd cannot prove it generated it
 */
export type KeptReason = "not-generated" | "edited" | "symlink" | "unreadable";

export interface KeptFile {
  /** Project-relative path */
  path: string;
  reason: KeptReason;
}

const GeneratedManifestSchema = z
  .object({
    version: z.literal(1),
    files: z.record(z.string().regex(/^[0-9a-f]{64}$/)),
  })
  .strict();

export type GeneratedManifest = z.infer<typeof GeneratedManifestSchema>;

export interface ReconcileGeneratedResult {
  created: string[];
  refreshed: string[];
  kept: KeptFile[];
  changed: boolean;
}

export async function loadGeneratedManifest(path: string): Promise<GeneratedManifest> {
  let st: Awaited<ReturnType<typeof lstat>>;
  try {
    st = await lstat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, files: {} };
    throw err;
  }
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(`Cannot trust generated file manifest at ${path}; no files were changed.`);
  }
  try {
    return GeneratedManifestSchema.parse(JSON.parse(await readText(path)));
  } catch (err) {
    throw new Error(
      `Invalid generated file manifest at ${path}: ${err instanceof Error ? err.message : String(err)}. No files were changed.`,
    );
  }
}

export async function saveGeneratedManifest(
  path: string,
  manifest: GeneratedManifest,
): Promise<void> {
  const validated = GeneratedManifestSchema.parse(manifest);
  const files = Object.fromEntries(
    Object.entries(validated.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeText(path, `${JSON.stringify({ version: 1, files }, null, 2)}\n`);
}

async function defaultFiles(sourceDir: string, relativeDir = ""): Promise<string[]> {
  const files = (await listFiles(join(sourceDir, relativeDir))).map((file) =>
    [relativeDir, file].filter(Boolean).join("/"),
  );
  const nested = await Promise.all(
    (await listDirs(join(sourceDir, relativeDir))).map((dir) =>
      defaultFiles(sourceDir, [relativeDir, dir].filter(Boolean).join("/")),
    ),
  );
  return [...files, ...nested.flat()].sort();
}

async function symlinkInPath(projectRoot: string, relativePath: string): Promise<string | null> {
  let current = projectRoot;
  const parts = relativePath.split("/");
  const traversed: string[] = [];
  for (const part of parts) {
    current = join(current, part);
    traversed.push(part);
    try {
      if ((await lstat(current)).isSymbolicLink()) return traversed.join("/");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw err;
    }
  }
  return null;
}

export async function reconcileGeneratedTree(
  projectRoot: string,
  sourceDir: string,
  destinationDir: string,
  destinationRelative: string,
  manifest: GeneratedManifest,
  force: boolean,
): Promise<ReconcileGeneratedResult> {
  const created: string[] = [];
  const refreshed: string[] = [];
  const kept: KeptFile[] = [];
  let changed = false;

  for (const relativeFile of await defaultFiles(sourceDir)) {
    const projectRelative = `${destinationRelative}/${relativeFile}`;
    const sourcePath = join(sourceDir, relativeFile);
    const destPath = join(destinationDir, relativeFile);
    const symlinkPath = await symlinkInPath(projectRoot, projectRelative);
    if (symlinkPath) {
      kept.push({ path: symlinkPath, reason: "symlink" });
      continue;
    }

    const generated = await readText(sourcePath);
    const generatedHash = contentHash(generated);
    if (!(await pathExists(destPath))) {
      await writeText(destPath, generated);
      manifest.files[projectRelative] = generatedHash;
      created.push(projectRelative);
      changed = true;
      continue;
    }

    let current: string;
    try {
      const st = await lstat(destPath);
      if (!st.isFile()) {
        kept.push({ path: projectRelative, reason: "unreadable" });
        continue;
      }
      current = await readText(destPath);
    } catch {
      kept.push({ path: projectRelative, reason: "unreadable" });
      continue;
    }

    const currentHash = contentHash(current);
    let previousHash = manifest.files[projectRelative];
    if (!previousHash) {
      // No recorded hash. A byte-for-byte match (line endings aside) is the
      // bundled file, so record it. A later --force can then refresh it.
      // Anything else is a user's file and stays kept.
      if (currentHash !== generatedHash) {
        kept.push({ path: projectRelative, reason: "not-generated" });
        continue;
      }
      manifest.files[projectRelative] = generatedHash;
      previousHash = generatedHash;
    }
    if (currentHash !== previousHash) {
      kept.push({ path: projectRelative, reason: "edited" });
      continue;
    }
    if (force && current !== generated) {
      await writeText(destPath, generated);
      manifest.files[projectRelative] = generatedHash;
      refreshed.push(projectRelative);
      changed = true;
    }
  }

  return { created, refreshed, kept, changed };
}

export function describeKept(k: KeptFile): string {
  switch (k.reason) {
    case "edited":
      return `${k.path} (generated by sdd, then edited — kept)`;
    case "symlink":
      return `${k.path} (symbolic link — not followed, left untouched)`;
    case "unreadable":
      return `${k.path} (could not be read — left untouched)`;
    default:
      return `${k.path} (not generated by sdd — left untouched)`;
  }
}
