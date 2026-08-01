/**
 * sdd as MCP *client* — connect to external stdio MCP servers and call tools.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpSource } from "./types.js";
import { interpolate } from "./sources.js";

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
    .map((p) => (p.type === "text" ? p.text ?? "" : JSON.stringify(p)))
    .join("\n")
    .trim();
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
  const cwd = source.cwd
    ? interpolate(source.cwd, vars)
    : projectRoot;
  const env: Record<string, string> = {
    ...process.env,
    ...source.env,
    SDD_PROJECT_ROOT: projectRoot,
  } as Record<string, string>;

  const transport = new StdioClientTransport({
    command: source.command,
    args: source.args,
    cwd,
    env,
  });

  const client = new Client({
    name: "sdd-mcp-client",
    version: "0.14.0",
  });

  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
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
