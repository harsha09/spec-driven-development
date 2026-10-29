import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  addLesson,
  createRole,
  initProject,
  loadBrain,
  readTeamConfig,
  setFact,
} from "../index.js";
import { countTokens } from "../search/tokenize.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-brain-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await createRole(root, {
    name: "builder",
    label: "Builder",
    job: "Implement the accepted change",
    rules: ["stay in scope"],
    never: ["accept a spec"],
  });
  await writeFile(
    join(root, ".sdd", "team.yaml"),
    [
      "branch: bot/{bot}/{change}",
      "rooms:",
      "  commit: false",
      "bots:",
      "  - name: builder",
      "    role: builder",
      "    wip: 1",
      "humans: []",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

describe("loadBrain", () => {
  it("keeps the role file, drops an unrelated fact, and drops a lesson before the role", async () => {
    const root = await project();
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    await mkdir(join(root, ".sdd/agents/builder"), { recursive: true });
    await writeFile(
      join(root, ".sdd/agents/builder/memory.md"),
      "alpha memory line\nomega memory line\n",
    );
    await addLesson(root, "builder", "check Node engine range");
    await setFact(root, { key: "engine", value: "engine mounts are tight" });
    await setFact(root, { key: "quota", value: "quota" });
    const roleText = await readFile(join(root, ".sdd/roles/builder.md"), "utf8");
    const item = "repair engine mounts";
    const roomy = await loadBrain(root, loaded.team, "builder", { text: item }, 8000);
    if ("error" in roomy) throw new Error(roomy.error);
    expect(roomy.inputs).toEqual([]);
    expect(roomy.prompt.startsWith(roleText.trimEnd())).toBe(true);
    expect(roomy.prompt).toContain("check Node engine range");
    expect(roomy.prompt).toContain("engine: engine mounts are tight");
    expect(roomy.prompt).not.toContain("quota");
    expect(roomy.prompt.indexOf("Lessons:")).toBeLessThan(roomy.prompt.indexOf("Facts:"));
    expect(roomy.prompt).toContain(`Item:\n${item}`);

    const lessonBudget =
      countTokens(`${roleText.trimEnd()}\nItem:\n${item}`) + countTokens("Memory:\nalpha");
    const tight = await loadBrain(root, loaded.team, "builder", { text: item }, lessonBudget);
    if ("error" in tight) throw new Error(tight.error);
    expect(tight.prompt).toContain("name: builder");
    expect(tight.prompt).not.toContain("check Node engine range");

    const tiny = await loadBrain(root, loaded.team, "builder", { text: item }, 1);
    if ("error" in tiny) throw new Error(tiny.error);
    expect(tiny.prompt).toContain("name: builder");
    expect(tiny.prompt).toContain("Memory is longer than the budget.");
    expect(tiny.prompt).not.toContain("check Node engine range");
  });
});
