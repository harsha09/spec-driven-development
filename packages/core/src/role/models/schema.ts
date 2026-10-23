import { join } from "pathe";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { pathExists, readText } from "../../fs.js";
import { WORK_TYPES, type WorkType, isWorkType, workKind } from "../types.js";

const idSchema = z.string().trim().min(1);
const envName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const confidence = z.number().gte(0).lte(1);

const WorkTypeSchema = z.enum(WORK_TYPES);
const workSlots = z.record(WorkTypeSchema, idSchema);

const ModelEntrySchema = z.discriminatedUnion("provider", [
  z
    .object({
      kind: z.literal("decide"),
      provider: z.literal("rules"),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["decide", "reason"]),
      provider: z.literal("command"),
      command_env: envName,
      min_confidence: confidence.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("decide"),
      provider: z.literal("ollama"),
      model: z.string().trim().min(1),
      base_url_env: envName,
      min_confidence: confidence.optional(),
    })
    .strict(),
]);

export type ModelEntry = z.infer<typeof ModelEntrySchema>;

export const ModelsConfigSchema = z
  .object({
    version: z.literal(1),
    models: z.record(idSchema, ModelEntrySchema),
    defaults: z
      .object({
        by_work_type: workSlots,
        fallback_reason: idSchema,
        fallback_decide: idSchema,
      })
      .strict(),
    overrides: z
      .object({
        bots: z.record(idSchema, workSlots).optional(),
        stages: z.record(idSchema, workSlots).optional(),
        roles: z.record(idSchema, workSlots).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (Object.keys(config.models).length === 0) {
      ctx.addIssue({ code: "custom", path: ["models"], message: "needs a model" });
    }
    expectSlot(ctx, config.models, config.defaults.fallback_reason, "reason", [
      "defaults",
      "fallback_reason",
    ]);
    expectSlot(ctx, config.models, config.defaults.fallback_decide, "decide", [
      "defaults",
      "fallback_decide",
    ]);
    expectMap(ctx, config.models, config.defaults.by_work_type, ["defaults", "by_work_type"]);
    expectNamed(ctx, config.models, config.overrides?.bots, ["overrides", "bots"]);
    expectNamed(ctx, config.models, config.overrides?.stages, ["overrides", "stages"]);
    expectNamed(ctx, config.models, config.overrides?.roles, ["overrides", "roles"]);
  });

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S+$/;

function expectSlot(
  ctx: z.RefinementCtx,
  models: Record<string, ModelEntry>,
  id: string | undefined,
  kind: "reason" | "decide",
  path: (string | number)[],
): void {
  if (!id) return;
  const model = models[id];
  if (!model) {
    ctx.addIssue({ code: "custom", path, message: "unknown model" });
    return;
  }
  if (model.kind !== kind) {
    ctx.addIssue({ code: "custom", path, message: `kind must be ${kind}` });
  }
}

function expectMap(
  ctx: z.RefinementCtx,
  models: Record<string, ModelEntry>,
  map: Partial<Record<WorkType, string>> | undefined,
  path: (string | number)[],
): void {
  if (!map) return;
  for (const [work, id] of Object.entries(map)) {
    if (!isWorkType(work)) continue;
    expectSlot(ctx, models, id, workKind(work), [...path, work]);
  }
}

function expectNamed(
  ctx: z.RefinementCtx,
  models: Record<string, ModelEntry>,
  named: Record<string, Partial<Record<WorkType, string>>> | undefined,
  path: (string | number)[],
): void {
  if (!named) return;
  for (const [name, map] of Object.entries(named)) {
    expectMap(ctx, models, map, [...path, name]);
  }
}

export function formatModelsError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || "models";
  const message = issue?.message ?? "invalid";
  return `models.yaml is invalid: ${path} ${message}`;
}

function looksSecret(value: string): boolean {
  if (value.includes("-----BEGIN")) return true;
  if (!/\s/.test(value) && ASSIGNMENT.test(value)) return true;
  if (!/\s/.test(value) && value.length >= 32 && !ENV_NAME.test(value)) return true;
  return false;
}

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return looksSecret(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === "object") return Object.values(value).some(containsSecret);
  return false;
}

export function modelsPath(root: string): string {
  return join(root, ".sdd", "models.yaml");
}

export async function loadModels(
  root: string,
): Promise<{ config: ModelsConfig } | { error: string } | null> {
  const path = modelsPath(root);
  if (!(await pathExists(path))) return null;
  let raw: unknown;
  try {
    raw = parseYaml(await readText(path));
  } catch {
    return { error: "models.yaml is invalid: models could not be parsed" };
  }
  if (containsSecret(raw)) return { error: "models.yaml has a secret value." };
  const parsed = ModelsConfigSchema.safeParse(raw);
  if (!parsed.success) return { error: formatModelsError(parsed.error) };
  return { config: parsed.data };
}

export async function checkModels(
  root: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const loaded = await loadModels(root);
  if (loaded === null) return { ok: true };
  if ("error" in loaded) return { ok: false, message: loaded.error };
  return { ok: true };
}
