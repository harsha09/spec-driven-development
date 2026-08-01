/**
 * sdd as MCP *client* — connect to external stdio MCP servers and call tools.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { toProcessEnv } from "../env.js";
import { SddError } from "../errors.js";
import { SDD_CORE_VERSION } from "../version.js";
import { interpolate } from "./sources.js";
import type { McpSource } from "./types.js";

/** Default timeout for connect + tool call (ms). Override with SDD_MCP_TIMEOUT_MS. */
export function mcpTimeoutMs(): number {
  const raw = process.env.SDD_MCP_TIMEOUT_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 30_000;
}

export interface CallMcpToolResult {
  ok: boolean;
  text: string;
  error?: string;
}

function contentToText(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): string {
  const parts = result.content ?? [];
  return parts
    .map((p) => (p.type === "text" ? (p.text ?? "") : JSON.stringify(p)))
    .join("\n")
    .trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new SddError(`MCP ${label} timed out after ${ms}ms`, {
              code: "MCP_TIMEOUT",
              hint: "Raise SDD_MCP_TIMEOUT_MS or fix the source server.",
            }),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One-shot: spawn source, list tools or call tool, then close.
 */
export async function withMcpSource<T>(
  source: McpSource,
  projectRoot: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const vars = { projectRoot };
  const cwd = source.cwd ? interpolate(source.cwd, vars) : projectRoot;
  const env = toProcessEnv(process.env, {
    ...source.env,
    SDD_PROJECT_ROOT: projectRoot,
  });

  const transport = new StdioClientTransport({
    command: source.command,
    args: source.args,
    cwd,
    env,
  });

  const client = new Client({
    name: "sdd-mcp-client",
    version: SDD_CORE_VERSION,
  });

  const ms = mcpTimeoutMs();
  await withTimeout(client.connect(transport), ms, `connect (${source.id})`);
  try {
    return await withTimeout(fn(client), ms, `call (${source.id})`);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors after success/failure
    }
  }
}

export async function listMcpSourceTools(
  source: McpSource,
  projectRoot: string,
): Promise<{ name: string; description?: string }[]> {
  return withMcpSource(source, projectRoot, async (client) => {
    const listed = await client.listTools();
    return listed.tools.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  });
}

export async function callMcpSourceTool(
  source: McpSource,
  projectRoot: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<CallMcpToolResult> {
  try {
    if (source.tools?.length && !source.tools.includes(tool)) {
      return {
        ok: false,
        text: "",
        error: `Tool "${tool}" not in allowlist for source ${source.id}: ${source.tools.join(", ")}`,
      };
    }
    return await withMcpSource(source, projectRoot, async (client) => {
      const result = await client.callTool({ name: tool, arguments: args });
      const text = contentToText(result as { content?: Array<{ type: string; text?: string }> });
      const isError = Boolean((result as { isError?: boolean }).isError);
      return {
        ok: !isError,
        text: text || (isError ? "(empty error result)" : "(empty)"),
        error: isError ? text || "tool returned isError" : undefined,
      };
    });
  } catch (err) {
    return {
      ok: false,
      text: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
