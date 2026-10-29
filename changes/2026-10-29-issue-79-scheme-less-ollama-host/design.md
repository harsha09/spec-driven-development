# Design

> **Issue 79 scheme-less Ollama host** · `2026-10-29-issue-79-scheme-less-ollama-host`

## Approach

Prefix `http://` inside `chatUrl` only. `decide.ts` already trims `base_url_env` and already treats a blank value, a missing fetch, and `called: false` as the ask path with no decision row. Those branches stay.

`chatUrl` trims its argument. An empty result stays empty, so the `new URL` call still fails and the function returns null. Any other value that does not start with `http:` or `https:` (either case) is prefixed with `http://`. The function then adds a trailing slash when one is missing and returns `new URL("api/chat", withSlash).toString()`. A throw still returns null.

`http:` and `https:` are the only schemes this function recognizes. A port colon, as in `127.0.0.1:11434` or `localhost:11434`, is not a scheme. `new URL("localhost:11434")` would treat `localhost` as a scheme, which is why the check is the `http:` / `https:` prefix and not "any token before a colon."

## Seams

| Piece | Change |
|---|---|
| `chatUrl` in `packages/core/src/role/models/ollama.ts` | Trim, then prefix `http://` when the value has no `http:` or `https:` start |
| `ollamaDecision` | Unchanged. A null URL returns `called: false` before fetch |
| `runOne` in `decide.ts` | Unchanged. Blank base and `called: false` ask the human and do not record a row |
| `routeRole` | Unchanged. The ask text stays `Ask the human.\nNo rule matched.` |
| `role-decide.test.ts` | Scheme-less hosts, an `https://` host, and the no-call path |

## Risks

A scheme-less host is always called over `http`, including a host the person meant to use with TLS. A value that still does not parse after the prefix stays `called: false`, which is the same text as a missing variable. A fetch that throws is a different path: `called: true`, a decision row, and one escalation. This change does not touch that path.
