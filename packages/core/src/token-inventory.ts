import { join } from "pathe";
import { getActiveChangeId } from "./change-context.js";
import { listFiles, pathExists, readText, readYaml } from "./fs.js";
import { changePath, templatesDir, workflowsDir } from "./paths.js";
import { type ArtifactDef, ChangeMetaSchema, type Config, type Workflow } from "./schemas.js";
import { countTokens } from "./search/tokenize.js";
import { listWorkflowNames, loadWorkflow } from "./workflow.js";

async function readIfExists(path: string): Promise<string | null> {
  if (!(await pathExists(path))) return null;
  return readText(path);
}

async function workflowFileTokens(projectRoot: string, name: string): Promise<number | null> {
  const dir = workflowsDir(projectRoot);
  for (const ext of ["yaml", "yml"]) {
    const text = await readIfExists(join(dir, `${name}.${ext}`));
    if (text !== null) return countTokens(text);
  }
  return null;
}

/** Template body sdd would copy, before {{title}} is filled in. */
async function templateBody(projectRoot: string, artifact: ArtifactDef): Promise<string | null> {
  const dir = templatesDir(projectRoot);
  const names = artifact.template
    ? [artifact.template, artifact.template.replace(/^templates\//, ""), `${artifact.id}.md`]
    : [`${artifact.id}.md`];
  const seen = new Set<string>();
  for (const name of names) {
    const path = join(dir, name);
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await readIfExists(path);
    if (text !== null) return text;
  }
  return null;
}

function pushArtifactLines(lines: string[], stageId: string, path: string, label: string): number {
  lines.push(`  ${stageId}  ${path}  ${label}`);
  const tokens = Number(label);
  return Number.isInteger(tokens) && String(tokens) === label ? tokens : 0;
}

async function workflowLines(projectRoot: string, name: string): Promise<string[]> {
  let workflow: Workflow;
  try {
    workflow = await loadWorkflow(projectRoot, name);
  } catch {
    return [`${name}  unreadable`];
  }
  const fileTokens = await workflowFileTokens(projectRoot, name);
  const lines = [`${name}  workflow ${fileTokens === null ? "missing" : fileTokens}`];
  let total = 0;
  let any = false;
  for (const stage of workflow.stages) {
    for (const artifact of stage.artifacts) {
      any = true;
      if (artifact.path.endsWith("/")) {
        total += pushArtifactLines(lines, stage.id, artifact.path, "directory");
        continue;
      }
      const body = await templateBody(projectRoot, artifact);
      total += pushArtifactLines(
        lines,
        stage.id,
        artifact.path,
        body === null ? "missing" : String(countTokens(body)),
      );
    }
  }
  lines.push(any ? `  artifacts ${total}` : "  (no artifacts)");
  return lines;
}

async function changeLines(projectRoot: string, config: Config, id: string): Promise<string[]> {
  const dir = changePath(projectRoot, config, id);
  let workflowName = "";
  let workflow: Workflow;
  try {
    const meta = ChangeMetaSchema.parse(await readYaml(join(dir, "meta.yaml")));
    workflowName = meta.workflow;
    workflow = await loadWorkflow(projectRoot, meta.workflow);
  } catch {
    return [`Change ${id}  unreadable`];
  }
  const lines = [`Change ${id}  workflow ${workflowName}`];
  let total = 0;
  let any = false;
  for (const stage of workflow.stages) {
    for (const artifact of stage.artifacts) {
      any = true;
      if (artifact.path.endsWith("/")) {
        const folder = join(dir, artifact.path);
        const names = (await listFiles(folder)).sort();
        if (names.length === 0) {
          total += pushArtifactLines(lines, stage.id, artifact.path, "directory");
          continue;
        }
        for (const name of names) {
          const text = await readText(join(folder, name));
          total += pushArtifactLines(
            lines,
            stage.id,
            `${artifact.path}${name}`,
            String(countTokens(text)),
          );
        }
        continue;
      }
      const text = await readIfExists(join(dir, artifact.path));
      total += pushArtifactLines(
        lines,
        stage.id,
        artifact.path,
        text === null ? "not written" : String(countTokens(text)),
      );
    }
  }
  lines.push(any ? `  artifacts ${total}` : "  (no artifacts)");
  return lines;
}

/** cl100k counts for each workflow file, its artifact templates, and the active change. */
export async function formatTokenInventory(projectRoot: string, config: Config): Promise<string> {
  const lines = ["Tokens (cl100k):"];
  const names = await listWorkflowNames(projectRoot);
  if (names.length === 0) lines.push("No workflows.");
  for (const name of names) {
    lines.push(...(await workflowLines(projectRoot, name)));
  }
  const active = await getActiveChangeId(projectRoot, config);
  if (active) {
    lines.push("");
    lines.push(...(await changeLines(projectRoot, config, active)));
  }
  return lines.join("\n");
}
