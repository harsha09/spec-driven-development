import * as path from "node:path";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runTests } from "@vscode/test-electron";

/**
 * Keep paths short: VS Code IPC sockets fail if the path exceeds ~103 chars
 * (common on macOS with deep monorepo paths).
 */
function shortTemp(prefix: string): string {
  const base = process.platform === "darwin" ? "/tmp" : tmpdir();
  const dir = path.join(base, `${prefix}-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");

  const workspace = shortTemp("sddw");
  const userDataDir = shortTemp("sddu");
  const extensionsDir = shortTemp("sdde");

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspace,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        "--disable-extensions",
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  } finally {
    // Best-effort cleanup of short temp dirs
    for (const d of [workspace, userDataDir, extensionsDir]) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error("Failed to run VS Code UI tests:", err);
  process.exit(1);
});
