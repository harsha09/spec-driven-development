/**
 * Run the design checker and a real sdd  feature loop for both hypothetical examples.
 * Uses packages/cli/dist/index.js when it exists, otherwise sdd on PATH.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDesign } from "./check-design.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const writer = join(here, "..");
const repo = join(writer, "..", "..");

const cases = [
  {
    name: "Inventory stock reservation",
    title: "Reserve stock before payment",
    dir: join(writer, "examples", "inventory-stock-reservation"),
  },
  {
    name: "Offline notes sync",
    title: "Sync notes edited offline",
    dir: join(writer, "examples", "offline-notes-sync"),
  },
];

function resolveSdd() {
  if (process.env.SDD_BIN) {
    const bin = process.env.SDD_BIN;
    if (bin.endsWith(".js")) return { command: process.execPath, args: [bin], label: "SDD_BIN" };
    return { command: bin, args: [], label: "SDD_BIN" };
  }
  const dist = join(repo, "packages/cli/dist/index.js");
  if (existsSync(dist)) {
    return { command: process.execPath, args: [dist], label: "packages/cli/dist/index.js" };
  }
  return { command: "sdd", args: [], label: "sdd on PATH" };
}

/** Consola colors the change id when CI forces color. The id is the uncolored slug. */
export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "");
}

export function changeIdFromOutput(output) {
  const line = stripAnsi(output)
    .split("\n")
    .find((item) => item.includes("Created change"));
  const id = line?.split("Created change ").pop()?.trim() ?? "";
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$/.test(id)) return "";
  return id;
}

function run(sdd, cwd, args) {
  const result = spawnSync(sdd.command, [...sdd.args, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SDD_NO_AGENT: "1" },
  });
  return {
    status: result.status ?? 1,
    output: stripAnsi(`${result.stdout ?? ""}${result.stderr ?? ""}`),
  };
}

function redact(text, temps) {
  let out = text;
  for (const temp of temps) out = out.split(temp).join("<tmp>");
  return out.replace(/\r\n/g, "\n").trim();
}

function brief(text) {
  const kept = text.split("\n").filter((line) =>
    /Created change|✔ .+ → |Skipped stage|ERROR|incomplete|\[✓\] design —|WARN {2}Soft gate checklist not signed off on "design"|Required artifact|Optional stages only/.test(
      line,
    ),
  );
  return kept.join("\n");
}

function assertAdvance(name, result) {
  if (result.status !== 0 || !result.output.includes("design → clarify_design")) {
    throw new Error(`${name} did not advance design → clarify_design\n${result.output}`);
  }
}

