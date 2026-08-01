import { describe, expect, it } from "vitest";
import { matchMcpSources } from "../mcp/match.js";
import type { McpSource } from "../mcp/types.js";

function src(partial: Partial<McpSource> & { id: string }): McpSource {
  const { when, ...rest } = partial;
  return {
    description: "",
    transport: "stdio",
    command: "npx",
    args: [],
    env: {},
    enabled: true,
    priority: 0,
    ...rest,
    when: {
      stages: [],
      workflows: [],
      keywords: [],
      intents: [],
      ...when,
    },
  };
}

describe("matchMcpSources", () => {
  const design = src({
    id: "design-system",
    priority: 20,
    when: {
      stages: ["design", "implement"],
      workflows: [],
      intents: ["ui", "design"],
      keywords: ["button", "component"],
    },
  });
  const ast = src({
    id: "code-ast",
    priority: 30,
    when: {
      stages: ["implement", "code_research"],
      workflows: [],
      intents: ["code"],
      keywords: [],
    },
  });

  it("matches by stage alone (handoff without keyword filter hit)", () => {
    const m = matchMcpSources([design, ast], {
      stage: "implement",
      workflow: "feature",
      query: "Empty list crash on expenses",
    });
    // design has keywords and query doesn't include them → skip design
    // ast has no keywords → match
    expect(m.map((s) => s.id)).toEqual(["code-ast"]);
  });

  it("includes design-system when query mentions button", () => {
    const m = matchMcpSources([design, ast], {
      stage: "implement",
      query: "add primary button variant",
    });
    expect(m.map((s) => s.id).sort()).toEqual(["code-ast", "design-system"]);
  });

  it("filters by explicit intents", () => {
    const m = matchMcpSources([design, ast], {
      stage: "implement",
      query: "add primary button",
      intents: ["code"],
    });
    // design requires ui|design when intents provided → skip
    expect(m.map((s) => s.id)).toEqual(["code-ast"]);
  });

  it("skips wrong stage", () => {
    const m = matchMcpSources([design], { stage: "vision" });
    expect(m).toHaveLength(0);
  });
});
