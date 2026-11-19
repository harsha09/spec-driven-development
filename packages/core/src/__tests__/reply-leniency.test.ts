import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  createRole,
  initProject,
  loadBrain,
  loadConfig,
  readTeamConfig,
  reviewRoom,
  runLoop,
} from "../index.js";
import {
  MODEL_REPLY_EXAMPLES,
  PLAN_REPLY_EXAMPLES,
  ROOM_POST_EXAMPLES,
  guideExamples,
} from "../reply-schemas.js";
import { cleanReply } from "../reply-text.js";
import { readGuideReply } from "../role/guide.js";
import { planNetwork } from "../role/index.js";
import { modelFromEnv } from "../role/models/command.js";
import { parseReply } from "../role/run.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temps.push(root);
  return root;
}

/** The ways a model wraps a JSON reply. Each parser must read all of them. */
const WRAPS: Array<[string, (json: string) => string]> = [
  ["plain", (json) => json],
  ["fenced", (json) => `\`\`\`json\n${json}\n\`\`\``],
  ["fenced without a language", (json) => `\`\`\`\n${json}\n\`\`\``],
  ["think-tagged", (json) => `<think>Let me work out the shape first.</think>\n${json}`],
  ["think-tagged and fenced", (json) => `<think>\nplan\n</think>\n\`\`\`json\n${json}\n\`\`\`\n`],
];

describe("cleanReply", () => {
  it("removes think blocks and one surrounding fence, and nothing else", () => {
    expect(cleanReply('{"a":1}')).toBe('{"a":1}');
    expect(cleanReply('  {"a":1}\n')).toBe('{"a":1}');
    expect(cleanReply('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(cleanReply('<think>x</think>{"a":1}')).toBe('{"a":1}');
    expect(cleanReply('<THINK>x</THINK>\n{"a":1}')).toBe('{"a":1}');
    expect(cleanReply('<think>a</think><think>b</think>{"a":1}')).toBe('{"a":1}');
    expect(cleanReply('{"text":"keep ```fences``` inside"}')).toBe(
      '{"text":"keep ```fences``` inside"}',
    );
    expect(cleanReply('<think>never closed {"a":1}')).toBe('<think>never closed {"a":1}');
  });
});

describe("author, critique, revision, hand-off receiver, and owner replies", () => {
  const kinds: Array<[string, unknown]> = [
    ["author", { text: "The list screen spec is drafted." }],
    ["critique", MODEL_REPLY_EXAMPLES.valid[0]],
    ["revision", { text: "Revised.", changed: ["CHK-002"] }],
    ["hand-off receiver", { text: "I will add the refund endpoint." }],
    [
      "owner",
      {
        text: "Wrote the notes.",
        action: { name: "write_file", inputs: { path: "notes/a.md", contents: "x" } },
      },
    ],
  ];
  for (const [kind, reply] of kinds) {
    for (const [wrap, apply] of WRAPS) {
      it(`reads a ${wrap} ${kind} reply`, () => {
        const parsed = parseReply(apply(JSON.stringify(reply)));
        expect(parsed?.text).toBe((reply as { text: string }).text);
      });
    }
  }
  it("still refuses text that is not an object", () => {
    expect(parseReply("```json\n[1]\n```")).toBeNull();
    expect(parseReply("<think>x</think>sure, here you go")).toBeNull();
  });
});

describe("guide replies", () => {
  for (const [wrap, apply] of WRAPS) {
    it(`reads a ${wrap} guide reply`, () => {
      const headings = ["Goals", "Non-goals"];
      const reply = guideExamples(headings).valid[0] as Record<string, unknown>;
      const read = readGuideReply(headings)(apply(JSON.stringify(reply)));
      expect(read).toEqual({ ok: true, value: reply });
    });
  }
});

describe("loop steps", () => {
  async function loopRun(
    wrap: (json: string) => string,
  ): Promise<{ prompts: string[]; log: string }> {
    const root = await tempDir("sdd-lenient-");
    await initProject({ projectRoot: root, agents: false });
    await createRole(root, { name: "builder", label: "Builder", job: "Implement" });
    await writeFile(
      join(root, ".sdd", "team.yaml"),
      "branch: bot/{bot}/{change}\nrooms:\n  commit: false\nbots:\n  - name: builder\n    role: builder\n    wip: 1\nhumans: []\n",
      "utf8",
    );
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const brain = await loadBrain(root, loaded.team, "builder", { text: "add a todo" }, 8000);
    if ("error" in brain) throw new Error(brain.error);
    const prompts: string[] = [];
    const replies = [
      { step: "plan", items: ["Read the list"] },
      { step: "ask", question: "Which list?", options: ["a", "b"] },
    ];
    const model: RoleModel = {
      async complete(call) {
        prompts.push(call.prompt);
        return wrap(JSON.stringify(replies.shift()));
      },
    };
    await mkdir(join(root, ".sdd/role-runs/conversation/builder"), { recursive: true });
    const file = join(root, ".sdd/role-runs/conversation/builder/001.jsonl");
    const result = await runLoop({
      root,
      cfg: loaded.team,
      brain,
      model,
      file,
      roleName: "builder",
      logName: "builder",
    });
    expect(result.exitCode).toBe(0);
    return { prompts, log: await readFile(file, "utf8") };
  }

  for (const [wrap, apply] of WRAPS) {
    it(`runs on ${wrap} replies`, async () => {
      const run = await loopRun(apply);
      expect(run.prompts).toHaveLength(2);
      expect(run.log).toContain('"step":"plan"');
      expect(run.log).toContain('"step":"ask"');
      expect(run.log).not.toContain("bad_call");
    });
  }
});

describe("room entries", () => {
  async function room(wrap: (json: string) => string): Promise<string> {
    const root = await tempDir("sdd-lenient-room-");
    await initProject({ projectRoot: root, agents: false });
    await createRole(root, { name: "reviewer", label: "reviewer", job: "Review the reading" });
    await writeFile(
      join(root, ".sdd", "team.yaml"),
      "branch: bot/{bot}/{change}\nrooms:\n  commit: false\nbots:\n  - name: reviewer\n    role: reviewer\n    wip: 1\nhumans: []\n",
      "utf8",
    );
    await mkdir(join(root, ".sdd", "workflows"), { recursive: true });
    await writeFile(
      join(root, ".sdd", "workflows", "rooms.yaml"),
      [
        "name: rooms",
        "version: 1",
        "stages:",
        "  - id: requirements",
        "    owner: reviewer",
        "    artifacts:",
        "      - { id: requirements, path: requirements.md, required: true }",
        "",
      ].join("\n"),
      "utf8",
    );
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Rooms",
      workflowName: "rooms",
    });
    await writeFile(join(ctx.path, "requirements.md"), "A todo has a title.\n", "utf8");
    const model: RoleModel = {
      async complete() {
        return wrap(JSON.stringify(ROOM_POST_EXAMPLES.valid[0]));
      },
    };
    const result = await reviewRoom(root, { stage: "requirements", model });
    return result.stdout;
  }

  for (const [wrap, apply] of WRAPS) {
    it(`stores a ${wrap} room reply`, async () => {
      expect(await room(apply)).toBe("Round 1.");
    });
  }
});

