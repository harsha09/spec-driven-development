/**
 * In-CLI MCP server (stdio). Same process as `sdd` — no separate package.
 *
 *   sdd mcp
 *   # MCP config: command "sdd", args ["mcp"], env SDD_PROJECT_ROOT=...
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as tools from "./tools.js";

const projectRoot = z
  .string()
  .optional()
  .describe(
    "Absolute path to the sdd project. Defaults to SDD_PROJECT_ROOT or process cwd.",
  );

const change = z
  .string()
  .optional()
  .describe("Change id (default: active change)");

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "sdd",
    version: "0.13.0",
  });

  server.registerTool(
    "sdd_help",
    {
      title: "sdd MCP help",
      description: "How to use sdd MCP tools (process + AST code context).",
    },
    async () => tools.toolHelp(),
  );

  server.registerTool(
    "sdd_doctor",
    {
      title: "sdd doctor",
      description: "Check whether this folder is a valid sdd project.",
      inputSchema: { projectRoot },
    },
    async (args) => tools.toolDoctor(args),
  );

  server.registerTool(
    "sdd_status",
    {
      title: "sdd status",
      description:
        "Show active change stage progress, or list open changes when list=true. Never launches an AI.",
      inputSchema: {
        projectRoot,
        change,
        list: z
          .boolean()
          .optional()
          .describe("If true, list all open changes (like sdd status --list)"),
      },
    },
    async (args) => tools.toolStatus(args),
  );

  server.registerTool(
    "sdd_workflows",
    {
      title: "sdd workflows",
      description: "List available workflow packs (hotfix, feature, greenfield, …).",
      inputSchema: { projectRoot },
    },
    async (args) => tools.toolWorkflows(args),
  );

  server.registerTool(
    "sdd_new",
    {
      title: "sdd new",
      description:
        "Start a new change pack. Prefer workflow hotfix|feature|patch|… Same as CLI sdd new (no agent launch).",
      inputSchema: {
        projectRoot,
        title: z.string().describe("Change title"),
        workflow: z
          .string()
          .optional()
          .describe("Workflow name (default: recommended from title)"),
      },
    },
    async (args) => tools.toolNew(args),
  );

  server.registerTool(
    "sdd_greenfield",
    {
      title: "sdd greenfield",
      description:
        "Start a new-product discovery pack from a one-line idea (vision → requirements → features → architecture).",
      inputSchema: {
        projectRoot,
        idea: z.string().describe("One-line product idea"),
      },
    },
    async (args) => tools.toolGreenfield(args),
  );

  server.registerTool(
    "sdd_feature_list",
    {
      title: "sdd feature list",
      description: "List F-NNN backlog items (memory/features.md or greenfield pack).",
      inputSchema: { projectRoot },
    },
    async (args) => tools.toolFeatureList(args),
  );

  server.registerTool(
    "sdd_feature_start",
    {
      title: "sdd feature start",
      description: "Start a delivery change from backlog id (e.g. F-001).",
      inputSchema: {
        projectRoot,
        featureId: z.string().describe("Feature id like F-001"),
        workflow: z.string().optional().describe("Override workflow from backlog"),
      },
    },
    async (args) => tools.toolFeatureStart(args),
  );

  server.registerTool(
    "sdd_next",
    {
      title: "sdd next",
      description:
        "Advance to the next stage when current artifacts are substantive. Does not launch AI.",
      inputSchema: {
        projectRoot,
        change,
        force: z
          .boolean()
          .optional()
          .describe("Skip gate/artifact checks (use sparingly)"),
      },
    },
    async (args) => tools.toolNext(args),
  );

  server.registerTool(
    "sdd_skip",
    {
      title: "sdd skip",
      description: "Skip a stage for this change with a reason.",
      inputSchema: {
        projectRoot,
        change,
        stage: z.string().describe("Stage id to skip"),
        reason: z.string().describe("Why this stage is skipped"),
      },
    },
    async (args) => tools.toolSkip(args),
  );

  server.registerTool(
    "sdd_use",
    {
      title: "sdd use",
      description: "Switch workflow pack mid-change.",
      inputSchema: {
        projectRoot,
        change,
        workflow: z.string().describe("Workflow name"),
        reason: z.string().optional(),
      },
    },
    async (args) => tools.toolUse(args),
  );

  server.registerTool(
    "sdd_gate",
    {
      title: "sdd gate",
      description: "Approve, waive, or fail a stage gate.",
      inputSchema: {
        projectRoot,
        change,
        action: z.enum(["approve", "waive", "fail"]),
        stage: z.string().optional().describe("Stage id (default: current)"),
        note: z.string().optional(),
      },
    },
    async (args) => tools.toolGate(args),
  );

  server.registerTool(
    "sdd_verify",
    {
      title: "sdd verify",
      description: "Run local verify for the current stage.",
      inputSchema: {
        projectRoot,
        change,
        noRun: z
          .boolean()
          .optional()
          .describe("Only write checklist stubs; do not run commands"),
      },
    },
    async (args) => tools.toolVerify(args),
  );

  server.registerTool(
    "sdd_complete",
    {
      title: "sdd complete",
      description:
        "Complete the active change. Greenfield packs also promote vision/requirements/features/architecture into memory/.",
      inputSchema: { projectRoot, change },
    },
    async (args) => tools.toolComplete(args),
  );

  server.registerTool(
    "sdd_handoff",
    {
      title: "sdd handoff",
      description:
        "Refresh and return the agent handoff text for the current change (like sdd agent --print).",
      inputSchema: { projectRoot, change },
    },
    async (args) => tools.toolHandoff(args),
  );

  server.registerTool(
    "sdd_code_context",
    {
      title: "AST code context",
      description: [
        "Structure-aware TypeScript/JavaScript slices for implement/review.",
        "Prefer this over pasting whole packages. Default maxTokens=4000.",
        "Pass symbols and/or paths to focus. format=summary is most compact.",
      ].join(" "),
      inputSchema: {
        projectRoot,
        paths: z.array(z.string()).optional(),
        symbols: z.array(z.string()).optional(),
        query: z.string().optional(),
        includeNeighbors: z.boolean().optional(),
        maxTokens: z.number().int().positive().optional(),
        maxFiles: z.number().int().positive().optional(),
        maxSlices: z.number().int().positive().optional(),
        maxLinesPerSlice: z.number().int().positive().optional(),
        format: z.enum(["markdown", "summary"]).optional(),
        writeToChange: z
          .boolean()
          .optional()
          .describe("Also write changes/<id>/code-context.md"),
        change,
      },
    },
    async (args) => tools.toolCodeContext(args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
