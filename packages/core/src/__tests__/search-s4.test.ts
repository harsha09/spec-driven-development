import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type McpSearchCall,
  buildRetrievedInner,
  executeSearch,
  initProject,
  loadConfig,
  loadSearchConfig,
  resolveSearchProvider,
} from "../index.js";
import * as mcpClient from "../mcp/client.js";

const temps: string[] = [];
const SECRET = "FAKE_PRIVATE_RECORD_S4";
const ENV_SECRET = "SECRET_ENV_S4=1";

afterEach(async () => {
  vi.restoreAllMocks();
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-search-s4-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src/ok.ts"),
    "export function okWidget(): number {\n  return 1;\n}\n",
  );
  return root;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeSearch(root: string, extra = ""): Promise<void> {
  await writeFile(
    join(root, ".sdd/search.yaml"),
    [
      "version: 1",
      "provider: mcp",
      "k: 20",
      "embeddings: false",
      "budgets:",
      "  default: 12000",
      extra,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
}

async function writeSource(root: string, body: string): Promise<void> {
  await writeFile(join(root, ".sdd/mcp.yaml"), body);
}

function sourceYaml(id = "fake"): string {
  return [
    "version: 1",
    "sources:",
    `  - id: ${id}`,
    "    command: sdd-s4-not-spawned",
    "    invoke:",
    "      tool: search",
    "",
  ].join("\n");
}

async function search(root: string, query = "okWidget", call?: McpSearchCall, timeoutMs?: number) {
  const config = await loadConfig(root);
  return executeSearch(root, config, query, "code", 400, {
    mcpCall: call,
    mcpTimeoutMs: timeoutMs,
  });
}

const GOOD_HIT = {
  path: "src/ok.ts",
  startLine: 1,
  endLine: 3,
  symbol: "okWidget",
  language: "ts",
  signature: "export function okWidget(): number {",
  body: "export function okWidget(): number {\n  return 1;\n}",
  score: 1,
};

function answer(hits: unknown[]): string {
  return JSON.stringify({ hits });
}

describe("search S4", () => {
  it("keeps built-in keyword search offline", async () => {
    const root = await project();
    const spy = vi
      .spyOn(mcpClient, "callMcpSourceTool")
      .mockRejectedValue(new Error("must not call"));
    const result = await search(root);
    expect(spy).not.toHaveBeenCalled();
    expect(result.provider).toBe("builtin");
    expect(result.text).toContain("Provider: builtin");
    expect(result.text).toContain("`src/ok.ts` · `okWidget`");
    expect(result.warning).toBeUndefined();
  });

  it("falls back when the MCP source is missing and matches built-in text", async () => {
    const root = await project();
    const builtin = await search(root);
    await writeSearch(root);
    const missing = await search(root);
    expect(missing.provider).toBe("builtin");
    expect(missing.warning).toBe(
      'Search provider "mcp" is unavailable. Using built-in keyword search.',
    );
    expect(missing.text).toBe(builtin.text);
    expect(missing.text).not.toContain(SECRET);
  });

  it("falls back when the call throws, returns ok false, or returns prose", async () => {
    const root = await project();
    const builtin = await search(root);
    await writeSearch(root, "mcp_source: fake\nmcp_tool: search");
    await writeSource(root, sourceYaml());
    const thrown = await search(root, "okWidget", async () => {
      throw new Error("down");
    });
    expect(thrown.provider).toBe("builtin");
    expect(thrown.text).toBe(builtin.text);
    expect(thrown.warning).toContain("unavailable");

    const refused = await search(root, "okWidget", async () => ({ ok: false, text: "" }));
    expect(refused.provider).toBe("builtin");
    expect(refused.text).toBe(builtin.text);

    const prose = await search(root, "okWidget", async () => ({
      ok: true,
      text: "PROSE_ONLY_TOKEN_S4 is the answer",
    }));
    expect(prose.provider).toBe("builtin");
    expect(prose.text).toBe(builtin.text);
    expect(prose.text).not.toContain("PROSE_ONLY_TOKEN_S4");
  });

  it("falls back when the call does not return", async () => {
    const root = await project();
    await writeSearch(root, "mcp_source: fake");
    await writeSource(root, sourceYaml());
    let called = false;
    const started = Date.now();
    const result = await search(
      root,
      "okWidget",
      () => {
        called = true;
        return new Promise(() => {});
      },
      40,
    );
    expect(called).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.provider).toBe("builtin");
    expect(result.warning).toContain("unavailable");
    expect(result.text).toContain("Provider: builtin");
  });

  it("keeps an empty hit list on the MCP provider", async () => {
    const root = await project();
    await writeSearch(root);
    await writeSource(root, sourceYaml());
    const result = await search(root, "okWidget", async (input) => {
      expect(input.tool).toBe("search");
      expect(input.args).toEqual({ query: "okWidget", scope: "code" });
      return { ok: true, text: answer([]) };
    });
    expect(result.provider).toBe("mcp");
    expect(result.warning).toBeUndefined();
    expect(result.text).toContain("Provider: mcp");
    expect(result.text).not.toContain("`src/ok.ts`");
    expect(result.text).not.toContain("return 1");
    expect(await exists(join(root, ".sdd/index.db"))).toBe(false);
  });

  it("prints the same text for the same fake answer", async () => {
    const root = await project();
    await writeSearch(root, "mcp_source: fake\nmcp_tool: search");
    await writeSource(root, sourceYaml());
    const call: McpSearchCall = async () => ({ ok: true, text: answer([GOOD_HIT]) });
    const first = await search(root, "okWidget", call);
    const second = await search(root, "okWidget", call);
    expect(first.provider).toBe("mcp");
    expect(second.text).toBe(first.text);
    expect(second.hits).toEqual(first.hits);
    expect(first.text).toContain("Provider: mcp");
    expect(first.text).toContain("(lines 1\u20133) · full");
  });

  it("drops excluded paths before the call and from the printed result", async () => {
    const root = await project();
    await mkdir(join(root, "review-private"), { recursive: true });
    await writeFile(join(root, "review-private/person.txt"), `${SECRET}\n`);
    await writeFile(join(root, ".env"), `${ENV_SECRET}\n`);
    await writeFile(join(root, "notes.jhd"), "NESTED_JHD_SECRET_S4\n");
    await writeSearch(
      root,
      'mcp_source: fake\nmcp_tool: search\nexclude:\n  - "*.jhd"\n  - "review-private/"',
    );
    await writeSource(root, sourceYaml());
    const calls: Record<string, unknown>[] = [];
    const config = await loadConfig(root);
    const searchConfig = await loadSearchConfig(root);
    const provider = resolveSearchProvider(root, config, searchConfig, undefined, {
      mcpTimeoutMs: 50,
      mcpCall: async (input) => {
        calls.push(input.args);
        if ("paths" in input.args) return { ok: true, text: "" };
        return {
          ok: true,
          text: answer([
            {
              path: "review-private/person.txt",
              startLine: 1,
              endLine: 1,
              symbol: "person",
              body: SECRET,
            },
            { path: ".env", startLine: 1, endLine: 1, symbol: "env", body: ENV_SECRET },
            {
              path: "notes.jhd",
              startLine: 1,
              endLine: 1,
              symbol: "jhd",
              body: "NESTED_JHD_SECRET_S4",
            },
            { path: "/tmp/abs.ts", startLine: 1, endLine: 1, symbol: "abs", body: "absolute" },
            { path: "src/../.env", startLine: 1, endLine: 1, symbol: "dot", body: "dotdot" },
            GOOD_HIT,
          ]),
        };
      },
    });
    await provider.index(["review-private/person.txt", ".env"]);
    expect(calls).toEqual([]);
    await provider.index([
      "review-private/person.txt",
      ".env",
      "notes.jhd",
      "/tmp/abs.ts",
      "src/../.env",
      "src/ok.ts",
    ]);
    expect(calls).toEqual([{ paths: ["src/ok.ts"] }]);
    const result = await provider.search("okWidget", { scope: "code", k: 20, budget: 400 });
    expect(calls[1]).toEqual({ query: "okWidget", scope: "code" });
    const sent = JSON.stringify(calls);
    expect(sent).not.toContain(SECRET);
    expect(sent).not.toContain(ENV_SECRET);
    expect(sent).not.toContain("review-private");
    expect(sent).not.toContain("NESTED_JHD_SECRET_S4");
    expect(result.provider).toBe("mcp");
    expect(result.text).toContain("`src/ok.ts` · `okWidget`");
    expect(result.text).not.toContain(SECRET);
    expect(result.text).not.toContain(ENV_SECRET);
    expect(result.text).not.toContain("review-private");
    expect(result.text).not.toContain("NESTED_JHD_SECRET_S4");
    expect(result.text).not.toContain("/tmp/abs.ts");
  });

  it("sends only the query and scope through the MCP client", async () => {
    const root = await project();
    await mkdir(join(root, "review-private"), { recursive: true });
    await writeFile(join(root, "review-private/person.txt"), `${SECRET}\n`);
    await writeSearch(root, 'mcp_source: fake\nexclude:\n  - "review-private/"');
    await writeSource(root, sourceYaml());
    const spy = vi.spyOn(mcpClient, "callMcpSourceTool").mockResolvedValue({
      ok: true,
      text: answer([GOOD_HIT]),
    });
    const result = await search(root);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[2]).toBe("search");
    expect(spy.mock.calls[0]?.[3]).toEqual({ query: "okWidget", scope: "code" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    expect(result.provider).toBe("mcp");
    expect(await exists(join(root, ".sdd/index.db"))).toBe(false);
  });

  it("does not call MCP while building a handoff", async () => {
    const root = await project();
    await writeSearch(root, "mcp_source: fake");
    await writeSource(root, sourceYaml());
    const spy = vi
      .spyOn(mcpClient, "callMcpSourceTool")
      .mockRejectedValue(new Error("must not call"));
    const config = await loadConfig(root);
    const text = await buildRetrievedInner(root, config, "okWidget", "implement", 400);
    expect(spy).not.toHaveBeenCalled();
    expect(text).toContain("okWidget");
    expect(text).not.toContain("Provider: mcp");
  });

  it("rejects a search.yaml whose mcp_source is not a string", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/search.yaml"), "version: 1\nprovider: mcp\nmcp_source: 1\n");
    await expect(loadSearchConfig(root)).rejects.toThrow("search.yaml is invalid");
  });
});
