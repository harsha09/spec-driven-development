import { join } from "pathe";
import type { Config } from "./schemas.js";
import {
  getStage,
  isStageSkipped,
  shouldAutoSkip,
} from "./workflow.js";
import type { ChangeContext } from "./change-context.js";

export function formatStatus(ctx: ChangeContext): string {
  const lines: string[] = [];
  lines.push(`Change: ${ctx.meta.title}`);
  lines.push(`ID:     ${ctx.id}`);
  lines.push(`Status: ${ctx.meta.status}`);
  lines.push(`Workflow: ${ctx.meta.workflow}`);
  lines.push(`Path: ${ctx.path}`);
  lines.push("");
  lines.push("Stages:");
  for (const stage of ctx.stages) {
    const skipped =
      isStageSkipped(ctx.meta, stage.id) || shouldAutoSkip(stage, ctx.meta);
    let mark = " ";
    if (skipped) mark = "·";
    else if (stage.id === ctx.meta.stage) mark = "●";
    else {
      const order = ctx.active.map((s) => s.id);
      const cur = order.indexOf(ctx.meta.stage);
      const idx = order.indexOf(stage.id);
      if (idx >= 0 && cur >= 0 && idx < cur) mark = "✓";
    }
    const gate = ctx.meta.gates?.[stage.id];
    const gateInfo = gate ? ` [${gate.status}]` : "";
    const skipInfo = skipped ? " (skipped)" : "";
    lines.push(
      `  [${mark}] ${stage.id}${stage.title ? ` — ${stage.title}` : ""}${gateInfo}${skipInfo}`,
    );
  }
  if (ctx.meta.overrides?.skip_stages?.length) {
    lines.push("");
    lines.push(`Overrides: skip=${ctx.meta.overrides.skip_stages.join(", ")}`);
  }
  return lines.join("\n");
}

export async function buildAgentPrompt(
  ctx: ChangeContext,
  config: Config,
  projectRoot: string,
): Promise<string> {
  const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
  const parts: string[] = [];
  parts.push(`# SDD Agent Handoff`);
  parts.push("");
  parts.push(`You are implementing a change under Structured Vibe Coding (local SDD).`);
  parts.push("");
  parts.push(`## Change`);
  parts.push(`- Title: ${ctx.meta.title}`);
  parts.push(`- ID: ${ctx.id}`);
  parts.push(`- Workflow: ${ctx.meta.workflow}`);
  parts.push(
    `- Current stage: ${ctx.meta.stage}${stage?.title ? ` (${stage.title})` : ""}`,
  );
  parts.push(`- Change path: ${ctx.path}`);
  parts.push("");

  if (stage?.summary) {
    parts.push(`## Stage goal`);
    parts.push(stage.summary);
    parts.push("");
  }

  if (stage?.agent_context?.instructions) {
    parts.push(`## Instructions`);
    parts.push(stage.agent_context.instructions);
    parts.push("");
  }

  parts.push(`## Constraints`);
  parts.push(`- Follow artifacts in the change directory as source of truth.`);
  parts.push(`- Honor \`memory/constitution.md\` when present (non-negotiables).`);
  parts.push(`- Do not skip ARB/decision constraints if present.`);
  parts.push(`- Local development only — verify on this machine.`);
  parts.push(`- Prefer small, reviewable commits.`);
  parts.push("");

  parts.push(`## Artifacts to read`);
  const memoryHint = join(projectRoot, config.memory_path);
  parts.push(`- Documentation map (if present): ${memoryHint}/index.md`);
  parts.push(`- Memory: ${memoryHint}/`);
  for (const s of ctx.stages) {
    for (const a of s.artifacts) {
      parts.push(`- ${join(ctx.path, a.path)}`);
    }
  }
  parts.push("");
  parts.push(`## Current stage artifacts`);
  if (stage) {
    for (const a of stage.artifacts) {
      parts.push(`- ${a.path}${a.required ? " (required)" : ""}`);
    }
  }
  parts.push("");
  parts.push(
    `When done with this stage, the human will run \`sdd next\` or \`sdd verify\` / \`sdd complete\`.`,
  );

  return parts.join("\n");
}
