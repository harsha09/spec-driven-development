import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { initProject, loadWorkflow, pathExists } from "../index.js";
import { runGuide } from "../role/guide.js";
import { clarifyLimit, initTeam, readClarifyFile, renderClarifyPage } from "../role/index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function emptyDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-clarify-"));
  temps.push(root);
  return root;
}

const DRAFT = "Show an empty state when the list has no rows.";
const FEATURE = [
  "Problem / opportunity",
  "Users & value",
  "Scope",
  "Non-goals",
  "Success criteria",
  "Risks / open questions",
];

function headed(headings: string[]) {
  return { text: DRAFT, parts: headings.map((heading) => ({ heading, text: DRAFT })) };
}

function ask(gap: string, n: number) {
  return { gap, question: `Question ${n} about ${gap}?`, proposed: `Default ${n}` };
}

/** A model that answers the gap check from `gaps` and every other prompt from `drafts`. */
function fakeModel(drafts: unknown[] = [], gaps: unknown[] = []) {
  const pendingDrafts = drafts.slice();
  const pendingGaps = gaps.slice();
  const gapPrompts: string[] = [];
  const draftPrompts: string[] = [];
  const model: RoleModel = {
    async complete(input) {
      if (input.prompt.includes("You check one request for gaps.")) {
        gapPrompts.push(input.prompt);
        return JSON.stringify(pendingGaps.shift() ?? { questions: [] });
      }
      draftPrompts.push(input.prompt);
      return JSON.stringify(pendingDrafts.shift() ?? { kind: "draft", text: DRAFT });
    },
  };
  return { model, gapPrompts, draftPrompts };
}

async function activeChange(root: string): Promise<string> {
  return join(root, "changes", (await readFile(join(root, "changes/.active"), "utf8")).trim());
}

const START = { agents: false as const };

describe("gap check: ask only where the request has gaps", () => {
  it("a clear request gets no question, and the clarify stage is skipped with a reason", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)]);
    const result = await runGuide(root, {
      title: "Add an empty state",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    expect(result.stdout.startsWith("Question:")).toBe(false);
    expect(result.stdout).toContain("Skipped clarify_intent: no gaps found.");
    const meta = await readFile(join(await activeChange(root), "meta.yaml"), "utf8");
    expect(meta).toContain("No gaps found in the request.");
    expect(fake.gapPrompts).toHaveLength(1);
  });

  it("an ambiguous request gets one targeted question that names the gap", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("users", 1)] }]);
    const result = await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("Question:")).toBe(true);
    expect(result.stdout).toContain("Clarify (users, 1 of 1):");
    expect(result.stdout).toContain("Question 1 about users?");
    expect(result.stdout).toContain("Default: Default 1");
    expect(result.stdout).toContain("Press Enter to accept the default");
  });

  it("runs the clarify stage when it has open questions instead of skipping it", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("scope", 1)] }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    const meta = await readFile(join(await activeChange(root), "meta.yaml"), "utf8");
    expect(meta).toContain("stage: clarify_intent");
    expect(meta).not.toContain("No role runs this optional stage");
  });

  it("asks one question at a time and caps them", async () => {
    const root = await emptyDir();
    const six = { questions: [1, 2, 3, 4, 5, 6].map((n) => ask("scope", n)) };
    const fake = fakeModel([headed(FEATURE)], [six]);
    const first = await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    expect(first.stdout).toContain("Clarify (scope, 1 of 5):");
    expect(first.stdout).not.toContain("Question 2 about");
    const second = await runGuide(root, { answer: "Only owners", model: fake.model });
    expect(second.stdout).toContain("Clarify (scope, 2 of 5):");
    expect(second.stdout).toContain("Question 2 about scope?");
    expect(second.stdout).not.toContain("Question 3 about");
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.answers).toHaveLength(1);
    expect(stored?.queue).toHaveLength(4);
  });

  it("Enter records the proposed default as the person's confirmed answer", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("acceptance", 1)] }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    const done = await runGuide(root, { acceptDefault: true, model: fake.model });
    expect(done.exitCode).toBe(0);
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.answers).toHaveLength(1);
    expect(stored?.answers[0]).toMatchObject({
      status: "confirmed",
      answer: "Default 1",
      proposed: "Default 1",
      gap: "acceptance",
    });
    const page = await readFile(join(await activeChange(root), "clarify-intent.md"), "utf8");
    expect(page).toContain("## Confirmed answers");
    expect(page).toContain("**A:** Default 1");
    expect(page).toContain("## Unconfirmed proposals\n\nNone.");
  });

  it("a typed answer is stored as typed and reaches the next prompt", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("users", 1)] }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    await runGuide(root, { answer: "Team admins only", model: fake.model });
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.answers[0]).toMatchObject({ answer: "Team admins only", status: "confirmed" });
    expect(fake.draftPrompts.some((prompt) => prompt.includes("Team admins only"))).toBe(true);
  });

  it("does not ask a question again after a restart, and does not run the check again", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("users", 1), ask("scope", 2)] }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    await runGuide(root, { answer: "Admins", model: fake.model });
    const again = await runGuide(root, { model: fake.model });
    expect(again.stdout).toContain("Question 2 about scope?");
    expect(again.stdout).not.toContain("Question 1 about users?");
    await runGuide(root, { acceptDefault: true, model: fake.model });
    const after = await runGuide(root, { model: fake.model });
    expect(after.stdout).not.toContain("Question 1 about users?");
    expect(after.stdout).not.toContain("Question 2 about scope?");
    expect(fake.gapPrompts).toHaveLength(1);
  });

  it("never asks a question that is already answered", async () => {
    const root = await emptyDir();
    const fake = fakeModel(
      [headed(FEATURE)],
      [{ questions: [ask("users", 1)] }, { questions: [ask("users", 1), ask("scope", 2)] }],
    );
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    await runGuide(root, { answer: "Admins", model: fake.model });
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.answers.map((item) => item.question)).toEqual(["Question 1 about users?"]);
  });
});

