import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const EXT_ID = "structured-vibe-coding.structured-vibe-sdd";

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "Expected a workspace folder");
  return folder.uri.fsPath;
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(workspaceRoot(), rel));
}

suite("Structured Vibe SDD — VS Code UI", () => {
  suiteSetup(async function () {
    this.timeout(120_000);
    // Ensure extension is activated
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `Extension ${EXT_ID} not found (check publisher.name in package.json)`);
    await ext.activate();
    assert.ok(ext.isActive, "Extension failed to activate");
  });

  test("extension activates and registers SDD commands", async () => {
    const cmds = await vscode.commands.getCommands(true);
    const required = [
      "structuredVibe.init",
      "structuredVibe.new",
      "structuredVibe.next",
      "structuredVibe.status",
      "structuredVibe.verify",
      "structuredVibe.complete",
      "structuredVibe.agentsInstall",
      "structuredVibe.agentsRefresh",
      "structuredVibe.refresh",
    ];
    for (const id of required) {
      assert.ok(cmds.includes(id), `Missing command: ${id}`);
    }
  });

  test("SDD: Initialize creates .sdd and only selected platform agents", async function () {
    this.timeout(60_000);
    // force + explicit platforms (no QuickPick in UI tests)
    await vscode.commands.executeCommand("structuredVibe.init", true, ["copilot"]);

    assert.ok(exists(".sdd/config.yaml"), ".sdd/config.yaml");
    assert.ok(exists(".sdd/workflows/hotfix.yaml"), "default workflow");
    assert.ok(exists("memory/index.md"), "memory documentation map");
    assert.ok(exists("memory/product.md"), "memory");
    assert.ok(exists(".sdd/protocol.md"), "single SDD protocol playbook");
    assert.ok(exists(".github/agents/sdd.agent.md"), "GitHub Copilot agent only");
    assert.ok(!exists(".claude/agents/sdd.md"), "Claude not installed when only copilot selected");
    assert.ok(!exists(".claude/skills/sdd/SKILL.md"), "no Claude skills (agents-only)");
    assert.ok(exists("AGENTS.md"), "AGENTS.md thin pointer");
  });

  test("SDD: New Change with args creates change pack", async function () {
    this.timeout(60_000);
    if (!exists(".sdd/config.yaml")) {
      await vscode.commands.executeCommand("structuredVibe.init", true, false);
    }

    await vscode.commands.executeCommand(
      "structuredVibe.new",
      "UI test hotfix typo",
      "hotfix",
    );

    const changesDir = path.join(workspaceRoot(), "changes");
    assert.ok(fs.existsSync(changesDir), "changes/ directory");
    const kids = fs.readdirSync(changesDir).filter((n) => n !== ".gitkeep" && n !== ".active");
    assert.ok(kids.length >= 1, "expected at least one change folder");
    const changePath = path.join(changesDir, kids[0]!);
    assert.ok(fs.existsSync(path.join(changePath, "meta.yaml")));
    assert.ok(fs.existsSync(path.join(changePath, "intent.md")));

    const meta = fs.readFileSync(path.join(changePath, "meta.yaml"), "utf8");
    assert.match(meta, /workflow:\s*hotfix/);
    assert.match(meta, /UI test hotfix typo/);
  });

  test("SDD: Next Stage advances workflow", async function () {
    this.timeout(60_000);
    if (!exists(".sdd/config.yaml")) {
      await vscode.commands.executeCommand("structuredVibe.init", true, false);
    }
    // Fresh change for this test
    await vscode.commands.executeCommand(
      "structuredVibe.new",
      "Advance stage UI test",
      "hotfix",
    );

    const changesDir = path.join(workspaceRoot(), "changes");
    const kids = fs
      .readdirSync(changesDir)
      .filter((n) => n.includes("advance-stage") || n.includes("advance"));
    const folder =
      kids[0] ??
      fs.readdirSync(changesDir).filter((n) => n !== ".gitkeep" && n !== ".active").pop();
    assert.ok(folder, "change folder");
    const changePath = path.join(changesDir, folder!);

    // Substantive intent required — empty templates fail advanceStage
    fs.writeFileSync(
      path.join(changePath, "intent.md"),
      [
        "# Intent",
        "",
        "UI test: advance hotfix from intent to implement after filling real intent content.",
        "Success: structuredVibe.next moves stage to implement without incomplete-artifact errors.",
        "",
      ].join("\n"),
      "utf8",
    );

    await vscode.commands.executeCommand("structuredVibe.next");

    const meta = fs.readFileSync(path.join(changePath, "meta.yaml"), "utf8");
    assert.match(meta, /stage:\s*implement/);
  });

  test("SDD: Refresh Agent Context writes active-context.md", async function () {
    this.timeout(60_000);
    if (!exists(".sdd/config.yaml")) {
      await vscode.commands.executeCommand("structuredVibe.init", true, false);
    }
    await vscode.commands.executeCommand(
      "structuredVibe.new",
      "Agent context UI",
      "hotfix",
    );
    await vscode.commands.executeCommand("structuredVibe.agentsRefresh");

    const ctxPath = path.join(workspaceRoot(), ".sdd", "active-context.md");
    assert.ok(fs.existsSync(ctxPath), "active-context.md");
    const body = fs.readFileSync(ctxPath, "utf8");
    assert.match(body, /Agent context UI|active context/i);
  });

  test("SDD: tree view provider is registered", async () => {
    // Opening the view forces tree provider work
    await vscode.commands.executeCommand("structuredVibe.refresh");
    // If we got here without throw, provider is live; optional: check extension context
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext?.isActive);
  });

  test("SDD: status command runs without error", async function () {
    this.timeout(60_000);
    if (!exists(".sdd/config.yaml")) {
      await vscode.commands.executeCommand("structuredVibe.init", true, false);
    }
    // Ensure there is an active change
    const changesDir = path.join(workspaceRoot(), "changes");
    const open = fs.existsSync(changesDir)
      ? fs.readdirSync(changesDir).filter((n) => n !== ".gitkeep" && n !== ".active")
      : [];
    if (open.length === 0) {
      await vscode.commands.executeCommand(
        "structuredVibe.new",
        "Status UI test",
        "hotfix",
      );
    }
    await vscode.commands.executeCommand("structuredVibe.status");
  });
});
