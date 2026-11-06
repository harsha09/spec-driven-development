import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { REQUIRED_HEADINGS, checkDesign } from "./check-design.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, "..");
const skillsRoot = join(pack, "..");
const repoRoot = join(skillsRoot, "..");

const examples = [
  "inventory-stock-reservation/design.md",
  "offline-notes-sync/design.md",
];

const skillFiles = [
  "sdd-design-writer/SKILL.md",
  "sdd-acceptance-gate/SKILL.md",
  "sdd-smallest-change/SKILL.md",
  "sdd-ux-writer/SKILL.md",
  "sdd-ui-binder/SKILL.md",
  "sdd-qa-writer/SKILL.md",
  "sdd-constitution-interview/SKILL.md",
  "sdd-default-roles/SKILL.md",
];

const forbidden = [
  /jyovana/i,
  /jyotirmala/i,
  /\/home\//,
  /\/Users\//,
  /ghp_[A-Za-z0-9]/,
  /sk-[A-Za-z0-9]/,
  /xoxb-/,
  /AKIA[0-9A-Z]{8}/,
];

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

describe("design checker", () => {
  it("accepts both hypothetical examples", () => {
    for (const example of examples) {
      const file = join(pack, "examples", example);
      const result = checkDesign(readFileSync(file, "utf8"));
      assert.deepEqual(result.errors, [], example);
      assert.equal(result.ok, true);
      assert.match(readFileSync(file, "utf8"), /Hypothetical example/);
    }
  });

  it("rejects the skeleton", () => {
    const result = checkDesign(readFileSync(join(pack, "assets", "design.md"), "utf8"));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("Approach")));
    assert.ok(result.errors.some((error) => error.includes("Race conditions")));
  });

  it("rejects a note that drops race conditions", () => {
    const text = readFileSync(join(pack, "examples", examples[0]), "utf8").replace(
      "## Race conditions",
      "## Concurrency notes",
    );
    const result = checkDesign(text);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("Missing section: Race conditions")));
  });

  it("requires every heading the skill names", () => {
    const skill = readFileSync(join(pack, "SKILL.md"), "utf8");
    for (const heading of REQUIRED_HEADINGS) {
      assert.match(skill, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});

describe("checker command", () => {
  const script = join(here, "check-design.mjs");

  it("exits 2 when no file is given", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage:/);
  });

  it("exits 0 for both examples and 1 for the skeleton", () => {
    const ok = spawnSync(
      process.execPath,
      [script, ...examples.map((example) => join(pack, "examples", example))],
      { encoding: "utf8" },
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /ok /);
    const fail = spawnSync(process.execPath, [script, join(pack, "assets", "design.md")], {
      encoding: "utf8",
    });
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /fail /);
  });
});

describe("skill pack shape", () => {
  it("keeps product nouns out of the skill bodies and names the config file", () => {
    for (const file of skillFiles) {
      const text = readFileSync(join(skillsRoot, file), "utf8");
      assert.match(text, /^---\nname: /);
      assert.match(text, /## Purpose/);
      assert.match(text, /## When to use/);
      assert.match(text, /## Configuration/);
      assert.match(text, /## Procedure/);
      assert.match(text, /## Output/);
      assert.match(text, /## Never/);
      assert.match(text, /## Ask a human/);
      assert.match(text, /\.sdd\/skill-config\.yaml/);
      for (const pattern of forbidden) {
        assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
      }
    }
  });

  it("keeps the role procedures from taking over the CLI", () => {
    const roles = readFileSync(join(skillsRoot, "sdd-default-roles/SKILL.md"), "utf8");
    assert.match(roles, /does not edit those files/);
    assert.match(roles, /planner/);
    assert.match(roles, /architect/);
    assert.match(roles, /builder/);
    const acceptance = readFileSync(join(skillsRoot, "sdd-acceptance-gate/SKILL.md"), "utf8");
    assert.match(acceptance, /does not sign/i);
    const qa = readFileSync(join(skillsRoot, "sdd-qa-writer/SKILL.md"), "utf8");
    assert.match(qa, /has not recorded a result/);
    const implementer = readFileSync(join(skillsRoot, "sdd-smallest-change/SKILL.md"), "utf8");
    assert.match(implementer, /generate a release/);
    const constitution = readFileSync(join(skillsRoot, "sdd-constitution-interview/SKILL.md"), "utf8");
    assert.match(constitution, /refine/);
    const ux = readFileSync(join(skillsRoot, "sdd-ux-writer/SKILL.md"), "utf8");
    assert.match(ux, /no component/i);
    const binder = readFileSync(join(skillsRoot, "sdd-ui-binder/SKILL.md"), "utf8");
    assert.match(binder, /ui_components/);
  });

  it("scans the pack for private markers", () => {
    const guide = readFileSync(join(repoRoot, "docs/guides/skills.md"), "utf8");
    const files = [...walk(skillsRoot), guide];
    for (const file of files) {
      if (file.endsWith(".test.mjs")) continue;
      if (!/\.(md|yaml|yml|mjs)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
      }
    }
  });
});
