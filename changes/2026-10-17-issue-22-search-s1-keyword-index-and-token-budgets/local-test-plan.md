# Local test plan

> **Issue #22: search S1 keyword index and token budgets** · `2026-10-17-issue-22-search-s1-keyword-index-and-token-budgets`

## Environment

- How to run locally: from the repo root, `pnpm --filter @structured-vibe-coding/core test` and `pnpm --filter @structured-vibe-coding/cli test`. Node on this machine is v20.19.3. Do not require a Node 24-only API. Tests must not open a network connection and must not download a model or a grammar.
- Branch / flags / seed data: committed fixture corpus `packages/core/src/__tests__/fixtures/search-s1/`. Each file below includes a single trailing `\n`. Tests copy the corpus into a temp directory. `countTokens` is `encode(text).length` from `gpt-tokenizer/encoding/cl100k_base`. The en dash in `lines 1–3` is U+2013.
- Cases 2–10 copy the corpus without `packages/secret-nest/hidden.ts` and `packages/secret-nest/shown.ts`. Those two files exist only in case 11. With `skip-me.ts` gitignored, the token `function` then matches exactly `alphaWidget` and `betaWidget`. Python and Rust files use `def` and `fn`, so they do not match that query.
- AstroApp is not available on this machine. Do not run it and do not record a before/after token count or a hit rate for it. Acceptance is this fixture corpus.

### Fixture files

`src/budget.ts`

```ts
export function alphaWidget(n: number): number {
  return n + 1;
}
```

`src/other.ts`

```ts
export function betaWidget(x: string): string {
  return x.trim();
}
```

`src/notes.py`

```py
def alpha_symbol(n):
    return n + 1
```

`src/notes.rs`

```rs
fn alpha_symbol(n: i32) -> i32 {
    n + 1
}
```

`changes/demo/feature.md`

```md
# Demo

Preamble words stay here.

## Alpha section

AlphaSectionBody is the answer.

## Other

Not the answer.
```

`memory/product.md`

```md
# Product

## Memory alpha

MemoryAlphaBody is kept.
```

`review-private/birth.jhd` — one line `FAKE_BIRTH_RECORD_S1`

`.env` — one line `API_TOKEN=fake-secret-s1-do-not-index`

`.gitignore` — one line `skip-me.ts`

`src/skip-me.ts` — one line `export function hiddenSkip() { return 1; }`

`packages/secret-nest/.gitignore` — two lines, `*.jhd` then `hidden.ts`

`packages/secret-nest/note.jhd` — one line `NESTED_JHD_SECRET`

`packages/secret-nest/hidden.ts`

```ts
export function nestedHidden() {
  return 1;
}
```

`packages/secret-nest/shown.ts`

```ts
export function nestedShown() {
  return 1;
}
```

`other/note.jhd` — one line `OTHER_JHD_VISIBLE`

`.sdd/search.yaml` for the personal-data cases adds:

```yaml
exclude:
  - "*.jhd"
  - "review-private/"
```

