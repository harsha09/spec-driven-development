import { type ModelChoice, WORK_TYPES, type WorkType } from "../types.js";
import type { ModelEntry, ModelsConfig } from "./schema.js";
import { selectModel } from "./select.js";

export function formatModelChoice(workType: string, choice: ModelChoice): string {
  return `${workType}  ${choice.id}  ${choice.kind}  ${choice.provider}  ${choice.why}`;
}

function confidence(model: ModelEntry): string {
  return "min_confidence" in model && model.min_confidence !== undefined
    ? String(model.min_confidence)
    : "n/a";
}

function formatEntry(id: string, model: ModelEntry): string {
  if (model.provider === "rules") return `${id}  decide  rules`;
  if (model.provider === "command") {
    return `${id}  ${model.kind}  command  command_env ${model.command_env}  min_confidence ${confidence(model)}`;
  }
  return `${id}  decide  ollama  model ${model.model}  base_url_env ${model.base_url_env}  min_confidence ${confidence(model)}`;
}

export function formatModels(config: ModelsConfig): string {
  const lines = Object.keys(config.models)
    .sort()
    .map((id) => formatEntry(id, config.models[id] as ModelEntry));
  for (const workType of WORK_TYPES) {
    lines.push(formatModelChoice(workType, selectModel(config, { workType })));
  }
  const reason = config.models[config.defaults.fallback_reason];
  const decide = config.models[config.defaults.fallback_decide];
  if (reason) {
    lines.push(
      `fallback_reason  ${config.defaults.fallback_reason}  ${reason.kind}  ${reason.provider}  fallback`,
    );
  }
  if (decide) {
    lines.push(
      `fallback_decide  ${config.defaults.fallback_decide}  ${decide.kind}  ${decide.provider}  fallback`,
    );
  }
  return lines.join("\n");
}

export function explainModel(
  config: ModelsConfig,
  workType: WorkType,
  ctx: {
    role?: string;
    bot?: string;
    stage?: string;
  },
): string {
  return formatModelChoice(workType, selectModel(config, { workType, ...ctx }));
}
