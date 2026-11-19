import "./zod-v3-messages.js";
import { z } from "zod";
import type { ReplyExamples } from "./prompt.js";

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

export const MODEL_REPLY_EXAMPLES: ReplyExamples = {
  valid: [
    {
      text: "The draft covers the add-item flow. One gap: no rule for empty titles.",
      gaps: [
        { cite: "CHK-002", text: "The text 'a todo has a title' has no rule for an empty title." },
      ],
    },
  ],
  invalid: { value: { gaps: "none" }, why: "text is missing, and gaps must be a list." },
};

/** One room entry (`entryFromReply` in team/room.ts). */
export const RoomPostSchema = z.object({
  type: z.enum(ROOM_TYPES).describe("post, objection, agree, block, or decision."),
  text: z.string().describe("One line."),
  cite: z.string().optional().describe("What you point at. An objection needs one."),
});

export const ROOM_POST_EXAMPLES: ReplyExamples = {
  valid: [
    {
      type: "objection",
      text: "CHK-004: the retry limit for a failed payment is missing.",
      cite: "CHK-004",
    },
  ],
  invalid: {
    value: { type: "shrug", text: "Not sure." },
    why: "type must be post, objection, agree, block or decision.",
  },
};

/** The reply of a guided stage draft (`parseGuideReply` in role/guide.ts). */
export const GuideReplySchema = z.object({
  text: z.string().describe('The whole draft, or "Question: ..." when one fact is missing.'),
  parts: z
    .array(z.object({ heading: z.string(), text: z.string() }))
    .optional()
    .describe("The draft split under the listed headings."),
});

export const GUIDE_REPLY_EXAMPLES: ReplyExamples = {
  valid: [
    {
      text: "Draft for the todo list.",
      parts: [{ heading: "Goals", text: "People add, finish, and remove todo items." }],
    },
  ],
  invalid: {
    value: { text: "Draft for the todo list.", parts: "Goals" },
    why: "parts must be a list of {heading, text} objects.",
  },
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

export const PLAN_REPLY_EXAMPLES: ReplyExamples = {
  valid: [
    {
      text: "The API change goes first, then the docs.",
      plan: [
        {
          scope: "orders-api",
          owner: "developer",
          decision: "add-limit",
          after: [],
          artifact: "changes/add-limit/api-notes.md",
          boundary: "ask",
        },
      ],
    },
  ],
  invalid: {
    value: { text: "Plan ready.", plan: [{ scope: "orders-api", boundary: "maybe" }] },
    why: "boundary must be ask or stop, and owner, decision, after and artifact are missing.",
  },
};
