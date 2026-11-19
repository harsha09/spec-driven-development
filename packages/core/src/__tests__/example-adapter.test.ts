import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRoleDocument } from "../role/profile.js";
import { authorPrompt, critiquePrompt, revisionPrompt } from "../role/prompts.js";
import { parseReply } from "../role/run.js";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/examples/role-model.mjs",
);

const role = (() => {
  const parsed = parseRoleDocument(
    "developer",
    "---\nlabel: Developer\njob: Build the page\n---\nBody.\n",
  );
  if (!parsed) throw new Error("fixture role");
  return parsed;
})();

function run(prompt: string): string {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ roleId: "developer", prompt }),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

describe("local SDD_ROLE_MODEL example on the prompts sdd really sends", () => {
  const section = { id: "todo-list", decision: "D1", checks: ["CHK-001", "CHK-002"], body: "x" };

  it("answers the critique prompt with a gap on the first check id", () => {
    const reply = parseReply(run(critiquePrompt(role, section, "A todo has a title.")));
    expect(reply?.gaps).toEqual([{ cite: "CHK-001", text: "The draft misses this check." }]);
  });

  it("answers the revision prompt with every gap cite", () => {
    const gaps = [
      { cite: "CHK-001", text: "No title rule." },
      { cite: "CHK-002", text: "No empty rule." },
    ];
    const reply = parseReply(run(revisionPrompt(role, "A todo has a title.", gaps)));
    expect(reply?.changed).toEqual(["CHK-001", "CHK-002"]);
    expect(reply?.action?.name).toBe("write_file");
  });

  it("answers the author prompt with a plain draft", () => {
    const reply = parseReply(
      run(authorPrompt({ role, task: "Write the page", kind: "draft", section })),
    );
    expect(reply?.text).toBe("Draft from the local example.");
    expect(reply?.gaps).toEqual([]);
  });
});
