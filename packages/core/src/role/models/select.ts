import { type ModelChoice, type WorkType, workKind } from "../types.js";
import type { ModelsConfig } from "./schema.js";

export interface ModelContext {
  workType: WorkType;
  role?: string;
  bot?: string;
  stage?: string;
}

function slot(
  map: Partial<Record<WorkType, string>> | undefined,
  workType: WorkType,
): string | undefined {
  const id = map?.[workType]?.trim();
  return id || undefined;
}

/** Pure precedence: bot, stage, role, work-type default, then the fallback for that kind. */
export function selectModel(config: ModelsConfig, ctx: ModelContext): ModelChoice {
  const bot = ctx.bot?.trim();
  const stage = ctx.stage?.trim();
  const role = ctx.role?.trim();
  const fromBot = bot ? slot(config.overrides?.bots?.[bot], ctx.workType) : undefined;
  const fromStage = stage ? slot(config.overrides?.stages?.[stage], ctx.workType) : undefined;
  const fromRole = role ? slot(config.overrides?.roles?.[role], ctx.workType) : undefined;
  const fromWork = slot(config.defaults.by_work_type, ctx.workType);
  let id: string;
  let why: string;
  if (fromBot && bot) {
    id = fromBot;
    why = `bot ${bot}`;
  } else if (fromStage && stage) {
    id = fromStage;
    why = `stage ${stage}`;
  } else if (fromRole && role) {
    id = fromRole;
    why = `role ${role}`;
  } else if (fromWork) {
    id = fromWork;
    why = "work-type default";
  } else {
    id =
      workKind(ctx.workType) === "decide"
        ? config.defaults.fallback_decide
        : config.defaults.fallback_reason;
    why = "fallback";
  }
  const model = config.models[id];
  if (!model) return { id, kind: workKind(ctx.workType), provider: "rules", why };
  return { id, kind: model.kind, provider: model.provider, why };
}
