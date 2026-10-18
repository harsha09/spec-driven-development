# Design

> **Issue #22: search S1 keyword index and token budgets** · `2026-10-17-issue-22-search-s1-keyword-index-and-token-budgets`

## Approach

Add a local keyword index and a packer. `sdd search` reads the index and prints packed hits. `sdd context` uses the same index and packer for its slice section. `sdd agent` appends a packed retrieved section to the existing handoff. The process half of the handoff is not trimmed.

Do not edit the #26 estimate in `packages/core/src/report.ts`. Token budgets here use `gpt-tokenizer` `cl100k_base`. The report still uses Unicode code points / 4.

Node on the test machine is v20.19.3. Package `engines` say `>=24`, but tests run on Node 20. Do not call `node:sqlite`, `Promise.withResolvers`, or any other API that is absent on Node 20. Do not add a polynomial regex (CodeQL `js/polynomial-redos`). Strip trailing slashes with a loop, the same way `stripTrailingSlashes` does in `packages/core/src/paths.ts`.

### Licenses

Checked against npm `license` metadata and the upstream `LICENSE` file. None of the chosen packages is AGPL. `js-tiktoken` is also MIT and was not chosen: its lite build can load ranks from a CDN, and S1 must not fetch. `gpt-tokenizer@4.0.3` has no runtime dependencies and bundles `cl100k_base`.

| Piece | What is shipped | SPDX | Evidence |
|-------|-----------------|------|----------|
| Tokenizer | npm `gpt-tokenizer@4.0.3` | `MIT` | npm `license` field `MIT`. Upstream `LICENSE` is the MIT license, copyright 2023–2024 Bazyli Brzoska. Encoding data is in the package (`gpt-tokenizer/encoding/cl100k_base`). |
| Tokenizer ranks' origin | port of OpenAI tiktoken, bundled inside gpt-tokenizer | `MIT` | `https://github.com/openai/tiktoken` `LICENSE` is MIT, copyright 2022 OpenAI, Shantanu Jain. No separate vocabulary download. |
| SQLite binding | npm `better-sqlite3@12.8.0` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2017 Joshua Wise. `engines.node` includes `20.x`. |
| SQLite and FTS5 | amalgamation compiled into that binding | `blessing` | `https://sqlite.org/copyright.html` dedicates the deliverable code to the public domain (the SQLite Blessing). SPDX id for that dedication is `blessing`. FTS5 is not a separate product. `deps/defines.gypi` in better-sqlite3 lists `SQLITE_ENABLE_FTS5`. Verified on 12.8.0: `sqlite_compileoption_used('ENABLE_FTS5')` is 1. |
| Tree-sitter runtime | npm `web-tree-sitter@0.27.1` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2018 Max Brunsfeld. |
| JavaScript grammar WASM | vendored from `tree-sitter-javascript@0.25.0` file `tree-sitter-javascript.wasm` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2014 Max Brunsfeld. |
| Python grammar WASM | vendored from `tree-sitter-python@0.25.0` file `tree-sitter-python.wasm` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2016 Max Brunsfeld. |
| Rust grammar WASM | vendored from `tree-sitter-rust@0.24.0` file `tree-sitter-rust.wasm` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2017 Maxim Sokolov. |
| TypeScript and TSX grammar WASM | vendored from `tree-sitter-typescript@0.23.2` files `tree-sitter-typescript.wasm` and `tree-sitter-tsx.wasm` | `MIT` | npm `license` `MIT`. Upstream `LICENSE` is MIT, copyright 2017 Max Brunsfeld. |
| Gitignore matcher | npm `ignore@7.0.12` | `MIT` | npm `license` `MIT`. Upstream `LICENSE-MIT` is the MIT license, copyright 2013 Kael Zhang. |

