# Feature

> **Issue 79 scheme-less Ollama host** · `2026-10-29-issue-79-scheme-less-ollama-host` · 2026-10-29

## Reading

A person who set `OLLAMA_HOST` to a host and port with no scheme, such as `127.0.0.1:11434`, gets `POST http://127.0.0.1:11434/api/chat`. The same prefix applies to `localhost:11434`. A value that already starts with `http:` or `https:` is left as written, in either case. A missing variable, a blank variable, and a value that is still not a URL after that prefix stay on today's path: `sdd role route` prints `Ask the human.` and `No rule matched.`, does not call fetch, and writes no decision row.

## Source

Issue #79, as filed. The research assistant checked `chatUrl`, `decide`, and the Ollama route test. The product manager proposes this reading. The product owner and the architect reviewed the same brief. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue offers two outcomes and asks that a missing variable stay on the ask path. This change is the prefix. One product.

Proposed checks, not a recorded decision:

- An unset `OLLAMA_HOST` prints `Ask the human.` and `No rule matched.`, does not call fetch, and writes no decision row.
- `127.0.0.1:11434` is fetched as `http://127.0.0.1:11434/api/chat`. `localhost:11434` is fetched as `http://localhost:11434/api/chat`.
- `http://127.0.0.1:11434` and `https://example.test:11434` are fetched with that scheme unchanged.
- A value that is still not a URL after the prefix does not call fetch and writes no decision row.
- A valid Ollama body on the scheme-less host still keeps the pick. An invalid body on an `http://` host still calls the strong model once, then prints the same two lines.

## Non-goals

- No distinct error when the variable is set and is not a URL.
- No default host and no default port.
- This change does not start the `ollama run` launcher.
- Issue #78 (long model names rejected as secrets), `matchRoute`, model precedence, and the product-team entrypoint stay as they are.
