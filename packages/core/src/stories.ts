import { join } from "pathe";
import { listDirs, pathExists, readYaml } from "./fs.js";
import { archiveDir, changesDir } from "./paths.js";
import { type ChangeMeta, ChangeMetaSchema, type Config } from "./schemas.js";

const STORY_ID = /^S-\d+$/i;
const EPIC_KEY = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;

export interface StoryNode {
  changeId: string;
  title: string;
  story: string;
  epic: string;
  depends: string[];
  status: string;
}

export interface StoryDraft {
  epic?: string;
  story?: string;
  depends: string[];
}

export function validBranchName(name: string): boolean {
  if (!name || name === "." || name === ".." || name.includes(" ") || name.includes("..")) {
    return false;
  }
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".lock") || name.includes("@{")) {
    return false;
  }
  if (/[\\~^:?*[]/.test(name)) return false;
  return name.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function parseStoryDraft(input: {
  epic?: string;
  story?: string;
  depends?: string[];
}): { ok: true; draft: StoryDraft } | { ok: false; stdout: string } {
  const epic = input.epic?.trim() ?? "";
  const storyRaw = input.story?.trim() ?? "";
  const dependsRaw = (input.depends ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if ((storyRaw || dependsRaw.length > 0) && !epic) {
    return { ok: false, stdout: "A story needs an epic." };
  }
  if (epic && !EPIC_KEY.test(epic)) return { ok: false, stdout: "An epic key is not valid." };
  if (dependsRaw.length > 0 && !storyRaw) return { ok: false, stdout: "A story id is not valid." };
  if (storyRaw && !STORY_ID.test(storyRaw))
    return { ok: false, stdout: "A story id is not valid." };
  const depends: string[] = [];
  for (const dep of dependsRaw) {
    if (!STORY_ID.test(dep)) return { ok: false, stdout: "A story id is not valid." };
    const id = dep.toUpperCase();
    if (!depends.includes(id)) depends.push(id);
  }
  return {
    ok: true,
    draft: {
      epic: epic || undefined,
      story: storyRaw ? storyRaw.toUpperCase() : undefined,
      depends,
    },
  };
}

async function metasIn(dir: string): Promise<ChangeMeta[]> {
  const out: ChangeMeta[] = [];
  for (const id of await listDirs(dir)) {
    const path = join(dir, id, "meta.yaml");
    if (!(await pathExists(path))) continue;
    try {
      out.push(ChangeMetaSchema.parse(await readYaml(path)));
    } catch {
      // A directory that is not a change pack is not a story.
    }
  }
  return out;
}

export async function loadEpicStories(
  projectRoot: string,
  config: Config,
  epic: string,
): Promise<StoryNode[]> {
  const metas = [
    ...(await metasIn(changesDir(projectRoot, config))),
    ...(await metasIn(archiveDir(projectRoot, config))),
  ];
  const nodes: StoryNode[] = [];
  for (const meta of metas) {
    if (meta.epic !== epic || !meta.story) continue;
    nodes.push({
      changeId: meta.id,
      title: meta.title,
      story: meta.story.toUpperCase(),
      epic: meta.epic,
      depends: (meta.depends ?? []).map((item) => item.toUpperCase()),
      status: meta.status,
    });
  }
  return nodes;
}

export async function storyIdTaken(
  projectRoot: string,
  config: Config,
  epic: string,
  story: string,
): Promise<boolean> {
  const nodes = await loadEpicStories(projectRoot, config, epic);
  return nodes.some((node) => node.story === story.toUpperCase());
}

function byStoryId(left: StoryNode, right: StoryNode): number {
  if (left.story < right.story) return -1;
  if (left.story > right.story) return 1;
  return 0;
}

export function formatEpicGraph(nodes: StoryNode[]): { exitCode: number; stdout: string } {
  const ordered = [...nodes].sort(byStoryId);
  const byStory = new Map<string, StoryNode>();
  for (const node of ordered) {
    if (byStory.has(node.story))
      return { exitCode: 1, stdout: `Story ${node.story} already exists.` };
    byStory.set(node.story, node);
  }
  for (const node of ordered) {
    for (const dep of [...node.depends].sort()) {
      if (!byStory.has(dep)) {
        return {
          exitCode: 1,
          stdout: `${node.story} depends on ${dep}, which is not in this epic.`,
        };
      }
    }
  }

  const wave = new Map<string, number>();
  const stack: string[] = [];
  const visit = (id: string): string | null => {
    if (wave.has(id)) return null;
    if (stack.includes(id)) {
      const at = stack.indexOf(id);
      return `Story cycle: ${[...stack.slice(at), id].join(" -> ")}`;
    }
    stack.push(id);
    const node = byStory.get(id);
    if (!node) return null;
    let deepest = 0;
    for (const dep of [...node.depends].sort()) {
      const err = visit(dep);
      if (err) return err;
      deepest = Math.max(deepest, wave.get(dep) ?? 0);
    }
    stack.pop();
    wave.set(id, deepest + 1);
    return null;
  };
  for (const node of ordered) {
    const err = visit(node.story);
    if (err) return { exitCode: 1, stdout: err };
  }

  const groups = new Map<number, StoryNode[]>();
  for (const node of ordered) {
    const number = wave.get(node.story) ?? 1;
    const list = groups.get(number) ?? [];
    list.push(node);
    groups.set(number, list);
  }
  const lines: string[] = [];
  const parallel: string[] = [];
  for (const number of [...groups.keys()].sort((left, right) => left - right)) {
    const group = groups.get(number) ?? [];
    lines.push(`Wave ${number}`);
    for (const node of group) {
      const deps = [...node.depends].sort();
      lines.push(
        deps.length > 0
          ? `${node.story} ${node.title} after ${deps.join(", ")}`
          : `${node.story} ${node.title}`,
      );
    }
    if (group.length > 1) parallel.push(group.map((node) => node.story).join(", "));
  }
  if (parallel.length === 0) lines.push("Parallel: none");
  for (const line of parallel) lines.push(`Parallel: ${line}`);
  const serial = ordered.filter((node) => node.depends.length > 0);
  if (serial.length === 0) lines.push("Serial: none");
  for (const node of serial) {
    lines.push(`Serial: ${node.story} after ${[...node.depends].sort().join(", ")}`);
  }
  return { exitCode: 0, stdout: lines.join("\n") };
}

/** Graph errors, then open dependencies. Null means the branch may be created. */
export function branchBlock(nodes: StoryNode[], story: string): string | null {
  const graph = formatEpicGraph(nodes);
  if (graph.exitCode !== 0) return graph.stdout;
  const node = nodes.find((item) => item.story === story);
  if (!node) return null;
  const waiting = [...node.depends].sort().filter((dep) => {
    const other = nodes.find((item) => item.story === dep);
    return !other || other.status !== "completed";
  });
  if (waiting.length === 0) return null;
  return `${story} waits on ${waiting.join(", ")}.`;
}