describe("gap check in every workflow", () => {
  const shipped = [
    "feature",
    "hotfix",
    "patch",
    "spike",
    "greenfield",
    "enterprise-feature",
    "team-software",
  ];

  for (const name of shipped) {
    it(`${name} runs the gap check and asks about a real gap`, async () => {
      const root = await emptyDir();
      const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("scope", 1)] }]);
      const result = await runGuide(root, {
        title: "Add sharing",
        workflow: name,
        model: fake.model,
        ...START,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("Question:")).toBe(true);
      expect(result.stdout).toContain("Clarify (scope, 1 of 1):");
      const stored = await readClarifyFile(await activeChange(root));
      expect(stored?.checked).toEqual([name === "feature" ? "clarify_intent" : "start"]);
      expect(fake.gapPrompts).toHaveLength(1);
    });
  }

  it("a workflow without a clarify stage checks before its first drafting stage", async () => {
    const root = await emptyDir();
    const fake = fakeModel([], [{ questions: [ask("constraints", 1)] }]);
    const result = await runGuide(root, {
      title: "Fix the typo",
      workflow: "hotfix",
      model: fake.model,
      ...START,
    });
    expect(result.stdout).toContain("Clarify (constraints, 1 of 1):");
    expect(fake.draftPrompts).toHaveLength(0);
    const meta = await readFile(join(await activeChange(root), "meta.yaml"), "utf8");
    expect(meta).toContain("stage: intent");
  });

  it("a custom workflow takes the default limit of 3 and asks the same way", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    await mkdir(join(root, ".sdd/workflows"), { recursive: true });
    await writeFile(
      join(root, ".sdd/workflows/custom.yaml"),
      [
        "name: custom",
        "version: 1",
        "stages:",
        "  - id: intent",
        "    title: Intent",
        "    skippable: false",
        "    artifacts:",
        "      - id: intent",
        "        path: intent.md",
        "        required: true",
        "",
      ].join("\n"),
      "utf8",
    );
    const four = { questions: [1, 2, 3, 4].map((n) => ask("scope", n)) };
    const fake = fakeModel([], [four]);
    const result = await runGuide(root, {
      title: "Something custom",
      workflow: "custom",
      model: fake.model,
      ...START,
    });
    expect(result.stdout).toContain("Clarify (scope, 1 of 3):");
  });

  it("a custom workflow can set its own limit", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    await mkdir(join(root, ".sdd/workflows"), { recursive: true });
    await writeFile(
      join(root, ".sdd/workflows/tight.yaml"),
      [
        "name: tight",
        "version: 1",
        "clarify:",
        "  max_questions: 1",
        "stages:",
        "  - id: intent",
        "    skippable: false",
        "    artifacts:",
        "      - id: intent",
        "        path: intent.md",
        "        required: true",
        "",
      ].join("\n"),
      "utf8",
    );
    const fake = fakeModel([], [{ questions: [ask("scope", 1), ask("users", 2)] }]);
    const result = await runGuide(root, {
      title: "Tight",
      workflow: "tight",
      model: fake.model,
      ...START,
    });
    expect(result.stdout).toContain("Clarify (scope, 1 of 1):");
  });

  for (const name of ["hotfix", "patch"]) {
    it(`${name} never asks more than 2 questions`, async () => {
      const root = await emptyDir();
      const five = { questions: [1, 2, 3, 4, 5].map((n) => ask("scope", n)) };
      const fake = fakeModel([], [five]);
      const first = await runGuide(root, {
        title: "Small fix",
        workflow: name,
        model: fake.model,
        ...START,
      });
      expect(first.stdout).toContain("Clarify (scope, 1 of 2):");
      const second = await runGuide(root, { answer: "a", model: fake.model });
      expect(second.stdout).toContain("Clarify (scope, 2 of 2):");
      const stored = await readClarifyFile(await activeChange(root));
      expect(stored?.queue).toHaveLength(1);
      expect(fake.gapPrompts[0]).toContain("Ask at most 2 questions");
    });

    it(`a clear ${name} request asks none`, async () => {
      const root = await emptyDir();
      const fake = fakeModel();
      const result = await runGuide(root, {
        title: "Small fix",
        workflow: name,
        model: fake.model,
        ...START,
      });
      expect(result.stdout.startsWith("Question:")).toBe(false);
      const stored = await readClarifyFile(await activeChange(root));
      expect(stored?.queue).toEqual([]);
      expect(stored?.answers).toEqual([]);
    });
  }
});

