/**
 * MCP client setup — generate / write configs for real hosts.
 * Users should not hand-write JSON for every tool.
 */

import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  constants,
} from "node:fs/promises";

export type McpClientId =
  | "cursor"
  | "claude-code"
  | "vscode"
  | "claude-desktop"
  | "print";

export interface McpClientInfo {
  id: McpClientId;
  label: string;
  /** Where we write project-level config when --write */
  projectConfigRel?: string;
  /** Human path for user-global config (we print; may write with --global) */
  globalConfigHint?: string;
  /** Use case blurb */
  useCase: string;
}

export const MCP_CLIENTS: McpClientInfo[] = [
  {
    id: "cursor",
    label: "Cursor",
    projectConfigRel: ".cursor/mcp.json",
    useCase:
      "Editor agent with MCP tools — run sdd process + AST code slices from Cursor chat",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    projectConfigRel: ".mcp.json",
    useCase:
      "Claude Code CLI/agent — call sdd_new / sdd_next / sdd_code_context as tools",
  },
  {
    id: "vscode",
    label: "VS Code (Copilot / MCP)",
    projectConfigRel: ".vscode/mcp.json",
    useCase:
      "VS Code MCP support — tools available to Copilot Chat / MCP-enabled extensions",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    globalConfigHint:
      process.platform === "darwin"
        ? "~/Library/Application Support/Claude/claude_desktop_config.json"
        : process.platform === "win32"
          ? "%APPDATA%\\\\Claude\\\\claude_desktop_config.json"
          : "~/.config/Claude/claude_desktop_config.json",
    useCase:
      "Desktop app MCP — global config (not per-repo); set SDD_PROJECT_ROOT to your app",
  },
  {
    id: "print",
    label: "Generic / print only",
    useCase: "Any MCP host — print the snippet to paste yourself",
  },
];

export function resolveClient(id: string): McpClientInfo {
  const key = id.trim().toLowerCase().replace(/_/g, "-");
  const aliases: Record<string, McpClientId> = {
    cursor: "cursor",
    claude: "claude-code",
    "claude-code": "claude-code",
    claudecode: "claude-code",
    vscode: "vscode",
    code: "vscode",
    copilot: "vscode",
    "claude-desktop": "claude-desktop",
    desktop: "claude-desktop",
    print: "print",
    generic: "print",
    json: "print",
  };
  const resolved = aliases[key];
  const info = MCP_CLIENTS.find((c) => c.id === resolved);
  if (!info) {
    throw new Error(
      `Unknown MCP client "${id}". Use: ${MCP_CLIENTS.map((c) => c.id).join(", ")}`,
    );
  }
  return info;
}

export interface BuildMcpSnippetOpts {
  /** Absolute project root for SDD_PROJECT_ROOT */
  projectRoot: string;
  /** How to invoke sdd: "sdd" | absolute path | "npx" */
  command?: "sdd" | "npx" | string;
  /** Server key in mcpServers */
  serverName?: string;
}

/** Fragment under mcpServers.sdd */
export function buildSddServerEntry(opts: BuildMcpSnippetOpts): Record<string, unknown> {
  const name = opts.serverName ?? "sdd";
  const projectRoot = resolve(opts.projectRoot);
  const command = opts.command ?? "sdd";

  if (command === "npx") {
    return {
      [name]: {
        command: "npx",
        args: ["-y", "@structured-vibe-coding/cli", "mcp", "serve"],
        env: {
          SDD_PROJECT_ROOT: projectRoot,
        },
      },
    };
  }

  return {
    [name]: {
      command,
      args: ["mcp", "serve"],
      env: {
        SDD_PROJECT_ROOT: projectRoot,
      },
    },
  };
}

/** Full file shapes differ slightly by host */
export function buildConfigDocument(
  client: McpClientInfo,
  opts: BuildMcpSnippetOpts,
): { json: unknown; format: "mcpServers" | "servers" | "servers-vscode" } {
  const entry = buildSddServerEntry(opts);

  // VS Code 1.102+ style often uses "servers" in .vscode/mcp.json
  if (client.id === "vscode") {
    const servers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      const e = v as { command: string; args?: string[]; env?: Record<string, string> };
      servers[k] = {
        type: "stdio",
        command: e.command,
        args: e.args,
        env: e.env,
      };
    }
    return { json: { servers }, format: "servers-vscode" };
  }

  return { json: { mcpServers: entry }, format: "mcpServers" };
}

export function prettyJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge sdd server into existing config file without wiping other servers.
 */
export async function mergeAndWriteConfig(
  filePath: string,
  client: McpClientInfo,
  opts: BuildMcpSnippetOpts,
): Promise<{ path: string; created: boolean; merged: boolean }> {
  const { json: fresh } = buildConfigDocument(client, opts);
  let created = true;
  let merged = false;
  let out = fresh;

  if (await pathExists(filePath)) {
    created = false;
    try {
      const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<
        string,
        unknown
      >;
      if (client.id === "vscode") {
        const servers = {
          ...((raw.servers as Record<string, unknown>) ?? {}),
          ...((fresh as { servers: Record<string, unknown> }).servers ?? {}),
        };
        out = { ...raw, servers };
      } else {
        const mcpServers = {
          ...((raw.mcpServers as Record<string, unknown>) ?? {}),
          ...((fresh as { mcpServers: Record<string, unknown> }).mcpServers ??
            {}),
        };
        out = { ...raw, mcpServers };
      }
      merged = true;
    } catch {
      // overwrite invalid JSON with fresh
      out = fresh;
    }
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, prettyJson(out), "utf8");
  return { path: filePath, created, merged };
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

export function claudeDesktopConfigPath(): string {
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library/Application Support/Claude/claude_desktop_config.json",
    );
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appdata, "Claude", "claude_desktop_config.json");
  }
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

export function resolveWritePath(
  client: McpClientInfo,
  projectRoot: string,
  explicitPath?: string,
  globalWrite?: boolean,
): string | null {
  if (explicitPath) {
    return isAbsolute(explicitPath)
      ? explicitPath
      : resolve(projectRoot, explicitPath);
  }
  if (client.id === "claude-desktop" || globalWrite) {
    if (client.id === "claude-desktop") return claudeDesktopConfigPath();
    return null;
  }
  if (client.projectConfigRel) {
    return join(projectRoot, client.projectConfigRel);
  }
  return null;
}
