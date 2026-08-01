import type { McpMatchContext, McpSource } from "./types.js";

function includesCI(list: string[], value: string): boolean {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v);
}

/**
 * Decide which configured MCP sources apply for this stage / workflow / query.
 *
 * 1. enabled
 * 2. when.stages → stage must match (if stage known)
 * 3. when.workflows → workflow must match (if workflow known)
 * 4. when.intents + caller passed intents → require intersection
 * 5. when.keywords + query present → require a keyword substring hit
 *
 * So: stage routing always; intents/keywords refine when the caller provides signals.
 */
export function matchMcpSources(sources: McpSource[], ctx: McpMatchContext): McpSource[] {
  const stage = ctx.stage ?? "";
  const workflow = ctx.workflow ?? "";
  const query = (ctx.query ?? "").toLowerCase();
  const intents = (ctx.intents ?? []).map((i) => i.toLowerCase());

  const matched = sources.filter((s) => {
    if (!s.enabled) return false;
    const w = s.when;

    if (w.stages.length && stage && !includesCI(w.stages, stage)) {
      return false;
    }
    if (w.workflows.length && workflow && !includesCI(w.workflows, workflow)) {
      return false;
    }

    // Explicit intent tags from CLI/agent (e.g. --intents code)
    if (w.intents.length && intents.length) {
      const hit = w.intents.some((i) => intents.includes(i.toLowerCase()));
      if (!hit) return false;
    }

    // Keyword filter only when we have a query string
    if (w.keywords.length && query) {
      const hit = w.keywords.some((k) => query.includes(k.toLowerCase()));
      if (!hit) return false;
    }

    return true;
  });

  return matched.sort((a, b) => b.priority - a.priority);
}

/** Human explanation of match for CLI */
export function explainMatch(source: McpSource, ctx: McpMatchContext): string {
  const bits: string[] = [];
  if (source.when.stages.length) {
    bits.push(`stages=[${source.when.stages.join(",")}]`);
  } else bits.push("stages=*");
  if (source.when.workflows.length) {
    bits.push(`workflows=[${source.when.workflows.join(",")}]`);
  }
  if (source.when.intents.length) {
    bits.push(`intents=[${source.when.intents.join(",")}]`);
  }
  if (source.when.keywords.length) {
    bits.push(`keywords=[${source.when.keywords.join(",")}]`);
  }
  const ok = matchMcpSources([source], ctx).length > 0;
  return `${ok ? "MATCH" : "skip"} ${source.id} (${bits.join(" ")}) stage=${ctx.stage ?? "?"} workflow=${ctx.workflow ?? "?"}`;
}
