import "../zod-v3-messages.js";
import { z } from "zod";

const nameSchema = z.string().trim().min(1);

const botSchema = z.strictObject({
  name: nameSchema,
  role: nameSchema,
  wip: z.number().int().positive(),
});

const humanSchema = z.strictObject({
  name: nameSchema,
});

/** Project team file written to `.sdd/team.yaml`. */
export const TeamSchema = z
  .strictObject({
    template: nameSchema.optional(),
    branch: z.string().trim().min(1),
    rooms: z.strictObject({
      commit: z.boolean(),
    }),
    bots: z.array(botSchema).min(1),
    humans: z.array(humanSchema).default([]),
    role_wip: z.record(z.string().trim().min(1), z.number().int().positive()).optional(),
    limits: z
      .strictObject({
        loop_max_steps: z.number().int().positive().optional(),
        room_rounds: z.number().int().positive().optional(),
      })
      .refine((limits) => limits.loop_max_steps !== undefined || limits.room_rounds !== undefined, {
        error: "needs a limit",
      })
      .optional(),
  })
  .superRefine((team, ctx) => {
    if (!team.branch.includes("{bot}")) {
      ctx.addIssue({
        code: "custom",
        path: ["branch"],
        message: "must include {bot}",
      });
    }
    const names = new Set<string>();
    for (const [index, bot] of team.bots.entries()) {
      if (names.has(bot.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["bots", index, "name"],
          message: "bot name is repeated",
        });
      }
      names.add(bot.name);
    }
  });

export type TeamConfig = z.infer<typeof TeamSchema>;

export function formatTeamError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || "team";
  const message = issue?.message ?? "invalid";
  return `team.yaml is invalid: ${path} ${message}`;
}