describe("lead plans", () => {
  const SPEC = `# Spec

## expenses
decision: D-exp
accepted: yes
service: expenses
module: money
owner: expenses-builder

## billing
decision: D-bill
accepted: yes
service: billing
module: money
owner: billing-builder

## lead
decision: D-lead
accepted: yes
module: money
lead: money-lead
`;
  const plan = {
    text: "One piece.",
    plan: [
      {
        scope: "money",
        owner: "money-lead",
        decision: "D-lead",
        after: [],
        artifact: "notes/parent.md",
        boundary: "stop",
      },
    ],
  };
  for (const [wrap, apply] of WRAPS) {
    it(`stores a ${wrap} plan`, async () => {
      const root = await tempDir("sdd-lenient-plan-");
      for (const name of ["money-lead", "expenses-builder", "billing-builder"]) {
        await createRole(root, { name, label: name, job: `Job ${name}` });
      }
      await mkdir(join(root, "changes", "pay"), { recursive: true });
      await writeFile(join(root, "changes", "pay", "accepted.md"), SPEC);
      const model: RoleModel = {
        async complete() {
          return apply(JSON.stringify(plan));
        },
      };
      const stored = await planNetwork(root, {
        change: "pay",
        section: "expenses",
        task: "link money",
        model,
        now: () => new Date("2026-10-19T00:00:00.000Z"),
      });
      expect(stored.stdout).toMatch(/^Accept this plan before anyone writes\./);
    });
  }

  it("has an example that matches the plan shape", () => {
    expect(PLAN_REPLY_EXAMPLES.valid).toHaveLength(1);
  });
});

describe("a model run by command", () => {
  for (const [wrap, apply] of WRAPS) {
    it(`accepts ${wrap} stdout`, async () => {
      const dir = await tempDir("sdd-lenient-cmd-");
      const script = join(dir, "model.mjs");
      await writeFile(
        script,
        `process.stdout.write(${JSON.stringify(apply('{"text":"ok"}'))});\n`,
        "utf8",
      );
      const model = modelFromEnv({ SDD_ROLE_MODEL: `node ${script}` });
      expect(await model?.complete({ roleId: "builder", prompt: "x" })).toBe('{"text":"ok"}');
    });
  }
});
