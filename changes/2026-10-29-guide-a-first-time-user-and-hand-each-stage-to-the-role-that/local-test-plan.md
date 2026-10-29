# Local test plan

Run the guide tests in `packages/core`:

```bash
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/role-guide.test.ts
```

The workspace verify command is `pnpm test`.

Checks:

- `sdd setup` creates planner, architect, and builder for the feature stages and does not replace an existing role file.
- `sdd go` asks "Who is this for?" before a model call, then hands intent to the architect.
- A model line that starts with `Question:` stays on the same stage.
- A human gate stops with no review file.
- A planner cannot write `src/app.ts`. A builder can. A `.env` write is refused.
- Answering the three questions reaches the end of the feature workflow. The person has not signed the change.

This plan is a proposal. The person has not recorded the result.