These four WASM files load under `web-tree-sitter@0.27.1` on Node 20 (`Language.load` succeeded for all five files, including TSX). Vendor those bytes. Do not add the grammar npm packages as dependencies. Their `install` scripts run `node-gyp-build`. Write `packages/core/vendor/tree-sitter/NOTICE` as plain text, one block per file: package name, exact version, SPDX `MIT`, and the upstream git URL. No other license is added.

### Dependencies

Add only these runtime dependencies to `packages/core/package.json`:

- `better-sqlite3` at `12.8.0`
- `gpt-tokenizer` at `4.0.3`
- `web-tree-sitter` at `0.27.1`
- `ignore` at `7.0.12`

`packages/core/tsup.config.ts` `external` must include all four names so the native addon and the WASM runtime are loaded from `node_modules` at runtime, not inlined into `dist/index.js`. pnpm 9 runs dependency install scripts. Do not set `ignore-scripts`. better-sqlite3 needs its prebuild install. If a later pnpm blocks the script, allow `better-sqlite3` in the approved-builds list. Do not replace it with `node:sqlite`.

Import the tokenizer only as:

```ts
import { encode } from "gpt-tokenizer/encoding/cl100k_base";
```

`countTokens(text)` is `encode(text).length`. `encode("hello world").length` is `2`. Do not call the package root `encode` (that path is not pinned to cl100k).

Import SQLite as `import Database from "better-sqlite3"`. Open `.sdd/index.db` and run `PRAGMA journal_mode = DELETE` so a normal run does not create a WAL. Still gitignore the sidecars in case a crash leaves them.

### Config file

Ship `packages/core/defaults/search.yaml`. `defaultSearchYamlPath()` sits next to `defaultMcpYamlPath()` in `packages/core/src/defaults.ts`. Init copies it with `writeTextIfMissing`, on first init and on `--force`, same as `.sdd/mcp.yaml` and `.sdd/prices.yaml`. Destination is `.sdd/search.yaml` under `sddRoot`, not under a `--root` memory or changes directory. No `sdd:generated` marker. Do not record it in `.sdd/.generated.json`. A user edit is kept byte for byte. Deleting the file and running `sdd init --force` writes the shipped body again.

Exact shipped body:

```yaml
# Operator-owned search config. sdd does not refresh this file.
# Keyword index only. Embeddings are a later phase.
version: 1
provider: builtin
k: 20
budgets:
  default: 12000
  intent: 4000
  clarify_intent: 4000
  brainstorm: 4000
  design: 8000
  clarify_design: 8000
  tasks: 8000
  clarify_tasks: 8000
  implement: 12000
  local_verify: 8000
exclude: []
```

Schema, parsed with the existing `yaml` package and zod. A missing file uses this schema's defaults and does not throw. A present file that fails the schema throws `search.yaml is invalid` with no parser text and no absolute path. CLI exit 1. Do not fall back to built-in on a schema failure. A broken provider name is not a schema failure.

- `version`: literal `1`.
- `provider`: non-empty string, default `builtin`.
- `k`: integer from 1 through 100, default `20`.
- `budgets.default`: integer `>= 1`, default `12000`. Any other key is an integer `>= 1`. Omitted stage keys use `budgets.default` at read time. The shipped file lists the feature-workflow stage ids above. A hotfix stage id that is not listed uses `default`.
- `exclude`: array of non-empty strings, default `[]`. Gitignore syntax, root-relative. The shipped file does not exclude `*.jhd`. That pattern is project configuration, used by the fixture.

`search.yaml` `exclude` cannot re-include a secret, an `isIgnoredPath` hit, a `.gitignore` hit, or a `.sddignore` hit. Negation (`!`) works only inside the file that wrote the pattern.

### Provider

