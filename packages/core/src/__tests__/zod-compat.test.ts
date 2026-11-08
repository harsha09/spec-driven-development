import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChangeMetricsSchema } from "../metrics.js";
import { ModelsConfigSchema } from "../role/models/schema.js";
import { TeamSchema, formatTeamError } from "../role/schema.js";
import { ChangeMetaSchema, ConfigSchema, WorkflowSchema } from "../schemas.js";
import { LoopStepSchema } from "../team/loop.js";

const team = {
  branch: "feat/{bot}",
  rooms: { commit: false },
  bots: [{ name: "dev", role: "developer", wip: 1 }],
};

function message(parsed: { success: true } | { success: false; error: z.ZodError }): string {
  if (parsed.success) return "";
  return parsed.error.issues[0]?.message ?? "";
}

describe("zod 4 validation keeps the previous sentences", () => {
  it("fills config defaults from an empty object", () => {
    expect(ConfigSchema.parse({})).toEqual({
      version: 1,
      metrics: { enabled: true, exclude: [] },
      memory_path: "memory",
      changes_path: "changes",
      archive_path: "archive",
      domains_path: "domains",
      default_workflow: "recommend",
      per_change: {
        allow_skip: true,
        allow_gate_override: "soft_only",
        allow_custom_stages: true,
        require_reason_on_skip: true,
      },
      persistence: {
        default: "change_only",
        archive_on_complete: false,
        domain_sync: { mode: "never", anchored_domains: [] },
      },
      policy: { gates: "soft" },
    });
    expect(ConfigSchema.parse({ policy: {} }).policy).toEqual({ gates: "soft" });
    expect(ConfigSchema.parse({ extra: true }).memory_path).toBe("memory");
  });

  it("prints the same config and workflow sentences", () => {
    const wrongType = ConfigSchema.safeParse({ memory_path: false });
    expect(message(wrongType)).toBe("Expected string, received boolean");
    if (!wrongType.success) {
      expect(wrongType.error.message).toBe(`[
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "memory_path"
    ],
    "message": "Expected string, received boolean"
  }
]`);
    }

    expect(message(ConfigSchema.safeParse({ metrics: { exclude: [""] } }))).toBe(
      "String must contain at least 1 character(s)",
    );
    expect(message(ConfigSchema.safeParse({ policy: { gates: "nope" } }))).toBe(
      "Invalid enum value. Expected 'soft' | 'hard', received 'nope'",
    );
    expect(message(ConfigSchema.safeParse({ policy: { gates: null } }))).toBe(
      "Expected 'soft' | 'hard', received null",
    );
    expect(message(z.enum(["soft", "hard"]).safeParse(undefined))).toBe("Required");
    expect(message(z.literal(1).safeParse("nope"))).toBe("Invalid literal value, expected 1");
    expect(message(WorkflowSchema.safeParse({ name: "n", stages: [] }))).toBe(
      "Array must contain at least 1 element(s)",
    );
    expect(
      message(WorkflowSchema.safeParse({ name: "n", stages: [{ id: "a", kind: "nope" }] })),
    ).toBe("Invalid enum value. Expected 'standard' | 'brainstorm' | 'clarify', received 'nope'");

    const missing = ChangeMetaSchema.safeParse({});
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.message)).toEqual([
        "Required",
        "Required",
        "Required",
        "Required",
        "Required",
      ]);
    }
  });

  it("prints the same team.yaml sentences", () => {
    expect(TeamSchema.parse({ ...team, role_wip: { "  dev  ": 2 } }).role_wip).toEqual({ dev: 2 });

    const extra = TeamSchema.safeParse({ ...team, nope: 1 });
    expect(extra.success).toBe(false);
    if (!extra.success)
      expect(formatTeamError(extra.error)).toBe(
        "team.yaml is invalid: team Unrecognized key(s) in object: 'nope'",
      );

    const branch = TeamSchema.safeParse({ ...team, branch: "feat" });
    expect(branch.success).toBe(false);
    if (!branch.success) {
      expect(formatTeamError(branch.error)).toBe("team.yaml is invalid: branch must include {bot}");
    }

    const blankKey = TeamSchema.safeParse({ ...team, role_wip: { " ": 2 } });
    expect(blankKey.success).toBe(false);
    if (!blankKey.success) {
      expect(formatTeamError(blankKey.error)).toBe(
        "team.yaml is invalid: role_wip.  String must contain at least 1 character(s)",
      );
    }

    const extraBot = TeamSchema.safeParse({
      ...team,
      bots: [{ name: "dev", role: "developer", wip: 1, extra: true }],
    });
    expect(extraBot.success).toBe(false);
    if (!extraBot.success) {
      expect(formatTeamError(extraBot.error)).toBe(
        "team.yaml is invalid: bots.0 Unrecognized key(s) in object: 'extra'",
      );
    }

    const floatWip = TeamSchema.safeParse({
      ...team,
      bots: [{ name: "dev", role: "developer", wip: 1.5 }],
    });
    expect(floatWip.success).toBe(false);
    if (!floatWip.success) {
      expect(formatTeamError(floatWip.error)).toBe(
        "team.yaml is invalid: bots.0.wip Expected integer, received float",
      );
    }

    const negativeWip = TeamSchema.safeParse({
      ...team,
      bots: [{ name: "dev", role: "developer", wip: -1 }],
    });
    expect(negativeWip.success).toBe(false);
    if (!negativeWip.success) {
      expect(formatTeamError(negativeWip.error)).toBe(
        "team.yaml is invalid: bots.0.wip Number must be greater than 0",
      );
    }
  });

  it("keeps datetime and hash checks", () => {
    expect(ChangeMetricsSchema.safeParse({ version: 1, phases: [], requests: [] }).success).toBe(
      true,
    );
    const phase = ChangeMetricsSchema.safeParse({
      version: 1,
      phases: [{ phase: "implement", startedAt: "2026-11-04T12:58:37.251Z" }],
      requests: [],
    });
    expect(phase.success).toBe(true);
    const offset = ChangeMetricsSchema.safeParse({
      version: 1,
      phases: [{ phase: "implement", startedAt: "2026-11-04T12:58:37.251+00:00" }],
      requests: [],
    });
    expect(message(offset)).toBe("Invalid datetime");
    const hash = z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .safeParse("zz");
    expect(message(hash)).toBe("Invalid");
  });

  it("accepts a partial work-type map", () => {
    const parsed = ModelsConfigSchema.safeParse({
      version: 1,
      models: {
        rules: { kind: "decide", provider: "rules" },
        strong: { kind: "reason", provider: "command", command_env: "SDD_ROLE_MODEL" },
      },
      defaults: {
        by_work_type: { classify: "rules" },
        fallback_reason: "strong",
        fallback_decide: "rules",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("parses a tool step that omits args", () => {
    const parsed = LoopStepSchema.parse({ step: "tool", name: "x" });
    expect(parsed).toEqual({ step: "tool", name: "x" });
    expect(Object.keys(parsed)).toEqual(["step", "name"]);
  });

  it("rejects Infinity in config and an integer past Number.MAX_SAFE_INTEGER", () => {
    expect(message(ConfigSchema.safeParse({ version: Number.POSITIVE_INFINITY }))).toBe(
      "Number must be finite",
    );

    const unsafe = TeamSchema.safeParse({
      ...team,
      bots: [{ name: "dev", role: "developer", wip: Number.MAX_SAFE_INTEGER + 2 }],
    });
    expect(unsafe.success).toBe(false);
    if (!unsafe.success) {
      expect(formatTeamError(unsafe.error)).toBe(
        "team.yaml is invalid: bots.0.wip Too big: expected int to be <=9007199254740991",
      );
    }
  });
});
