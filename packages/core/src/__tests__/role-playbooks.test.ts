import { readFileSync } from "node:fs";
import { join } from "pathe";
import { describe, expect, it } from "vitest";
import { defaultTeamsDir } from "../defaults.js";
import { roleCard, roleLines, scopeLines } from "../prompt.js";
import { parseRoleDocument } from "../role/profile.js";
import type { RoleProfile } from "../role/types.js";
import { countTokens } from "../search/tokenize.js";
import { TOOL_SPECS } from "../team/tools.js";

const ROLES: Array<{ team: string; name: string }> = [
  { team: "software", name: "product-manager" },
  { team: "software", name: "product-owner" },
  { team: "software", name: "architect" },
  { team: "software", name: "dev-lead" },
  { team: "software", name: "developer" },
  { team: "software", name: "qa" },
  { team: "research", name: "researcher" },
  { team: "solo", name: "developer" },
];

function load(team: string, name: string): RoleProfile {
  const raw = readFileSync(join(defaultTeamsDir(), team, "roles", `${name}.md`), "utf8");
  const role = parseRoleDocument(name, raw);
  if (!role) throw new Error(`${team}/${name} does not parse`);
  return role;
}

/** The body split on its `## ` headings. The text before the first heading is the lead line. */
function parts(body: string): { lead: string; sections: Map<string, string[]> } {
  const sections = new Map<string, string[]>();
  const lead: string[] = [];
  let current: string[] = lead;
  for (const line of body.trim().split("\n")) {
    if (line.startsWith("## ")) {
      current = [];
      sections.set(line.slice(3).trim(), current);
    } else {
      current.push(line);
    }
  }
  return { lead: lead.join("\n").trim(), sections };
}

const NEGATED = /\b(do not|don't|never|not|stop|without)\b/i;

/** Lines that tell the role to do something its own `never` list forbids. */
function breaksNever(lines: string[], never: string[]): string[] {
  const hits: string[] = [];
  for (const line of lines) {
    for (const item of never) {
      const phrase = item.trim().toLowerCase();
      if (phrase && line.toLowerCase().includes(phrase) && !NEGATED.test(line)) hits.push(line);
    }
  }
  return hits;
}

const toolNames = new Set<string>(TOOL_SPECS.map((tool) => tool.name));

describe("default role playbooks", () => {
  for (const { team, name } of ROLES) {
    describe(`${team}/${name}`, () => {
      const role = load(team, name);
      const { lead, sections } = parts(role.description);
      const card = roleCard(role);
      const text = [...roleLines(card), ...scopeLines(card)].join("\n");

      it("matches its snapshot", async () => {
        await expect(`${text}\n`).toMatchFileSnapshot(`./__snapshots__/roles/${team}-${name}.txt`);
      });

      it("has a lead line, then Process, Done when, Example and Voice in that order", () => {
        expect(lead.length).toBeGreaterThan(0);
        expect(lead).not.toContain("\n");
        expect([...sections.keys()]).toEqual(["Process", "Done when", "Example", "Voice"]);
        for (const [heading, lines] of sections) {
          expect(lines.join("").trim().length, heading).toBeGreaterThan(0);
        }
      });

      it("does not tell the role to do anything on its own never list", () => {
        const lines = [lead, ...[...sections.values()].flat()];
        expect(breaksNever(lines, role.never)).toEqual([]);
      });

      it("names only tools that exist", () => {
        for (const line of sections.get("Process") ?? []) {
          for (const match of line.matchAll(/`([^`]+)`/g)) {
            expect(toolNames.has(match[1] ?? ""), `${match[1]} in "${line}"`).toBe(true);
          }
        }
      });

      it("uses short sentences in the steps, the done list and the voice", () => {
        const lines = ["Process", "Done when", "Voice"].flatMap((key) => sections.get(key) ?? []);
        for (const line of [lead, ...lines]) {
          const plain = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
          for (const sentence of plain.split(/(?<=[.?!:])\s+/)) {
            expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20);
          }
        }
      });

      it("stays small enough for the prompt budget", () => {
        expect(countTokens(text)).toBeLessThan(600);
      });

      it("leaves no frontmatter or screen-only key in what the model reads", () => {
        expect(text).not.toMatch(/^---$|ask_first|pinned|hidden|approvers|name:/m);
      });
    });
  }

  it("catches a step that tells a role to do what it must never do", () => {
    expect(
      breaksNever(["4. Record a decision for the person."], ["record a decision"]),
    ).toHaveLength(1);
    expect(breaksNever(["4. Do not record a decision."], ["record a decision"])).toEqual([]);
  });

  it("gives the dev lead role names to pick an owner from", () => {
    expect(load("software", "dev-lead").collaborates.length).toBeGreaterThan(0);
  });
});
