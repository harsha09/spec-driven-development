import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "@structured-vibe-coding/core";
import {
  toolDoctor,
  toolHelp,
  toolNew,
  toolNext,
  toolStatus,
} from "./tools.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("MCP tool handlers (in-CLI)", () => {
  it("sdd_help returns guidance", async () => {
    const r = await toolHelp();
    expect(r.content[0]?.text).toMatch(/sdd MCP/i);
  });

  it("doctor / new / status / next work without separate package", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-mcp-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });

    const doc = await toolDoctor({ projectRoot: root });
    expect("isError" in doc && doc.isError).toBeFalsy();
    expect(doc.content[0]?.text).toMatch(/initialized/i);

    const created = await toolNew({
      projectRoot: root,
      title: "MCP hotfix typo",
      workflow: "hotfix",
    });
    expect("isError" in created && created.isError).toBeFalsy();
    expect(created.content[0]?.text).toMatch(/Created change|hotfix|intent/i);

    const st = await toolStatus({ projectRoot: root });
    expect("isError" in st && st.isError).toBeFalsy();
    expect(st.content[0]?.text).toMatch(/intent|hotfix/i);

    // Fill intent with substantive content via filesystem
    const { readdir, writeFile } = await import("node:fs/promises");
    const kids = (await readdir(join(root, "changes"))).filter(
      (n) => n !== ".gitkeep" && n !== ".active",
    );
    const changePath = join(root, "changes", kids[0]!);
    await writeFile(
      join(changePath, "intent.md"),
      "# Intent\n\nMCP integration test: prove sdd_next advances when intent is real prose about a tiny fix.\nSuccess: stage moves past intent.\n",
      "utf8",
    );

    const next = await toolNext({ projectRoot: root });
    expect("isError" in next && next.isError).toBeFalsy();
    expect(next.content[0]?.text).toMatch(/implement|Advanced/i);
  });
});
