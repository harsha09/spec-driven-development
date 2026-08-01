/**
 * CLI: sdd as MCP *client* — manage external sources and fetch context.
 * (Inbound "sdd mcp serve" was removed; agents use terminal + handoff files.)
 */

import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { withProject } from "./project.js";
import { asStringList } from "./shared.js";

const sourcesList = defineCommand({
  meta: {
    name: "list",
    description: "List external MCP sources (.sdd/mcp.yaml) that sdd will call",
  },
  args: {
    stage: { type: "string", description: "Show match for this stage" },
    workflow: { type: "string", description: "Filter by workflow" },
    query: { type: "string", description: "Filter free-text / title" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { loadMcpConfig, matchMcpSources, explainMatch } = await import(
        "@structured-vibe-coding/core"
      );
      const cfg = await loadMcpConfig(root);
      if (!cfg.sources.length) {
        consola.info("No external MCP sources yet.");
        consola.log(
          pc.dim(
            "Add: sdd mcp sources add --id design-system --command npx --arg -y --arg @acme/ds-mcp --stages design,implement --tool search --tool-arg query={{query}}",
          ),
        );
        consola.log(pc.dim(`Config: ${root}/.sdd/mcp.yaml`));
        return;
      }
      consola.log(
        pc.bold("External MCP sources") +
          pc.dim("  — sdd calls these (org libs, design systems, AST engines)"),
      );
      consola.log(pc.dim(`auto_fetch_on_handoff: ${cfg.auto_fetch_on_handoff}`));
      consola.log("");
      const matchCtx = {
        stage: args.stage,
        workflow: args.workflow,
        query: args.query,
      };
      for (const s of cfg.sources) {
        const mark = s.enabled ? pc.green("on ") : pc.dim("off");
        consola.log(
          `${mark} ${pc.cyan(s.id)}  pri=${s.priority}  ${pc.dim(s.command)} ${(s.args ?? []).join(" ")}`,
        );
        if (s.description) consola.log(pc.dim(`     ${s.description}`));
        if (s.invoke) {
          consola.log(
            pc.dim(`     invoke: ${s.invoke.tool} ${JSON.stringify(s.invoke.args ?? {})}`),
          );
        } else {
          consola.log(pc.dim("     invoke: (none — set --tool on add, or sdd mcp fetch --tool …)"));
        }
        if (args.stage || args.workflow || args.query) {
          consola.log(pc.dim(`     ${explainMatch(s, matchCtx)}`));
        }
        consola.log("");
      }
      if (args.stage || args.workflow || args.query) {
        const matched = matchMcpSources(cfg.sources, matchCtx);
        consola.log(
          pc.bold("Would call:") + " " + (matched.map((m) => m.id).join(", ") || "(none)"),
        );
      }
    });
  },
});

const sourcesAdd = defineCommand({
  meta: {
    name: "add",
    description: "Register an external MCP source (design system, org lib, AST engine, …)",
  },
  args: {
    id: {
      type: "string",
      description: "Source id (e.g. design-system)",
      required: true,
    },
    command: {
      type: "string",
      description: "Command that starts the MCP server (npx, node, path)",
      required: true,
    },
    arg: { type: "string", description: "Server arg (repeatable)" },
    description: { type: "string", description: "What this source provides" },
    stages: {
      type: "string",
      description: "Comma stages (e.g. design,implement)",
    },
    workflows: { type: "string", description: "Comma workflows (optional)" },
    intents: {
      type: "string",
      description: "Comma intents: ui,design,code,api,…",
    },
    keywords: {
      type: "string",
      description: "Comma keywords matched against title/query",
    },
    tool: {
      type: "string",
      description: "Default tool for auto-fetch / fetch",
    },
    "tool-arg": {
      type: "string",
      description:
        "Tool arg key=value (repeatable); values may use {{query}} {{title}} {{stage}} {{projectRoot}}",
    },
    priority: { type: "string", description: "Higher = preferred (default 0)" },
    cwd: {
      type: "string",
      description: "cwd (default project root; {{projectRoot}} ok)",
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { addMcpSource } = await import("@structured-vibe-coding/core");
      const toolArgs: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq <= 0) continue;
        toolArgs[raw.slice(0, eq)] = raw.slice(eq + 1);
      }
      const split = (s?: string) =>
        (s ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const priority = args.priority ? Number(args.priority) : 0;

      await addMcpSource(root, {
        id: args.id,
        description: args.description ?? "",
        transport: "stdio",
        command: args.command,
        args: asStringList(args.arg),
        env: {},
        cwd: args.cwd,
        enabled: true,
        priority: Number.isFinite(priority) ? priority : 0,
        when: {
          stages: split(args.stages),
          workflows: split(args.workflows),
          intents: split(args.intents),
          keywords: split(args.keywords),
        },
        invoke: args.tool ? { tool: args.tool, args: toolArgs } : undefined,
      });
      consola.success(`Added MCP source ${pc.cyan(args.id)} → .sdd/mcp.yaml`);
      consola.log(pc.dim(`Test: sdd mcp sources test ${args.id}`));
      consola.log(pc.dim("Handoff auto-fetches when stage matches and invoke.tool is set."));
    });
  },
});

