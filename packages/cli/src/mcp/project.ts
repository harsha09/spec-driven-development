/**
 * Resolve project root for MCP tools (stdio hosts often start outside the app).
 */
import { isInitialized, loadConfig, type Config } from "@structured-vibe-coding/core";

export function resolveMcpProjectRoot(explicit?: string): string {
  const root = (explicit || process.env.SDD_PROJECT_ROOT || process.cwd()).trim();
  return root;
}

export async function requireProject(explicit?: string): Promise<{
  root: string;
  config: Config;
}> {
  const root = resolveMcpProjectRoot(explicit);
  if (!(await isInitialized(root))) {
    throw new Error(
      `SDD is not initialized in ${root}. Run: sdd init --here --ai copilot  (or set SDD_PROJECT_ROOT)`,
    );
  }
  const config = await loadConfig(root);
  return { root, config };
}

export function okText(text: string) {
  return {
    content: [{ type: "text" as const, text: text.endsWith("\n") ? text : `${text}\n` }],
  };
}

export function errText(message: string) {
  return {
    content: [{ type: "text" as const, text: message.endsWith("\n") ? message : `${message}\n` }],
    isError: true as const,
  };
}