describe("team templates and workflow settings carry the limits", () => {
  it("ships the limits in the workflow files", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    const limits: Record<string, number> = {};
    for (const name of [
      "feature",
      "hotfix",
      "patch",
      "spike",
      "greenfield",
      "enterprise-feature",
    ]) {
      limits[name] = clarifyLimit((await loadWorkflow(root, name)) as never);
    }
    expect(limits).toEqual({
      feature: 5,
      hotfix: 2,
      patch: 2,
      spike: 3,
      greenfield: 5,
      "enterprise-feature": 5,
    });
  });

  it("the software team template carries its clarify settings into a new project", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    const made = await initTeam(root, "software", "someone");
    expect(made.exitCode).toBe(0);
    const team = parseYaml(await readFile(join(root, ".sdd/team.yaml"), "utf8")) as {
      clarify?: { max_questions?: number };
    };
    expect(team.clarify?.max_questions).toBe(5);

    await mkdir(join(root, ".sdd/workflows"), { recursive: true });
    await writeFile(
      join(root, ".sdd/workflows/bare.yaml"),
      [
        "name: bare",
        "version: 1",
        "stages:",
        "  - id: intent",
        "    owner: product-manager",
        "    skippable: false",
        "    artifacts:",
        "      - id: intent",
        "        path: intent.md",
        "        required: true",
        "",
      ].join("\n"),
      "utf8",
    );
    const six = { questions: [1, 2, 3, 4, 5, 6].map((n) => ask("scope", n)) };
    const fake = fakeModel([], [six]);
    const result = await runGuide(root, {
      title: "From a template",
      workflow: "bare",
      model: fake.model,
      ...START,
    });
    expect(result.stdout).toContain("Clarify (scope, 1 of 5):");
  });

  it("an invalid team clarify setting is refused", async () => {
    const root = await emptyDir();
    await initProject({ projectRoot: root, agents: false });
    expect((await initTeam(root, "software", null)).exitCode).toBe(0);
    const { TeamSchema } = await import("../role/schema.js");
    const team = parseYaml(await readFile(join(root, ".sdd/team.yaml"), "utf8"));
    expect(TeamSchema.safeParse({ ...team, clarify: { max_questions: 9 } }).success).toBe(false);
  });
});

