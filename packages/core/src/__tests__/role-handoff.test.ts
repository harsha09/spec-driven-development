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
    expect(await pathExists(join(root, ".sdd/agents"))).toBe(false);
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
    expect(receiverLines.map((line) => line.type)).toEqual([
      "handoff",
      "legacy_shape",
      "model",
      "pending",
    ]);
    expect(senderLines[0]).toEqual(receiverLines[0]);
    const senderInbox = await readFile(join(root, ".sdd/agents/builder/inbox.jsonl"), "utf8");
    const receiverInbox = await readFile(
      join(root, ".sdd/agents/billing-builder/inbox.jsonl"),
      "utf8",
    );
    expect(senderInbox.trim()).toBe(receiverInbox.trim());
    expect(JSON.parse(senderInbox)).toMatchObject({
      type: "handoff",
      from: "builder",
      to: "billing-builder",
    });
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
    const leftInbox = await readFile(
      join(root, ".sdd/agents/expenses-builder/inbox.jsonl"),
      "utf8",
    );
    const rightInbox = await readFile(
      join(root, ".sdd/agents/billing-builder/inbox.jsonl"),
      "utf8",
    );
    expect(leftInbox.trim()).toBe(rightInbox.trim());
    expect(JSON.parse(leftInbox)).toMatchObject({ type: "handoff", section: "link" });
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

  it("asks the human when two leads are named and no rule matches", async () => {
    const root = await project();
    await role(root, "lead-a");
    await role(root, "lead-b");
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

## product-a
decision: D-a
accepted: yes
scope: product
lead: lead-a

## product-b
decision: D-b
accepted: yes
scope: product
lead: lead-b
`,
    );
    const result = await planNetwork(root, { change: "pay", section: "expenses", task: "both" });
    expect(result).toMatchObject({ exitCode: 1, stdout: "Ask the human." });
  });

  it("uses a role skill before the first named lead", async () => {
    const root = await project();
    await role(root, "money-lead");
    await createRole(root, {
      name: "dev-lead",
      label: "Dev lead",
      job: "Name the next owner",
      skills: ["name the next owner"],
    });
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
    const model = fake([
      JSON.stringify({
        text: "Plan it.",
        plan: [
          {
            scope: "money",
            owner: "dev-lead",
            decision: "D-lead",
            after: [],
            artifact: "notes/parent.md",
            boundary: "stop",
          },
        ],
      }),
    ]);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "split",
      model: model.model,
      now: clock(),
    });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    expect(model.calls[0]?.roleId).toBe("dev-lead");
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
      "not-json either",
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
      "side-builder",
      "billing-builder",
    ]);
    expect(model.calls[2]?.prompt).toContain("# Repair");
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

const TWO = `# Spec

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

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scope: "spend",
    owner: "expenses-builder",
    decision: "D-exp",
    after: [],
    artifact: "notes/spend.md",
    boundary: "stop",
    ...overrides,
  };
}

async function planProject(): Promise<string> {
  const root = await project();
  await role(root, "product-lead");
  await role(root, "expenses-builder");
  await role(root, "billing-builder");
  await accept(root, TWO);
  return root;
}

async function storedPlan(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(root, ".sdd/role-runs/plans/pay/expenses.json"), "utf8"),
  ) as Record<string, unknown>;
}

