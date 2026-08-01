import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildConfigDocument,
  buildSddServerEntry,
  mergeAndWriteConfig,
  resolveClient,
} from "./setup.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("mcp setup config builders", () => {
  it("resolves client aliases", () => {
    expect(resolveClient("cursor").id).toBe("cursor");
    expect(resolveClient("claude").id).toBe("claude-code");
    expect(resolveClient("vscode").projectConfigRel).toBe(".vscode/mcp.json");
  });

  it("builds sdd server entry with project root", () => {
    const entry = buildSddServerEntry({
      projectRoot: "/app/my-repo",
      command: "sdd",
    });
    expect(entry.sdd).toMatchObject({
      command: "sdd",
      args: ["mcp", "serve"],
      env: { SDD_PROJECT_ROOT: "/app/my-repo" },
    });
  });

  it("writes cursor mcp.json and merges second server", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-mcp-setup-"));
    temps.push(root);
    const client = resolveClient("cursor");
    const path = join(root, client.projectConfigRel!);

    const r1 = await mergeAndWriteConfig(path, client, {
      projectRoot: root,
    });
    expect(r1.created).toBe(true);
    const j1 = JSON.parse(await readFile(path, "utf8"));
    expect(j1.mcpServers.sdd.env.SDD_PROJECT_ROOT).toBe(root);

    // pre-existing other server
    j1.mcpServers.other = { command: "echo" };
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path, JSON.stringify(j1, null, 2)),
    );

    const r2 = await mergeAndWriteConfig(path, client, {
      projectRoot: root,
    });
    expect(r2.merged).toBe(true);
    const j2 = JSON.parse(await readFile(path, "utf8"));
    expect(j2.mcpServers.other).toBeTruthy();
    expect(j2.mcpServers.sdd).toBeTruthy();
  });

  it("vscode uses servers shape", () => {
    const client = resolveClient("vscode");
    const { json } = buildConfigDocument(client, {
      projectRoot: "/proj",
    });
    expect(json).toHaveProperty("servers");
    expect((json as { servers: { sdd: { type: string } } }).servers.sdd.type).toBe(
      "stdio",
    );
  });
});