describe("confirmed answers are kept apart from proposed ones", () => {
  async function pending() {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("users", 1), ask("scope", 2)] }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    return { root, fake };
  }

  it("--answer with --no-clarify confirms the typed answer instead of proposing the default", async () => {
    const { root, fake } = await pending();
    const result = await runGuide(root, { answer: "Admins", noClarify: true, model: fake.model });
    expect(result.exitCode).toBe(0);
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.answers.find((item) => item.id === "q1")).toEqual(
      expect.objectContaining({ answer: "Admins", status: "confirmed" }),
    );
  });

  it("--no-clarify on waiting questions keeps their defaults as unconfirmed proposals", async () => {
    const { root, fake } = await pending();
    await runGuide(root, { answer: "Admins", model: fake.model });
    const result = await runGuide(root, { noClarify: true, model: fake.model });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Unconfirmed clarify answers: 1 (q2).");
    const dir = await activeChange(root);
    const stored = await readClarifyFile(dir);
    expect(stored?.answers.map((item) => [item.id, item.status])).toEqual([
      ["q1", "confirmed"],
      ["q2", "proposed"],
    ]);
    expect(stored?.skipped).toContainEqual({ stage: "clarify_intent", reason: "--no-clarify" });
    const page = await readFile(join(dir, "clarify-intent.md"), "utf8");
    expect(page).toMatch(/## Confirmed answers[\s\S]*Admins[\s\S]*## Unconfirmed proposals/);
    expect(page).toContain("**Proposed, unconfirmed:** Default 2");
    expect(page.split("## Unconfirmed proposals")[0]).not.toContain("Default 2");
  });

  it("later stages see an unconfirmed answer flagged", async () => {
    const { root, fake } = await pending();
    await runGuide(root, { acceptDefault: true, model: fake.model });
    await runGuide(root, { noClarify: true, model: fake.model });
    const flagged = fake.draftPrompts.filter((prompt) =>
      prompt.includes("[unconfirmed: proposed, the person has not confirmed it]"),
    );
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0]).toContain("Question 2 about scope?: Default 2");
    const confirmedLine = flagged[0]?.split("\n").find((line) => line.includes("Default 1"));
    expect(confirmedLine).toBeDefined();
    expect(confirmedLine).not.toContain("unconfirmed");
  });

  it("renders the page with confirmed and proposed answers apart", () => {
    const base = { stage: "clarify_intent", gap: "scope" as const, proposed: "p" };
    const page = renderClarifyPage(
      {
        checked: [],
        queue: [],
        skipped: [],
        answers: [
          { ...base, id: "q1", question: "A?", answer: "yes", status: "confirmed" },
          { ...base, id: "q2", question: "B?", answer: "maybe", status: "proposed" },
        ],
      },
      { id: "clarify_intent", title: "Clarify intent" },
    );
    const [confirmed, proposed] = page.split("## Unconfirmed proposals");
    expect(confirmed).toContain("yes");
    expect(confirmed).not.toContain("maybe");
    expect(proposed).toContain("maybe");
  });

  it("the gate summary line counts unconfirmed answers", async () => {
    const { root, fake } = await pending();
    await runGuide(root, { noClarify: true, model: fake.model });
    const { unconfirmedClarifyLine } = await import("../role/clarify.js");
    const line = await unconfirmedClarifyLine(await activeChange(root));
    expect(line).toContain("Unconfirmed clarify answers: 2 (q1, q2).");
    expect(await unconfirmedClarifyLine(await emptyDir())).toBeNull();
  });
});

