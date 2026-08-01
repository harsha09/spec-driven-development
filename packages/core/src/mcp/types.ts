import { z } from "zod";

/**
 * External MCP *sources* that sdd consumes (sdd = MCP client).
 * Distinct from `sdd mcp serve` (sdd as MCP server for agents).
 */

export const McpWhenSchema = z.object({
  /** Empty = all stages */
  stages: z.array(z.string()).default([]),
  /** Empty = all workflows */
  workflows: z.array(z.string()).default([]),
  /** Match title/query (case-insensitive substring) */
  keywords: z.array(z.string()).default([]),
  /**
   * High-level intent tags the operator or tool may pass:
   * code | ui | design | api | docs | data
   */
  intents: z.array(z.string()).default([]),
});

export const McpInvokeSchema = z.object({
  /** Tool name on the remote MCP server */
  tool: z.string(),
  /**
   * Static args + templates:
   * {{query}} {{title}} {{stage}} {{workflow}} {{projectRoot}}
   */
  args: z.record(z.unknown()).default({}),
});

export const McpSourceSchema = z.object({
  id: z.string().min(1),
  description: z.string().default(""),
  /** stdio only in v1 */
  transport: z.enum(["stdio"]).default("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  /** Working directory (default: project root). Supports {{projectRoot}} */
  cwd: z.string().optional(),
  enabled: z.boolean().default(true),
  /** Higher runs first when gathering */
  priority: z.number().default(0),
  when: McpWhenSchema.default({}),
  /**
   * How sdd calls this source when auto-gathering for a stage.
   * If omitted, `sdd mcp fetch` still works with an explicit --tool.
   */
  invoke: McpInvokeSchema.optional(),
  /** Optional allowlist of tool names (documentation / validation) */
  tools: z.array(z.string()).optional(),
});

export const McpConfigSchema = z.object({
  version: z.number().default(1),
  /**
   * When true, handoff generation calls matching sources with `invoke` and
   * embeds results under "External MCP context".
   */
  auto_fetch_on_handoff: z.boolean().default(true),
  /** Max chars of MCP output embedded into handoff per source */
  max_chars_per_source: z.number().default(6000),
  sources: z.array(McpSourceSchema).default([]),
});

export type McpWhen = z.infer<typeof McpWhenSchema>;
export type McpInvoke = z.infer<typeof McpInvokeSchema>;
export type McpSource = z.infer<typeof McpSourceSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

export interface McpMatchContext {
  stage?: string;
  workflow?: string;
  /** Free text: change title, user query, task line */
  query?: string;
  /** Explicit intent tags from CLI/agent */
  intents?: string[];
}

export interface McpFetchResult {
  sourceId: string;
  tool: string;
  ok: boolean;
  text: string;
  error?: string;
}
