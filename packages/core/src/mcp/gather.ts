import type { ChangeContext } from "../change-context.js";
import { callMcpSourceTool } from "./client.js";
import { matchMcpSources } from "./match.js";
import { interpolateArgs, loadMcpConfig } from "./sources.js";
import type { McpFetchResult, McpMatchContext, McpSource } from "./types.js";

export interface GatherMcpOptions {
  projectRoot: string;
  match: McpMatchContext;
  /** Only these source ids (default: all matching) */
  sourceIds?: string[];
  /** Force tool/args instead of source.invoke */
  tool?: string;
  args?: Record<string, unknown>;
  /** Skip sources without invoke unless tool override */
  requireInvoke?: boolean;
}

/**
 * Call matching external MCP sources and collect text for agents / handoff.
 */
export async function gatherMcpContext(opts: GatherMcpOptions): Promise<McpFetchResult[]> {
  const cfg = await loadMcpConfig(opts.projectRoot);
  let sources = matchMcpSources(cfg.sources, opts.match);
  if (opts.sourceIds?.length) {
    const allow = new Set(opts.sourceIds);
    sources = sources.filter((s) => allow.has(s.id));
  }

  const vars: Record<string, string> = {
    projectRoot: opts.projectRoot,
    query: opts.match.query ?? "",
    title: opts.match.query ?? "",
    stage: opts.match.stage ?? "",
    workflow: opts.match.workflow ?? "",
  };

  const results: McpFetchResult[] = [];

  for (const source of sources) {
    const tool = opts.tool ?? source.invoke?.tool;
    if (!tool) {
      if (opts.requireInvoke !== false && !opts.tool) {
        results.push({
          sourceId: source.id,
          tool: "(none)",
          ok: false,
          text: "",
          error: "No invoke.tool configured. Set invoke in .sdd/mcp.yaml or pass --tool.",
        });
      }
      continue;
    }
    const baseArgs = opts.args ?? source.invoke?.args ?? {};
    const args = interpolateArgs(baseArgs as Record<string, unknown>, vars);
    const called = await callMcpSourceTool(source, opts.projectRoot, tool, args);
    const max = cfg.max_chars_per_source ?? 6000;
    let text = called.text;
    if (text.length > max) {
      text = `${text.slice(0, max)}\n\n…(truncated at max_chars_per_source=${max})`;
    }
    results.push({
      sourceId: source.id,
      tool,
      ok: called.ok,
      text,
      error: called.error,
    });
  }

  return results;
}

export async function gatherMcpContextForChange(
  projectRoot: string,
  ctx: ChangeContext,
  extra?: { query?: string; intents?: string[] },
): Promise<McpFetchResult[]> {
  const cfg = await loadMcpConfig(projectRoot);
  if (!cfg.auto_fetch_on_handoff && !extra?.query) {
    // still allow explicit gather
  }
  return gatherMcpContext({
    projectRoot,
    match: {
      stage: ctx.meta.stage,
      workflow: ctx.meta.workflow,
      query: extra?.query ?? ctx.meta.title,
      intents: extra?.intents,
    },
    requireInvoke: true,
  });
}

export function formatMcpContextForHandoff(results: McpFetchResult[]): string {
  if (!results.length) return "";
  const parts: string[] = [
    "## External MCP context",
    "",
    "Pulled from project-configured MCP *sources* (`.sdd/mcp.yaml`).",
    "Use this instead of guessing org libraries / design systems / remote AST indexes.",
    "",
  ];
  for (const r of results) {
    parts.push(`### Source \`${r.sourceId}\` (tool: \`${r.tool}\`)`);
    parts.push("");
    if (!r.ok) {
      parts.push(`_Error: ${r.error ?? "failed"}_`);
    } else {
      parts.push(r.text || "_(empty)_");
    }
    parts.push("");
  }
  return parts.join("\n");
}

export function listMatchingSourceIds(sources: McpSource[], match: McpMatchContext): string[] {
  return matchMcpSources(sources, match).map((s) => s.id);
}