```ts
type SearchScope = "code" | "specs" | "memory";

interface SearchQuery {
  scope: SearchScope;
  k: number;
  budget: number;
}

interface SearchHit {
  scope: SearchScope;
  path: string; // repo-relative, forward slashes, no leading slash
  startLine: number;
  endLine: number;
  symbol: string;
  /** Raw SQLite bm25(). More negative is a better match. */
  score: number;
  form: "full" | "signature";
  text: string; // rendered block for this hit
}

interface SearchResult {
  provider: "builtin";
  warning?: string;
  query: string;
  scope: SearchScope;
  budget: number;
  usedTokens: number;
  hits: SearchHit[];
  text: string;
}

interface IndexStats {
  provider: "builtin";
  files: number;
  chunks: number;
  lastIndexFilesConsidered: number;
  lastIndexFilesReindexed: number;
}

interface SearchProvider {
  readonly id: string;
  index(changed?: readonly string[]): Promise<IndexStats>;
  search(query: string, options: SearchQuery): Promise<SearchResult>;
  stats(): Promise<IndexStats>;
}
```

`resolveSearchProvider(config, registry)`:

- `provider` omitted or `builtin` returns the built-in provider. `SearchResult.provider` is always `"builtin"` after fallback, so stdout does not change.
- Any other id is looked up in an in-process `Map`. The CLI registry contains only `builtin`.
- A missing id, or a provider whose `index` or `search` throws, is caught. Retry once with built-in. The warning string is exactly `Search provider "<name>" is unavailable. Using built-in keyword search.`
- Core returns the warning on the result. It does not print. The CLI writes that sentence to stderr with `consola.warn` and still exits 0 when built-in search succeeds.
- If built-in also throws, search CLI exits 1 with the built-in error message and no absolute path. Handoff does not exit 1 for that. It appends `Retrieved context skipped: <message>.` and writes the rest of the handoff. `<message>` is the warning sentence when fallback failed, or `search.yaml is invalid` when the file is invalid. No absolute path.

Export `registerSearchProvider` for tests. A test registers `broken` whose `search` throws, sets `provider: broken`, and expects the warning plus a built-in hit. The CLI test does not use the seam. It sets `provider: does-not-exist`.

S1 does not dynamic-import a package from the provider string. That is #25.

### Index schema

Database file: `.sdd/index.db`. Create the parent `.sdd` directory if needed. Enable foreign keys.

```sql
PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('code', 'specs', 'memory')),
  language TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  symbol,
  body,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS chunks_fts_map (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  fts_rowid INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Do not use FTS5 `content=` external-content mode and do not use a contentless table. `chunks.body` stores the plain chunk text so a test can read the db file and see that an excluded string is absent. The FTS table is only a search key. Keep it in sync in the same transaction as `chunks`.

`content_hash` is hex sha256 of the raw file bytes (`node:crypto`), not of newline-normalized text.

`meta` keys `last_files_considered` and `last_files_reindexed` are decimal integers written at the end of `index()`. `stats()` reads them. They are not printed by `sdd search`.

### What gets indexed

Repo-relative posix paths. Refuse an absolute `changed` entry with `Index path must be project-relative.` and do not echo the absolute path.

| Scope | Files |
|-------|--------|
| `code` | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.rs` |
| `specs` | `.md` under `config.changes_path`, under `config.archive_path`, and under `docs/` |
| `memory` | `.md` under `config.memory_path` |

A markdown file is never `code`. Root `README.md` is not indexed. `.sdd/**` is not indexed. YAML and JSON are not indexed. A `.go` file is not indexed. `sdd context` reports gap `unsupported_language` for a requested `.go` path and does not report that gap for `.py` or `.rs`.

### Exclusions

A path is excluded if any rule hits. Hard denies run first and cannot be re-included:

