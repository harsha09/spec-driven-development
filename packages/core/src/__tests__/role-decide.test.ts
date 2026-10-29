import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { pathExists } from "../fs.js";
import {
  createChange,
  initProject,
  loadConfig,
  readChangeMetrics,
  setActiveChange,
} from "../index.js";
import { createRole, initTeam } from "../role/index.js";
import { routeRole, takeRole } from "../role/routing.js";

const temps: string[] = [];
const options = [
  "architect",
  "dev-lead",
  "developer",
  "product-manager",
  "product-owner",
  "qa",
  "human",
];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function reply(pick: string, probability: number, sum = 1, tokens = true): string {
  const probs: Record<string, number> = {};
  for (const option of options) probs[option] = 0;
  const other = options.find((option) => option !== pick) ?? pick;
  probs[pick] = probability;
  probs[other] = (probs[other] ?? 0) + (sum - probability);
  const body: Record<string, unknown> = { pick, probs };
  if (tokens) {
    body.input_tokens = 4;
    body.output_tokens = 2;
  }
  return JSON.stringify(body);
}

function modelsYaml(route = "rules", min = "0.7"): string {
  return [
    "version: 1",
    "models:",
    `  rules: { kind: decide, provider: rules }`,
    `  local: { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL, min_confidence: ${min} }`,
    "  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
    "  nearby: { kind: decide, provider: ollama, model: qwen2.5:7b, base_url_env: OLLAMA_HOST, min_confidence: 0.7 }",
    "defaults:",
    "  by_work_type:",
    `    route: ${route}`,
    "    classify: local",
    "    check: local",
    "    draft: strong",
    "    design: strong",
    "    code: strong",
    "    review: strong",
    "  fallback_reason: strong",
    "  fallback_decide: rules",
  ].join("\n");
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-decide-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  expect((await initTeam(root, "software", "Ada Lovelace")).exitCode).toBe(0);
  const config = await loadConfig(root);
  const change = await createChange({
    projectRoot: root,
    config,
    title: "Pick a model",
    workflowName: "feature",
  });
  await setActiveChange(root, config, change.id);
  return root;
}

