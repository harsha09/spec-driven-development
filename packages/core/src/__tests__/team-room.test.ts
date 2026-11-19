import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  createRole,
  initProject,
  loadConfig,
  pathExists,
  postRoom,
  reviewRoom,
  runRole,
  showRoom,
} from "../index.js";
import type { RoleModel } from "../role/types.js";
import { stageMemberNames } from "../team/room.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-room-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

async function role(root: string, name: string, job: string): Promise<void> {
  await createRole(root, { name, label: name, job });
}

async function writeTeam(root: string, bots: string[], rounds?: number): Promise<void> {
  const limits = rounds ? `limits:\n  room_rounds: ${rounds}\n` : "";
  const lines = [
    "branch: bot/{bot}/{change}",
    "rooms:",
    "  commit: false",
    "bots:",
    ...bots.flatMap((name) => [`  - name: ${name}`, `    role: ${name}`, "    wip: 1"]),
    "humans: []",
    limits,
  ];
  await writeFile(join(root, ".sdd", "team.yaml"), `${lines.join("\n")}\n`, "utf8");
}

async function workflow(root: string): Promise<void> {
  await mkdir(join(root, ".sdd", "workflows"), { recursive: true });
  await writeFile(
    join(root, ".sdd", "workflows", "rooms.yaml"),
    [
      "name: rooms",
      "version: 1",
      "stages:",
      "  - id: requirements",
      "    owner: product-manager",
      "    collaborates: [architect]",
      "    artifacts:",
      "      - { id: requirements, path: requirements.md, required: true }",
      "  - id: trio",
      "    collaborates: [one, two, three]",
      "    artifacts: []",
      "  - id: builders",
      "    owner: builder",
      "    artifacts: []",
      "",
    ].join("\n"),
    "utf8",
  );
}

function script(replies: unknown[]): { model: RoleModel; prompts: string[] } {
  const pending = replies.slice();
  const prompts: string[] = [];
  return {
    prompts,
    model: {
      async complete(input) {
        prompts.push(input.prompt);
        const next = pending.shift();
        if (next === undefined) throw new Error("unexpected model call");
        return typeof next === "string" ? next : JSON.stringify(next);
      },
    },
  };
}

