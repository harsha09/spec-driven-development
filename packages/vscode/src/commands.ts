import * as vscode from "vscode";
import {
  advanceStage,
  approveGate,
  AGENT_TARGET_OPTIONS,
  buildAgentPrompt,
  buildContext,
  completeChange,
  createChange,
  formatStatus,
  initProject,
  installAgentIntegration,
  isInitialized,
  listChanges,
  listWorkflowNames,
  loadWorkflow,
  parseIntegration,
  recommendWorkflow,
  refreshActiveAgentContext,
  resolveChangeId,
  runLocalVerify,
  setActiveChange,
  skipStage,
  switchWorkflow,
  type AgentTarget,
} from "@structured-vibe-coding/core";
import type { SddTreeProvider } from "./tree.js";
import { requireInit, requireWorkspaceRoot, showError, showInfo } from "./workspace.js";

export function registerCommands(
  context: vscode.ExtensionContext,
  tree: SddTreeProvider,
): void {
  const refresh = () => tree.refresh();

  const reg = (id: string, fn: (...args: unknown[]) => Promise<void>) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await fn(...args);
          refresh();
        } catch (err) {
          showError(err);
        }
      }),
    );
  };

  reg("structuredVibe.refresh", async () => {
    refresh();
  });

  /**
   * @param forceArg when true, re-init without confirm (UI tests / automation)
   * @param agentsArg AI agent(s) — string, string[], or false/"none" to skip.
   *   When omitted, shows a single-agent picker (Speckit-style).
   */
  reg("structuredVibe.init", async (forceArg?: unknown, agentsArg?: unknown) => {
    const root = await requireWorkspaceRoot();
    const force = forceArg === true;
    if (await isInitialized(root)) {
      if (!force) {
        const again = await vscode.window.showWarningMessage(
          "SDD already initialized. Re-copy default workflows/templates?",
          "Force re-init",
          "Cancel",
        );
        if (again !== "Force re-init") return;
      }
    }

    const agents = await resolveAgentTargetsForIde(agentsArg);
    if (agents === undefined) return; // user cancelled picker

    await initProject({
      projectRoot: root,
      force: force || (await isInitialized(root)),
      agents: agents === false ? false : agents[0],
    });
    const agentNote =
      agents === false
        ? "No agent files (use SDD: Install Agent Integrations)."
        : `AI agent: ${agents[0]}.`;
    showInfo(`Initialized. ${agentNote} Use SDD: New Change to start.`);
  });

  /**
   * @param titleArg optional title (skips input box when string)
   * @param workflowArg optional workflow name (skips quick pick when string)
   */
  reg("structuredVibe.new", async (titleArg?: unknown, workflowArg?: unknown) => {
    const { root, config } = await requireInit();
    let title =
      typeof titleArg === "string" && titleArg.trim()
        ? titleArg.trim()
        : undefined;
    if (!title) {
      title = await vscode.window.showInputBox({
        prompt: "Change title (spec-first intent)",
        placeHolder: "Add CSV export for expenses",
        ignoreFocusOut: true,
      });
    }
    if (!title?.trim()) return;
    title = title.trim();

    let workflowName =
      typeof workflowArg === "string" && workflowArg.trim()
        ? workflowArg.trim()
        : undefined;
    if (!workflowName) {
      const rec = await recommendWorkflow(root, title, config);
      const names = await listWorkflowNames(root);
      const picks = [
        {
          label: rec.name,
          description: `Recommended — ${rec.reason}`,
          picked: true,
        },
        ...names
          .filter((n) => n !== rec.name)
          .map((n) => ({ label: n, description: "Workflow pack" })),
      ];
      const chosen = await vscode.window.showQuickPick(picks, {
        title: "Select workflow",
        placeHolder: rec.name,
        ignoreFocusOut: true,
      });
      if (!chosen) return;
      workflowName = chosen.label;
    }

    const ctx = await createChange({
      projectRoot: root,
      config,
      title,
      workflowName,
    });
    showInfo(`Created ${ctx.id} (${ctx.meta.workflow}) · stage ${ctx.meta.stage}`);
    await openPath(ctx.path);
  });

  reg("structuredVibe.status", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const ctx = await buildContext(root, config, id);
    const channel = getOutput();
    channel.clear();
    channel.appendLine(formatStatus(ctx));
    channel.show(true);
  });

  reg("structuredVibe.next", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    try {
      const result = await advanceStage(root, config, id);
      for (const w of result.warnings) {
        void vscode.window.showWarningMessage(`SDD: ${w}`);
      }
      if (result.to) {
        showInfo(`${result.from} → ${result.to}`);
        if (result.artifactsCreated.length) {
          const first = result.artifactsCreated.find((p) => !p.endsWith("/"));
          if (first) await openPath(`${result.ctx.path}/${first}`);
        }
      } else {
        showInfo("Already on the last stage. Run SDD: Complete Change when ready.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Hard gate/i.test(msg)) {
        const pick = await vscode.window.showErrorMessage(
          msg,
          "Approve gate",
          "Cancel",
        );
        if (pick === "Approve gate") {
          await approveGate(root, config, id, undefined, "Approved from IDE");
          const result = await advanceStage(root, config, id);
          showInfo(`${result.from} → ${result.to ?? "(end)"}`);
        }
        return;
      }
      throw err;
    }
  });

  reg("structuredVibe.skip", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const ctx = await buildContext(root, config, id);
    const stageId = await vscode.window.showQuickPick(
      ctx.stages
        .filter((s) => s.skippable)
        .map((s) => ({ label: s.id, description: s.title })),
      { title: "Stage to skip", ignoreFocusOut: true },
    );
    if (!stageId) return;
    const reason = await vscode.window.showInputBox({
      prompt: "Reason for skipping (required)",
      ignoreFocusOut: true,
    });
    if (!reason?.trim()) return;
    await skipStage(root, config, id, stageId.label, reason.trim());
    showInfo(`Skipped ${stageId.label}`);
  });

  reg("structuredVibe.use", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const names = await listWorkflowNames(root);
    const pick = await vscode.window.showQuickPick(names, {
      title: "Switch workflow for this change",
      ignoreFocusOut: true,
    });
    if (!pick) return;
    const reason = await vscode.window.showInputBox({
      prompt: "Reason (optional)",
      ignoreFocusOut: true,
    });
    await switchWorkflow(root, config, id, pick, reason || undefined);
    showInfo(`Workflow → ${pick}`);
  });

  reg("structuredVibe.gateApprove", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const note = await vscode.window.showInputBox({
      prompt: "Approval note (optional)",
      ignoreFocusOut: true,
    });
    const ctx = await approveGate(root, config, id, undefined, note || undefined, "approved");
    showInfo(`Gate approved on ${ctx.meta.stage}`);
  });

  reg("structuredVibe.gateWaive", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const note = await vscode.window.showInputBox({
      prompt: "Waiver note (recommended)",
      ignoreFocusOut: true,
    });
    const ctx = await approveGate(root, config, id, undefined, note || undefined, "waived");
    showInfo(`Gate waived on ${ctx.meta.stage}`);
  });

  reg("structuredVibe.verify", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const result = await runLocalVerify(root, config, id, { runCommands: true });
    const channel = getOutput();
    channel.appendLine(`\n=== Local verify: ${result.stageId} ===`);
    for (const r of result.results) {
      channel.appendLine(`  [${r.exitCode === 0 ? "ok" : "FAIL"}] ${r.name} (exit ${r.exitCode})`);
    }
    if (!result.results.length) {
      channel.appendLine("  (no commands — complete checklist in local-test-results.md)");
    }
    channel.show(true);
    if (result.ok) {
      showInfo(`Verify passed for ${result.stageId}`);
    } else {
      void vscode.window.showWarningMessage(
        `SDD: Verify did not pass for ${result.stageId}. See Output → Structured Vibe.`,
      );
    }
  });

  /** @param forceArg when true, skip confirm dialog (UI tests) */
  reg("structuredVibe.complete", async (forceArg?: unknown) => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    if (forceArg !== true) {
      const confirm = await vscode.window.showWarningMessage(
        `Complete change ${id}?`,
        "Complete",
        "Cancel",
      );
      if (confirm !== "Complete") return;
    }
    const { archivedTo } = await completeChange(root, config, id);
    showInfo(archivedTo ? `Completed and archived to ${archivedTo}` : `Completed ${id}`);
  });

  reg("structuredVibe.workflows", async () => {
    const { root } = await requireInit();
    const names = await listWorkflowNames(root);
    const items = [];
    for (const name of names) {
      const wf = await loadWorkflow(root, name);
      items.push({
        label: name,
        description: `${wf.stages.length} stages`,
        detail: wf.description,
      });
    }
    await vscode.window.showQuickPick(items, {
      title: "Workflow packs in this repo",
    });
  });

  reg("structuredVibe.agent", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const ctx = await buildContext(root, config, id);
    const prompt = await buildAgentPrompt(ctx, config, root);
    await vscode.env.clipboard.writeText(prompt);
    showInfo("Agent handoff copied to clipboard — paste into Cursor / Copilot Chat.");
  });

  reg("structuredVibe.checkout", async (changeIdArg?: unknown) => {
    const { root, config } = await requireInit();
    let changeId = typeof changeIdArg === "string" ? changeIdArg : undefined;
    if (!changeId) {
      const ids = await listChanges(root, config);
      if (!ids.length) {
        showInfo("No open changes.");
        return;
      }
      changeId = await vscode.window.showQuickPick(ids, {
        title: "Active change",
        ignoreFocusOut: true,
      });
    }
    if (!changeId) return;
    await buildContext(root, config, changeId);
    await setActiveChange(root, config, changeId);
    showInfo(`Active change: ${changeId}`);
  });

  reg("structuredVibe.openChangeFolder", async () => {
    const { root, config } = await requireInit();
    const id = await resolveChangeId(root, config);
    const ctx = await buildContext(root, config, id);
    await openPath(ctx.path);
  });

  /**
   * @param agentsArg AI agent key/string[] to skip picker (Speckit-style single agent)
   */
  reg("structuredVibe.agentsInstall", async (agentsArg?: unknown) => {
    const root = await requireWorkspaceRoot();
    if (!(await isInitialized(root))) {
      throw new Error("Initialize SDD first.");
    }
    const targets = await resolveAgentTargetsForIde(agentsArg, { allowNone: false });
    if (targets === undefined || targets === false) return;
    const result = await installAgentIntegration({
      projectRoot: root,
      target: targets[0]!,
      force: true,
    });
    showInfo(`AI agent (${result.target}): +${result.created.length} files`);
  });

  reg("structuredVibe.agentsRefresh", async () => {
    const root = await requireWorkspaceRoot();
    const path = await refreshActiveAgentContext(root);
    if (path) {
      showInfo(`Updated ${path}`);
      await openPath(path);
    }
  });
}

