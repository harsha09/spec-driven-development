import "./zod-v3-messages.js";
import { z } from "zod";
import type { ReplyExamples } from "./prompt.js";
import { type KindFamily, QUESTION_PREFIX, kindMessage } from "./reply-kind.js";

/*
 * One schema per reply format a prompt asks for. The prompt text is generated from these, and
 * each parser is tested against them (see prompt-replies.test.ts), so a prompt cannot promise a
 * shape the parser refuses.
 */

export const ROOM_TYPES = ["post", "objection", "agree", "block", "decision"] as const;

/** The kinds of a draft reply. `question` is offered only where the run can wait for an answer. */
export const DRAFT_KINDS = ["draft", "question"] as const;

/** An old draft reply has no kind: a text that starts with `Question:` is a question. */
export const DRAFT_FAMILY: KindFamily = {
  kinds: DRAFT_KINDS,
  infer: (reply) =>
    typeof reply.text === "string" && reply.text.trim().startsWith(QUESTION_PREFIX)
      ? "question"
      : "draft",
};

const ModelActionSchema = z.object({
  name: z.string().min(1),
  words: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

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
  action: ModelActionSchema.optional().describe(
    "A file write you want a person to approve. Only write_file is applied.",
  ),
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

/**
 * The reply of an author, hand-off receiver, or network owner run: `{text, action?}`. This is
 * what the parser accepts. It takes any non-empty action name, so a refused name still reaches
 * the runtime refusal (`rejected`, `unavailable`) and its log line. See `DraftContractSchema`.
 */
export const DraftReplySchema = z.object({
  kind: z.enum(DRAFT_KINDS, { error: kindMessage(DRAFT_KINDS) }),
  text: z.string().describe("Your answer in plain words."),
  action: ModelActionSchema.optional().describe("A file write you want a person to approve."),
});

/**
 * The same reply as the prompt shows it. The only action name offered is `write_file`. This
 * schema is for the prompt text only; the parser is `DraftReplySchema` (decision 2c). A prompt
 * that cannot wait for an answer offers only the kind `draft`.
 */
export function draftContractSchema(question: boolean) {
  const action = z
    .object({
      name: z.literal("write_file").describe("Only write_file is applied."),
      words: z.string().optional().describe("One line that says why you write the file."),
      inputs: z.object({
        path: z.string().describe("A relative file path inside the project."),
        contents: z.string().describe("The whole file."),
      }),
    })
    .optional()
    .describe("A file write you want a person to approve. At most one.");
  return z.object({
    kind: question
      ? z
          .enum(DRAFT_KINDS, { error: kindMessage(DRAFT_KINDS) })
          .describe('"draft" for your answer, "question" when one fact is missing.')
      : z.literal("draft"),
    text: z
      .string()
      .describe(question ? "Your answer, or your one question." : "Your answer in plain words."),
    action,
  });
}

export function draftExamples(question: boolean): ReplyExamples {
  return {
    valid: [
      {
        kind: "draft",
        text: "I added the retry note to the design.",
        action: {
          name: "write_file",
          words: "Save the retry note in the design file.",
          inputs: { path: "design.md", contents: "Retry up to 3 times, 2 seconds apart." },
        },
      },
      question
        ? { kind: "question", text: "How long should the client wait between retries?" }
        : { kind: "draft", text: "The section does not say how long to wait. Please say." },
    ],
    invalid: {
      value: { kind: "draft", text: "Merged it.", action: { name: "merge" } },
      why: "merge is not an allowed action. Only write_file is, and a bot cannot merge.",
    },
  };
}

type CiteIds = [string, ...string[]];

/** The reply of a critique (`critiquePrompt`). A gap may cite only an id the section allows. */
export function critiqueReplySchema(cites: CiteIds) {
  return z.object({
    kind: z.literal("critique"),
    text: z.string().describe('One short line: the verdict, such as "Two checks are not met."'),
    gaps: z
      .array(
        z.object({
          cite: z
            .enum(cites, { error: "must be one of the ids in Cite ids" })
            .describe("One id from Cite ids."),
          text: z.string().describe("What is missing, in one short sentence."),
        }),
      )
      .optional()
      .describe("Every gap, one entry each. An empty list means every check is met."),
  });
}

export function critiqueExamples(cites: CiteIds): ReplyExamples {
  const first = cites[0];
  return {
    valid: [
      {
        kind: "critique",
        text: "One check is not met.",
        gaps: [{ cite: first, text: "The draft does not say what this check needs." }],
      },
      { kind: "critique", text: "All checks are met.", gaps: [] },
    ],
    invalid: {
      value: {
        kind: "critique",
        text: "Looks good, but add logging.",
        gaps: [{ cite: "logging", text: "Add logging." }],
      },
      why: "logging is not one of the ids in Cite ids, and a style tip is not a gap.",
    },
  };
}

/**
 * The reply of a revision (`revisionPrompt`). `changed` and `open` together must list every gap
 * cite, each once; `runRole` checks that after the shape is read.
 */
export const RevisionReplySchema = z.object({
  kind: z.literal("revision"),
  text: z.string().describe("The full revised draft, not only the changed parts."),
  changed: z.array(z.string()).describe("The cite of every gap you fixed."),
  open: z
    .array(z.string())
    .optional()
    .describe("The cite of every gap you could not fix. Leave it out if you fixed them all."),
  action: ModelActionSchema.optional().describe(
    "A file write you want a person to approve. Only write_file is applied.",
  ),
});

export function revisionExamples(cites: string[]): ReplyExamples {
  const all = cites.length > 0 ? cites : ["CHK-001"];
  const [first, ...rest] = all;
  const valid: unknown[] = [
    { kind: "revision", text: "The full revised draft goes here.", changed: all },
  ];
  valid.push(
    rest.length > 0
      ? {
          kind: "revision",
          text: "The full revised draft goes here.",
          changed: [first],
          open: rest,
        }
      : {
          kind: "revision",
          text: "The draft, with the gap still open.",
          changed: [],
          open: [first],
        },
  );
  return {
    valid,
    invalid: {
      value: { kind: "revision", text: "The full revised draft goes here.", changed: [] },
      why: `changed and open together must list every gap cite (${all.join(", ")}). This reply lists none.`,
    },
  };
}

/**
 * What a model may send as a room entry. `decision` is left out: only a person records a decision.
 * `ROOM_TYPES` still has it, for people who post and for the entry classifier's options.
 */
export const MODEL_ROOM_TYPES = ["post", "objection", "agree", "block"] as const;

/** An old room entry named its kind `type`. */
export const ROOM_FAMILY: KindFamily = { kinds: MODEL_ROOM_TYPES, legacyKey: "type" };

/** One room entry from a model (`readRoomReply` in team/room.ts). */
export const RoomPostSchema = z
  .object({
    kind: z
      .enum(MODEL_ROOM_TYPES, {
        error: 'must be post, objection, agree or block. "decision" is for the person.',
      })
      .describe("post, objection, agree, or block."),
    text: z.string().describe("One line."),
    cite: z
      .string()
      .optional()
      .describe("What you point at. An objection needs one. An agree needs an evidence path."),
  })
  .refine((value) => value.kind !== "objection" || (value.cite ?? "").trim() !== "", {
    message: "an objection needs a cite",
    path: ["cite"],
  });

export const ROOM_POST_EXAMPLES: ReplyExamples = {
  valid: [
    {
      kind: "objection",
      text: "The draft does not say what happens when a card is declined.",
      cite: "declined-card-path",
    },
    {
      kind: "agree",
      text: "All checks are met.",
      cite: "changes/refund-retry/evidence/0a1b2c3.json",
    },
  ],
  invalid: {
    value: { kind: "objection", text: "Needs more detail." },
    why: "An objection has no cite. It also does not say what is missing.",
  },
};

/**
 * The reply of a guided stage draft (`readGuideReply` in role/guide.ts). When the artifact's
 * template has headings, a part may use only those headings. With none, the reply is
 * `{kind, text}`. A question is `{kind: "question", text}` and has no parts.
 */
export function guideReplySchema(headings: string[]) {
  const [first, ...rest] = headings;
  const kind = z
    .enum(DRAFT_KINDS, { error: kindMessage(DRAFT_KINDS) })
    .describe('"draft" for your draft, "question" when one fact is missing.');
  if (first === undefined) {
    return z.object({
      kind,
      text: z.string().describe("The whole draft, or your one question."),
    });
  }
  return z.object({
    kind,
    text: z.string().describe("A one-line summary, or your one question."),
    parts: z
      .array(
        z.object({
          heading: z
            .enum([first, ...rest], { error: "must be one of the headings in Headings" })
            .describe("One heading from Headings, spelled exactly."),
          text: z.string().describe("The words for this heading."),
        }),
      )
      .optional()
      .describe("The draft, one entry per heading. Leave it out when you ask a question."),
  });
}

export function guideExamples(headings: string[]): ReplyExamples {
  const question = { kind: "question", text: "Should the link expire?" };
  if (headings.length === 0) {
    return {
      valid: [
        { kind: "draft", text: "Share a todo list with a link. View only. No comments." },
        question,
      ],
      invalid: {
        value: { kind: "draft", text: ["Share a todo list with a link."] },
        why: "text must be one string, not a list.",
      },
    };
  }
  const unknown =
    ["Overview", "Notes", "Extra"].find((name) => !headings.includes(name)) ?? "Other";
  return {
    valid: [
      {
        kind: "draft",
        text: "Share a todo list with a link.",
        parts: headings.map((heading) => ({ heading, text: "The words for this heading." })),
      },
      question,
    ],
    invalid: {
      value: {
        kind: "draft",
        text: "Share a todo list with a link.",
        parts: [{ heading: unknown, text: "The words for this heading." }],
      },
      why: `${unknown} is not one of the headings. Use only ${headings.join(", ")}.`,
    },
  };
}

const PlanLeafSchema = z.object({
  scope: z.string().describe("A service or module named in Inputs."),
  owner: z.string().describe("A role named in Inputs."),
  decision: z.string().describe("A decision named in Inputs. Use each decision once."),
  after: z.array(z.string()).describe("Decisions that must finish first. Use [] for none."),
  artifact: z.string().describe("A relative file path inside the project."),
  boundary: z
    .enum(["ask", "stop"])
    .describe(
      'At the edge of the artifact: "ask" asks the person one question and waits; "stop" stops and says what change is needed and where.',
    ),
});

/** The lead's plan (`parsePlan` in role/handoff.ts). A node has children one level deep. */
export const PlanReplySchema = z.object({
  kind: z.literal("plan_tree"),
  text: z.string().describe("One sentence about the plan."),
  plan: z.array(PlanLeafSchema.extend({ children: z.array(PlanLeafSchema).optional() })),
});

export const PLAN_REPLY_EXAMPLES: ReplyExamples = {
  valid: [
    {
      kind: "plan_tree",
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
    value: {
      kind: "plan_tree",
      text: "Plan ready.",
      plan: [{ scope: "orders-api", boundary: "maybe" }],
    },
    why: "boundary must be ask or stop, and owner, decision, after and artifact are missing.",
  },
};

/** An old critique, revision, or plan reply has no kind. The call says which one it is. */
export const CRITIQUE_FAMILY: KindFamily = { kinds: ["critique"], infer: () => "critique" };
export const REVISION_FAMILY: KindFamily = { kinds: ["revision"], infer: () => "revision" };
export const PLAN_FAMILY: KindFamily = { kinds: ["plan_tree"], infer: () => "plan_tree" };
/** A guide reply is a draft or a question, like any draft reply. */
export const GUIDE_FAMILY: KindFamily = DRAFT_FAMILY;
