# Local test plan

> **Issue 79 scheme-less Ollama host** · `2026-10-29-issue-79-scheme-less-ollama-host`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

QA proposes these checks. They are not a recorded QA result. The person has not signed them.

| # | Check | Expected |
|---|--------|----------|
| 1 | Nearby route with `OLLAMA_HOST` unset, blank (`   `), and `not a url` | Each prints `Ask the human.` and `No rule matched.`, does not call fetch, does not call strong, and writes no decision row. |
| 2 | `OLLAMA_HOST=127.0.0.1:11434` with a valid Ollama body | Fetch is `POST http://127.0.0.1:11434/api/chat`. The pick is kept (`role developer`). |
| 3 | `OLLAMA_HOST=localhost:11434` with a valid Ollama body | Fetch is `POST http://localhost:11434/api/chat`. The pick is kept (`role developer`). |
| 4 | `OLLAMA_HOST=http://127.0.0.1:9` and `OLLAMA_HOST=https://example.test:11434` | Schemes stay as written: `http://127.0.0.1:9/api/chat` and `https://example.test:11434/api/chat`. Neither is prefixed again. |
| 5 | Existing invalid body on `http://127.0.0.1:9` (`{"pick":"nope"}`) | Strong is called once. Then the same two lines: `Ask the human.` and `No rule matched.` |
| 6 | Vitest file `packages/core/src/__tests__/role-decide.test.ts` | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/role-decide.test.ts` exits 0. `EBADENGINE` for `engines.node >= 24` on Node v20.19.3 is expected. |
| 7 | Core `tsc --noEmit` | `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit` exits 0. The same `EBADENGINE` warning is expected. |
| 8 | `sdd verify` on this feature change | Runs `pnpm test` (Workspace tests) and exits 0. The same `EBADENGINE` warning is expected and is not a failure. |