`other/note.jhd` is indexed when that exclude list is absent, and is excluded when `*.jhd` is present. The personal-data cases use the exclude list above, so neither `.jhd` file is indexed. `skip-me.ts` is excluded by the root gitignore. `packages/secret-nest/hidden.ts` is excluded by the nested `hidden.ts` pattern. `packages/secret-nest/shown.ts` is not.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Tokenizer pin | `countTokens("hello world")` | `2` |
| 2 | Both hits full | Copy corpus. `sdd search "function" --scope code --budget 120` | Exit 0. Stdout is the 120-budget block below, byte for byte. `countTokens(stdout)` is `108`, and `108 <= 120`. Stdout does not contain the temp directory's absolute path. The process does not spawn an agent and does not write `.sdd/handoff.md`. |
| 3 | Signature, not a cut body | Same corpus. `sdd search "function" --scope code --budget 105` | Exit 0. Stdout is the 105-budget block below. `countTokens` is `102`, and `102 <= 105`. Stdout contains `· signature` and does not contain `return x.trim()`. |
| 4 | Header only | `--budget 30` | Exit 0. Stdout is the 30-budget block below. `countTokens` is `20`. |
| 5 | Preamble does not fit | `--budget 19` | Exit 0. Stdout is zero bytes, not a newline. `countTokens` is `0`. |
| 6 | Byte-identical | Run case 2 twice without changing files | The two stdouts are equal, including order. |
| 7 | Specs heading | `sdd search "AlphaSectionBody" --scope specs --budget 200` | Exit 0. Stdout is the specs block below. `countTokens` is `61`. |
| 8 | Memory heading | `sdd search "MemoryAlphaBody" --scope memory --budget 200` | Exit 0. Stdout is the memory block below. `countTokens` is `58`. |
| 9 | Rust and Python symbols | `sdd search "alpha_symbol" --scope code --budget 200` | Exit 0. Stdout contains `` `src/notes.py` · `alpha_symbol` `` and `` `src/notes.rs` · `alpha_symbol` ``. `countTokens(stdout) <= 200`. A second run is byte-identical. |
| 10 | Secret and private path | With the `exclude` list above, index, then search `FAKE_BIRTH`, `fake-secret`, `NESTED_JHD`, `nestedHidden`, and `hiddenSkip` in each scope at budget 200. Also build context with `--query FAKE_BIRTH --budget 200` and write a handoff whose change title is `function`. | `FAKE_BIRTH_RECORD_S1`, `fake-secret-s1-do-not-index`, and `NESTED_JHD_SECRET` are absent from every stdout, the handoff file, `readFile` of `.sdd/index.db`, and `SELECT body FROM chunks`. `nestedHidden` and `hiddenSkip` are absent from context stdout, the handoff file, `readFile` of `.sdd/index.db`, and `SELECT body FROM chunks`. On search stdout those two words may appear only on the `Query:` line, the same rule as case 11. No `###` hit line contains them. |
| 11 | Gitignore predicate and nested code | `exclude: []`. Call the exclude predicate. Then `sdd search "nestedShown" --scope code --budget 200` and `sdd search "nestedHidden" --scope code --budget 200`. | Predicate: `src/skip-me.ts` and `skip-me.ts` are excluded; `packages/secret-nest/note.jhd` is excluded; `other/note.jhd` is not excluded. Search `nestedShown` prints `` `packages/secret-nest/shown.ts` · `nestedShown` ``. Search `nestedHidden` prints the header only: no `###` hit line, and the stdout does not contain `packages/secret-nest/hidden.ts`. The query word may appear on the `Query:` line. |
| 12 | Per-file reindex | Full `index()`. Record `body` and `content_hash` for `src/other.ts`. Append a comment line to `src/budget.ts` only. Call `index()` with no list. | `lastIndexFilesReindexed` is `1`. `src/other.ts` hash and body are unchanged. `src/budget.ts` hash changed. Then append a comment to `src/other.ts` and call `index(["src/budget.ts"])`. `src/other.ts` stored body stays the old text. |
| 13 | Broken provider | `provider: does-not-exist`, then case 2's command | Exit 0. Stderr contains `Search provider "does-not-exist" is unavailable. Using built-in keyword search.` Stdout equals case 2. A unit test that registers a provider `broken` which throws gets the same warning and a built-in hit. |
| 14 | Invalid config and flags | `search.yaml` with `k: 0`. Then a valid file with `--scope no`, `--budget 0`, and no query. | Exit 1. Messages, exactly and with no absolute path: `search.yaml is invalid`, `Search scope must be code, specs, or memory.`, `Budget must be a positive integer.`, `Search query is required.` |
| 15 | Context budget | `sdd context --query function --budget 87` and again with `--budget 88` | Exit 0. Bytes after `## Slices\n\n` at budget 87 are the signature slice block below (`countTokens` `82`) and do not contain `return x.trim()`. At budget 88 those bytes are the both-full slice block (`countTokens` `88`). The markdown contains `# Code context`, `## Summary`, `## Gaps`, and `## Slices` in that order. It does not contain `…(truncated)` and does not contain the temp absolute path. |
| 16 | Init ignore and search.yaml | Fresh `initProject` with `agents: false`. Edit `.sdd/search.yaml`, run `--force`, delete the file, run `--force` again. | `.sdd/.gitignore` is exactly the six lines below. `.sdd/search.yaml` has no `sdd:generated` marker, is not a key in `.sdd/.generated.json`, survives the edit, and comes back as the shipped default after delete. `git init` in the temp dir then `git check-ignore .sdd/index.db` exits 0. |

### Case 2 stdout (108 tokens)

```text
# Search
Query: function
Scope: code
Provider: builtin
Budget: 120

### `src/budget.ts` · `alphaWidget` (lines 1–3) · full
```ts
export function alphaWidget(n: number): number {
  return n + 1;
}
```
### `src/other.ts` · `betaWidget` (lines 1–3) · full
```ts
export function betaWidget(x: string): string {
  return x.trim();
}
```
```