describe("--no-clarify", () => {
  it("stays on for the whole change after a role question on feature", async () => {
    const root = await emptyDir();
    const fake = fakeModel(
      [{ kind: "question", text: "Which surface shows the empty state?" }, headed(FEATURE)],
      [{ questions: [ask("scope", 1)] }],
    );
    const first = await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      noClarify: true,
      ...START,
    });
    expect(first.stdout).toContain("Which surface shows the empty state?");
    const second = await runGuide(root, {
      answer: "The main list",
      model: fake.model,
      noClarify: true,
      ...START,
    });
    expect(second.stdout).not.toMatch(/Clarify \(/);
    expect(fake.gapPrompts).toHaveLength(0);
    expect(second.stdout).toContain("Skipped clarify_intent: --no-clarify.");
  });

  it("skips the gap check for the run and records that it was skipped", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [ask("scope", 1)] }]);
    const result = await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      noClarify: true,
      ...START,
    });
    expect(result.stdout.startsWith("Question:")).toBe(false);
    expect(result.stdout).toContain("Skipped clarify_intent: --no-clarify.");
    expect(fake.gapPrompts).toHaveLength(0);
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.skipped).toContainEqual({ stage: "clarify_intent", reason: "--no-clarify" });
    expect(stored?.queue).toEqual([]);
  });

  it("skips the start check of a workflow without a clarify stage", async () => {
    const root = await emptyDir();
    const fake = fakeModel([], [{ questions: [ask("scope", 1)] }]);
    const result = await runGuide(root, {
      title: "Small fix",
      workflow: "hotfix",
      model: fake.model,
      noClarify: true,
      ...START,
    });
    expect(result.stdout.startsWith("Question:")).toBe(false);
    expect(fake.gapPrompts).toHaveLength(0);
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.skipped).toContainEqual({ stage: "start", reason: "--no-clarify" });
  });
});

describe("gap check failures never block the run", () => {
  it("continues with a note when the gap check reply is not valid", async () => {
    const root = await emptyDir();
    const fake = fakeModel([headed(FEATURE)], [{ questions: [{ gap: "color" }] }, { oops: 1 }]);
    const result = await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("did not return a valid reply");
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.skipped.some((item) => item.reason.includes("not valid"))).toBe(true);
  });

  it("runs without a model and records why no question was asked", async () => {
    const root = await emptyDir();
    const result = await runGuide(root, { title: "Small fix", workflow: "hotfix", ...START });
    expect(result.exitCode).toBe(1);
    const stored = await readClarifyFile(await activeChange(root));
    expect(stored?.skipped).toContainEqual({
      stage: "start",
      reason: "no model to check the request for gaps",
    });
    expect(stored?.checked).not.toContain("start");
    expect(await pathExists(join(await activeChange(root), "clarify.yaml"))).toBe(true);
  });

  it("does not burn the start checkpoint without a model, so a later run can ask", async () => {
    const root = await emptyDir();
    await runGuide(root, { title: "Small fix", workflow: "hotfix", ...START });
    const fake = fakeModel([], [{ questions: [ask("scope", 1)] }]);
    const again = await runGuide(root, { model: fake.model, ...START });
    expect(again.stdout.startsWith("Question:")).toBe(true);
    expect(again.stdout).toContain("Clarify (scope, 1 of 1):");
    expect(fake.gapPrompts).toHaveLength(1);
  });

  it("refuses a default for a question that has none", async () => {
    const root = await emptyDir();
    const fake = fakeModel([{ kind: "question", text: "Which list is empty?" }]);
    await runGuide(root, {
      title: "Add sharing",
      workflow: "feature",
      model: fake.model,
      ...START,
    });
    const result = await runGuide(root, { acceptDefault: true, model: fake.model });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("no default");
  });
});