1. `isSecretPath` (`packages/core/src/code-context/secrets.ts`): `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `credentials`, `secret`, and `.git`.
2. `isIgnoredPath` (`packages/core/src/code-context/ignore.ts`): `node_modules`, `dist`, `coverage`, binaries, lockfiles, and the rest of that list.
3. Any path whose first segment is `.sdd` or `.git`.

Then three separate `ignore` instances, each built from one source. A path is excluded if any instance ignores it. Do not merge them into one instance.

- Root `.gitignore`, then every nested `.gitignore` whose own path is not already excluded. Walk directories in sorted path order.
- Root `.sddignore` only. No nested `.sddignore`. A missing file adds no rules. Init does not create `.sddignore`.
- `search.yaml` `exclude`, added last, still unable to re-include a hard deny or a gitignore hit.

Nested `.gitignore` prefix, with no regex. `dir` is the repo-relative directory of that file (`""` at the root). For a non-root file, rewrite each logical line:

- Keep a blank line and a line whose first non-space character is `#`.
- After optional leading spaces or tabs and one optional `!`, look at the pattern.
- If the pattern has no `/`, emit both `dir/<pattern>` and `dir/**/<pattern>` (keep the `!` on both when the line was negated).
- If the pattern has a `/`, drop one leading `/` when present, then emit `dir/<pattern>`.

Root `.gitignore` lines are passed through unchanged. This is the S1 gitignore behavior. The exclude predicate, tested directly, locks it: root pattern `skip-me.ts` excludes `skip-me.ts` and `src/skip-me.ts`; `packages/secret-nest/.gitignore` containing `*.jhd` excludes `packages/secret-nest/note.jhd` and does not exclude `other/note.jhd`. A second nested file `hidden.ts` (one pattern, one line) excludes `packages/secret-nest/hidden.ts` from the index. `packages/secret-nest/shown.ts` is not matched by that pattern and is indexed. `.jhd` files are not code or markdown, so the `*.jhd` check is on the predicate, not on a search hit.

### Chunking code

Load WASM from `packages/core/vendor/tree-sitter/` using the same candidate walk as `defaultsRoot()`: from `dist/index.js` the folder is `../vendor/tree-sitter`; from a source test file it is `../../vendor/tree-sitter` relative to `src/search/`. `Parser.init` receives `locateFile` that returns the absolute path of `web-tree-sitter/web-tree-sitter.wasm` inside that package (`createRequire` from `import.meta.url`). Call `Parser.init` once per process.

Grammar file by extension:

| Extensions | WASM file |
|------------|-----------|
| `.js`, `.mjs`, `.cjs`, `.jsx` | `tree-sitter-javascript.wasm` |
| `.ts`, `.mts`, `.cts` | `tree-sitter-typescript.wasm` |
| `.tsx` | `tree-sitter-tsx.wasm` |
| `.py` | `tree-sitter-python.wasm` |
| `.rs` | `tree-sitter-rust.wasm` |

Parse failure, or a file that contains a NUL byte: do not fail `index()`. Delete any previous rows for that path and store no chunk. Context adds gap `parse_error` for a requested path that produced no chunk.

Emit a chunk for each matching node. If the node's parent is `export_statement`, the span is the parent (so the `export` keyword is included). If the node's parent is `decorated_definition`, the span is the parent. Node types:

