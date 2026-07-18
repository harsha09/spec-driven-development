import { join } from "pathe";
import {
  WorkflowSchema,
  type ChangeMeta,
  type Complexity,
  type Stage,
  type Workflow,
  type Config,
} from "./schemas.js";
import { listFiles, pathExists, readYaml } from "./fs.js";
import { workflowsDir } from "./paths.js";

export async function listWorkflowNames(projectRoot: string): Promise<string[]> {
  const dir = workflowsDir(projectRoot);
  const files = await listFiles(dir);
  return files
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

export async function loadWorkflow(projectRoot: string, name: string): Promise<Workflow> {
  const dir = workflowsDir(projectRoot);
  const candidates = [`${name}.yaml`, `${name}.yml`];
  for (const file of candidates) {
    const path = join(dir, file);
    if (await pathExists(path)) {
      const raw = await readYaml(path);
      const workflow = WorkflowSchema.parse(raw);
      if (workflow.name !== name) {
        // allow filename to be source of truth when name mismatches slightly
      }
      return workflow;
    }
  }
  throw new Error(
    `Workflow "${name}" not found in ${dir}. Available: ${(await listWorkflowNames(projectRoot)).join(", ") || "(none)"}`,
  );
}

/** Resolve effective stages for a change (workflow + per-change overrides). */
export function resolveStages(workflow: Workflow, meta: ChangeMeta): Stage[] {
  const base = [...workflow.stages];
  const extra = meta.overrides?.extra_stages ?? [];
  const stages = [...base, ...extra];

  return stages.map((stage) => {
    const gateOverride = meta.overrides?.gates?.[stage.id];
    if (!gateOverride) return stage;
    return {
      ...stage,
      gate: {
        ...stage.gate,
        type: gateOverride,
      },
    };
  });
}

export function isStageSkipped(meta: ChangeMeta, stageId: string): boolean {
  if (meta.overrides?.skip_stages?.includes(stageId)) return true;
  if (meta.skipped?.some((s) => s.stage === stageId)) return true;
  return false;
}

export function shouldAutoSkip(stage: Stage, meta: ChangeMeta): boolean {
  const flags = stage.skip_when?.flags ?? [];
  for (const flag of flags) {
    if (meta.flags?.[flag] === true || meta.flags?.[flag] === "true") {
      return true;
    }
  }
  return false;
}

/** Ordered list of active (non-skipped) stages for navigation. */
export function activeStages(workflow: Workflow, meta: ChangeMeta): Stage[] {
  return resolveStages(workflow, meta).filter((s) => {
    if (isStageSkipped(meta, s.id)) return false;
    if (shouldAutoSkip(s, meta)) return false;
    return true;
  });
}

export function getStage(workflow: Workflow, meta: ChangeMeta, stageId: string): Stage | undefined {
  return resolveStages(workflow, meta).find((s) => s.id === stageId);
}

/**
 * Next *active* stage after the current one in full workflow order.
 * If the current stage is skipped/missing from the active list, still walks
 * forward from its position in the full stage list (does not jump back to first).
 */
export function nextStageId(workflow: Workflow, meta: ChangeMeta): string | null {
  const all = resolveStages(workflow, meta);
  const activeIds = new Set(activeStages(workflow, meta).map((s) => s.id));

  let start = all.findIndex((s) => s.id === meta.stage);
  // Unknown current stage: begin before the first entry so we pick the first active.
  if (start === -1) start = -1;

  for (let i = start + 1; i < all.length; i++) {
    const id = all[i]!.id;
    if (activeIds.has(id)) return id;
  }
  return null;
}

export function previousStageId(workflow: Workflow, meta: ChangeMeta): string | null {
  const all = resolveStages(workflow, meta);
  const activeIds = new Set(activeStages(workflow, meta).map((s) => s.id));
  const start = all.findIndex((s) => s.id === meta.stage);
  if (start <= 0) return null;

  for (let i = start - 1; i >= 0; i--) {
    const id = all[i]!.id;
    if (activeIds.has(id)) return id;
  }
  return null;
}

/** First active stage (honors skip / skip_when). */
export function firstActiveStageId(workflow: Workflow, meta: ChangeMeta): string | null {
  return activeStages(workflow, meta)[0]?.id ?? null;
}

export function inferComplexity(title: string, hints?: { keywords?: string[] }): Complexity {
  const text = `${title} ${(hints?.keywords ?? []).join(" ")}`.toLowerCase();
  const hotfixHints = ["typo", "hotfix", "nit", "rename", "bump", "chore", "readme", "docs"];
  const highHints = [
    "architecture",
    "migration",
    "auth",
    "payment",
    "billing",
    "redesign",
    "platform",
    "arb",
    "epic",
  ];
  if (hotfixHints.some((h) => text.includes(h))) return "low";
  if (highHints.some((h) => text.includes(h))) return "high";
  if (text.length > 80) return "medium";
  return "medium";
}

export async function recommendWorkflow(
  projectRoot: string,
  title: string,
  config: Config,
  opts?: { preferred?: string; complexity?: Complexity },
): Promise<{ name: string; reason: string; alternatives: string[] }> {
  const available = await listWorkflowNames(projectRoot);
  const allowed = config.allowed_workflows?.length
    ? available.filter((n) => config.allowed_workflows!.includes(n))
    : available;

  if (opts?.preferred) {
    if (!available.includes(opts.preferred)) {
      throw new Error(
        `Workflow "${opts.preferred}" is not available. Available: ${available.join(", ") || "(none)"}`,
      );
    }
    if (config.allowed_workflows?.length && !config.allowed_workflows.includes(opts.preferred)) {
      throw new Error(
        `Workflow "${opts.preferred}" is not in allowed_workflows: ${config.allowed_workflows.join(", ")}`,
      );
    }
    return {
      name: opts.preferred,
      reason: "Explicitly selected",
      alternatives: allowed.filter((n) => n !== opts.preferred),
    };
  }

  if (config.default_workflow !== "recommend" && allowed.includes(config.default_workflow)) {
    return {
      name: config.default_workflow,
      reason: `Repo default_workflow=${config.default_workflow}`,
      alternatives: allowed.filter((n) => n !== config.default_workflow),
    };
  }

  const complexity = opts?.complexity ?? inferComplexity(title);
  const scored: { name: string; score: number; reason: string }[] = [];

  for (const name of allowed) {
    try {
      const wf = await loadWorkflow(projectRoot, name);
      let score = wf.recommendation?.priority ?? 0;
      let reason = `workflow priority ${score}`;
      const when = wf.recommendation?.when;

      if (complexity === "low" && name === "hotfix") {
        score += 50;
        reason = "Low complexity → hotfix";
      } else if (complexity === "low" && name === "patch") {
        score += 40;
        reason = "Low complexity → patch";
      } else if (complexity === "medium" && name === "feature") {
        score += 45;
        reason = "Medium complexity → feature";
      } else if (complexity === "medium" && name === "patch") {
        score += 30;
        reason = "Medium complexity → patch";
      } else if (complexity === "high" && name === "enterprise-feature") {
        score += 50;
        reason = "High complexity → enterprise-feature";
      } else if (complexity === "high" && name === "feature") {
        score += 35;
        reason = "High complexity → feature";
      }

      const keywords = when?.keywords ?? [];
      const titleLower = title.toLowerCase();
      if (keywords.some((k) => titleLower.includes(k.toLowerCase()))) {
        score += 20;
        reason = `Keyword match for ${name}`;
      }

      scored.push({ name, score, reason });
    } catch {
      // skip invalid
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) {
    throw new Error("No workflows available. Run `sdd init` or add files under .sdd/workflows/");
  }

  return {
    name: best.name,
    reason: best.reason,
    alternatives: scored.slice(1).map((s) => s.name),
  };
}
