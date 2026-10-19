import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/examples/role-model.mjs",
);

function run(prompt: string): unknown {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ roleId: "builder", prompt }),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("local SDD_ROLE_MODEL example", () => {
  it("returns the author, critique, and revision objects", async () => {
    const source = await readFile(script, "utf8");
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/https?:/);

    expect(run("Job: Build\nTask: write the page\n")).toEqual({
      text: "Draft from the local example.",
    });

    expect(
      run(
        [
          "Job: Review",
          "Check ids:",
          "CHK-001",
          "CHK-002",
          "Cite: billing:use-ledger",
          "Draft:",
          "hello",
        ].join("\n"),
      ),
    ).toEqual({
      text: "Checked the draft.",
      gaps: [{ cite: "CHK-001", text: "The draft misses this check." }],
    });

    expect(
      run(
        [
          "Job: Review",
          "Draft:",
          "hello",
          "Gaps:",
          "CHK-001: The draft misses this check.",
          "CHK-002: Another gap.",
          "changed must list every gap cite.",
        ].join("\n"),
      ),
    ).toEqual({
      text: "Revised draft.",
      changed: ["CHK-001", "CHK-002"],
      action: {
        name: "write_file",
        words: "Write the draft.",
        inputs: { path: "notes/draft.md", contents: "Revised draft." },
      },
    });
  });
});