- TypeScript and JavaScript: `function_declaration`, `generator_function_declaration`, `class_declaration`, `method_definition`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`. Also `lexical_declaration` and `variable_declaration` when a descendant type is `arrow_function`, `function`, or `function_expression`. Do not also emit that inner function node.
- Python: `function_definition`, `class_definition`.
- Rust: `function_item`, `struct_item`, `enum_item`, `trait_item`, `impl_item`. Also `mod_item` only when it has a child `declaration_list` (inline module). Skip `mod name;` declarations.

A class and its methods are both chunks. The class body includes the methods. Packing drops a later hit whose line range is fully inside an already packed full hit.

Symbol name is the text of the first child whose type is `identifier`, `property_identifier`, or `type_identifier`. A method or a function nested in a named class is `ClassName.method` (`AlphaService.run`). An unnamed node is `(anonymous)`. An `impl_item` with no name is `(impl)`.

Signature is the first physical line of the chunk with the trailing newline removed. It is not a shortened copy of the body. The full body is the exact source from `startLine` through `endLine` inclusive, joined with `\n`. Line endings in the stored body are `\n`. The hash still uses raw bytes.

A file with no symbol nodes and no NUL is one chunk: symbol `(file)`, the whole file, signature the first non-empty line or `(file)` when the file is empty of non-whitespace. An empty file stores no row.

Language column: `ts`, `tsx`, `js`, `py`, `rs`, or `md`.

### Chunking Markdown

Do not use tree-sitter for Markdown. Normalize newlines with `replaceAll`, not a regex. If the text ends with `\n`, drop that one character before splitting on `\n`, using `endsWith` and `slice`. Heading and fence detection is a character loop:

- A fence opener is a line with at most three leading spaces, then a run of three or more `` ` `` or `~`, then an optional info string. Remember the character and the run length.
- A closer is a line with at most three leading spaces, then the same character with a run at least that long, then only spaces. Lines inside a fence are not headings.
- A heading is a line outside a fence whose first non-space run is 1 to 6 `#` characters and the next character is a space. Setext headings (`===`, `---`) are not headings in S1. They stay in the previous chunk.

A chunk starts at a heading line and ends on the line before the next heading of any level. The symbol is the heading text after the hashes and the one required space, trimmed of trailing spaces with a loop. The signature is the heading line. Text before the first heading is a chunk only when it contains a non-whitespace character. Its symbol and signature are `(preamble)`.

`changes/demo/feature.md` in the fixture (trailing newline stripped before the split) yields:

| Lines | Symbol |
|-------|--------|
| 1–4 | `Demo` |
| 5–8 | `Alpha section` |
| 9–11 | `Other` |

`memory/product.md` yields `Product` on lines 1–2 and `Memory alpha` on lines 3–5.

### Query and rank

Turn the raw query into FTS5 tokens with a loop, not a regex. A token character is `0-9`, `A-Z`, `a-z`, `_`, or a code point above 127. Any other character separates tokens. Drop empty tokens. If none remain, search returns zero hits and does not call `MATCH`. Otherwise `MATCH` the tokens joined by ` OR `. `function` is a legal token. Do not pass quotes, `*`, or parentheses through.

```sql
SELECT c.id, c.path, c.scope, c.symbol, c.start_line, c.end_line,
       c.signature, c.body, bm25(chunks_fts) AS score
FROM chunks_fts
JOIN chunks_fts_map AS m ON m.fts_rowid = chunks_fts.rowid
JOIN chunks AS c ON c.id = m.chunk_id
WHERE chunks_fts MATCH ? AND c.scope = ?
ORDER BY score ASC, c.path ASC, c.start_line ASC, c.symbol ASC
LIMIT ?
```

SQLite `bm25()` is lower-is-better. Sort ascending. `LIMIT` is `k`. On the fixture, `function` matches `alphaWidget` and `betaWidget` with equal scores. Path order then puts `src/budget.ts` first.

### Packing

`packHits({ preamble, hits, budget })` walks hits in the order above.

Rendered block, en dash U+2013 in the line range, the same character `formatter.ts` already uses:

```text
### `<path>` · `<symbol>` (lines <start>–<end>) · full
```<lang>
<body>
```
```

or `signature` and the one signature line in place of `<body>`. `<lang>` is `ts`, `tsx`, `js`, `py`, `rs`, `md`, or empty. The block ends with a newline.

- If `countTokens(preamble) > budget`, return `{ text: "", usedTokens: 0, hits: [] }`. Do not slice the preamble.
- Otherwise walk hits. If the full block fits in the remaining tokens, emit `full`. Else if the signature block fits, emit `signature`. Else skip this hit and keep walking. A later smaller signature may still fit.
- Never emit a prefix of a body or a prefix of a signature line.
- After a full hit is packed, skip a later hit whose start and end lines are inside that hit's range and whose path is equal.
- `text` is `preamble` when there are no hit blocks, or `preamble + "\n" + blocks` when preamble does not already end in a way that double-joins. For the search header, preamble is the header lines joined by `\n` plus a trailing `\n`, and the blocks follow. `usedTokens` is `countTokens(text)`.
- `countTokens(text) <= budget` always. Empty text is `0`.

