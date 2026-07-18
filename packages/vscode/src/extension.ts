import * as vscode from "vscode";
import { registerCommands } from "./commands.js";
import { SddTreeProvider } from "./tree.js";
import { getWorkspaceRoot } from "./workspace.js";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new SddTreeProvider();
  const treeView = vscode.window.createTreeView("structuredVibe.stages", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  registerCommands(context, tree);

  const autoRefresh = vscode.workspace
    .getConfiguration("structuredVibe")
    .get<boolean>("autoRefresh", true);

  if (autoRefresh) {
    const root = getWorkspaceRoot();
    if (root) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, "{.sdd,changes,archive,memory}/**/*"),
      );
      const bounce = debounce(() => tree.refresh(), 300);
      watcher.onDidChange(bounce);
      watcher.onDidCreate(bounce);
      watcher.onDidDelete(bounce);
      context.subscriptions.push(watcher);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
  );

  void vscode.commands.executeCommand("setContext", "structuredVibe.activated", true);
}

export function deactivate(): void {
  // no-op
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}
