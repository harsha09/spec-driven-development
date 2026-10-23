import { join } from "pathe";
import { z } from "zod";
import { listFiles, pathExists, readYaml, writeYaml } from "./fs.js";
import type { Stage } from "./schemas.js";

const itemSchema = z
  .object({
    id: z.string().trim().min(1),
    stage: z.string().trim().min(1),
    source: z.string().trim().min(1),
    status: z.enum(["open", "done"]),
  })
  .strict();

const itemsSchema = z.array(itemSchema);

type StageItem = z.infer<typeof itemSchema>;

/** Directory plus one star in the file name, for example tasks/T-*.md. */
export function itemSourcePattern(
  pattern: string,
): { dir: string; prefix: string; suffix: string } | null {
  if (pattern.includes("..") || pattern.startsWith("/") || pattern.includes("\\")) return null;
  const slash = pattern.lastIndexOf("/");
  if (slash <= 0) return null;
  const dir = pattern.slice(0, slash);
  const file = pattern.slice(slash + 1);
  if (!/^[A-Za-z0-9._-]+$/.test(dir) || dir.includes("*")) return null;
  const star = file.indexOf("*");
  if (star < 0 || file.indexOf("*", star + 1) !== -1) return null;
  return { dir, prefix: file.slice(0, star), suffix: file.slice(star + 1) };
}

function matches(name: string, prefix: string, suffix: string): boolean {
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false;
  return name.length > prefix.length + suffix.length;
}

function itemId(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

/**
 * Write one item per file matched by stage.items_from.
 * Items for other stages stay. A repeated id keeps its status.
 */
export async function syncStageItems(changeDir: string, stage: Stage): Promise<string[]> {
  if (!stage.items_from) return [];
  const pattern = itemSourcePattern(stage.items_from);
  if (!pattern) throw new Error("items_from is invalid");

  const names = (await listFiles(join(changeDir, pattern.dir)))
    .filter((name) => matches(name, pattern.prefix, pattern.suffix))
    .sort();

  const itemsPath = join(changeDir, "items.yaml");
  let existing: StageItem[] = [];
  if (await pathExists(itemsPath)) {
    let raw: unknown;
    try {
      raw = await readYaml(itemsPath);
    } catch {
      throw new Error("items.yaml is invalid");
    }
    const parsed = itemsSchema.safeParse(raw);
    if (!parsed.success) throw new Error("items.yaml is invalid");
    existing = parsed.data;
  }

  const others = existing.filter((item) => item.stage !== stage.id);
  const mine = new Map(
    existing.filter((item) => item.stage === stage.id).map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
  const next: StageItem[] = [];
  for (const name of names) {
    const id = itemId(name);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = `${pattern.dir}/${name}`;
    const prev = mine.get(id);
    if (prev) next.push({ ...prev, source });
    else next.push({ id, stage: stage.id, source, status: "open" });
  }

  const items = [...others, ...next].sort((a, b) =>
    a.stage === b.stage ? a.id.localeCompare(b.id) : a.stage.localeCompare(b.stage),
  );
  await writeYaml(itemsPath, items);
  return next.map((item) => item.id);
}