Search header preamble, with the budget number interpolated:

```text
# Search
Query: <raw query>
Scope: <scope>
Provider: builtin
Budget: <n>

```

The blank line after `Budget` is part of the preamble. `Provider` stays `builtin` even when a plug-in fell back. The warning is stderr only, so stdout stays stable.

Pinned fixture, query `function`, scope `code`, files in the local test plan:

| Budget | Stdout tokens | What is emitted |
|--------|---------------|-----------------|
| 120 | 108 | both hits `full` |
| 105 | 102 | `alphaWidget` `full`, `betaWidget` `signature` |
| 30 | 20 | header only |
| 19 | 0 | zero bytes, because the 20-token header does not fit |

`sdd context` passes an empty preamble into the packer. `--budget` limits the slice blocks only. The `# Code context` / `## Summary` / `## Gaps` / `## Slices` frame is outside that number and is not cut. The bytes after `## Slices\n\n` are the packed blocks and nothing else. Drop the `## Structural notes` section on the success path so that region is exact. For query `function` and `--budget 87`, that region is `alphaWidget` full plus `betaWidget` signature (82 tokens). `--budget 88` packs both full (88 tokens).

Handoff uses an empty preamble. The budget limits the text between the markers below, not the process prompt.

### CLI

`sdd search` is a new command in `packages/cli/src/search-cmd.ts`, registered on `commands` in `packages/cli/src/commands.ts`. It does not call `launchConfiguredAgent`, `writeAgentHandoff`, or `refreshActiveAgentContext`.

- Positional query, required. Missing or whitespace-only: exit 1, `Search query is required.`
- `--scope`, required, one of `code`, `specs`, `memory`. Anything else, including omitted: exit 1, `Search scope must be code, specs, or memory.`
- `--budget`, optional positive integer. Invalid (`0`, negative, non-integer, `1.5`): exit 1, `Budget must be a positive integer.`
- When `--budget` is omitted, use `budgets.default`. Do not use the active change's stage. Search has no stage.
- Run `index()` with no path list, then `search`. Stdout is `result.text` and, when `text` is non-empty, exactly those bytes (the packer already includes the trailing newline). When `text` is empty, write zero bytes. Do not force an extra newline.
- Paths in stdout are repo-relative. Do not print `projectRoot`. Use the same relative display as `displayRepoPath` if a log line is added. Prefer no log line on success.
- Exit 0 on fallback. Exit 1 on `search.yaml is invalid` before opening the index.

`sdd context` gains `--budget`. `--max-tokens` remains and means the same number. When both are set, `--budget` wins. Invalid values use `Budget must be a positive integer.` When neither is set, use the active change's stage budget, or `budgets.default` when there is no active change. `caps.maxTokensApprox`, when passed to `generateCodeContext`, is that budget. `caps.maxLinesPerSlice` is ignored. Do not cut a slice to that many lines. `caps.maxSlices` is `k` for this call. Default `k` comes from `search.yaml` when `maxSlices` is omitted.

`sdd agent` gains `--budget` and passes it to `writeAgentHandoff`. Other commands that launch an agent (`next`, `verify`, `checkout`, and the rest) do not grow a `--budget` flag. They use the change's stage budget. `sdd status` still does not rewrite the handoff.

### Context behavior

`generateCodeContext` keeps today's no-focus hard failure when there is no path, symbol, query, or active change. The failure markdown stays the current one (`## Gaps`, no slices).

Otherwise:

