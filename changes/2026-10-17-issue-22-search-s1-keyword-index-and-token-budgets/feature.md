# Feature

> **Issue #22: search S1 keyword index and token budgets** · `2026-10-17-issue-22-search-s1-keyword-index-and-token-budgets` · 2026-10-17

## Problem / opportunity

`sdd context` is TypeScript-only, ranks by keywords in the current process, and estimates tokens as `chars / 4`. When the markdown exceeds the cap, `packages/core/src/code-context/formatter.ts` slices the string (`markdown.slice`), which can cut a function in half. Agents then see a broken body and no ranked Rust, Python, spec, or memory hits.

Epic #21 wants small, ranked, local context under a hard token budget. This change is phase S1 only (#22). S0 (#26) already shipped `sdd report`, `sdd cost`, and the handoff code-point estimate. S1 adds the keyword index, the real tokenizer used for budgets, and packing that never cuts a chunk.

## Users & value

- A developer or coding agent runs `sdd search` and gets ranked code, spec, or memory hits without launching an agent and without a network call.
- `sdd context` and the handoff's retrieved section stay inside a real token budget. The top hit is the whole symbol. A hit that does not fit is a one-line signature, not a chopped function.
- A project can exclude private paths. Those bytes are not stored in the index and are not packed into context or handoff.

## Scope

- `SearchProvider` in `packages/core/src/search/`: `index(changed)`, `search(query, {scope: code|specs|memory, k, budget})`, `stats()`.
- Config file `.sdd/search.yaml`. The built-in provider is the default. A missing or broken plug-in name falls back to built-in and does not fail the stage or the command.
- Built-in keyword index: SQLite FTS5 + BM25 in git-ignored `.sdd/index.db`. No model download. Keyword search works offline.
- Chunk code per symbol with `web-tree-sitter` WASM for TypeScript/JavaScript, Rust, and Python. Chunk specs, memory, and change packs by Markdown heading.
- Tokenizer: `gpt-tokenizer` encoding `cl100k_base` (bundled, no download). It replaces `chars / 4` for search, context packing, and the handoff retrieved section. It does not replace the #26 report estimate.
- Per-stage budgets in `search.yaml`, plus `--budget N` on `sdd context`, `sdd search`, and `sdd agent` (the handoff writer).
- Greedy pack by rank. Top hits go in whole. A hit that does not fit is a signature. Nothing is cut mid-function or mid-chunk.
- CLI: `sdd search "<query>" --scope code|specs|memory --budget N`. It must not launch an agent and must not write `.sdd/handoff.md`.
- Exclusions, applied to indexing and again when packing: `.gitignore` (root and nested), root `.sddignore`, the existing secrets filter, `isIgnoredPath`, everything under `.sdd/`, and `exclude:` globs in `search.yaml`.
- Same index and same question produce byte-identical search stdout.
- Changing one file reindexes only that file (content-hash rule below). A full directory walk may still run to discover changes. Embeddings and commit-based incremental reindex stay in #23.

### Per-file reindex (not deferred)

S1 reindexes per file. This is not deferred to #23.

- Each indexed file stores `sha256` of its raw bytes.
- `index()` with no path list walks eligible files, rewrites only files whose hash changed, adds new files, and deletes rows for files that are gone or now excluded.
- `index(["src/budget.ts"])` rehashes and rewrites only that path (or deletes it if it is gone or excluded). Other rows stay byte-for-byte, even if those files changed on disk.
- #23 still owns sqlite-vec, embeddings, hybrid RRF, and reindex-since-commit. S1 does not implement those.

### AstroApp measurement

The epic's AstroApp before/after token counts and hit rate cannot be run on this machine. AstroApp is not available here. This change does not invent those numbers. Acceptance is the committed fixture corpus in the local test plan: known files, known questions, and expected symbols, text, and token counts.

## Non-goals

- #23 S2: sqlite-vec, embeddings, hybrid RRF, incremental reindex by git commit.
- #24 S3: tiered spec summaries, stable-prefix handoff, result cache.
- #25 S4: external MCP search adapters and the docs language matrix. S1 only reserves the provider interface and the fallback. It does not load a third-party search module.
- Reimplementing `sdd cost` or `sdd report`. Do not change the handoff code-point estimate (`Math.floor(codePoints / 4)`, fixture `"abcd😀"` → 1).
- Hosted vector databases, required network calls, model downloads, and an inbound sdd MCP server.
- Cutting or rewriting the process half of `.sdd/handoff.md` (change title, stage, artifact list, protocol instructions). The budget applies to the new retrieved section only. Shrinking that prefix is #24.
- `node:sqlite`. Tests run on Node 20.19.3. `node:sqlite` is not available there. Do not call it.
- A second chunker. Tree-sitter is the chunker for the index and for `sdd context`. The existing TypeScript compiler adapter stays for its unit tests. Injected `deps.adapters` is not consulted when building the index or context slices.

## Success criteria

- [ ] `sdd search "function" --scope code --budget 120` on the fixture corpus prints the pinned stdout in the local test plan (108 cl100k tokens, both hits full) and does not launch an agent.
- [ ] `--budget 105` prints the pinned stdout (102 tokens): `alphaWidget` full, `betaWidget` signature, and the string `return x.trim()` absent.
- [ ] `--budget 30` prints the 20-token header only. `--budget 19` prints zero bytes. Every search stdout satisfies `countTokens(stdout) <= budget`.
- [ ] The same index and question produce byte-identical stdout across two runs.
- [ ] After a full index, editing one file and calling `index()` rewrites only that file. `index(["src/budget.ts"])` does not rewrite `src/other.ts` even if `src/other.ts` changed on disk.
- [ ] `.env` text `fake-secret-s1-do-not-index` is not a search hit and is not a byte sequence in `.sdd/index.db`.
- [ ] `review-private/birth.jhd` text `FAKE_BIRTH_RECORD_S1` never appears in search stdout, context markdown, handoff, or `.sdd/index.db`.
- [ ] `provider: does-not-exist` prints `Search provider "does-not-exist" is unavailable. Using built-in keyword search.` on stderr, exits 0, and stdout is the built-in result.
- [ ] Fresh `sdd init` writes `.sdd/.gitignore` lines that ignore `index.db` and its journal/WAL sidecars, and writes `.sdd/search.yaml` only when missing, with no `sdd:generated` marker.
- [ ] Search stdout and context markdown contain repo-relative paths only. They do not contain the absolute project root.
- [ ] Keyword search does not open a network socket and does not download a model. Grammars and the tokenizer are files already on disk.
- [ ] `sdd report` / `sdd cost` still estimate an unmeasured handoff as code points / 4. This change does not edit that formula.

## Risks / open questions

Decisions that would otherwise be product questions are locked in `design.md`. No open product question remains for S1.

- AstroApp numbers are explicitly out of this change. Do not block S1 on them.
- `better-sqlite3` is a native module. Pin `12.8.0`, which ships Node 20 prebuilds and compiles FTS5 in. Do not switch to `node:sqlite` to avoid the native module.
- Grammar WASM files are vendored from the MIT grammar packages named in `design.md`. Do not npm-install those packages. Their `install` scripts build native addons this phase never calls.
- Context and handoff frames stay outside the numeric budget. `sdd search` stdout, including its short header, is inside the budget. That split is intentional and tested.
