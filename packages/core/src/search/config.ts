import { z } from "zod";
import { pathExists, readYaml } from "../fs.js";
import { searchConfigPath } from "../paths.js";

export class SearchConfigError extends Error {
  constructor() {
    super("search.yaml is invalid");
    this.name = "SearchConfigError";
  }
}

const BudgetSchema = z
  .object({
    default: z.number().int().min(1).default(12000),
  })
  .catchall(z.number().int().min(1));

const SearchConfigSchema = z.object({
  version: z.literal(1).default(1),
  provider: z.string().min(1).default("builtin"),
  k: z.number().int().min(1).max(100).default(20),
  budgets: BudgetSchema.default({ default: 12000 }),
  exclude: z.array(z.string().min(1)).default([]),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

export function budgetForStage(config: SearchConfig, stage: string | undefined): number {
  if (!stage) return config.budgets.default;
  const value = config.budgets[stage];
  return typeof value === "number" ? value : config.budgets.default;
}

export async function loadSearchConfig(projectRoot: string): Promise<SearchConfig> {
  const file = searchConfigPath(projectRoot);
  if (!(await pathExists(file))) {
    return SearchConfigSchema.parse({});
  }
  let raw: unknown;
  try {
    raw = await readYaml(file);
  } catch {
    throw new SearchConfigError();
  }
  const parsed = SearchConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new SearchConfigError();
  return parsed.data;
}