1. Load search config. A schema failure returns `ok: false` and the sentence `search.yaml is invalid` in the summary. Do not throw out of the CLI except as today's non-zero exit when `ok` is false.
2. `index()` with no path list.
3. Query text is `request.query` when set, otherwise the symbol names joined with spaces, otherwise the active change title. Scope is always `code`.
4. Search with that query. Then filter. `paths` keeps a chunk whose path equals a file argument or starts with `dir + "/"` for a directory argument. `symbols` keeps a chunk whose symbol equals the name or ends with `"." + name`. Exact symbol equality sorts first. That preserves `slices[0].symbolName === "buildAgentPrompt"` on the existing alpha fixture.
5. Pack with an empty preamble.
6. Map hits to `CodeSlice`. `body` is the full source or the signature line, never a mid-function cut. `reason` ends with `full` or `signature`. `summary.truncated` is true when any ranked hit was omitted or emitted as a signature. Add gap `cap_truncated` with message `Packed under the token budget. Lower hits are signatures.` in that case.
7. `formatMarkdown` renders the frame, then the packed blocks. Delete the `chars / 4` loop and the `markdown.slice` tail. Do not append `…(truncated)`.

`filesAnalyzed` is the number of distinct paths that survived the path and symbol filters before packing. `symbolsExtracted` is the chunk count before packing. `slicesEmitted` is the packed hit count. `deps.adapters` is unused. The mock-adapter test must expect the real tree-sitter symbol `mocked` from the file it writes.

Python fixture `gamma.py` defines `hello`. Context on that path returns a slice named `hello` and does not add `unsupported_language`.

### Handoff

`buildAgentPrompt` and `writeAgentHandoff` take an optional `budget?: number`. After the existing sections, including the current implement-stage "Code context (product code)" pointer, append:

```text
## Retrieved context

<!-- retrieved-context:start -->
<packed hit blocks, or empty>
<!-- retrieved-context:end -->
```

Build the inner text by searching three times with the change title as the query and `k` from config. Merge the hits by `score` ascending, then scope order `specs`, `memory`, `code`, then path, start line, symbol. Pack once under the stage budget, or under `budget` when the caller passed it. The marker lines are outside the counted text. `countTokens(inner) <= budget`. Excluded bytes never appear. A search failure replaces the inner text with `Retrieved context skipped: <message>.` and does not fail the command.

The acceptance fixture creates a change whose title is `function`, then overwrites that change's `feature.md` with a heading and body that do not contain `function`, `alphaWidget`, or `betaWidget`, and reindexes before writing the handoff. The new spec chunk must not outrank the code hits. The change id may still contain `function`. That path is not the FTS body. `.sdd/handoff.md` is not indexed. A search header echoes `Query: <raw query>`, so a query word such as `nestedHidden` may appear on that line and nowhere else in stdout. It must still be absent from `chunks.body` and from `.sdd/index.db`.

Do not remove or rewrite the existing `## Code context (product code)` pointer. #24 owns stable-prefix edits. The new section is additional.

### Gitignore

`ensureIgnoreEntries` for `.sdd/.gitignore` requires, in this order:

```text
handoff.md
active-context.md
index.db
index.db-journal
index.db-wal
index.db-shm
```

Fresh init writes exactly those six lines. `--force` still appends only the missing ones. Update `init-force.test.ts`, which currently expects exactly `handoff.md\nactive-context.md\n`. The per-machine tracked warning list gains `.sdd/index.db` next to handoff and active-context. `sdd` does not run `git rm`.

### Docs

Update `docs/reference/cli.md`: add `sdd search` to the command table, and extend the gitignore sentence so init also ignores `index.db` and the three sidecar names. Do not change the paragraph that says an unmeasured `sdd report` row is `estimated (handoff code points / 4)` and is not a model tokenizer. Add a separate sentence that search, context packing, and the handoff retrieved section use `cl100k_base`.

Update the opening of `docs/guides/code-context.md` so it is not TypeScript-only: keyword search covers TypeScript, JavaScript, Rust, and Python, and a budget demotes a hit to a signature instead of cutting a function.

