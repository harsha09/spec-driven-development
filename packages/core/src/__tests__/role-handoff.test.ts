import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, pathExists } from "../index.js";
import {
  acceptNetwork,
  allowRole,
  createRole,
  handoffRole,
  planNetwork,
  rebuildNetwork,
  runNetwork,
  setRoleMessaging,
  showRoleGroup,
} from "../role/index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];
const T0 = "2026-10-19T00:00:00.000Z";

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-handoff-"));
  temps.push(root);
  return root;
}

function clock(seconds = 0): () => Date {
  return () => new Date(Date.parse(T0) + seconds * 1000);
}

function fake(replies: string[]): {
  model: RoleModel;
  calls: { roleId: string; prompt: string }[];
} {
  const calls: { roleId: string; prompt: string }[] = [];
  return {
    calls,
    model: {
      async complete(input) {
        calls.push(input);
        const next = replies[calls.length - 1];
        if (next === undefined) throw new Error("unexpected model call");
        if (next === "THROW") throw new Error("down");
        return next;
      },
    },
  };
}

async function role(root: string, name: string): Promise<void> {
  const result = await createRole(root, {
    name,
    label: name,
    job: `Job ${name}`,
    description: `Description ${name}`,
  });
  expect(result.exitCode).toBe(0);
}

async function accept(root: string, body: string, change = "pay"): Promise<void> {
  const dir = join(root, "changes", change);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "accepted.md"), body);
}

const ONE = `# Spec

## billing
decision: use-ledger
accepted: yes
owner: billing-builder
service: billing

The frontend and the backend stay together.
`;

