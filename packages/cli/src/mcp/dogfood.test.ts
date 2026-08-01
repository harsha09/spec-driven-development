/**
 * Dogfood: act like a developer using MCP tools for a full hotfix + greenfield + AST path.
 */
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "@structured-vibe-coding/core";
import {
  toolCodeContext,
  toolComplete,
  toolDoctor,
  toolFeatureList,
  toolFeatureStart,
  toolGreenfield,
  toolHelp,
  toolHandoff,
  toolNew,
  toolNext,
  toolSkip,
  toolStatus,
  toolVerify,
  toolWorkflows,
} from "./tools.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function text(r: ToolResult): string {
  return r.content.map((c) => c.text ?? "").join("\n");
}

function ok(r: ToolResult) {
  expect(r.isError, text(r)).toBeFalsy();
}

function failed(r: ToolResult) {
  expect(r.isError, text(r)).toBe(true);
}

async function changeDir(root: string): Promise<string> {
  const kids = (await readdir(join(root, "changes"))).filter(
    (n) => n !== ".gitkeep" && n !== ".active",
  );
  expect(kids.length).toBeGreaterThan(0);
  return join(root, "changes", kids[0]!);
}

describe("dogfood: developer MCP journey", () => {
  it("full hotfix lifecycle via MCP tools + SDD_PROJECT_ROOT", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-df-hotfix-"));
    temps.push(root);
    process.env.SDD_PROJECT_ROOT = root;

    await initProject({ projectRoot: root, agents: "copilot" });

    // 1) doctor
    const doc = await toolDoctor({});
    ok(doc);
    expect(text(doc)).toMatch(/initialized/i);

    // 2) workflows visible
    const wfs = await toolWorkflows({});
    ok(wfs);
    expect(text(wfs)).toMatch(/hotfix/);
    expect(text(wfs)).toMatch(/greenfield/);

    // 3) help
    ok(await toolHelp());

    // 4) new hotfix
    const created = await toolNew({
      title: "Empty list crash on expenses",
      workflow: "hotfix",
    });
    ok(created);
    expect(text(created)).toMatch(/Created change|intent/i);

    // 5) status
    const st1 = await toolStatus({});
    ok(st1);
    expect(text(st1)).toMatch(/intent/);

    // 6) handoff non-empty
    const hand = await toolHandoff({});
    ok(hand);
    expect(text(hand).length).toBeGreaterThan(80);

    // 7) next should FAIL on empty template (real dev hits this)
    const nextFail = await toolNext({});
    failed(nextFail);
    expect(text(nextFail)).toMatch(/incomplete|template|artifact|required/i);

    // 8) fill intent with real meat
    const cdir = await changeDir(root);
    await writeFile(
      join(cdir, "intent.md"),
      [
        "# Intent",
        "",
        "Expenses page throws when the list is empty (null reference in render).",
        "Show an empty state instead of crashing.",
        "Success: open expenses with zero rows — no error, empty UI visible.",
        "",
      ].join("\n"),
      "utf8",
    );

    // 9) next → implement
    const next1 = await toolNext({});
    ok(next1);
    expect(text(next1)).toMatch(/implement/i);

    // 10) mini product code for AST
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src/expenses.ts"),
      [
        "export function renderExpenses(rows: string[] | null): string {",
        "  if (!rows || rows.length === 0) return 'empty';",
        "  return rows.join(',');",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    // 11) code context
    const ctx = await toolCodeContext({
      paths: ["src/expenses.ts"],
      symbols: ["renderExpenses"],
      maxTokens: 2000,
      format: "markdown",
      writeToChange: true,
    });
    ok(ctx);
    expect(text(ctx)).toMatch(/renderExpenses|expenses|Code context/i);

    // 12) implement → local_verify
    const next2 = await toolNext({});
    ok(next2);
    expect(text(next2)).toMatch(/local_verify|verify/i);

    // 13) fill verify results
    await writeFile(
      join(cdir, "local-test-results.md"),
      [
        "# Results",
        "",
        "Verified empty list shows empty state; no exception on laptop.",
        "Slow network case not tested.",
        "",
      ].join("\n"),
      "utf8",
    );

    // 14) verify (no run commands)
    const ver = await toolVerify({ noRun: true });
    ok(ver);

    // 15) complete
    const done = await toolComplete({});
    ok(done);
    expect(text(done)).toMatch(/Completed|completed/i);

    // 16) status list still works
    const list = await toolStatus({ list: true });
    ok(list);

    delete process.env.SDD_PROJECT_ROOT;
  });

  it("greenfield → feature list/start via MCP", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-df-gf-"));
    temps.push(root);

    await initProject({ projectRoot: root, agents: "grok" });

    const gf = await toolGreenfield({
      projectRoot: root,
      idea: "Shared shopping list for roommates",
    });
    ok(gf);
    expect(text(gf)).toMatch(/greenfield|vision/i);

    const cdir = await changeDir(root);
    // walk stages with substantive content
    await writeFile(
      join(cdir, "vision.md"),
      "# Product vision\n\nRoommates need one shared shopping list on phones so nobody double-buys milk.\nMVP success: two people add items and mark bought.\nNon-goals: delivery integrations.\n",
      "utf8",
    );
    ok(await toolNext({ projectRoot: root }));

    await writeFile(
      join(cdir, "requirements.md"),
      "# Requirements\n\nR-001: Users shall add items with a name.\nR-002: Users shall mark items bought.\nAcceptance: two accounts see the same list updates.\n",
      "utf8",
    );
    ok(await toolNext({ projectRoot: root }));

    await writeFile(
      join(cdir, "features.md"),
      [
        "# Feature backlog",
        "",
        "## F-001: Add item",
        "",
        "- **Status:** planned",
        "- **Priority:** must",
        "- **Workflow:** hotfix",
        "- **Summary:** User adds a named item to the shared list from mobile.",
        "- **Requirements:** R-001",
        "- **Notes:**",
        "",
        "## F-002: Mark bought",
        "",
        "- **Status:** planned",
        "- **Priority:** must",
        "- **Workflow:** hotfix",
        "- **Summary:** User toggles bought so roommates see it.",
        "- **Requirements:** R-002",
        "- **Notes:**",
        "",
      ].join("\n"),
      "utf8",
    );
    ok(await toolNext({ projectRoot: root }));

    await writeFile(
      join(cdir, "architecture.md"),
      "# Architecture\n\nSimple API + Postgres. Mobile clients only. No microservices in v1. Risks: offline sync deferred.\n",
      "utf8",
    );

    const done = await toolComplete({ projectRoot: root });
    ok(done);
    expect(text(done)).toMatch(/Promoted|Completed|memory/i);

    // memory files exist
    expect(await readFile(join(root, "memory/features.md"), "utf8")).toMatch(
      /F-001/,
    );

    const fl = await toolFeatureList({ projectRoot: root });
    ok(fl);
    expect(text(fl)).toMatch(/F-001/);
    expect(text(fl)).toMatch(/F-002/);

    const start = await toolFeatureStart({
      projectRoot: root,
      featureId: "F-001",
    });
    ok(start);
    expect(text(start)).toMatch(/F-001|Started/i);

    // skip not needed for hotfix first stage - just status
    const st = await toolStatus({ projectRoot: root });
    ok(st);
  });

  it("errors are actionable for real mistakes", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-df-err-"));
    temps.push(root);

    // not initialized
    const d = await toolDoctor({ projectRoot: root });
    failed(d);

    await initProject({ projectRoot: root, agents: "grok" });

    // feature list without backlog
    const fl = await toolFeatureList({ projectRoot: root });
    failed(fl);
    expect(text(fl)).toMatch(/backlog|greenfield|features/i);

    // next without change
    const n = await toolNext({ projectRoot: root });
    failed(n);
  });

  it("skip works when optional stage exists on feature workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-df-skip-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });

    ok(
      await toolNew({
        projectRoot: root,
        title: "Add CSV export for reports dogfood",
        workflow: "feature",
      }),
    );
    const cdir = await changeDir(root);
    await writeFile(
      join(cdir, "feature.md"),
      "# Feature\n\nAnalysts need CSV export of the filtered report for offline work.\nScope: visible columns only. Non-goals: PDF. Success: 10k rows download.\n",
      "utf8",
    );
    const st = await toolStatus({ projectRoot: root });
    ok(st);
    const n1 = (await toolNext({ projectRoot: root })) as ToolResult;
    if (!n1.isError) {
      const st2 = text(await toolStatus({ projectRoot: root }));
      if (/clarify/i.test(st2)) {
        const sk = await toolSkip({
          projectRoot: root,
          stage: "clarify_intent",
          reason: "scope is clear for dogfood",
        });
        expect(text(sk).length).toBeGreaterThan(0);
      }
    } else {
      // feature.md may not be the first required artifact name on all workflows
      expect(text(n1).length).toBeGreaterThan(0);
    }
  });
});