The block ends with a newline after the last fence.

### Case 3 stdout (102 tokens)

```text
# Search
Query: function
Scope: code
Provider: builtin
Budget: 105

### `src/budget.ts` · `alphaWidget` (lines 1–3) · full
```ts
export function alphaWidget(n: number): number {
  return n + 1;
}
```
### `src/other.ts` · `betaWidget` (lines 1–3) · signature
```ts
export function betaWidget(x: string): string {
```
```

The signature hit is the declaration line only. The lines `return x.trim();` and the function's closing `}` are not in the stdout.

### Case 4 stdout (20 tokens)

```text
# Search
Query: function
Scope: code
Provider: builtin
Budget: 30

```

That is the header plus a blank line, and a trailing newline.

### Case 7 stdout (61 tokens)

```text
# Search
Query: AlphaSectionBody
Scope: specs
Provider: builtin
Budget: 200

### `changes/demo/feature.md` · `Alpha section` (lines 5–8) · full
```md
## Alpha section

AlphaSectionBody is the answer.

```
```

There is a blank line inside the fence before the closing fence. That blank line is source line 8.

### Case 8 stdout (58 tokens)

```text
# Search
Query: MemoryAlphaBody
Scope: memory
Provider: builtin
Budget: 200

### `memory/product.md` · `Memory alpha` (lines 3–5) · full
```md
## Memory alpha

MemoryAlphaBody is kept.
```
```

### Case 15 slice bytes at budget 87 (82 tokens)

```text
### `src/budget.ts` · `alphaWidget` (lines 1–3) · full
```ts
export function alphaWidget(n: number): number {
  return n + 1;
}
```
### `src/other.ts` · `betaWidget` (lines 1–3) · signature
```ts
export function betaWidget(x: string): string {
```
```

### Case 15 slice bytes at budget 88 (88 tokens)

```text
### `src/budget.ts` · `alphaWidget` (lines 1–3) · full
```ts
export function alphaWidget(n: number): number {
  return n + 1;
}
```
### `src/other.ts` · `betaWidget` (lines 1–3) · full
```ts
export function betaWidget(x: string): string {
  return x.trim();
}
```
```

### Case 16 gitignore bytes

```text
handoff.md
active-context.md
index.db
index.db-journal
index.db-wal
index.db-shm
```

The `--force` merge test that starts from `# keep\nextra\nhandoff.md` (no trailing newline) ends as that text plus `\nactive-context.md\nindex.db\nindex.db-journal\nindex.db-wal\nindex.db-shm\n`.

### Handoff budget

Create a change titled `function` on the fixture project, stage `intent`, budget `87`. `sdd new` writes that title into the change's `feature.md`. Overwrite that file with a heading and body that do not contain `function`, `alphaWidget`, or `betaWidget`, then reindex. The path slug may still contain `function`; that slug is not stored in `chunks.body`. `.sdd/handoff.md` is under `.sdd/` and is not indexed. The handoff contains `<!-- retrieved-context:start -->` and `<!-- retrieved-context:end -->`. The bytes between those markers, trimmed of one leading and one trailing newline, equal the case 15 budget-87 slice. `FAKE_BIRTH_RECORD_S1` is absent. The absolute temp path is absent. The existing `## Code context (product code)` pointer is unchanged on `implement` and still absent on `intent`. `sdd report` on a change with no measured requests still prints `estimated (handoff code points / 4)`. Do not change that test. `"abcd😀"` still estimates 1.

### Existing context tests to update

- `maxLinesPerSlice: 3` no longer asserts a body of at most 3 lines. Assert the packed body is a whole symbol or a one-line signature.
- `gamma.py` is a Python chunk named `hello`, not gap `unsupported_language`. A `.go` path still gets `unsupported_language`.
- The mock `LanguageAdapter` is not used for slices. `export function mocked() {}` yields symbol `mocked` from tree-sitter.

## Out of scope this change

- AstroApp token counts and hit rate. Not run. No invented numbers.
- sqlite-vec, embeddings, hybrid RRF, reindex-by-commit (#23).
- Tiered summaries, stable-prefix handoff, result cache (#24).
- MCP search adapters and a docs language matrix (#25).
- Changing `sdd cost`, `sdd report`, or the handoff code-point estimate (#26).
