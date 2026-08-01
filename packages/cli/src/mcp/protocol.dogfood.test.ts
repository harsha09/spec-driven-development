/**
 * Real MCP stdio protocol: list tools + call sdd_status / sdd_next like a host would.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "@structured-vibe-coding/core";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

function text(result: unknown): string {
  const r = result as {
    content?: Array<{ type: string; text?: string }>;
  };
  const parts = r.content ?? [];
  return parts.map((p) => p.text ?? "").join("\n");
}

function isErr(result: unknown): boolean {
  return Boolean((result as { isError?: boolean }).isError);
}

describe("MCP stdio protocol dogfood", () => {
  it("lists tools and runs process calls over the wire", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-mcp-proto-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [sddBin, "mcp", "serve"],
      env: {
        ...process.env,
        SDD_PROJECT_ROOT: root,
        SDD_NO_AGENT: "1",
      },
    });
    const client = new Client({ name: "vitest-dogfood", version: "1.0.0" });
    await client.connect(transport);

    try {
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name).sort();
      expect(names).toContain("sdd_new");
      expect(names).toContain("sdd_next");
      expect(names).toContain("sdd_code_context");
      expect(names).toContain("sdd_complete");
      expect(names.length).toBeGreaterThanOrEqual(14);

      const created = await client.callTool({
        name: "sdd_new",
        arguments: {
          title: "Protocol dogfood hotfix",
          workflow: "hotfix",
        },
      });
      expect(isErr(created)).toBeFalsy();
      expect(text(created)).toMatch(/Created change|intent/i);

      const badNext = await client.callTool({
        name: "sdd_next",
        arguments: {},
      });
      expect(isErr(badNext)).toBe(true);

      const kids = (await readdir(join(root, "changes"))).filter(
        (n) => !n.startsWith("."),
      );
      await writeFile(
        join(root, "changes", kids[0]!, "intent.md"),
        "# Intent\n\nProtocol test: empty template must block; after real prose, next advances.\nSuccess: stage becomes implement.\n",
        "utf8",
      );

      const goodNext = await client.callTool({
        name: "sdd_next",
        arguments: {},
      });
      expect(isErr(goodNext)).toBeFalsy();
      expect(text(goodNext)).toMatch(/implement/i);

      const status = await client.callTool({
        name: "sdd_status",
        arguments: {},
      });
      expect(isErr(status)).toBeFalsy();
      expect(text(status)).toMatch(/implement/);
    } finally {
      await client.close();
    }
  }, 60_000);
});
