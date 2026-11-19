import "./zod-v3-messages.js";
import { z } from "zod";

/*
 * One schema per reply format a prompt asks for. The prompt text is generated from these, and
 * each parser is tested against them (see prompt-replies.test.ts), so a prompt cannot promise a
 * shape the parser refuses.
 */

export const ROOM_TYPES = ["post", "objection", "agree", "block", "decision"] as const;

/** The reply of a draft, critique, revision, or hand-off run (`parseReply` in role/run.ts). */
export const ModelReplySchema = z.object({
  text: z.string().describe("Your answer in plain words."),
  gaps: z
    .array(z.object({ cite: z.string(), text: z.string() }))
    .optional()
    .describe("Problems you found, one entry each, with the cite it belongs to."),
  changed: z
    .array(z.string())
    .optional()
    .describe("In a revision: the cite of every gap you fixed."),
  action: z
    .object({
      name: z.string().min(1),
      words: z.string().optional(),
      inputs: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .describe("A file write you want a person to approve. Only write_file is applied."),
});

export const MODEL_REPLY_EXAMPLE = {
  text: "The draft covers the add-item flow. One gap: no rule for empty titles.",
  gaps: [{ cite: "CHK-002", text: "An empty todo title has no stated outcome." }],
};

/** One room entry (`entryFromReply` in team/room.ts). */
export const RoomPostSchema = z.object({
  type: z.enum(ROOM_TYPES).describe("post, objection, agree, block, or decision."),
  text: z.string().describe("One line."),
  cite: z.string().optional().describe("What you point at. An objection needs one."),
});

export const ROOM_POST_EXAMPLE = {
  type: "objection",
  text: "The retry limit for a failed payment is missing.",
  cite: "CHK-004",
};

/** The reply of a guided stage draft (`parseGuideReply` in role/guide.ts). */
export const GuideReplySchema = z.object({
  text: z.string().describe('The whole draft, or "Question: ..." when one fact is missing.'),
  parts: z
    .array(z.object({ heading: z.string(), text: z.string() }))
    .optional()
    .describe("The draft split under the listed headings."),
});

export const GUIDE_REPLY_EXAMPLE = {
  text: "Draft for the todo list.",
  parts: [{ heading: "Goals", text: "People add, finish, and remove todo items." }],
};

const PlanLeafSchema = z.object({
  scope: z.string().describe("A service or module named in Inputs."),
  owner: z.string().describe("A role named in Inputs."),
  decision: z.string().describe("A decision named in Inputs. Use each decision once."),
  after: z.array(z.string()).describe("Decisions that must finish first. Use [] for none."),
  artifact: z.string().describe("A relative file path inside the project."),
  boundary: z.enum(["ask", "stop"]).describe("What the owner does at the edge of the artifact."),
});

/** The lead's plan (`parsePlan` in role/handoff.ts). A node has children one level deep. */
export const PlanReplySchema = z.object({
  text: z.string().describe("One sentence about the plan."),
  plan: z.array(PlanLeafSchema.extend({ children: z.array(PlanLeafSchema).optional() })),
});

export const PLAN_REPLY_EXAMPLE = {
  text: "The API change goes first, then the client.",
  plan: [
    {
      scope: "payments-api",
      owner: "developer",
      decision: "D1",
      after: [],
      artifact: "src/payments/refund.ts",
      boundary: "ask",
    },
  ],
};
