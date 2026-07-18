import { z } from "zod";

export const GateSchema = z.object({
  type: z.enum(["none", "soft", "hard"]).default("soft"),
  mode: z.enum(["none", "human_approval", "checklist"]).default("checklist"),
  checklist: z.array(z.string()).default([]),
  overridable: z.boolean().default(true),
});

export const ArtifactDefSchema = z.object({
  id: z.string(),
  path: z.string(),
  template: z.string().optional(),
  required: z.boolean().default(true),
});

export const VerifyCommandSchema = z.object({
  name: z.string(),
  run: z.string(),
  required: z.boolean().default(false),
});

export const StageSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  artifacts: z.array(ArtifactDefSchema).default([]),
  gate: GateSchema.default({}),
  skippable: z.boolean().default(true),
  skip_when: z
    .object({
      flags: z.array(z.string()).optional(),
    })
    .optional(),
  verify: z
    .object({
      commands: z.array(VerifyCommandSchema).default([]),
      evidence_dir: z.string().optional(),
    })
    .optional(),
  agent_context: z
    .object({
      include: z.array(z.string()).default([]),
      instructions: z.string().optional(),
    })
    .optional(),
});

export const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.number().default(1),
  stages: z.array(StageSchema).min(1),
  recommendation: z
    .object({
      when: z
        .object({
          labels: z.array(z.string()).optional(),
          keywords: z.array(z.string()).optional(),
          max_complexity: z.enum(["low", "medium", "high"]).optional(),
          min_complexity: z.enum(["low", "medium", "high"]).optional(),
        })
        .optional(),
      priority: z.number().default(0),
    })
    .optional(),
  on_complete: z
    .object({
      archive: z.boolean().default(true),
      domain_sync: z.enum(["never", "recommend", "require"]).default("never"),
    })
    .optional(),
});

export const ConfigSchema = z.object({
  version: z.number().default(1),
  memory_path: z.string().default("memory"),
  changes_path: z.string().default("changes"),
  archive_path: z.string().default("archive"),
  domains_path: z.string().default("domains"),
  default_workflow: z.string().default("recommend"),
  allowed_workflows: z.array(z.string()).optional(),
  per_change: z
    .object({
      allow_skip: z.boolean().default(true),
      allow_gate_override: z.enum(["true", "false", "soft_only"]).default("soft_only"),
      allow_custom_stages: z.boolean().default(true),
      require_reason_on_skip: z.boolean().default(true),
    })
    .default({}),
  persistence: z
    .object({
      default: z.enum(["change_only", "domain_sync"]).default("change_only"),
      archive_on_complete: z.boolean().default(true),
      domain_sync: z
        .object({
          mode: z.enum(["never", "recommend", "require"]).default("never"),
          anchored_domains: z.array(z.string()).default([]),
        })
        .default({}),
    })
    .default({}),
  policy: z
    .object({
      gates: z.enum(["soft", "hard"]).default("soft"),
    })
    .default({}),
});

export const ChangeMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  workflow: z.string(),
  created: z.string(),
  updated: z.string().optional(),
  status: z.enum(["in_progress", "blocked", "completed", "abandoned"]).default("in_progress"),
  stage: z.string(),
  branch: z.string().optional(),
  domain: z.string().optional(),
  flags: z.record(z.union([z.boolean(), z.string(), z.number()])).default({}),
  overrides: z
    .object({
      skip_stages: z.array(z.string()).default([]),
      gates: z.record(z.enum(["none", "soft", "hard"])).default({}),
      extra_stages: z.array(StageSchema).default([]),
    })
    .default({}),
  skipped: z
    .array(
      z.object({
        stage: z.string(),
        reason: z.string(),
        at: z.string(),
      }),
    )
    .default([]),
  gates: z
    .record(
      z.object({
        status: z.enum(["pending", "approved", "failed", "waived"]),
        note: z.string().optional(),
        at: z.string().optional(),
      }),
    )
    .default({}),
  /** Results from `sdd verify` keyed by stage id */
  verify_results: z
    .record(
      z.object({
        ok: z.boolean(),
        at: z.string(),
        results: z
          .array(
            z.object({
              name: z.string(),
              exitCode: z.number().nullable(),
            }),
          )
          .default([]),
      }),
    )
    .default({}),
  pr: z
    .object({
      number: z.number().optional(),
      url: z.string().optional(),
    })
    .optional(),
  completed_at: z.string().optional(),
});

export type Gate = z.infer<typeof GateSchema>;
export type ArtifactDef = z.infer<typeof ArtifactDefSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type ChangeMeta = z.infer<typeof ChangeMetaSchema>;
export type Complexity = "low" | "medium" | "high";
