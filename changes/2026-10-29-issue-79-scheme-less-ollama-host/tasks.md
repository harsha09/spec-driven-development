# Tasks

> **Issue 79 scheme-less Ollama host** · dev-lead proposal from the design seams. Not an acceptance.

1. Change only `chatUrl` in `packages/core/src/role/models/ollama.ts`. Trim the base. If it does not start with `http:` or `https:` (either case), prefix `http://`. An empty base stays empty. Then build `api/chat` as today: add a trailing slash when missing, and return `new URL("api/chat", withSlash).toString()`. Return `null` only when that construction still throws.
2. Do not change `decide.ts`, the fetch body, token counts, the secret scan, `matchRoute`, or the product-team entrypoint. An unset or blank `base_url_env` still asks the human, does not fetch, and writes no decision row.
3. Leave `http:` and `https:` bases unchanged, including a trailing slash. A value that is still not a URL after the prefix keeps today's no-call, no-row path.
4. Vitest check in `packages/core/src/__tests__/role-decide.test.ts`: scheme-less `127.0.0.1:11434` and `localhost:11434` are fetched as `http://127.0.0.1:11434/api/chat` and `http://localhost:11434/api/chat`; `http://` and `https://` are fetched unchanged; an unset or blank `OLLAMA_HOST` asks the human, does not fetch, and writes no decision row; a base that is still not a URL after the prefix does not fetch and writes no decision row.