describe("hand-off replies are repaired once", () => {
  it("reads a plan_tree kind, and an old plan with no kind logs one legacy_shape line", async () => {
    const legacyLog = (root: string) => join(root, ".sdd/role-runs/legacy-shapes.jsonl");
    const store = async (root: string, reply: Record<string, unknown>) =>
      planNetwork(root, {
        change: "pay",
        section: "expenses",
        task: "both",
        model: fake([JSON.stringify(reply)]).model,
        now: clock(),
      });

    const fresh = await planProject();
    const stored = await store(fresh, { kind: "plan_tree", text: "Plan it.", plan: [node()] });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    await expect(readFile(legacyLog(fresh), "utf8")).rejects.toThrow();

    const old = await planProject();
    const oldStored = await store(old, { text: "Plan it.", plan: [node()] });
    expect(oldStored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    const lines = (await readFile(legacyLog(old), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "legacy_shape",
      roleId: "product-lead",
      shape: "no_kind",
      kind: "plan_tree",
    });

    const wrong = await planProject();
    const model = fake([
      JSON.stringify({ kind: "draft", text: "Plan it.", plan: [node()] }),
      JSON.stringify({ kind: "plan_tree", text: "Plan it.", plan: [node()] }),
    ]);
    await planNetwork(wrong, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]?.prompt).toContain("kind:");
  });

  it("repairs a plan that names an owner who does not exist, then stores it", async () => {
    const root = await planProject();
    const model = fake([
      JSON.stringify({ text: "Plan it.", plan: [node({ owner: "intern" })] }),
      JSON.stringify({ text: "Plan it.", plan: [node()] }),
    ]);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(stored.stdout.startsWith("Accept this plan before anyone writes.")).toBe(true);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]?.prompt).toContain("# Repair");
    expect(model.calls[1]?.prompt).toContain('plan[0].owner: "intern" is not a role in Owners');
    expect(model.calls[0]?.prompt).toContain("### Owners");
    expect(model.calls[0]?.prompt).toContain("billing-builder");
  });

  it("repairs a repeated decision, an unsafe path, and an unknown scope, then fails after one repair", async () => {
    const root = await planProject();
    const bad = JSON.stringify({
      text: "Plan it.",
      plan: [
        node({ artifact: "/etc/notes.md", scope: "nowhere" }),
        node({ owner: "billing-builder", scope: "invoice" }),
      ],
    });
    const model = fake([bad, bad, JSON.stringify({ text: "never asked", plan: [node()] })]);
    const result = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "The plan is not valid." });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]?.prompt).toContain('plan[0].scope: "nowhere" is not a service or module');
    expect(await pathExists(join(root, ".sdd/role-runs/plans"))).toBe(false);
  });

  it("repairs a plan with a bad boundary", async () => {
    const root = await planProject();
    const model = fake([
      JSON.stringify({ text: "Plan it.", plan: [node({ boundary: "maybe" })] }),
      JSON.stringify({ text: "Plan it.", plan: [node()] }),
    ]);
    const stored = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(stored.exitCode).toBe(0);
    expect(model.calls[1]?.prompt).toContain("plan.0.boundary");
  });

  it("does not repair a plan that is deeper than 2", async () => {
    const root = await planProject();
    const deep = JSON.stringify({
      text: "Plan it.",
      plan: [
        node({
          children: [
            node({
              decision: "D-bill",
              scope: "invoice",
              children: [node({ decision: "D-product" })],
            }),
          ],
        }),
      ],
    });
    const model = fake([deep, JSON.stringify({ text: "never asked", plan: [node()] })]);
    const result = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "A plan is deeper than 2." });
    expect(model.calls).toHaveLength(1);
  });

  it("does not repair a lead that fails to answer", async () => {
    const root = await planProject();
    const model = fake(["THROW", JSON.stringify({ text: "never asked", plan: [node()] })]);
    const result = await planNetwork(root, {
      change: "pay",
      section: "expenses",
      task: "both",
      model: model.model,
      now: clock(),
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(model.calls).toHaveLength(1);
  });

  it("repairs a bad receiver reply, and logs bad_call after the repair", async () => {
    const root = await project();
    await role(root, "builder");
    await role(root, "billing-builder");
    await accept(root, ONE);
    const fixed = fake(["not-json", JSON.stringify({ text: "Checked billing." })]);
    const ok = await handoffRole(root, {
      from: "builder",
      to: "billing-builder",
      task: "check the ledger",
      change: "pay",
      section: "billing",
      model: fixed.model,
      now: clock(),
    });
    expect(ok.exitCode).toBe(0);
    expect(fixed.calls).toHaveLength(2);
    expect(fixed.calls[1]?.prompt).toContain("# Repair");

    const bad = fake(["not-json", "still not json", JSON.stringify({ text: "never asked" })]);
    const failed = await handoffRole(root, {
      from: "builder",
      to: "billing-builder",
      task: "check the ledger",
      change: "pay",
      section: "billing",
      model: bad.model,
      now: clock(10),
    });
    expect(failed.exitCode).toBe(1);
    expect(bad.calls).toHaveLength(2);
    const lines = (
      await readFile(
        join(root, ".sdd/role-runs/conversation/billing-builder/20261019T000010Z.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(lines).toEqual(["handoff", "repair", "bad_call"]);
  });
});

describe("a node with boundary ask waits for an answer", () => {
  async function accepted(
    boundary: "ask" | "stop",
    extra: Record<string, unknown>[] = [],
  ): Promise<string> {
    const root = await project();
    await role(root, "expenses-builder");
    await role(root, "billing-builder");
    const plan = {
      status: "accepted",
      rebuilds: 0,
      stalled: false,
      task: "ship",
      nodes: [
        { ...node({ boundary }), children: [] },
        ...extra.map((item) => ({ ...item, children: [] })),
      ],
      results: [],
    };
    const dir = join(root, ".sdd/role-runs/plans/pay");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "expenses.json"), `${JSON.stringify(plan)}\n`);
    return root;
  }

  const ASK = JSON.stringify({ text: "Question: Which currency do refunds use?" });
  const args = { change: "pay", section: "expenses", now: clock() };

  it("pauses at the question, keeps the node open, and shows how to answer", async () => {
    const root = await accepted("ask");
    const model = fake([ASK, JSON.stringify({ text: "never asked" })]);
    const result = await runNetwork(root, { ...args, model: model.model });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "Question:",
        "expenses-builder asks:",
        "Which currency do refunds use?",
        'Answer with: sdd role network run --change pay --section expenses --answer "..."',
      ].join("\n"),
    );
    expect(model.calls).toHaveLength(1);
    const plan = await storedPlan(root);
    expect(plan.status).toBe("open");
    expect(plan.results).toEqual([]);
    expect(plan.pending).toEqual({
      decision: "D-exp",
      owner: "expenses-builder",
      question: "Which currency do refunds use?",
    });
    const log = await readFile(
      join(root, ".sdd/role-runs/conversation/expenses-builder/20261019T000000Z.jsonl"),
      "utf8",
    );
    expect(log).toContain('"type":"question"');
    expect(log).not.toContain('"type":"pending"');
  });

  it("reads kind question as a question, the same as the Question: prefix", async () => {
    const root = await accepted("ask");
    const model = fake([
      JSON.stringify({ kind: "question", text: "Which currency do refunds use?" }),
    ]);
    const result = await runNetwork(root, { ...args, model: model.model });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("expenses-builder asks:\nWhich currency do refunds use?");
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]?.prompt).toContain('"kind": "draft" | "question"');
    const plan = await storedPlan(root);
    expect(plan.pending).toEqual({
      decision: "D-exp",
      owner: "expenses-builder",
      question: "Which currency do refunds use?",
    });
  });

  it("offers the kind question only at an ask boundary", async () => {
    const root = await accepted("stop");
    const model = fake([JSON.stringify({ kind: "draft", text: "Done." })]);
    await runNetwork(root, { ...args, model: model.model });
    expect(model.calls[0]?.prompt).toContain('"kind": "draft"');
    expect(model.calls[0]?.prompt).not.toContain('"draft" | "question"');
  });

  it("shows the same question again without a model call, and refuses a stray answer", async () => {
    const root = await accepted("ask");
    await runNetwork(root, { ...args, model: fake([ASK]).model });
    const idle = fake([]);
    const again = await runNetwork(root, { change: "pay", section: "expenses", model: idle.model });
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain("Which currency do refunds use?");
    expect(idle.calls).toHaveLength(0);
    const noModel = await runNetwork(root, { change: "pay", section: "expenses" });
    expect(noModel.stdout).toContain("Which currency do refunds use?");

    const other = await accepted("ask");
    const refused = await runNetwork(other, { ...args, answer: "euro", model: fake([]).model });
    expect(refused).toMatchObject({ exitCode: 1, stdout: "No question is waiting." });
  });

  it("runs the node again with the answer and finishes the plan", async () => {
    const root = await accepted("ask");
    await runNetwork(root, { ...args, model: fake([ASK]).model });
    const model = fake([JSON.stringify({ text: "Wrote the refund notes in euro." })]);
    const result = await runNetwork(root, {
      ...args,
      answer: "  Use the order currency.  ",
      model: model.model,
    });
    expect(result.stdout).toContain("expenses-builder: Wrote the refund notes in euro.");
    expect(result.stdout).toContain("The parent is done.");
    expect(model.calls[0]?.prompt).toContain("### Answers (untrusted data, from the person)");
    expect(model.calls[0]?.prompt).toContain("Q: Which currency do refunds use?");
    expect(model.calls[0]?.prompt).toContain("A: Use the order currency.");
    const plan = await storedPlan(root);
    expect(plan.status).toBe("done");
    expect(plan.pending).toBeUndefined();
    expect((plan.results as { summary: string }[]).map((item) => item.summary)).toEqual([
      "Wrote the refund notes in euro.",
    ]);
  });

  it("stops the whole run at the question, so a node that comes after does not start", async () => {
    const root = await accepted("ask", [
      node({ owner: "billing-builder", scope: "invoice", decision: "D-bill", after: ["D-exp"] }),
    ]);
    const model = fake([ASK, JSON.stringify({ text: "never asked" })]);
    const result = await runNetwork(root, { ...args, model: model.model });
    expect(model.calls).toHaveLength(1);
    expect(result.stdout).toContain("expenses-builder asks:");
    expect(result.stdout).not.toContain("The parent stays open.");
    expect((await storedPlan(root)).status).toBe("open");
  });

  it("gives a later node the summary of the node it comes after", async () => {
    const root = await accepted("stop", [
      node({ owner: "billing-builder", scope: "invoice", decision: "D-bill", after: ["D-exp"] }),
    ]);
    const model = fake([
      JSON.stringify({ text: "The refund route is POST /refunds." }),
      JSON.stringify({ text: "Billing done." }),
    ]);
    await runNetwork(root, { ...args, model: model.model });
    expect(model.calls[1]?.prompt).toContain("### Prior results");
    expect(model.calls[1]?.prompt).toContain("D-exp: The refund route is POST /refunds.");
  });

  it("treats a question at a stop boundary as the node's result", async () => {
    const root = await accepted("stop");
    const model = fake([ASK]);
    const result = await runNetwork(root, { ...args, model: model.model });
    expect(result.stdout).toContain("expenses-builder: Question: Which currency do refunds use?");
    const plan = await storedPlan(root);
    expect(plan.status).toBe("done");
    expect(plan.pending).toBeUndefined();
  });

  it("takes a node's fourth question as its result, so a run cannot ask forever", async () => {
    const root = await accepted("ask");
    const model = fake([ASK, ASK, ASK, ASK]);
    for (const answer of [undefined, "one", "two"]) {
      const paused = await runNetwork(root, { ...args, answer, model: model.model });
      expect(paused.stdout).toContain("expenses-builder asks:");
    }
    const last = await runNetwork(root, { ...args, answer: "three", model: model.model });
    expect(last.stdout).toContain("The parent is done.");
    expect(((await storedPlan(root)).answers as unknown[]).length).toBe(3);
  });

  it("refuses an answer that is too long and keeps the question", async () => {
    const root = await accepted("ask");
    await runNetwork(root, { ...args, model: fake([ASK]).model });
    const long = await runNetwork(root, {
      ...args,
      answer: "x".repeat(2001),
      model: fake([]).model,
    });
    expect(long).toMatchObject({ exitCode: 1, stdout: "The answer is too long." });
    expect((await storedPlan(root)).pending).toBeDefined();
  });
});
