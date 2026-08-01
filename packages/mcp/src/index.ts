/**
 * sdd MCP server — expose AST code context as tools so agents fetch
 * only ranked symbol slices instead of stuffing the whole monorepo into the prompt.
 *
 * Transport: stdio (Claude Code, Cursor, VS Code MCP, etc.)
 *
 *   sdd mcp
 *   # or: npx @structured-vibe-coding/mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCodeContextTool } from "./context-tool.js";

const server = new McpServer({
  name: "sdd-code-context",
  version: "0.13.0",
});

server.registerTool(
  "code_context",
  {
    title: "AST code context",
    description: [
      "Structure-aware TypeScript/JavaScript code slices for the current project.",
      "Prefer this over pasting whole files or the monorepo into the chat.",
      "Returns ranked symbol slices with import neighbors optional, under a token budget.",
      "Use paths and/or symbols and/or query to focus. Default maxTokens is 4000.",
    ].join(" "),
    inputSchema: {
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Absolute project root. Defaults to SDD_PROJECT_ROOT or the process working directory.",
        ),
      paths: z
        .array(z.string())
        .optional()
        .describe("Seed file or directory paths (relative to project root or absolute)."),
      symbols: z
        .array(z.string())
        .optional()
        .describe("Symbol names to prioritize (functions, classes, exports)."),
      query: z
        .string()
        .optional()
        .describe("Free-text focus phrase for keyword ranking."),
      includeNeighbors: z
        .boolean()
        .optional()
        .describe("Include structural import neighbors within caps (default false)."),
      maxTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Approx token budget for the markdown body (default 4000)."),
      maxFiles: z.number().int().positive().optional(),
      maxSlices: z.number().int().positive().optional(),
      maxLinesPerSlice: z.number().int().positive().optional(),
      format: z
        .enum(["markdown", "summary"])
        .optional()
        .describe(
          "markdown = full slices (default). summary = compact JSON (fewest tokens).",
        ),
    },
  },
  async (args) => {
    try {
      const { text, result } = await runCodeContextTool({
        projectRoot: args.projectRoot,
        paths: args.paths,
        symbols: args.symbols,
        query: args.query,
        includeNeighbors: args.includeNeighbors,
        maxTokens: args.maxTokens,
        maxFiles: args.maxFiles,
        maxSlices: args.maxSlices,
        maxLinesPerSlice: args.maxLinesPerSlice,
        format: args.format,
      });

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
        isError: !result.ok,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `code_context failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "code_context_help",
  {
    title: "How to use sdd code context",
    description:
      "Short guidance for agents: when to call code_context and how to save tokens.",
  },
  async () => ({
    content: [
      {
        type: "text" as const,
        text: [
          "# sdd MCP code context",
          "",
          "Call **code_context** when you need product code for implement/review.",
          "Do **not** dump entire packages into the prompt.",
          "",
          "Tips:",
          "1. Pass `symbols` (function/class names) and/or `paths` under the change.",
          "2. Use `query` for a short task phrase if you lack exact symbols.",
          "3. Prefer `format: \"summary\"` first, then a focused `markdown` call.",
          "4. Keep `maxTokens` low (2000–4000) unless the task is wide.",
          "5. Process/spec files stay in markdown under changes/ — only code needs AST slices.",
          "",
          "Env: SDD_PROJECT_ROOT overrides the default project directory.",
          "",
        ].join("\n"),
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // MCP uses stdio for protocol — log errors to stderr only
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