/**
 * Resolve AI coding agent for IDE commands (not IDEs).
 * Speckit-style: one agent. Returns `undefined` if cancelled.
 */
async function resolveAgentTargetsForIde(
  agentsArg: unknown,
  opts?: { allowNone?: boolean },
): Promise<false | AgentTarget[] | undefined> {
  const allowNone = opts?.allowNone !== false;

  if (agentsArg === false || agentsArg === "none") return false;
  if (typeof agentsArg === "string" && agentsArg.trim()) {
    return [parseIntegration(agentsArg)];
  }
  if (Array.isArray(agentsArg) && agentsArg.length) {
    // Prefer first entry only (one integration at a time)
    return [parseIntegration(String(agentsArg[0]))];
  }

  const items: { label: string; description?: string; targets: false | AgentTarget[] }[] =
    AGENT_TARGET_OPTIONS.map((o) => ({
      label: o.label,
      description: `${o.key} · ${o.hint}`,
      targets: [o.id] as AgentTarget[],
    }));
  if (allowNone) {
    items.push({
      label: "None",
      description: "Skip agent files — install later",
      targets: false,
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    title: "Choose your AI coding agent integration",
    placeHolder: "copilot | claude | grok — not VS Code / IntelliJ",
    ignoreFocusOut: true,
  });
  if (!pick) return undefined;
  return pick.targets;
}

let output: vscode.OutputChannel | undefined;

function getOutput(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel("Structured Vibe");
  }
  return output;
}

async function openPath(fsPath: string): Promise<void> {
  const uri = vscode.Uri.file(fsPath);
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.Directory) {
      await vscode.commands.executeCommand("revealInExplorer", uri);
    } else {
      await vscode.window.showTextDocument(uri);
    }
  } catch {
    // ignore missing path
  }
}