const sourcesRemove = defineCommand({
  meta: { name: "remove", description: "Remove an external MCP source by id" },
  args: {
    id: { type: "positional", description: "Source id", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { removeMcpSource } = await import("@structured-vibe-coding/core");
      await removeMcpSource(root, args.id);
      consola.success(`Removed source ${args.id}`);
    });
  },
});

const sourcesTest = defineCommand({
  meta: {
    name: "test",
    description: "List tools from a source, or call its invoke tool",
  },
  args: {
    id: { type: "positional", description: "Source id", required: true },
    tool: { type: "string", description: "Call this tool (else list or invoke.tool)" },
    "tool-arg": { type: "string", description: "key=value (repeatable)" },
    query: { type: "string", description: "Fills {{query}} in args" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { loadMcpConfig, listMcpSourceTools, callMcpSourceTool, interpolateArgs } =
        await import("@structured-vibe-coding/core");
      const cfg = await loadMcpConfig(root);
      const source = cfg.sources.find((s) => s.id === args.id);
      if (!source) {
        consola.error(`Unknown source "${args.id}". Run: sdd mcp sources list`);
        process.exit(1);
      }
      const tool = args.tool ?? source.invoke?.tool;
      if (!tool) {
        consola.info(`Listing tools from ${source.id}…`);
        try {
          const tools = await listMcpSourceTools(source, root);
          if (!tools.length) consola.warn("No tools reported.");
          for (const t of tools) {
            consola.log(`${pc.cyan(t.name)}  ${pc.dim(t.description ?? "")}`);
          }
        } catch (err) {
          consola.error(err instanceof Error ? err.message : err);
          process.exit(1);
        }
        return;
      }
      const extra: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq > 0) extra[raw.slice(0, eq)] = raw.slice(eq + 1);
      }
      const callArgs = interpolateArgs(
        { ...(source.invoke?.args ?? {}), ...extra },
        {
          projectRoot: root,
          query: args.query ?? "",
          title: args.query ?? "",
          stage: "",
          workflow: "",
        },
      );
      consola.info(`Calling ${source.id} → ${tool}…`);
      const result = await callMcpSourceTool(source, root, tool, callArgs);
      if (!result.ok) {
        consola.error(result.error ?? result.text);
        process.exit(1);
      }
      process.stdout.write(result.text.endsWith("\n") ? result.text : `${result.text}\n`);
    });
  },
});

const sources = defineCommand({
  meta: {
    name: "sources",
    description: "External MCP servers sdd calls (design systems, org libs, AST engines)",
  },
  subCommands: {
    list: sourcesList,
    add: sourcesAdd,
    remove: sourcesRemove,
    test: sourcesTest,
  },
});

const fetch = defineCommand({
  meta: {
    name: "fetch",
    description: "Call matching MCP sources for the current stage (or --source / --tool)",
  },
  args: {
    source: { type: "string", description: "Only this source id (repeatable)" },
    tool: { type: "string", description: "Override invoke tool" },
    "tool-arg": { type: "string", description: "key=value (repeatable)" },
    query: {
      type: "string",
      description: "Query / focus (default: active change title)",
    },
    intents: { type: "string", description: "Comma intents e.g. ui,code" },
    stage: { type: "string", description: "Override stage for matching" },
    change: { type: "string", description: "Change id", alias: "c" },
    "out-handoff": {
      type: "boolean",
      description: "Refresh .sdd/handoff.md after fetch",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const {
        gatherMcpContext,
        formatMcpContextForHandoff,
        resolveChangeId,
        buildContext,
        writeAgentHandoff,
      } = await import("@structured-vibe-coding/core");

      let stage: string | undefined = args.stage;
      let workflow: string | undefined;
      let query = args.query?.trim();
      try {
        const id = await resolveChangeId(root, config, args.change);
        const ctx = await buildContext(root, config, id);
        stage = stage ?? ctx.meta.stage;
        workflow = ctx.meta.workflow;
        query = query || ctx.meta.title;
      } catch {
        // no active change
      }

      const extra: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq > 0) extra[raw.slice(0, eq)] = raw.slice(eq + 1);
      }

      const results = await gatherMcpContext({
        projectRoot: root,
        match: {
          stage,
          workflow,
          query,
          intents: (args.intents ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        sourceIds: asStringList(args.source),
        tool: args.tool,
        args: Object.keys(extra).length ? extra : undefined,
      });

      if (!results.length) {
        consola.warn("No matching sources (or none configured). Try: sdd mcp sources list");
        process.exitCode = 1;
        return;
      }
      process.stdout.write(formatMcpContextForHandoff(results));
      if (args["out-handoff"]) {
        try {
          const id = await resolveChangeId(root, config, args.change);
          await writeAgentHandoff(root, config, id);
          consola.info(pc.dim("Refreshed .sdd/handoff.md"));
        } catch (err) {
          consola.warn(err instanceof Error ? err.message : "Could not refresh handoff");
        }
      }
    });
  },
});

export const mcpCmd = defineCommand({
  meta: {
    name: "mcp",
    description: "Configure external MCP sources sdd calls (org libs, AST, APIs) and fetch context",
  },
  subCommands: {
    sources,
    fetch,
  },
});
