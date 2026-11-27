import { join } from "pathe";
import { ensureDir, listDirs, pathExists, readText, readYaml, writeText, writeYaml } from "./fs.js";
import {
  activePointerPath,
  archiveDir,
  changeMetaPath,
  changePath,
  changesDir,
  displayArchivePath,
  displayChangePath,
} from "./paths.js";
import {
  type ChangeMeta,
  ChangeMetaSchema,
  type Config,
  type Stage,
  type Workflow,
} from "./schemas.js";
import { nowIso } from "./slug.js";
import { activeStages, loadWorkflow, resolveStages } from "./workflow.js";

export interface ChangeContext {
  id: string;
  /** Absolute directory used for file reads and writes. */
  path: string;
  /** Repo-relative directory for status, handoff, and active-context text. */
  displayPath: string;
  meta: ChangeMeta;
  workflow: Workflow;
  stages: Stage[];
  active: Stage[];
}

export async function loadChangeMeta(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeMeta> {
  const path = changeMetaPath(projectRoot, config, changeId);
  if (!(await pathExists(path))) {
    throw new Error(`Change not found: ${changeId}`);
  }
  return ChangeMetaSchema.parse(await readYaml(path));
}

export async function saveChangeMeta(
  projectRoot: string,
  config: Config,
  meta: ChangeMeta,
): Promise<void> {
  meta.updated = nowIso();
  await writeYaml(changeMetaPath(projectRoot, config, meta.id), ChangeMetaSchema.parse(meta));
}

export async function locateChangePack(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<{ path: string; displayPath: string } | null> {
  const open = changePath(projectRoot, config, changeId);
  if (await pathExists(join(open, "meta.yaml"))) {
    return { path: open, displayPath: displayChangePath(config, changeId) };
  }
  const archived = join(archiveDir(projectRoot, config), changeId);
  if (await pathExists(join(archived, "meta.yaml"))) {
    return { path: archived, displayPath: displayArchivePath(config, changeId) };
  }
  return null;
}

export async function buildContext(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeContext> {
  const located = await locateChangePack(projectRoot, config, changeId);
  if (!located) throw new Error(`Change not found: ${changeId}`);
  const meta = ChangeMetaSchema.parse(await readYaml(join(located.path, "meta.yaml")));
  const workflow = await loadWorkflow(projectRoot, meta.workflow);
  return {
    id: changeId,
    path: located.path,
    displayPath: located.displayPath,
    meta,
    workflow,
    stages: resolveStages(workflow, meta),
    active: activeStages(workflow, meta),
  };
}

export async function listChanges(projectRoot: string, config: Config): Promise<string[]> {
  return listDirs(changesDir(projectRoot, config));
}

export async function getActiveChangeId(
  projectRoot: string,
  config: Config,
): Promise<string | null> {
  const pointer = activePointerPath(projectRoot, config);
  if (await pathExists(pointer)) {
    const id = (await readText(pointer)).trim();
    if (id && (await pathExists(changePath(projectRoot, config, id)))) {
      return id;
    }
    if (id) {
      await writeText(pointer, "");
    }
  }
  return null;
}

export async function clearActiveIf(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  const pointer = activePointerPath(projectRoot, config);
  if (!(await pathExists(pointer))) return;
  const id = (await readText(pointer)).trim();
  if (id === changeId) {
    await writeText(pointer, "");
  }
}

export async function setActiveChange(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  await ensureDir(changesDir(projectRoot, config));
  await writeText(activePointerPath(projectRoot, config), `${changeId}\n`);
}

export async function resolveChangeId(
  projectRoot: string,
  config: Config,
  changeId?: string,
): Promise<string> {
  if (changeId) return changeId;
  const active = await getActiveChangeId(projectRoot, config);
  if (!active) {
    throw new Error(
      "No active change. Pass --change <id> or run `sdd new`. Run `sdd list` to see changes.",
    );
  }
  return active;
}

const CHANGE_STATUS_FILTERS = ["in_progress", "blocked", "completed", "abandoned"] as const;

export type ChangeStatusFilter = (typeof CHANGE_STATUS_FILTERS)[number];

export interface ListedChange {
  id: string;
  title: string;
  status: string;
  /** completed_at, otherwise updated, otherwise created. Empty when meta cannot be read. */
  updated: string;
  place: "changes" | "archive";
}

function isStatusFilter(value: string): value is ChangeStatusFilter {
  return (CHANGE_STATUS_FILTERS as readonly string[]).includes(value);
}

async function readListed(dir: string, place: ListedChange["place"]): Promise<ListedChange[]> {
  const out: ListedChange[] = [];
  for (const id of await listDirs(dir)) {
    if (id.startsWith(".")) continue;
    const metaPath = join(dir, id, "meta.yaml");
    if (!(await pathExists(metaPath))) continue;
    try {
      const meta = ChangeMetaSchema.parse(await readYaml(metaPath));
      out.push({
        id: meta.id || id,
        title: meta.title,
        status: meta.status,
        updated: meta.completed_at || meta.updated || meta.created,
        place,
      });
    } catch {
      out.push({ id, title: "(unreadable)", status: "unknown", updated: "", place });
    }
  }
  return out;
}

/** Open changes, then archived ones that are not still open. Newest first. */
export async function listChangeRecords(
  projectRoot: string,
  config: Config,
  status?: string,
): Promise<ListedChange[]> {
  if (status !== undefined && !isStatusFilter(status)) {
    throw new Error(`--status must be one of ${CHANGE_STATUS_FILTERS.join(", ")}.`);
  }
  const open = await readListed(changesDir(projectRoot, config), "changes");
  const archived = await readListed(archiveDir(projectRoot, config), "archive");
  const seen = new Set(open.map((row) => row.id));
  const rows = [...open, ...archived.filter((row) => !seen.has(row.id))];
  const filtered = status ? rows.filter((row) => row.status === status) : rows;
  filtered.sort((left, right) => {
    if (left.updated !== right.updated) return left.updated < right.updated ? 1 : -1;
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
  return filtered;
}

export function formatChangeList(rows: ListedChange[]): string {
  if (!rows.length) return "No changes. Run `sdd new` to start one.\n";
  return `${rows.map((row) => `${row.id}  ${row.status}  ${row.title}`).join("\n")}\n`;
}

/**
 * Active change when one is set. Otherwise the newest completed change, with a note.
 * An in-progress pack is never adopted when the active pointer is empty.
 */
export async function resolveStatusChange(
  projectRoot: string,
  config: Config,
  changeId?: string,
): Promise<{ id: string; note: string | null }> {
  if (changeId) return { id: changeId, note: null };
  const active = await getActiveChangeId(projectRoot, config);
  if (active) return { id: active, note: null };
  const completed = await listChangeRecords(projectRoot, config, "completed");
  const latest = completed[0];
  if (latest) {
    return {
      id: latest.id,
      note: `No active change. Showing last completed change ${latest.id}. Run \`sdd list\` to see every change.`,
    };
  }
  throw new Error(
    "No active change. Pass --change <id> or run `sdd new`. Run `sdd list` to see changes.",
  );
}
