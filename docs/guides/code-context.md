# Code context (AST slices)

> Structure-aware TypeScript and JavaScript slices for agents — symbols and imports, not whole-repo dumps.

Agents either get huge noisy context or miss the right function. `sdd context` builds ranked slices with a local TypeScript AST so prompts stay small, focus stays clear, and secret paths stay out.

## When to use it

During implement or review of product code — optionally before you hand work to the agent.

## Commands

```bash
# Symbol-focused
sdd context --path packages/core/src/agent-handoff.ts --symbol buildAgentPrompt --stdout

# Write into active change pack
sdd context --path src/app.ts --symbol main --out change
# → changes/<id>/code-context.md

# JSON summary
sdd context -p src/foo.ts -s bar --json
```

Prefer slices over pasting the monorepo. Caps (files, lines, tokens) keep agent context bounded.

Handoff on implement / local_verify **points** at `sdd context`; it does **not** auto-run the pipeline on every status. Regenerate with `--out change` when code moves.

## Related

- [CLI flags](../reference/cli)  
- [Refine specs first](./refine) if the task list is still fuzzy  
