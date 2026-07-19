import { promises as fs } from "node:fs";
import { dirname } from "pathe";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function readText(path: string): Promise<string> {
  return fs.readFile(path, "utf8");
}

export async function writeText(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await fs.writeFile(path, content, "utf8");
}

export async function readYaml<T = unknown>(path: string): Promise<T> {
  const raw = await readText(path);
  return parseYaml(raw) as T;
}

export async function writeYaml(path: string, data: unknown): Promise<void> {
  const content = stringifyYaml(data, {
    lineWidth: 100,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });
  await writeText(path, content.endsWith("\n") ? content : `${content}\n`);
}

export async function listDirs(path: string): Promise<string[]> {
  if (!(await pathExists(path))) return [];
  const entries = await fs.readdir(path, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function listFiles(path: string): Promise<string[]> {
  if (!(await pathExists(path))) return [];
  const entries = await fs.readdir(path, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = `${src}/${entry.name}`;
    const to = `${dest}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await ensureDir(dirname(to));
      await fs.copyFile(from, to);
    }
  }
}

/**
 * Copy directory tree but never overwrite existing files (stable docs like
 * memory/constitution.md survive `sdd init --force`).
 */
export async function copyDirSkipExisting(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = `${src}/${entry.name}`;
    const to = `${dest}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyDirSkipExisting(from, to);
    } else if (!(await pathExists(to))) {
      await ensureDir(dirname(to));
      await fs.copyFile(from, to);
    }
  }
}

/** Write only when the path does not already exist. */
export async function writeTextIfMissing(path: string, content: string): Promise<boolean> {
  if (await pathExists(path)) return false;
  await writeText(path, content);
  return true;
}

export async function removePath(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true });
}