describe("route decides only when no rule matched", () => {
  it("keeps today's ask when models.yaml is absent", async () => {
    const root = await project();
    const calls: string[] = [];
    const routed = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand: async (_command, stdin) => {
          calls.push(stdin);
          return reply("developer", 0.9);
        },
      },
    );
    expect(routed).toMatchObject({
      exitCode: 0,
      stdout: "Ask the human.\nNo rule matched.",
    });
    expect(calls).toEqual([]);
    const config = await loadConfig(root);
    const active = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const metrics = await readChangeMetrics(root, config, active);
    expect(metrics.decisions).toBeUndefined();

    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("rules"), "utf8");
    const ruled = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide" },
        runCommand: async (_command, stdin) => {
          calls.push(stdin);
          return reply("developer", 0.9);
        },
      },
    );
    expect(ruled.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(calls).toEqual([]);
    const afterRules = await readChangeMetrics(root, config, active);
    expect(afterRules.decisions ?? []).toEqual([]);
  });

  it("does not call a model for a rule, one owner, a skill, a stage owner, or two owners", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("local"), "utf8");
    const calls: string[] = [];
    const runCommand = async (_command: string, stdin: string) => {
      calls.push(stdin);
      return reply("developer", 0.9);
    };
    const deps = { env: { SDD_DECIDE_MODEL: "decide" }, runCommand };
    await writeFile(
      join(root, ".sdd/routing.yaml"),
      "rules:\n  - id: implement\n    stage: implement\n    role: developer\n",
      "utf8",
    );
    expect((await routeRole(root, { stage: "implement" }, deps)).stdout).toContain(
      "rule implement",
    );
    expect(
      (await routeRole(root, { artifact: "the change pack for one service" }, deps)).stdout,
    ).toContain("rule owns");
    expect((await routeRole(root, { skill: "implement one change pack" }, deps)).stdout).toContain(
      "rule skill",
    );
    await rm(join(root, ".sdd/routing.yaml"));
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "Stage owner",
      workflowName: "team-software",
    });
    await setActiveChange(root, config, change.id);
    expect((await routeRole(root, {}, deps)).stdout).toContain("rule stage-owner");
    await createRole(root, {
      name: "other-dev",
      label: "Other",
      job: "Build the other pack",
      owns: ["the change pack for one service"],
    });
    const shared = await routeRole(root, { artifact: "the change pack for one service" }, deps);
    expect(shared.stdout).toBe("Ask the human.\nTwo roles own this.");
    expect(calls).toEqual([]);
    const taken = await takeRole(root, { artifact: "no-such-owns-phrase" });
    expect(taken.exitCode).toBe(1);
    expect(taken.stdout).toContain("Ask the human.");
    expect(await pathExists(join(root, ".sdd/agents/developer/inbox.jsonl"))).toBe(false);
  });

  it("keeps a confident command pick, escalates once, and records tokens", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("local"), "utf8");
    const calls: { command: string; stdin: string }[] = [];
    const runCommand = async (command: string, stdin: string) => {
      calls.push({ command, stdin });
      if (command === "decide") return reply("developer", 0.8);
      return reply("architect", 0.9);
    };
    const picked = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(picked.exitCode).toBe(0);
    expect(picked.stdout).toBe("role developer\nreason Model local picked developer.");
    expect(picked.stdout).not.toContain("rule ");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]?.stdin ?? "") as { mode: string; options: string[] };
    expect(body.mode).toBe("decide");
    expect(body.options).toEqual(options);

    calls.length = 0;
    const low = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand: async (command, stdin) => {
          calls.push({ command, stdin });
          return command === "decide" ? reply("developer", 0.69) : reply("architect", 0.9);
        },
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(low.stdout).toBe("role architect\nreason Model strong picked architect.");
    expect(calls.map((call) => call.command)).toEqual(["decide", "strong"]);

    const still = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand: async () => reply("developer", 0.69),
      },
    );
    expect(still.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(still.stdout).not.toContain("role ");

    const config = await loadConfig(root);
    const active = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const metrics = await readChangeMetrics(root, config, active);
    expect(metrics.decisions?.some((row) => row.provider === "command" && row.model === null)).toBe(
      true,
    );
    expect(metrics.decisions?.every((row) => row.inputTokens === 4)).toBe(true);
    expect(JSON.stringify(metrics)).not.toContain("usd");
  });

  it("does not read process.env when deps are omitted and does not escalate without a minimum", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("local"), "utf8");
    const previous = process.env.SDD_DECIDE_MODEL;
    process.env.SDD_DECIDE_MODEL = "definitely-not-a-command";
    try {
      const routed = await routeRole(root, { artifact: "no-such-owns-phrase" });
      expect(routed.stdout).toBe("Ask the human.\nNo rule matched.");
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, "SDD_DECIDE_MODEL");
      else process.env.SDD_DECIDE_MODEL = previous;
    }

    await writeFile(
      join(root, ".sdd/models.yaml"),
      modelsYaml("local", "null").replace("min_confidence: null", "min_confidence: 0.7"),
      "utf8",
    );
    const bare = modelsYaml("local").replace(" min_confidence: 0.7", "");
    await writeFile(join(root, ".sdd/models.yaml"), bare, "utf8");
    const calls: string[] = [];
    const kept = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand: async (command, stdin) => {
          calls.push(command);
          return stdin.includes("nope") ? reply("developer", 0.01) : reply("developer", 0.01);
        },
      },
    );
    expect(kept.stdout).toContain("role developer");
    expect(calls).toEqual(["decide"]);

    const invalid = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
        runCommand: async (command) => {
          calls.push(command);
          return JSON.stringify({ pick: "not-a-role", probs: { "not-a-role": 1 } });
        },
      },
    );
    expect(invalid.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(invalid.stdout).not.toContain("not-a-role");
    expect(calls.filter((command) => command === "strong")).toEqual([]);
  });

  it("uses an injected Ollama response and follows a bad body to the strong model", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("nearby"), "utf8");
    const fetches: string[] = [];
    const commands: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetches.push(String(input));
      expect(String(init?.body)).toContain("qwen2.5:7b");
      return new Response(
        JSON.stringify({
          model: "qwen2.5:latest",
          message: { content: reply("developer", 0.9, 1, false) },
          prompt_eval_count: 11,
          eval_count: 5,
        }),
        { status: 200 },
      );
    };
    const picked = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "http://127.0.0.1:9", SDD_ROLE_MODEL: "strong" },
        fetch: fetchImpl,
        runCommand: async (command) => {
          commands.push(command);
          return reply("architect", 0.9);
        },
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(picked.stdout).toContain("role developer");
    expect(fetches).toEqual(["http://127.0.0.1:9/api/chat"]);
    expect(commands).toEqual([]);

    const bad = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "http://127.0.0.1:9", SDD_ROLE_MODEL: "strong" },
        fetch: async () =>
          new Response(JSON.stringify({ message: { content: '{"pick":"nope"}' } }), {
            status: 200,
          }),
        runCommand: async (command) => {
          commands.push(command);
          return JSON.stringify({ text: "not a decision" });
        },
      },
    );
    expect(commands).toEqual(["strong"]);
    expect(bad.stdout).toBe("Ask the human.\nNo rule matched.");

    let fetched = false;
    const missing = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_ROLE_MODEL: "strong" },
        fetch: async () => {
          fetched = true;
          throw new Error("socket");
        },
        runCommand: async (command) => {
          commands.push(command);
          return reply("architect", 0.9);
        },
      },
    );
    expect(fetched).toBe(false);
    expect(missing.stdout).toBe("Ask the human.\nNo rule matched.");

    const config = await loadConfig(root);
    const active = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const metrics = await readChangeMetrics(root, config, active);
    expect(
      metrics.decisions?.some((row) => row.model === "qwen2.5:latest" && row.inputTokens === 11),
    ).toBe(true);
  });

  it("fetches http://127.0.0.1:11434/api/chat when OLLAMA_HOST has no scheme", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("nearby"), "utf8");
    const fetches: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetches.push(String(input));
      expect(String(init?.body)).toContain("qwen2.5:7b");
      return new Response(
        JSON.stringify({
          model: "qwen2.5:latest",
          message: { content: reply("developer", 0.9, 1, false) },
          prompt_eval_count: 11,
          eval_count: 5,
        }),
        { status: 200 },
      );
    };
    const picked = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "127.0.0.1:11434", SDD_ROLE_MODEL: "strong" },
        fetch: fetchImpl,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(picked.stdout).toContain("role developer");
    expect(fetches).toEqual(["http://127.0.0.1:11434/api/chat"]);

    fetches.length = 0;
    const local = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "localhost:11434", SDD_ROLE_MODEL: "strong" },
        fetch: fetchImpl,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(local.stdout).toContain("role developer");
    expect(fetches).toEqual(["http://localhost:11434/api/chat"]);

    fetches.length = 0;
    const tls = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "https://example.test:11434", SDD_ROLE_MODEL: "strong" },
        fetch: fetchImpl,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    expect(tls.stdout).toContain("role developer");
    expect(fetches).toEqual(["https://example.test:11434/api/chat"]);
  });

  it("does not fetch or record a row when the Ollama host is unset, blank, or still not a URL", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("nearby"), "utf8");
    let fetched = false;
    const commands: string[] = [];
    const deps = {
      fetch: async () => {
        fetched = true;
        throw new Error("socket");
      },
      runCommand: async (command: string) => {
        commands.push(command);
        return reply("architect", 0.9);
      },
    };
    const unset = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { SDD_ROLE_MODEL: "strong" },
        ...deps,
      },
    );
    const blank = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "   ", SDD_ROLE_MODEL: "strong" },
        ...deps,
      },
    );
    const unusable = await routeRole(
      root,
      { artifact: "no-such-owns-phrase" },
      {
        env: { OLLAMA_HOST: "not a url", SDD_ROLE_MODEL: "strong" },
        ...deps,
      },
    );
    expect(unset.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(blank.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(unusable.stdout).toBe("Ask the human.\nNo rule matched.");
    expect(fetched).toBe(false);
    expect(commands).toEqual([]);
    const config = await loadConfig(root);
    const active = (await readFile(join(root, "changes/.active"), "utf8")).trim();
    const metrics = await readChangeMetrics(root, config, active);
    expect(metrics.decisions ?? []).toEqual([]);
  });

  it("rejects a probability total outside the tolerance and a pick outside the options", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml("local"), "utf8");
    const commands: string[] = [];
    const run = (body: string) =>
      routeRole(
        root,
        { artifact: "no-such-owns-phrase" },
        {
          env: { SDD_DECIDE_MODEL: "decide", SDD_ROLE_MODEL: "strong" },
          runCommand: async (command) => {
            commands.push(command);
            return command === "decide" ? body : reply("architect", 0.9);
          },
        },
      );
    commands.length = 0;
    const wide = await run(reply("developer", 0.8, 1.02));
    expect(wide.stdout).toContain("role architect");
    expect(commands).toEqual(["decide", "strong"]);

    commands.length = 0;
    const close = await run(reply("developer", 0.8, 1.01));
    expect(close.stdout).toContain("role developer");
    expect(commands).toEqual(["decide"]);

    commands.length = 0;
    const outside = await run(JSON.stringify({ pick: "not-a-role", probs: { developer: 1 } }));
    expect(outside.stdout).not.toContain("not-a-role");
    expect(commands[0]).toBe("decide");
    expect(commands).toContain("strong");

    commands.length = 0;
    const far = await run(reply("developer", 0.8, 1.5));
    expect(far.stdout).toContain("role architect");
    expect(commands).toEqual(["decide", "strong"]);

    commands.length = 0;
    const omitted = await run(
      JSON.stringify({ pick: "developer", probs: { developer: 0.8, human: 0.2 } }),
    );
    expect(omitted.stdout).not.toContain("role developer");
    expect(commands).toContain("strong");
  });
});
