import * as vscode from "vscode";
import {
  isInitialized,
  loadConfig,
  type Config,
} from "@structured-vibe/core";

export function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

export async function requireWorkspaceRoot(): Promise<string> {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a folder workspace to use Structured Vibe Coding.");
  }
  return root;
}

export async function requireInit(): Promise<{ root: string; config: Config }> {
  const root = await requireWorkspaceRoot();
  if (!(await isInitialized(root))) {
    throw new Error('SDD is not initialized. Run "SDD: Initialize in Workspace" first.');
  }
  const config = await loadConfig(root);
  return { root, config };
}

export function showError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`SDD: ${msg}`);
}

export function showInfo(msg: string): void {
  void vscode.window.showInformationMessage(`SDD: ${msg}`);
}
