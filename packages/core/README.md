# `@structured-vibe-coding/core`

Core engine for **sdd** — local Spec-Driven Development.

Used by [`@structured-vibe-coding/cli`](https://www.npmjs.com/package/@structured-vibe-coding/cli).

## Install

```bash
npm install @structured-vibe-coding/core
```

## Architecture

```text
cli  →  core  →  fs / zod / yaml / MCP SDK / typescript
```

- **Public API:** only what is exported from `src/index.ts`.
- **Do not** import deep paths (`@structured-vibe-coding/core/src/...`) from apps.
- CLI owns UX (prompts, colors, agent launch). Core owns process state and pure logic.

## Public surface (stable intent)

| Area | Examples |
|------|----------|
| Lifecycle | `initProject`, `createChange`, `advanceStage`, `completeChange` |
| Gates | `canLeaveStage`, `approveGate` |
| Greenfield | `startGreenfield`, `startFeatureFromBacklog` |
| Code context | `generateCodeContext` |
| MCP *client* | `loadMcpConfig`, `addMcpSource`, `gatherMcpContext` |
| Errors | `SddError`, `isSddError` |

## Docs

- **Site:** https://harsha09.github.io/spec-driven-development/
- [MCP sources](https://harsha09.github.io/spec-driven-development/guides/mcp/)
- [Repository](https://github.com/harsha09/spec-driven-development)

## License

MIT
