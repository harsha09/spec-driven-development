import * as vscode from "vscode";
import { join } from "node:path";
import {
  buildContext,
  formatStatus,
  getActiveChangeId,
  isInitialized,
  isStageSkipped,
  listChanges,
  loadConfig,
  shouldAutoSkip,
  type ChangeContext,
  type Stage,
} from "@structured-vibe/core";
import { getWorkspaceRoot } from "./workspace.js";

export type TreeNode =
  | { kind: "message"; label: string }
  | { kind: "change"; label: string; changeId: string; isActive: boolean }
  | { kind: "stage"; label: string; stage: Stage; changeId: string; mark: string }
  | { kind: "artifact"; label: string; path: string; changeId: string };

export class SddTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "message") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "message";
      return item;
    }

    if (element.kind === "change") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = "change";
      item.description = element.isActive ? "active" : undefined;
      item.iconPath = new vscode.ThemeIcon(element.isActive ? "circle-filled" : "circle-outline");
      item.command = {
        command: "structuredVibe.checkout",
        title: "Switch Active Change",
        arguments: [element.changeId],
      };
      return item;
    }

    if (element.kind === "stage") {
      const item = new vscode.TreeItem(
        `${element.mark} ${element.stage.id}`,
        element.stage.artifacts.length
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.stage.title;
      item.tooltip = element.stage.summary ?? element.stage.title;
      item.contextValue = "stage";
      if (element.mark === "●") {
        item.iconPath = new vscode.ThemeIcon("debug-stackframe-focused");
      } else if (element.mark === "✓") {
        item.iconPath = new vscode.ThemeIcon("check");
      } else if (element.mark === "·") {
        item.iconPath = new vscode.ThemeIcon("debug-step-over");
      }
      return item;
    }

    // artifact
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "artifact";
    item.resourceUri = vscode.Uri.file(element.path);
    item.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [vscode.Uri.file(element.path)],
    };
    item.iconPath = new vscode.ThemeIcon("file");
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const root = getWorkspaceRoot();
    if (!root) {
      return [{ kind: "message", label: "Open a folder to use SDD" }];
    }

    if (!(await isInitialized(root))) {
      return [{ kind: "message", label: "Not initialized — run SDD: Initialize" }];
    }

    const config = await loadConfig(root);

    if (!element) {
      const ids = await listChanges(root, config);
      const active = await getActiveChangeId(root, config);
      if (!ids.length) {
        return [{ kind: "message", label: "No open changes — run SDD: New Change" }];
      }
      // Active first
      const ordered = [...ids].sort((a, b) => {
        if (a === active) return -1;
        if (b === active) return 1;
        return a.localeCompare(b);
      });
      return ordered.map((id) => ({
        kind: "change" as const,
        label: id,
        changeId: id,
        isActive: id === active,
      }));
    }

    if (element.kind === "change") {
      try {
        const ctx = await buildContext(root, config, element.changeId);
        return ctx.stages.map((stage) => ({
          kind: "stage" as const,
          label: stage.id,
          stage,
          changeId: element.changeId,
          mark: stageMark(ctx, stage),
        }));
      } catch (err) {
        return [
          {
            kind: "message",
            label: err instanceof Error ? err.message : String(err),
          },
        ];
      }
    }

    if (element.kind === "stage") {
      try {
        const ctx = await buildContext(root, config, element.changeId);
        return element.stage.artifacts.map((a) => {
          const rel = a.path.endsWith("/") ? a.path.slice(0, -1) : a.path;
          return {
            kind: "artifact" as const,
            label: a.path,
            path: join(ctx.path, rel),
            changeId: element.changeId,
          };
        });
      } catch {
        return [];
      }
    }

    return [];
  }
}

function stageMark(ctx: ChangeContext, stage: Stage): string {
  const skipped =
    isStageSkipped(ctx.meta, stage.id) || shouldAutoSkip(stage, ctx.meta);
  if (skipped) return "·";
  if (stage.id === ctx.meta.stage) return "●";
  const order = ctx.active.map((s) => s.id);
  const cur = order.indexOf(ctx.meta.stage);
  const idx = order.indexOf(stage.id);
  if (idx >= 0 && cur >= 0 && idx < cur) return "✓";
  return " ";
}

export async function getStatusText(): Promise<string> {
  const root = getWorkspaceRoot();
  if (!root) return "No workspace open.";
  if (!(await isInitialized(root))) return "SDD not initialized.";
  const config = await loadConfig(root);
  const active = await getActiveChangeId(root, config);
  if (!active) return "No active change.";
  const ctx = await buildContext(root, config, active);
  return formatStatus(ctx);
}
