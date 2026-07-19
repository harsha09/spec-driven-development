import {
  ChangeMetaSchema,
  type ChangeMeta,
  type Config,
  type Workflow,
  type Stage,
} from "./schemas.js";
import {
  ensureDir,
  listDirs,
  pathExists,
  readText,
  readYaml,
  writeText,
  writeYaml,
} from "./fs.js";
import {
  activePointerPath,
  changeMetaPath,
  changePath,
  changesDir,
} from "./paths.js";
import { nowIso } from "./slug.js";
import {
  activeStages,
  loadWorkflow,
  resolveStages,
} from "./workflow.js";

export interface ChangeContext {
  id: string;
  path: string;
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

export async function buildContext(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeContext> {
  const meta = await loadChangeMeta(projectRoot, config, changeId);
  const workflow = await loadWorkflow(projectRoot, meta.workflow);
  return {
    id: changeId,
    path: changePath(projectRoot, config, changeId),
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
  const all = await listChanges(projectRoot, config);
  const inProgress: { id: string; updated: string }[] = [];
  for (const id of all) {
    try {
      const meta = await loadChangeMeta(projectRoot, config, id);
      if (meta.status === "in_progress" || meta.status === "blocked") {
        inProgress.push({ id, updated: meta.updated ?? meta.created });
      }
    } catch {
      // ignore corrupt meta
    }
  }
  if (!inProgress.length) return null;
  inProgress.sort((a, b) => b.updated.localeCompare(a.updated));
  return inProgress[0]!.id;
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
    throw new Error("No active change. Pass --change <id> or run `sdd new`.");
  }
  return active;
}