describe("rooms", () => {
  it("refuses a review when there is no team and stores a cited objection", async () => {
    const root = await project();
    const missing = await reviewRoom(root, { model: script([]).model });
    expect(missing.stdout).toBe("No team config. Run sdd team init --template software.");
    expect(await pathExists(join(root, ".sdd", "rooms"))).toBe(false);

    await role(root, "product-manager", "Write the reading");
    await role(root, "architect", "Name the seams");
    await writeTeam(root, ["product-manager", "architect"]);
    await workflow(root);
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Rooms",
      workflowName: "rooms",
    });
    const draft = join(ctx.path, "requirements.md");
    await writeFile(draft, "Keep the reading.\n", "utf8");

    const bare = script([{ type: "objection", text: "No cite." }]);
    const refused = await reviewRoom(root, {
      stage: "requirements",
      model: bare.model,
    });
    expect(refused.stdout).toBe("An objection needs a cite.");
    expect(await pathExists(join(root, ".sdd", "rooms"))).toBe(false);

    const round = script([
      { type: "agree", text: "Ship the reading." },
      { type: "objection", text: "The ignore seam is missing.", cite: "requirements.md#scope" },
    ]);
    const reviewed = await reviewRoom(root, { stage: "requirements", model: round.model });
    expect(reviewed.stdout).toBe("Round 1.");
    expect(round.prompts[0]).toContain("You are in a review room for stage `requirements`.");
    expect(round.prompts[0]).toContain("Job: Write the reading");
    expect(round.prompts[1]).toMatch(/Round 1 of \d+\./);
    expect(round.prompts[1]).toContain("You review. You do not own this stage's artifact.");
    expect(await readFile(draft, "utf8")).toBe("Keep the reading.\n");
    const shown = await showRoom(root, { stage: "requirements" });
    expect(shown.stdout).toContain("1 product-manager agree Ship the reading.");
    expect(shown.stdout).toContain(
      "1 architect objection requirements.md#scope The ignore seam is missing.",
    );
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain("agreed product-manager open requirements.md#scope");
    expect(decisions).not.toContain("decision-needed");
    expect(await readFile(join(root, ".sdd", ".gitignore"), "utf8")).toContain("rooms/");

    const again = script([
      { type: "post", text: "Keep the ignore switch." },
      { type: "agree", text: "Agreed." },
    ]);
    const second = await reviewRoom(root, { stage: "requirements", model: again.model });
    expect(second.stdout).toBe("Round 2.");
    expect(again.prompts[0]).toContain("### Open objections");
    expect(await readFile(join(ctx.path, "meta.yaml"), "utf8")).toContain("stage: requirements");
  });

  it("repairs an objection without a cite, then stores it", async () => {
    const root = await project();
    await role(root, "product-manager", "Write the reading");
    await role(root, "architect", "Name the seams");
    await writeTeam(root, ["product-manager", "architect"]);
    await workflow(root);
    const config = await loadConfig(root);
    await createChange({ projectRoot: root, config, title: "Repair", workflowName: "rooms" });
    const fake = script([
      { type: "objection", text: "The ignore seam is missing." },
      { type: "objection", text: "The ignore seam is missing.", cite: "requirements.md#scope" },
      { type: "agree", text: "Noted." },
    ]);
    const reviewed = await reviewRoom(root, { stage: "requirements", model: fake.model });
    expect(reviewed.stdout).toBe("Round 1.");
    expect(fake.prompts).toHaveLength(3);
    expect(fake.prompts[1]).toContain("# Repair");
    expect(fake.prompts[1]).toContain("cite: an objection needs a cite");
    expect(fake.prompts[2]).not.toContain("# Repair");
    const shown = (await showRoom(root, { stage: "requirements" })).stdout;
    expect(shown).toContain(
      "1 product-manager objection requirements.md#scope The ignore seam is missing.",
    );
  });

  it("does not let a model record a decision: it is repaired, then refused", async () => {
    const root = await project();
    await role(root, "product-manager", "Write the reading");
    await role(root, "architect", "Name the seams");
    await writeTeam(root, ["product-manager", "architect"]);
    await workflow(root);
    const config = await loadConfig(root);
    await createChange({ projectRoot: root, config, title: "Decide", workflowName: "rooms" });
    const repaired = script([
      { type: "decision", text: "Keep the ignore switch." },
      { type: "post", text: "Keep the ignore switch." },
      { type: "agree", text: "Noted." },
    ]);
    expect((await reviewRoom(root, { stage: "requirements", model: repaired.model })).stdout).toBe(
      "Round 1.",
    );
    expect(repaired.prompts[1]).toContain(
      'kind: must be post, objection, agree or block. "decision" is for the person.',
    );
    expect(repaired.prompts[0]).not.toMatch(/"kind": "post"[^\n]*"decision"/);
    const shown = (await showRoom(root, { stage: "requirements" })).stdout;
    expect(shown).toContain("1 product-manager post Keep the ignore switch.");
    expect(shown).not.toContain(" decision ");

    const stubborn = script([
      { type: "decision", text: "Keep it." },
      { type: "decision", text: "Keep it." },
    ]);
    const refused = await reviewRoom(root, { stage: "requirements", model: stubborn.model });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toBe("A room entry is not valid.");
    expect(stubborn.prompts).toHaveLength(2);
    expect((await showRoom(root, { stage: "requirements" })).stdout).not.toContain(" decision ");
  });

  it("reads a kind, and an old type with a legacy_shape line once per round", async () => {
    const legacyLog = (root: string) => join(root, ".sdd/role-runs/legacy-shapes.jsonl");
    const setup = async () => {
      const root = await project();
      await role(root, "product-manager", "Write the reading");
      await role(root, "architect", "Name the seams");
      await writeTeam(root, ["product-manager", "architect"]);
      await workflow(root);
      const config = await loadConfig(root);
      await createChange({ projectRoot: root, config, title: "Kinds", workflowName: "rooms" });
      return root;
    };

    const fresh = await setup();
    const withKind = script([
      { kind: "post", text: "Keep the ignore switch." },
      { kind: "agree", text: "Noted." },
    ]);
    expect((await reviewRoom(fresh, { stage: "requirements", model: withKind.model })).stdout).toBe(
      "Round 1.",
    );
    expect((await showRoom(fresh, { stage: "requirements" })).stdout).toContain(
      "1 product-manager post Keep the ignore switch.",
    );
    await expect(readFile(legacyLog(fresh), "utf8")).rejects.toThrow();

    const old = await setup();
    const withType = script([
      { type: "post", text: "Keep the ignore switch." },
      { type: "agree", text: "Noted." },
    ]);
    expect((await reviewRoom(old, { stage: "requirements", model: withType.model })).stdout).toBe(
      "Round 1.",
    );
    expect((await showRoom(old, { stage: "requirements" })).stdout).toContain(
      "1 product-manager post Keep the ignore switch.",
    );
    const lines = (await readFile(legacyLog(old), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "legacy_shape",
      roleId: "product-manager",
      shape: "type",
      kind: "post",
    });
    expect(typeof lines[0]?.ts).toBe("string");
  });

  it("repairs a reply that is not one line or one JSON object", async () => {
    const root = await project();
    await role(root, "product-manager", "Write the reading");
    await role(root, "architect", "Name the seams");
    await writeTeam(root, ["product-manager", "architect"]);
    await workflow(root);
    const config = await loadConfig(root);
    await createChange({ projectRoot: root, config, title: "Lines", workflowName: "rooms" });
    const fake = script([
      "First line.\nSecond line.",
      { type: "post", text: "One line." },
      { foo: 1 },
      { type: "post", text: "Another." },
    ]);
    expect((await reviewRoom(root, { stage: "requirements", model: fake.model })).stdout).toBe(
      "Round 1.",
    );
    expect(fake.prompts[1]).toContain("- (reply): one JSON object, or one line of text");
    expect(fake.prompts[3]).toContain("- kind: required");
  });

  it("keeps decision for people and the classifier options, and makes a model's pick a post", async () => {
    const root = await project();
    await role(root, "one", "one");
    await role(root, "two", "two");
    await writeFile(
      join(root, ".sdd", "team.yaml"),
      [
        "branch: bot/{bot}/{change}",
        "rooms:",
        "  commit: false",
        "bots:",
        "  - { name: one, role: one, wip: 1 }",
        "  - { name: two, role: two, wip: 1 }",
        "humans: []",
        "",
      ].join("\n"),
      "utf8",
    );
    await workflow(root);
    const config = await loadConfig(root);
    await createChange({ projectRoot: root, config, title: "People", workflowName: "rooms" });
    const person = await postRoom(root, {
      stage: "trio",
      type: "decision",
      text: "Keep the ignore switch.",
      from: "Ada Lovelace",
    });
    expect(person.stdout).toBe("Posted.");
    await writeFile(
      join(root, ".sdd", "models.yaml"),
      [
        "version: 1",
        "models:",
        "  local: { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL }",
        "  writer: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
        "defaults:",
        "  by_work_type: { classify: local }",
        "  fallback_reason: writer",
        "  fallback_decide: local",
        "",
      ].join("\n"),
      "utf8",
    );
    const seen: string[] = [];
    const fake = script(["Keep the ignore switch.", "Keep the ignore switch."]);
    await reviewRoom(root, {
      stage: "trio",
      roles: ["one", "two"],
      model: fake.model,
      env: { SDD_DECIDE_MODEL: "echo", SDD_ROLE_MODEL: "echo" },
      runCommand: async (_command, stdin) => {
        seen.push(stdin);
        return JSON.stringify({
          pick: "decision",
          probs: { post: 0, objection: 0, agree: 0, block: 0, decision: 1 },
        });
      },
    });
    expect(JSON.parse(seen[0] ?? "{}").options).toEqual([
      "post",
      "objection",
      "agree",
      "block",
      "decision",
    ]);
    const shown = (await showRoom(root, { stage: "trio" })).stdout;
    expect(shown).toContain("Ada Lovelace decision Keep the ignore switch.");
    expect(shown).toContain("one post Keep the ignore switch.");
    expect(shown).toContain("two post Keep the ignore switch.");
  });

  it("stops at room_rounds and lets a person post", async () => {
    const root = await project();
    await role(root, "product-manager", "Write the reading");
    await role(root, "architect", "Name the seams");
    await writeTeam(root, ["product-manager", "architect"], 1);
    await workflow(root);
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Cap",
      workflowName: "rooms",
    });
    const round = script([
      { type: "agree", text: "Noted." },
      { type: "objection", text: "Still open.", cite: "requirements.md#scope" },
    ]);
    const reviewed = await reviewRoom(root, { stage: "requirements", model: round.model });
    expect(reviewed.stdout).toBe("Decision needed.");
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain("open requirements.md#scope");
    expect(decisions).toContain("decision-needed Room requirements still open after 1 rounds.");
    const stopped = await reviewRoom(root, { stage: "requirements", model: script([]).model });
    expect(stopped.stdout).toBe("Round limit reached.");

    const empty = await postRoom(root, { stage: "requirements", type: "objection", text: "No." });
    expect(empty.stdout).toBe("An objection needs a cite.");
    const posted = await postRoom(root, {
      stage: "requirements",
      type: "agree",
      text: "A person agrees.",
      from: "Ada Lovelace",
    });
    expect(posted.stdout).toBe("Posted.");
    expect((await showRoom(root, { stage: "requirements" })).stdout).toContain(
      "Ada Lovelace agree A person agrees.",
    );
  });

  it("uses three collaborators, the first bot of a shared role, and classifies free text", async () => {
    const root = await project();
    for (const name of ["one", "two", "three", "builder"]) {
      await role(root, name, name);
    }
    await writeFile(
      join(root, ".sdd", "team.yaml"),
      [
        "branch: bot/{bot}/{change}",
        "rooms:",
        "  commit: true",
        "bots:",
        "  - { name: one, role: one, wip: 1 }",
        "  - { name: two, role: two, wip: 1 }",
        "  - { name: three, role: three, wip: 1 }",
        "  - { name: builder-a, role: builder, wip: 1 }",
        "  - { name: builder-b, role: builder, wip: 1 }",
        "humans: []",
        "limits:",
        "  room_rounds: 4",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, ".sdd", ".gitignore"), "handoff.md\nrooms/\n", "utf8");
    await workflow(root);
    const config = await loadConfig(root);
    await createChange({
      projectRoot: root,
      config,
      title: "Trio",
      workflowName: "rooms",
    });
    const trio = script([
      { type: "post", text: "One." },
      { type: "post", text: "Two." },
      { type: "post", text: "Three." },
    ]);
    expect((await reviewRoom(root, { stage: "trio", model: trio.model })).stdout).toBe("Round 1.");
    expect(trio.prompts).toHaveLength(3);
    const shown = await showRoom(root, { stage: "trio" });
    expect(shown.stdout).toContain("1 one post One.");
    expect(shown.stdout).toContain("1 three post Three.");
    expect(await readFile(join(root, ".sdd", ".gitignore"), "utf8")).toBe("handoff.md\n");

    const shared = script([{ type: "post", text: "First bot." }]);
    expect((await reviewRoom(root, { stage: "builders", model: shared.model })).stdout).toBe(
      "Round 1.",
    );
    expect((await showRoom(root, { stage: "builders" })).stdout).toContain("builder-a post");
    const override = script([{ type: "post", text: "Named bot." }]);
    await reviewRoom(root, { stage: "builders", roles: ["builder-b"], model: override.model });
    expect((await showRoom(root, { stage: "builders" })).stdout).toContain("builder-b post");

    const plain = script(["Ship it.", "Ship it.", "Ship it."]);
    await reviewRoom(root, { stage: "trio", model: plain.model });
    expect((await showRoom(root, { stage: "trio" })).stdout).toContain("2 one post Ship it.");

    await writeFile(
      join(root, ".sdd", "models.yaml"),
      [
        "version: 1",
        "models:",
        "  local: { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL }",
        "  writer: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
        "defaults:",
        "  by_work_type: { classify: local }",
        "  fallback_reason: writer",
        "  fallback_decide: local",
        "",
      ].join("\n"),
      "utf8",
    );
    const typed = script(["Ship it.", "Ship it.", "Ship it."]);
    await reviewRoom(root, {
      stage: "trio",
      model: typed.model,
      env: { SDD_DECIDE_MODEL: "echo", SDD_ROLE_MODEL: "echo" },
      runCommand: async () =>
        JSON.stringify({
          pick: "agree",
          probs: { post: 0, objection: 0, agree: 1, block: 0, decision: 0 },
        }),
    });
    expect((await showRoom(root, { stage: "trio" })).stdout).toContain("3 one agree Ship it.");
  });

  it("adds a done post only when a room file already exists", async () => {
    const root = await project();
    await role(root, "builder", "Implement");
    await writeTeam(root, ["builder"]);
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Loop",
      workflowName: "feature",
    });
    const quiet = script([{ step: "done", summary: "quiet", outputs: [] }]);
    await runRole(root, { name: "builder", task: "quiet", model: quiet.model });
    expect(await pathExists(join(root, ".sdd", "rooms"))).toBe(false);

    const roomDir = join(root, ".sdd", "rooms", ctx.id);
    await mkdir(roomDir, { recursive: true });
    await writeFile(join(roomDir, "intent.jsonl"), '{"text":"prior room sentence"}\n', "utf8");
    const loud = script([{ step: "done", summary: "loop posted", outputs: [] }]);
    await runRole(root, { name: "builder", task: "loud", model: loud.model });
    expect(loud.prompts[0]).toContain("### Room");
    expect(loud.prompts[0]).toContain("prior room sentence");
    const body = await readFile(join(roomDir, "intent.jsonl"), "utf8");
    expect(body).toContain("prior room sentence");
    expect(body).toContain('"type":"post"');
    expect(body).toContain("loop posted");
  });
});

describe("stage members", () => {
  it("uses the roles that list the stage when the workflow names nobody", () => {
    expect(
      stageMemberNames({ owner: "architect", collaborates: ["dev-lead"] }, ["analyst"]),
    ).toEqual(["architect", "dev-lead"]);
    expect(stageMemberNames({}, ["analyst", "builder"])).toEqual(["analyst", "builder"]);
  });
});
