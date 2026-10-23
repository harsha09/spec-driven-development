import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { ChangeMetricsSchema } from "../metrics.js";
import {
  checkTeam,
  explainModel,
  formatModels,
  initTeam,
  loadModels,
  selectModel,
} from "../role/index.js";
import { rulesDecision } from "../role/models/rules.js";
import { ModelsConfigSchema } from "../role/models/schema.js";

const temps: string[] = [];
const token = "abcdEFGH-0123456789abcdef0123456789";

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function modelsYaml(): string {
  return [
    "version: 1",
    "models:",
    "  rules: { kind: decide, provider: rules }",
    "  local: { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL, min_confidence: 0.7 }",
    "  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
    "  nearby: { kind: decide, provider: ollama, model: qwen2.5:7b, base_url_env: OLLAMA_HOST, min_confidence: 0.7 }",
    "  by-role: { kind: reason, provider: command, command_env: SDD_BY_ROLE }",
    "  by-stage: { kind: reason, provider: command, command_env: SDD_BY_STAGE }",
    "  by-bot: { kind: reason, provider: command, command_env: SDD_BY_BOT }",
    "defaults:",
    "  by_work_type:",
    "    route: rules",
    "    classify: local",
    "    check: local",
    "    draft: strong",
    "    design: strong",
    "    code: strong",
    "    review: strong",
    "  fallback_reason: strong",
    "  fallback_decide: rules",
    "overrides:",
    "  bots:",
    "    bob-dev: { code: by-bot }",
    "  stages:",
    "    pr_review: { code: by-stage }",
    "  roles:",
    "    architect: { code: by-role }",
  ].join("\n");
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-models-"));
  temps.push(root);
  await mkdir(join(root, ".sdd"), { recursive: true });
  return root;
}

describe("model config", () => {
  it("loads a missing file as null and rejects a bad file, a secret, and a kind mismatch", async () => {
    const root = await project();
    expect(await loadModels(root)).toBeNull();
    await writeFile(join(root, ".sdd/models.yaml"), "version: [\n", "utf8");
    expect(await loadModels(root)).toEqual({
      error: "models.yaml is invalid: models could not be parsed",
    });

    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml(), "utf8");
    const loaded = await loadModels(root);
    expect(loaded && "config" in loaded).toBe(true);

    await writeFile(
      join(root, ".sdd/models.yaml"),
      modelsYaml().replace("SDD_ROLE_MODEL", "-----BEGIN FAKE-----"),
      "utf8",
    );
    const secret = await loadModels(root);
    expect(secret).toEqual({ error: "models.yaml has a secret value." });
    expect(JSON.stringify(secret)).not.toContain("BEGIN");
    expect(JSON.stringify(secret)).not.toContain(token);

    await writeFile(
      join(root, ".sdd/models.yaml"),
      modelsYaml().replace("SDD_DECIDE_MODEL", `TOKEN=${token}`),
      "utf8",
    );
    expect(await loadModels(root)).toEqual({ error: "models.yaml has a secret value." });

    await writeFile(
      join(root, ".sdd/models.yaml"),
      modelsYaml().replace("SDD_DECIDE_MODEL", token),
      "utf8",
    );
    expect(await loadModels(root)).toEqual({ error: "models.yaml has a secret value." });

    await writeFile(
      join(root, ".sdd/models.yaml"),
      modelsYaml().replace("SDD_DECIDE_MODEL", "abcdefghijklmnopqrstuvwxyz01234"),
      "utf8",
    );
    expect(await loadModels(root)).toMatchObject({ config: { version: 1 } });

    const mismatch = ModelsConfigSchema.safeParse({
      version: 1,
      models: {
        rules: { kind: "decide", provider: "rules" },
        strong: { kind: "reason", provider: "command", command_env: "SDD_ROLE_MODEL" },
      },
      defaults: {
        by_work_type: { route: "strong" },
        fallback_reason: "strong",
        fallback_decide: "rules",
      },
    });
    expect(mismatch.success).toBe(false);

    const missingEnv = ModelsConfigSchema.safeParse({
      version: 1,
      models: {
        rules: { kind: "decide", provider: "rules" },
        strong: { kind: "reason", provider: "command" },
      },
      defaults: {
        by_work_type: { draft: "strong" },
        fallback_reason: "strong",
        fallback_decide: "rules",
      },
    });
    expect(missingEnv.success).toBe(false);
  });

  it("picks bot, then stage, then role, then the work type, then the fallback", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd/models.yaml"), modelsYaml(), "utf8");
    const loaded = await loadModels(root);
    if (!loaded || !("config" in loaded)) throw new Error("expected config");
    const config = loaded.config;
    expect(selectModel(config, { workType: "draft" })).toMatchObject({
      id: "strong",
      kind: "reason",
      why: "work-type default",
    });
    expect(selectModel(config, { workType: "route" }).id).toBe("rules");
    expect(selectModel(config, { workType: "classify" }).id).toBe("local");
    expect(selectModel(config, { workType: "code", role: "architect" }).why).toBe("role architect");
    expect(
      selectModel(config, { workType: "code", role: "architect", stage: "pr_review" }).id,
    ).toBe("by-stage");
    expect(
      selectModel(config, {
        workType: "code",
        role: "architect",
        stage: "pr_review",
        bot: "bob-dev",
      }).why,
    ).toBe("bot bob-dev");
    expect(explainModel(config, "review", {})).toBe(
      "review  strong  reason  command  work-type default",
    );
    expect(formatModels(config)).toContain("fallback_reason  strong  reason  command  fallback");
    expect(formatModels(config)).toContain("fallback_decide  rules  decide  rules  fallback");
  });

  it("asks the human from rules and keeps a team file strict", async () => {
    expect(rulesDecision(["developer", "human"])).toEqual({ pick: "human" });
    expect(rulesDecision(["developer"])).toEqual({ pick: "human" });
    const root = await project();
    expect((await initTeam(root, "software", "Ada Lovelace")).exitCode).toBe(0);
    expect(await checkTeam(root)).toMatchObject({
      exitCode: 0,
      stdout: "Team config is valid.",
    });
    await writeFile(join(root, ".sdd/roles/developer.md"), "\n-----BEGIN FAKE-----\n", {
      flag: "a",
    });
    expect((await checkTeam(root)).exitCode).toBe(0);
    const team = await readFile(join(root, ".sdd/team.yaml"), "utf8");
    await writeFile(join(root, ".sdd/team.yaml"), `${team}models:\n  code: strong\n`, "utf8");
    const checked = await checkTeam(root);
    expect(checked.exitCode).toBe(1);
    expect(checked.stdout).toContain("team.yaml is invalid");
    expect(ChangeMetricsSchema.parse({ version: 1, phases: [], requests: [] }).decisions).toBe(
      undefined,
    );
  });
});