function featureLoop(sdd, example) {
  const root = mkdtempSync(join(tmpdir(), "sdd-skill-"));
  try {
    const init = run(sdd, root, ["init", "--here", "--no-agent"]);
    if (init.status !== 0) throw new Error(`init failed\n${init.output}`);
    const created = run(sdd, root, ["new", example.title, "-w", "feature", "-y", "--no-agent"]);
    if (created.status !== 0) throw new Error(`new failed\n${created.output}`);
    const id = changeIdFromOutput(created.output);
    if (!id) throw new Error(`no change id\n${created.output}`);
    const changeDir = join(root, "changes", id);
    writeFileSync(join(changeDir, "feature.md"), readFileSync(join(example.dir, "feature.md")));
    writeFileSync(join(changeDir, "design.md"), readFileSync(join(example.dir, "design.md")));
    const nextIntent = run(sdd, root, ["next", "--no-agent"]);
    if (nextIntent.status !== 0) throw new Error(`next from intent failed\n${nextIntent.output}`);
    const skipClarify = run(sdd, root, ["skip", "clarify_intent", "-r", "scope is clear", "--no-agent"]);
    if (skipClarify.status !== 0) throw new Error(`skip clarify failed\n${skipClarify.output}`);
    const skipBrainstorm = run(sdd, root, ["skip", "brainstorm", "-r", "approach is chosen", "--no-agent"]);
    if (skipBrainstorm.status !== 0) throw new Error(`skip brainstorm failed\n${skipBrainstorm.output}`);
    const nextDesign = run(sdd, root, ["next", "--no-agent"]);
    assertAdvance(example.name, nextDesign);
    const status = run(sdd, root, ["status"]);
    if (!status.output.includes("[✓] design — Design")) {
      throw new Error(`status did not mark design done\n${status.output}`);
    }
    return {
      root,
      transcript: [
        `$ sdd new ${JSON.stringify(example.title)} -w feature -y --no-agent`,
        brief(redact(created.output, [root])),
        "$ sdd next --no-agent",
        brief(redact(nextIntent.output, [root])),
        '$ sdd skip clarify_intent -r "scope is clear" --no-agent',
        brief(redact(skipClarify.output, [root])),
        '$ sdd skip brainstorm -r "approach is chosen" --no-agent',
        brief(redact(skipBrainstorm.output, [root])),
        "$ sdd next --no-agent",
        brief(redact(nextDesign.output, [root])),
        "$ sdd status",
        brief(redact(status.output, [root])),
      ].join("\n\n"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function prepareFeature(sdd, title) {
  const root = mkdtempSync(join(tmpdir(), "sdd-skill-"));
  try {
  const init = run(sdd, root, ["init", "--here", "--no-agent"]);
  if (init.status !== 0) throw new Error(`init failed\n${init.output}`);
  const created = run(sdd, root, ["new", title, "-w", "feature", "-y", "--no-agent"]);
  if (created.status !== 0) throw new Error(`new failed\n${created.output}`);
  const id = changeIdFromOutput(created.output);
  if (!id) throw new Error(`no change id\n${created.output}`);
  writeFileSync(
    join(root, "changes", id, "feature.md"),
    readFileSync(join(cases[0].dir, "feature.md")),
  );
  const reachDesign = () => {
    const nextIntent = run(sdd, root, ["next", "--no-agent"]);
    if (nextIntent.status !== 0) throw new Error(`next from intent failed\n${nextIntent.output}`);
    const skipClarify = run(sdd, root, ["skip", "clarify_intent", "-r", "scope is clear", "--no-agent"]);
    if (skipClarify.status !== 0) throw new Error(`skip clarify failed\n${skipClarify.output}`);
    const skipBrainstorm = run(sdd, root, [
      "skip",
      "brainstorm",
      "-r",
      "approach is chosen",
      "--no-agent",
    ]);
    if (skipBrainstorm.status !== 0) throw new Error(`skip brainstorm failed\n${skipBrainstorm.output}`);
    return { nextIntent, skipClarify, skipBrainstorm };
  };
  return { root, created, reachDesign };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function stubLoop(sdd) {
  const prepared = prepareFeature(sdd, "Empty design stub");
  try {
    writeFileSync(
      join(prepared.root, "changes", changeId(prepared.created.output), "design.md"),
      readFileSync(join(writer, "assets", "design.md")),
    );
    prepared.reachDesign();
    const blocked = run(sdd, prepared.root, ["next", "--no-agent"]);
    if (blocked.status === 0 || !/incomplete/i.test(blocked.output)) {
      throw new Error(`skeleton was not blocked\n${blocked.output}`);
    }
    return brief(redact(blocked.output, [prepared.root]));
  } finally {
    rmSync(prepared.root, { recursive: true, force: true });
  }
}

function vagueLoop(sdd) {
  const prepared = prepareFeature(sdd, "Vague design paragraph");
  try {
    const vague = [
      "# Design",
      "",
      "The list module draws an empty state when there are no rows, and the page stays put because a thrown error is worse than a sentence. No other module changes. The person sees the message instead of a crash.",
      "",
    ].join("\n");
    const checked = checkDesign(vague);
    if (checked.ok) throw new Error("vague paragraph unexpectedly passed the checker");
    writeFileSync(
      join(prepared.root, "changes", changeId(prepared.created.output), "design.md"),
      vague,
    );
    prepared.reachDesign();
    const advanced = run(sdd, prepared.root, ["next", "--no-agent"]);
    if (advanced.status !== 0 || !advanced.output.includes("design → clarify_design")) {
      throw new Error(`vague paragraph did not pass the CLI gate\n${advanced.output}`);
    }
    return {
      checkerErrors: checked.errors.length,
      transcript: brief(redact(advanced.output, [prepared.root])),
    };
  } finally {
    rmSync(prepared.root, { recursive: true, force: true });
  }
}

function changeId(output) {
  const id = changeIdFromOutput(output);
  if (!id) throw new Error(`no change id\n${output}`);
  return id;
}

function main() {
  const sdd = resolveSdd();
  const version = run(sdd, repo, ["--version"]);
  if (version.status !== 0) {
    process.stderr.write(`sdd is not runnable (${sdd.label})\n${version.output}\n`);
    process.exit(1);
  }
  const lines = [];
  lines.push("# Design writer validation");
  lines.push("");
  lines.push("Generated by `node skills/sdd-design-writer/scripts/validate-examples.mjs`.");
  lines.push("Temporary directories are shown as `<tmp>`. The two designs are hypothetical.");
  lines.push("");
  lines.push(`- Node: ${process.version}`);
  lines.push(`- sdd: ${version.output.trim()} (${sdd.label})`);
  lines.push("");
  lines.push("## Checker");
  lines.push("");
  for (const example of cases) {
    const file = join(example.dir, "design.md");
    const result = checkDesign(readFileSync(file, "utf8"));
    if (!result.ok) {
      process.stderr.write(`${example.name}\n${result.errors.join("\n")}\n`);
      process.exit(1);
    }
    lines.push(`- ${example.name}: checker ok`);
  }
  const skeleton = checkDesign(readFileSync(join(writer, "assets", "design.md"), "utf8"));
  if (skeleton.ok) {
    process.stderr.write("skeleton unexpectedly passed\n");
    process.exit(1);
  }
  lines.push(`- Skeleton: checker failed with ${skeleton.errors.length} errors, including a missing finished approach.`);
  lines.push("");

  for (const example of cases) {
    const loop = featureLoop(sdd, example);
    lines.push(`## CLI loop: ${example.name}`);
    lines.push("");
    lines.push("```text");
    lines.push(loop.transcript);
    lines.push("```");
    lines.push("");
  }

  lines.push("## CLI loop: skeleton is blocked");
  lines.push("");
  lines.push("The same feature loop with `assets/design.md` does not leave the design stage. The instructions in that file are HTML comments, so the CLI sees an empty template.");
  lines.push("");
  lines.push("```text");
  lines.push(stubLoop(sdd));
  lines.push("```");
  lines.push("");
  const vague = vagueLoop(sdd);
  lines.push("## CLI loop: a vague paragraph is not enough");
  lines.push("");
  lines.push(`The checker reported ${vague.checkerErrors} errors for a short paragraph that has no contracts, races, or acceptance table. \`sdd next\` still advanced, because the CLI gate is substantive prose rather than this skill's contract. That is why the checker exists.`);
  lines.push("");
  lines.push("```text");
  lines.push(vague.transcript);
  lines.push("```");
  lines.push("");
  lines.push("## What this does not prove");
  lines.push("");
  lines.push("The fictional inventory service and notes app were not implemented. No product test command was invented. The check is that a finished design passes the skill contract and that CLI 0.24.0 accepts it as a substantive `design.md`, while the skeleton stays incomplete.");
  lines.push("");

  const report = `${lines.join("\n")}\n`;
  const evidence = process.argv.find((arg) => arg.startsWith("--evidence="));
  if (evidence) {
    writeFileSync(evidence.slice("--evidence=".length), report);
  }
  process.stdout.write(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