describe("role handoff", () => {
  it("refuses the same role and writes nothing", async () => {
    const root = await project();
    await role(root, "builder");
    const model = fake([]);
    const result = await handoffRole(root, {
      from: "builder",
      to: "builder",
      task: "draft",
      change: "pay",
      section: "billing",
      model: model.model,
      now: clock(),
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "A role cannot hand off to itself." });
    expect(model.calls).toEqual([]);
    expect(await pathExists(join(root, ".sdd/role-runs"))).toBe(false);
  });

  it("turns messaging off before any call, then back on", async () => {
    const root = await project();
    await role(root, "builder");
    await role(root, "qa");
    await accept(root, ONE.replace("owner: billing-builder\n", ""));
    await writeFile(join(root, ".sdd/role.yaml"), "approval_timeout_minutes: 10\n");
    expect((await setRoleMessaging(root, false)).stdout).toBe("Messaging between roles is off.");
    const yaml = await readFile(join(root, ".sdd/role.yaml"), "utf8");
    expect(yaml).toContain("approval_timeout_minutes: 10");
    expect(yaml).toContain("role_messaging: false");
    const model = fake([]);
    const blocked = await handoffRole(root, {
      from: "builder",
      to: "qa",
      task: "draft",
      change: "pay",
      section: "billing",
      model: model.model,
      now: clock(),
    });
    expect(blocked).toMatchObject({ exitCode: 0, stdout: "Messaging between roles is off." });
    expect(model.calls).toEqual([]);
    expect(await pathExists(join(root, ".sdd/role-runs/conversation"))).toBe(false);
    expect((await setRoleMessaging(root, true)).stdout).toBe("Messaging between roles is on.");
  });

  it("writes both logs, calls the receiver once, and keeps the sender summary", async () => {
    const root = await project();
    await role(root, "builder");
    await role(root, "billing-builder");
    await accept(root, ONE);
    await mkdir(join(root, ".sdd/role-runs/memory/builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/memory/builder/notes.md"), "secret note\n");
    const model = fake([
      JSON.stringify({
        text: "Checked billing.",
        action: {
          name: "write_file",
          words: "Write the note.",
          inputs: { path: "notes/a.md", contents: "x" },
        },
      }),
    ]);
    const result = await handoffRole(root, {
      from: "builder",
      to: "billing-builder",
      task: "check the ledger",
      change: "pay",
      section: "billing",
      model: model.model,
      now: clock(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Allow once, Always allow, or Deny.");
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]?.roleId).toBe("billing-builder");
    expect(model.calls[0]?.prompt).not.toContain("secret note");
    expect(await pathExists(join(root, "notes/a.md"))).toBe(false);
    const sender = await readFile(
      join(root, ".sdd/role-runs/conversation/builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    const receiver = await readFile(
      join(root, ".sdd/role-runs/conversation/billing-builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    const senderLines = sender
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    const receiverLines = receiver
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    expect(senderLines.map((line) => line.type)).toEqual(["handoff", "handoff_reply"]);
    expect(receiverLines.map((line) => line.type)).toEqual(["handoff", "model", "pending"]);
    expect(senderLines[0]).toEqual(receiverLines[0]);
    expect(sender).toContain("Checked billing.");
    expect(sender).not.toContain("Write the note.");
    const allowed = await allowRole(root, {
      runId: "20261019T000000Z",
      mode: "deny",
      now: clock(1),
    });
    expect(allowed.exitCode).toBe(0);
  });

  it("refuses a receiver who is not the owner", async () => {
    const root = await project();
    await role(root, "builder");
    await role(root, "qa");
    await accept(root, ONE);
    const result = await handoffRole(root, {
      from: "builder",
      to: "qa",
      task: "draft",
      change: "pay",
      section: "billing",
      model: fake([]).model,
      now: clock(),
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "One owner handles this section." });
  });
});

describe("role network", () => {
  it("treats frontend and backend prose as one scope", async () => {
    const root = await project();
    await accept(
      root,
      `# Spec

## app
decision: one-app
accepted: yes

The frontend talks to the backend.
`,
    );
    const result = await planNetwork(root, { change: "pay", section: "app", task: "ship" });
    expect(result).toMatchObject({ exitCode: 0, stdout: "One scope. No lead." });
    expect(await pathExists(join(root, ".sdd/role-runs/plans"))).toBe(false);
  });

  it("names the one service and creates no plan", async () => {
    const root = await project();
    await role(root, "billing-builder");
    await accept(root, ONE);
    const result = await planNetwork(root, {
      change: "pay",
      section: "billing",
      task: "ship",
      model: fake([JSON.stringify({ text: "no" })]).model,
    });
    expect(result).toMatchObject({ exitCode: 0, stdout: "Service billing runs billing-builder." });
    expect(await pathExists(join(root, ".sdd/role-runs/plans"))).toBe(false);
  });

  it("hands off an accepted connection without a lead and keeps decisions", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    const body = `# Spec

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

## link
decision: D-link
accepted: yes
connection: expenses billing
owner: expenses-builder
owner: billing-builder
`;
    await accept(root, body);
    const before = await readFile(join(root, "changes/pay/accepted.md"), "utf8");
    const result = await planNetwork(root, {
      change: "pay",
      section: "billing",
      task: "link them",
      now: clock(),
    });
    expect(result.stdout).toBe(
      "Connection hands off. Lead is absent.\nexpenses-builder\nbilling-builder",
    );
    expect(await readFile(join(root, "changes/pay/accepted.md"), "utf8")).toBe(before);
    const left = await readFile(
      join(root, ".sdd/role-runs/conversation/expenses-builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    const right = await readFile(
      join(root, ".sdd/role-runs/conversation/billing-builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    expect(left.trim()).toBe(right.trim());
    expect(JSON.parse(left)).toMatchObject({
      type: "handoff",
      section: "link",
      decision: "D-link",
    });
    expect(await showRoleGroup(root, "pay")).toMatchObject({
      exitCode: 0,
      stdout: "expenses-builder\nbilling-builder",
    });
  });

  it("stores a depth-2 plan and runs a parent only after its child", async () => {
    const root = await project();
    await role(root, "money-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

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
`,
    );
    await mkdir(join(root, ".sdd/role-runs/memory/expenses-builder"), { recursive: true });
    await writeFile(join(root, ".sdd/role-runs/memory/expenses-builder/notes.md"), "secret note\n");
    const plan = {
      text: "Split the work.",
      plan: [
        {
          scope: "money",
          owner: "money-lead",
          decision: "D-lead",
          after: [],
          artifact: "notes/parent.md",
          boundary: "stop",
          children: [
            {
              scope: "expenses",
              owner: "expenses-builder",
              decision: "D-exp",
              after: [],
              artifact: "notes/child.md",
              boundary: "ask",
            },
          ],
        },
      ],
    };
    const deep = {
      text: "Too deep.",
      plan: [
        {
          scope: "money",
          owner: "money-lead",
          decision: "D-lead",
          after: [],
          artifact: "notes/parent.md",
          boundary: "stop",
          children: [
            {
              scope: "expenses",
              owner: "expenses-builder",
              decision: "D-exp",
              after: [],
              artifact: "notes/child.md",
              boundary: "ask",
              children: [
                {
                  scope: "billing",
                  owner: "billing-builder",
                  decision: "D-bill",
                  after: [],
                  artifact: "notes/grand.md",
                  boundary: "ask",
                },
              ],
            },
          ],
        },
      ],
    };
    const model = fake([JSON.stringify(deep), JSON.stringify(plan)]);
    const rejected = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "link money",
      model: model.model,
      now: clock(),
    });
    expect(rejected).toMatchObject({ exitCode: 1, stdout: "A plan is deeper than 2." });
    expect(await pathExists(join(root, ".sdd/role-runs/plans"))).toBe(false);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "link money",
      model: model.model,
      now: clock(),
    });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    expect(model.calls[1]?.prompt).toContain("link money");
    expect(model.calls[1]?.prompt).not.toContain("secret note");
    const early = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: model.model,
      now: clock(),
    });
    expect(early.stdout).toBe("Accept this plan before anyone writes.");
    expect((await acceptNetwork(root, { change: "pay", section: "expenses" })).stdout).toBe(
      "Plan accepted.",
    );
    const ran = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: fake([
        JSON.stringify({
          text: "child done",
          action: {
            name: "write_file",
            words: "Write.",
            inputs: { path: "notes/child.md", contents: "no" },
          },
        }),
        JSON.stringify({ text: "parent done" }),
      ]).model,
      now: clock(),
    });
    expect(ran.stdout).toContain("expenses-builder: child done");
    expect(ran.stdout).toContain("money-lead: parent done");
    expect(ran.stdout).toContain("The parent is done.");
    expect(await pathExists(join(root, "notes/child.md"))).toBe(false);
    const planFile = await readFile(join(root, ".sdd/role-runs/plans/pay/expenses.json"), "utf8");
    expect(planFile).not.toContain("secret note");
    expect(planFile).not.toContain("transcript");
    const results = (JSON.parse(planFile) as { results: { summary: string }[] }).results;
    expect(results.map((item) => item.summary)).toEqual(["child done", "parent done"]);
  });

  it("waits for an unmet prerequisite and refuses a second idle rebuild", async () => {
    const root = await project();
    await role(root, "money-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

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
`,
    );
    const waiting = {
      text: "Wait.",
      plan: [
        {
          scope: "billing",
          owner: "billing-builder",
          decision: "D-bill",
          after: ["D-exp"],
          artifact: "notes/bill.md",
          boundary: "stop",
        },
      ],
    };
    const same = waiting;
    const changed = {
      text: "Next.",
      plan: [
        {
          scope: "expenses",
          owner: "expenses-builder",
          decision: "D-exp",
          after: [],
          artifact: "notes/exp.md",
          boundary: "ask",
        },
      ],
    };
    const model = fake([JSON.stringify(waiting)]);
    expect(
      (
        await planNetwork(root, {
          change: "pay",
          section: "expenses",
          task: "link",
          model: model.model,
          now: clock(),
        })
      ).exitCode,
    ).toBe(0);
    await acceptNetwork(root, { change: "pay", section: "expenses" });
    const ran = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: fake([]).model,
      now: clock(),
    });
    expect(ran.stdout).toContain("A branch is waiting for its prerequisites.");
    expect(ran.stdout).toContain("The parent stays open.");
    expect(model.calls).toHaveLength(1);
    const idle = await rebuildNetwork(root, {
      change: "pay",
      section: "expenses",
      model: fake([JSON.stringify(same)]).model,
      now: clock(5),
    });
    expect(idle.stdout).toBe("Stopped. The plan made no progress.");
    const blocked = await rebuildNetwork(root, {
      change: "pay",
      section: "expenses",
      model: fake([JSON.stringify(changed)]).model,
      now: clock(6),
    });
    expect(blocked).toMatchObject({ exitCode: 1, stdout: "A second rebuild does not start." });
    const kept = JSON.parse(
      await readFile(join(root, ".sdd/role-runs/plans/pay/expenses.json"), "utf8"),
    ) as {
      nodes: { artifact: string }[];
      stalled: boolean;
    };
    expect(kept.stalled).toBe(true);
    expect(kept.nodes[0]?.artifact).toBe("notes/bill.md");
  });

  it("uses a product lead when services sit in two modules", async () => {
    const root = await project();
    await role(root, "product-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

## expenses
decision: D-exp
accepted: yes
service: expenses
module: spend
owner: expenses-builder

## billing
decision: D-bill
accepted: yes
service: billing
module: invoice
owner: billing-builder

## product
decision: D-product
accepted: yes
scope: product
lead: product-lead
`,
    );
    const model = fake([
      JSON.stringify({
        text: "Plan it.",
        plan: [
          {
            scope: "spend",
            owner: "expenses-builder",
            decision: "D-exp",
            after: [],
            artifact: "notes/spend.md",
            boundary: "stop",
          },
        ],
      }),
    ]);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    expect(model.calls[0]?.roleId).toBe("product-lead");
  });

  it("does not call a lead when two services have no module", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

## expenses
decision: D-exp
accepted: yes
service: expenses
owner: expenses-builder

## billing
decision: D-bill
accepted: yes
service: billing
owner: billing-builder
`,
    );
    const model = fake([JSON.stringify({ text: "no" })]);
    const result = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
    });
    expect(result).toMatchObject({ exitCode: 0, stdout: "One scope. No lead." });
    expect(model.calls).toEqual([]);
  });

  it("reads accepted.md from changes_path", async () => {
    const root = await project();
    await initProject({ projectRoot: root, agents: false, layoutRoot: ".sdd" });
    await role(root, "billing-builder");
    const dir = join(root, ".sdd/changes/pay");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "accepted.md"), ONE);
    await mkdir(join(root, "changes/pay"), { recursive: true });
    await writeFile(join(root, "changes/pay/accepted.md"), ONE.replace("billing-builder", "other"));
    const result = await planNetwork(root, { change: "pay", section: "billing", task: "ship" });
    expect(result.stdout).toBe("Service billing runs billing-builder.");
  });

  it("lists each connection owner once", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

## link
decision: D-link
accepted: yes
connection: expenses billing
owner: expenses-builder
owner: billing-builder
owner: billing-builder
`,
    );
    const result = await planNetwork(root, {
      change: "pay",
      section: "link",
      task: "link them",
      now: clock(),
    });
    expect(result.stdout).toBe(
      "Connection hands off. Lead is absent.\nexpenses-builder\nbilling-builder",
    );
    const right = await readFile(
      join(root, ".sdd/role-runs/conversation/billing-builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    expect(right.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(right)).toMatchObject({ from: "expenses-builder", to: "billing-builder" });
  });

  it("matches a connection on a later service id", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

## wide
decision: D-wide
accepted: yes
service: other
service: billing
owner: billing-builder

## link
decision: D-link
accepted: yes
connection: expenses billing
owner: expenses-builder
owner: billing-builder
`,
    );
    const model = fake([JSON.stringify({ text: "no" })]);
    const result = await planNetwork(root, {
      change: "pay",
      section: "wide",
      task: "link them",
      model: model.model,
      now: clock(),
    });
    expect(result.stdout).toBe(
      "Connection hands off. Lead is absent.\nexpenses-builder\nbilling-builder",
    );
    expect(model.calls).toEqual([]);
  });

  it("asks the product lead when another service has no module", async () => {
    const root = await project();
    await role(root, "product-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await role(root, "audit-builder");
    await accept(
      root,
      `# Spec

## expenses
decision: D-exp
accepted: yes
service: expenses
module: spend
owner: expenses-builder

## billing
decision: D-bill
accepted: yes
service: billing
module: invoice
owner: billing-builder

## audit
decision: D-audit
accepted: yes
service: audit
owner: audit-builder

## product
decision: D-product
accepted: yes
scope: product
lead: product-lead
`,
    );
    const model = fake([
      JSON.stringify({
        text: "Plan it.",
        plan: [
          {
            scope: "spend",
            owner: "expenses-builder",
            decision: "D-exp",
            after: [],
            artifact: "notes/spend.md",
            boundary: "stop",
          },
        ],
      }),
    ]);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    expect(model.calls[0]?.roleId).toBe("product-lead");
  });

  it("names a missing product lead on rebuild", async () => {
    const root = await project();
    await role(root, "product-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    const body = `# Spec

## expenses
decision: D-exp
accepted: yes
service: expenses
module: spend
owner: expenses-builder

## billing
decision: D-bill
accepted: yes
service: billing
module: invoice
owner: billing-builder

## product
decision: D-product
accepted: yes
scope: product
lead: product-lead
`;
    await accept(root, body);
    const model = fake([
      JSON.stringify({
        text: "Plan it.",
        plan: [
          {
            scope: "spend",
            owner: "expenses-builder",
            decision: "D-exp",
            after: [],
            artifact: "notes/spend.md",
            boundary: "stop",
          },
        ],
      }),
    ]);
    expect(
      (
        await planNetwork(root, {
          change: "pay",
          section: "expenses",
          task: "both",
          model: model.model,
          now: clock(),
        })
      ).exitCode,
    ).toBe(0);
    await accept(root, body.replace("lead: product-lead\n", ""));
    const again = await rebuildNetwork(root, {
      change: "pay",
      section: "expenses",
      model: model.model,
      now: clock(5),
    });
    expect(again).toMatchObject({ exitCode: 1, stdout: "This product needs a lead." });
    expect(model.calls).toHaveLength(1);
  });

  it("treats the same artifact ids in a new order as no progress", async () => {
    const root = await project();
    await role(root, "money-lead");
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    await accept(
      root,
      `# Spec

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
`,
    );
    const original = {
      text: "Order.",
      plan: [
        {
          scope: "expenses",
          owner: "expenses-builder",
          decision: "D-exp",
          after: [],
          artifact: "notes/a.md",
          boundary: "ask",
        },
        {
          scope: "billing",
          owner: "billing-builder",
          decision: "D-bill",
          after: [],
          artifact: "notes/b.md",
          boundary: "stop",
        },
      ],
    };
    const swapped = {
      text: "Swapped.",
      plan: [original.plan[1], original.plan[0]],
    };
    const model = fake([JSON.stringify(original), JSON.stringify(swapped)]);
    expect(
      (
        await planNetwork(root, {
          change: "pay",
          section: "expenses",
          task: "link",
          model: model.model,
          now: clock(),
        })
      ).exitCode,
    ).toBe(0);
    const idle = await rebuildNetwork(root, {
      change: "pay",
      section: "expenses",
      model: model.model,
      now: clock(5),
    });
    expect(idle.stdout).toBe("Stopped. The plan made no progress.");
    const kept = JSON.parse(
      await readFile(join(root, ".sdd/role-runs/plans/pay/expenses.json"), "utf8"),
    ) as { status: string; stalled: boolean; nodes: { artifact: string }[] };
    expect(kept.status).toBe("pending");
    expect(kept.stalled).toBe(true);
    expect(kept.nodes.map((node) => node.artifact)).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("calls each ready node once and keeps a result when a later node fails", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "side-builder");
    await role(root, "billing-builder");
    const plan = {
      status: "accepted",
      rebuilds: 0,
      stalled: false,
      task: "ship",
      nodes: [
        {
          scope: "expenses",
          owner: "expenses-builder",
          decision: "D-exp",
          after: [],
          artifact: "notes/exp.md",
          boundary: "stop",
          children: [],
        },
        {
          scope: "expenses",
          owner: "side-builder",
          decision: "D-side",
          after: [],
          artifact: "notes/side.md",
          boundary: "stop",
          children: [],
        },
        {
          scope: "billing",
          owner: "billing-builder",
          decision: "D-bill",
          after: ["D-exp"],
          artifact: "notes/bill.md",
          boundary: "stop",
          children: [],
        },
      ],
      results: [],
    };
    const dir = join(root, ".sdd/role-runs/plans/pay");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "expenses.json"), `${JSON.stringify(plan)}\n`);
    const model = fake([
      JSON.stringify({ text: "exp done" }),
      "not-json",
      JSON.stringify({ text: "bill done" }),
    ]);
    const ran = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: model.model,
      now: clock(),
    });
    expect(model.calls.map((call) => call.roleId)).toEqual([
      "expenses-builder",
      "side-builder",
      "billing-builder",
    ]);
    expect(ran.stdout).toContain("expenses-builder: exp done");
    expect(ran.stdout).toContain("billing-builder: bill done");
    expect(ran.stdout).toContain("A branch is waiting for its prerequisites.");
    expect(ran.stdout).toContain("The parent stays open.");
  });

  it("keeps earlier run results when a later owner is missing", async () => {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    const plan = {
      status: "accepted",
      rebuilds: 0,
      stalled: false,
      task: "ship",
      nodes: [
        {
          scope: "expenses",
          owner: "expenses-builder",
          decision: "D-exp",
          after: [],
          artifact: "notes/exp.md",
          boundary: "stop",
          children: [],
        },
        {
          scope: "billing",
          owner: "billing-builder",
          decision: "D-bill",
          after: [],
          artifact: "notes/bill.md",
          boundary: "stop",
          children: [],
        },
      ],
      results: [],
    };
    const dir = join(root, ".sdd/role-runs/plans/pay");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "expenses.json"), `${JSON.stringify(plan)}\n`);
    await rm(join(root, ".sdd/roles/billing-builder.md"));
    const model = fake([JSON.stringify({ text: "exp done" })]);
    const lost = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: model.model,
      now: clock(),
    });
    expect(lost).toMatchObject({ exitCode: 1, stdout: "Role not found." });
    expect(model.calls.map((call) => call.roleId)).toEqual(["expenses-builder"]);
    const kept = JSON.parse(await readFile(join(dir, "expenses.json"), "utf8")) as {
      results: { summary: string }[];
    };
    expect(kept.results.map((item) => item.summary)).toEqual(["exp done"]);
    const again = await runNetwork(root, {
      change: "pay",
      section: "expenses",
      model: fake([]).model,
      now: clock(5),
    });
    expect(again).toMatchObject({ exitCode: 1, stdout: "Role not found." });
  });
});