## Components / modules

- `packages/core/vendor/tree-sitter/`: five WASM files plus `NOTICE`.
- `packages/core/defaults/search.yaml`: shipped default above.
- `packages/core/src/defaults.ts`: `defaultSearchYamlPath()`.
- `packages/core/src/paths.ts`: `searchConfigPath`, `indexDbPath`.
- `packages/core/src/init.ts`: write-if-missing search.yaml; gitignore lines; tracked-path warning for `.sdd/index.db`.
- `packages/core/src/search/types.ts`: interfaces above.
- `packages/core/src/search/tokenize.ts`: `countTokens`, FTS token loop.
- `packages/core/src/search/exclude.ts`: hard denies plus three `ignore` instances.
- `packages/core/src/search/chunk-code.ts`: tree-sitter chunks.
- `packages/core/src/search/chunk-markdown.ts`: heading chunks.
- `packages/core/src/search/schema.ts`: the SQL in this design.
- `packages/core/src/search/pack.ts`: `packHits`.
- `packages/core/src/search/config.ts`: load and validate `search.yaml`.
- `packages/core/src/search/builtin.ts`: `index`, `search`, `stats`.
- `packages/core/src/search/registry.ts`: built-in default and fallback.
- `packages/core/src/search/index.ts`: public exports.
- `packages/core/src/index.ts`: re-export the public search API and `countTokens`.
- `packages/core/src/code-context/formatter.ts`: remove the `slice` truncation.
- `packages/core/src/code-context/index.ts`: pack from the index.
- `packages/core/src/agent-handoff.ts` and `packages/core/src/agents.ts`: retrieved section and optional budget.
- `packages/cli/src/search-cmd.ts` and `commands.ts`: `search`, `context --budget`, `agent --budget`.
- `packages/core/tsup.config.ts`: `external` list.
- Tests and the two doc edits named above.
- Do not edit `packages/core/src/report.ts`.

## Data flow

1. Init writes `.sdd/search.yaml` if missing and appends index gitignore lines.
2. `sdd search` loads that file, resolves the provider, walks the repo, rewrites dirty files into `.sdd/index.db`, runs FTS5, packs, and writes stdout.
3. `sdd context` does the same index step, packs code hits, and wraps them in the existing headings.
4. `sdd agent` writes the usual handoff and appends the retrieved section from three scoped searches.
5. A later `sdd report` still reads handoff code points when no measured requests exist. It does not read `index.db`.

## Alternatives considered

- `node:sqlite`: rejected. Not on Node 20, and current Node builds often omit FTS5.
- `js-tiktoken`: MIT, but the lite loader can fetch ranks. Rejected so keyword mode cannot hit the network.
- npm grammar packages as dependencies: rejected because `install` runs `node-gyp-build`. The WASM bytes are vendored instead. Licenses stay MIT and are recorded in `NOTICE`.
- Deferring per-file reindex to #23: rejected. The hash rule is small and is the behavior QA tests. #23 still adds embeddings and commit-based incremental reindex.
- Counting the whole handoff and the whole context frame against `--budget`: rejected. Cutting the process prompt or the `## Summary` heading would break the agent loop and the existing context tests. Search stdout is small, so its header is inside the budget.

## Risks

- better-sqlite3 prebuilds must match the CI Node ABI. Pin 12.8.0, which advertises Node 20 and installed on this machine.
- A future `web-tree-sitter` bump can refuse these WASM files. Do not bump it without reloading the five files. The versions above were loaded together on Node 20.
- BM25 numbers are not part of the contract. Tests pin hit order and rendered text, not the float.
- FTS `unicode61` does not split camelCase. Query `function` matches the fixture. Query `Widget` matches nothing in `alphaWidget`. That is expected. The fixture uses `function`, `AlphaSectionBody`, `MemoryAlphaBody`, and `alpha_symbol`.
