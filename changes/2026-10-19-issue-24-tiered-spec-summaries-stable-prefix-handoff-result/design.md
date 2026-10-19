# Design

> **Issue #24: tiered spec summaries, stable-prefix handoff, result cache** · `2026-10-19-issue-24-tiered-spec-summaries-stable-prefix-handoff-result` · 2026-10-19

## Approach

Summaries are a pack-time form. `chunkMarkdown` and the FTS insert in `writeChunks` stay as they are: `chunks.body` is the full section, `chunks_fts` indexes that body, and hybrid embedding still embeds that body. Summary text is never written into `chunks.body`, `chunks_fts`, or `vec_meta`. Ranking stays S1 keyword order when embeddings are off, and S2 RRF when a scope is hybrid-ready (`RRF_K = 60`, yaml `k` caps each source list only, `mergeRankedHits` unchanged).

`packHits` is still the only packer. The caller attaches an optional summary string. The packer does not open SQLite and does not call the network.

What gets a summary:

- Scope `code`: never. `full`, else `signature`, including the existing contained-range dedup.
- Scope `specs`, and the repo-relative path is under the active change directory: never. Same full-then-signature path. This is the active change, packed as today.
- Scope `specs`, path not under the active change directory: summary when one is available and it is not the same string as the body. This is every other change pack, plus `archive/` and `docs/`, because `scopeForPath` marks all three as `specs`.
- Scope `memory`: the same summary rule. Memory has no “active change” exception.

The active change directory is `displayChangePath(config, id)` (`changes/<id>` unless `changes_path` is configured), with no trailing slash. “Under” uses the same rule as `under` in `builtin.ts`: the path equals the directory or starts with `directory + "/"`.

Who passes that directory:

- `buildAgentPrompt` / `buildRetrievedInner` pass `ctx.displayPath` for the change being written. They do not read the active pointer.
- `executeSearch` and the context cache key resolve the directory from the pointer file. Read `activePointerPath(projectRoot, config)`, which is `{changes_path}/.active`. `setActiveChange` writes `` `${id}\n` ``. Trim the ends of that text to get the id. If the file is missing, empty after trim, the id is absolute, or the id contains a backslash or an empty, `.`, or `..` segment, the active directory is `""` and every specs chunk is eligible for a summary. Do not throw. Otherwise the active directory is `displayChangePath(config, id)`. It is not the bare id, and it is not a hard-coded `changes/` prefix.
- `generateCodeContext` ranks scope `code` only, so the summary rule does not change its slices. Its cache key records that same resolved directory.

`search.yaml` stays version 1. Do not add a key. The token cap is a constant, not config. `SearchConfigSchema` is unchanged. A file that fails today’s schema still throws exactly `search.yaml is invalid`, and nothing imports a summarizer before that throw. Embeddings default stays `false`.

S2’s design said “do not add a result cache.” This change adds one. It does not reopen RRF, the embedder, or `report.ts`.

## Licenses

No new dependency. Summaries call `encode` and `decode` from `gpt-tokenizer/encoding/cl100k_base`, which `tokenize.ts` already depends on, and they store rows in the `better-sqlite3` database the index already opens. Do not add a package. Do not call an LLM. Do not call `fastembed`. Do not download weights. Do not import `fastembed` or `sqlite-vec` on the summary or cache path when embeddings are off.

## Summary algorithm

```ts
export const SUMMARY_TOKEN_CAP = 80;
```

Eighty tokens is the cap on the summary string itself, not on the `###` line or the fence. The shipped intent budget is 4000 (`budgets.intent` in `packages/core/defaults/search.yaml`). A related `design.md` is one chunk per heading and can be far larger than that budget. Eighty tokens keeps the heading and a few following lines, and five such hits cost at most a few hundred tokens of body, which leaves room for the active change inside a 4000-token intent pack. The cap is a maximum. Shorter output is correct.

`countTokens` stays `encode(text).length` on `cl100k_base`. Truncation uses `decode` from that same module. Do not slice the string to a character count. Do not cut a token in half.

```ts
function extractiveSummary(signature: string, body: string): string {
  if (countTokens(body) <= SUMMARY_TOKEN_CAP) return body;
  const keepHeading =
    signature.length > 0 &&
    signature !== "(preamble)" &&
    body.startsWith(signature) &&
    (body.length === signature.length || body.charCodeAt(signature.length) === 10) &&
    countTokens(signature) <= SUMMARY_TOKEN_CAP;
  if (!keepHeading) return clipToTokens(body, SUMMARY_TOKEN_CAP);
  const rest = body.slice(signature.length);
  const restIds = encode(rest);
  let lo = 0;
  let hi = restIds.length;
  let best = signature;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const tail = mid === 0 ? "" : decode(restIds.slice(0, mid));
    const candidate = signature + tail;
    if (countTokens(candidate) <= SUMMARY_TOKEN_CAP) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best.endsWith("\n")) {
    const stripped = best.slice(0, -1);
    if (countTokens(stripped) <= SUMMARY_TOKEN_CAP && stripped.startsWith(signature)) {
      best = stripped;
    }
  }
  return best;
}

function clipToTokens(text: string, cap: number): string {
  const ids = encode(text);
  let n = Math.min(cap, ids.length);
  let clipped = n === 0 ? "" : decode(ids.slice(0, n));
  if (clipped.endsWith("\n")) clipped = clipped.slice(0, -1);
  while (n > 0 && countTokens(clipped) > cap) {
    n -= 1;
    clipped = n === 0 ? "" : decode(ids.slice(0, n));
    if (clipped.endsWith("\n")) clipped = clipped.slice(0, -1);
  }
  return clipped;
}
```

Heading chunks from `chunkMarkdown` start with the raw heading line, and that line is `signature`. The `(preamble)` symbol is not copied into the body. The `###` line already carries the symbol. A heading whose own token count is above 80 is clipped with `clipToTokens`; the `###` symbol is still the full chunk symbol.

No randomness, no clock, no locale, no network. The same `signature` and `body` always return the same string.

Pinned fixture. Build the body with this exact code and no extra newline:

```ts
const signature = "## SpecAnswerHeading";
const filler = Array.from(
  { length: 40 },
  (_, i) => `tailword${i} stays in the indexed body and may be cut.`,
).join(" ");
const body = `${signature}\n\nSpecAnswerHeading is the answer. ${filler}`;
```

`countTokens(body)` is 532. `extractiveSummary(signature, body)` is 80 tokens and these exact bytes:

```text
## SpecAnswerHeading

SpecAnswerHeading is the answer. tailword0 stays in the indexed body and may be cut. tailword1 stays in the indexed body and may be cut. tailword2 stays in the indexed body and may be cut. tailword3 stays in the indexed body and may be cut. tailword4 stays in the indexed body and may be cut. tailword5
```

There is no trailing newline. `tailword6` is absent. `tailword6` through `tailword39` stay in `chunks.body`. The S1 Alpha-section body and the S1 preamble body are under the cap, so the function returns them unchanged.

`renderBlock` gains a form:

```ts
form: "full" | "signature" | "summary"
```

The header line stays `### \`${path}\` · \`${symbol}\` (lines ${start}${enDash}${end}) · ${form}`, with the same en dash `\u2013`. The fence language is unchanged. The fence body is `hit.body` for `full`, the summary string for `summary`, and `hit.signature` for `signature`.

Pack order for one hit, after dedup:

1. If `summary` is a non-empty string and it is not equal to `body`, try the summary block. If `countTokens` of the text so far plus that block is within budget, take it and do not also emit `full`.
2. Otherwise, or if the summary block does not fit, try `full`, then `signature`, which is today’s loop. An empty summary is treated as missing.
3. A hit taken as `full` is recorded as a containment outer. A `summary` hit is not an outer, same as `signature`. Contained-range dedup is otherwise unchanged: same path, inner start ≥ outer start, inner end ≤ outer end, and the outer was packed as `full`.
4. Before that, drop a later hit whose `path`, `symbol`, and `startLine` equal an earlier hit. Keep the first.

`SearchHit.form` includes `"summary"`. `generateCodeContext` still maps `full` to “keyword full” and anything else to “keyword signature”. It never receives a summary hit, because it only packs `code`. Do not change those reason strings. Do not emit `· summary` from `sdd context`.

Summary rows are produced lazily at pack time from the chunk body already in the index, not by reading the file again and not during `index()`, except that `deletePath` removes that path’s rows. Lookup key is the repo-relative path, the file `content_hash` from `files` (sha256 of the raw file bytes, the hash `syncOne` already compares), the chunk `symbol`, and `start_line`. A hit on that key does not call `extractiveSummary` again and does not `UPDATE` the row. A miss computes the summary, inserts one row, and deletes other rows for that same path whose `content_hash` differs. File B is not in that delete. A one-byte edit of A changes A’s `content_hash`, `deletePath` drops A’s summary rows, and B’s rowid stays.

```sql
CREATE TABLE IF NOT EXISTS spec_summaries (
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (path, content_hash, symbol, start_line)
);
```

No foreign key to `chunks`. Creating the table must not rebuild chunk rows. `openDb` runs this `CREATE TABLE IF NOT EXISTS` next to the existing schema. Do not add a column to `chunks`.

## Cache keys and invalidation

Three tables, all inside `.sdd/index.db`:

```sql
CREATE TABLE IF NOT EXISTS result_cache (
  cache_key TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  channel TEXT NOT NULL,
  scope TEXT NOT NULL,
  k INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  embeddings INTEGER NOT NULL,
  active_change TEXT NOT NULL,
  filter TEXT NOT NULL,
  index_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  hybrid_scopes TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS result_cache_files (
  cache_key TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (cache_key, path)
);
```

`channel` is `search`, `context`, or `handoff`. `scope` is `code`, `specs`, `memory`, or, for a handoff, `merged`. `embeddings` is `0` or `1` from `search.embeddings`, not from whether the embedder loaded. `active_change` is the active directory string, or `""`. For `search` and `context`, that directory is the one `executeSearch` resolves from `activePointerPath`. For `handoff`, it is `ctx.displayPath`. `filter` is the same filter string that goes into the key. `mode` is `rrf` if any ranked hit passed into `packHits` has `rankedBy === "rrf"`, otherwise `bm25`. `hybrid_scopes` is the comma-separated list of scopes that took the RRF branch for this call (`code`, `specs`, `memory`), sorted, or `""` when none did.

`generateCodeContext` in `packages/core/src/code-context/index.ts` uses channel `context` and scope `code`. The query component is the string passed to `rankScope`, or `""` when `listScopeHits` is used. `k` and budget are the values passed into `packHits`. On a context hit, do not call `rankScope`, `listScopeHits`, or `packHits`, and do not run FTS. Build the markdown frame as today. The bytes after `## Slices\n\n` are the stored pack text. Do not replace the frame with that text. Slice rows and the summary counts above the marker are derived from the stored packed hits. `executeSearch` stdout and the handoff inner text are the stored text unchanged, with no frame around them.

The query component is the raw query string. Do not trim, lowercase, or NFC-normalize it. `function` and ` function ` are different keys. That is the whole of query normalization.

Contributors are the distinct `files.path` values among the ranked hits passed into `packHits` (after `mergeRankedHits`, before the budget loop), each with that row’s current `content_hash`. Sort with `a < b` on the path, the same ordering the index already uses. Canonical text, one contributor per line:

```text
${path}\t${content_hash}\n
```

`index_version` is the hex sha256 of that UTF-8 string. It is not a counter in `meta`, and it is not a hash of every file in the index.

Cache key material, length-prefixed so a newline inside the query cannot collide:

```ts
function field(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}
```

Join these fields with `\n`, in this order: raw query, channel, scope, decimal `k`, decimal budget, `embeddings` as `0` or `1`, active change, index version, filter. `filter` is the context path list sorted and joined with `\n`, then the four characters `\n/\n`, then the symbol list sorted and joined with `\n`. Search and handoff use an empty path list and an empty symbol list. `cache_key` is the hex sha256 of that UTF-8 material.

`deletePath` also runs:

```sql
DELETE FROM spec_summaries WHERE path = ?
```

and deletes `result_cache` rows whose `cache_key` is in `result_cache_files` for that path, then deletes those `result_cache_files` rows. Match the path by equality on the side table. Do not use SQL `LIKE`. Do not delete a cache row that does not list the path. Do not touch `chunks` of any other path. This is not a global generation bump. Unchanged files do not enter `deletePath`, so their cache rows stay.

On read, select rows by query, channel, scope, `k`, budget, embeddings, active change, and filter. The version is not known yet, so it is not part of that select. For each row, compare every `result_cache_files.content_hash` to `files.content_hash`. If a path is missing or the hash differs, delete that cache row and its file rows. If one row’s hashes all match, recompute `index_version` from those stored pairs and require it to equal the stored version. Embeddings `0` requires `mode = bm25` and `hybrid_scopes = ""`. Embeddings `1` requires `hybrid_scopes` to equal the scopes whose `scopeVectorState` is `ready` right now, among the scopes this channel ranks (the one search scope, `code` for context, or `specs,memory,code` for a handoff). Compare as a sorted comma-separated list. If the ready set disagrees, drop the row. A keyword fallback while the vectors are already ready therefore misses and recomputes, so a later successful embed is not stuck on keyword text. Do not call `resolveEmbedder`, `fastembed`, or `fetch` on a hit. A hit returns the stored payload text and does not run FTS.

Payload is `JSON.stringify` of `{ text, hits }` with hit keys in this order: `scope`, `path`, `startLine`, `endLine`, `symbol`, `score`, `form`, `text`, `signature`, `body`, `language`, `rankedBy`. On a search or handoff hit, the returned text is that `text` unchanged. On a context hit, that `text` is only the section after `## Slices\n\n`. `usedTokens` is `countTokens(text)`, not a stored integer. A JSON parse failure is a cache miss, not a thrown handoff. Do not store the embeddings warning in the payload. Before insert, if the raw query or the payload `text` contains `FAKE_BIRTH_RECORD_S1` or `fake-secret-s1-do-not-index`, write neither `result_cache` nor `result_cache_files`. On read, a row whose query or payload contains either string is deleted with its file rows and treated as a miss. That call is packed again and still not stored. The string may appear on a stdout `Query:` line only. On an embeddings-on hit whose mode is `bm25` and whose scope is not ready, the existing `Embeddings are unavailable. Using keyword search.` warning may still be set from `scopeVectorState`. Do not invent a second sentence.

Accepted hole: a file that was not a contributor can change so that it would newly match, and entries that do not list it stay valid. Do not hash the whole index to close that hole.

A second identical `executeSearch` returns byte-identical `text`. The S1 budget-120 stdout is that text, warm or cold.

## Handoff section order

`buildAgentPrompt` still joins parts with `\n`. Stable prefix, in this order, with the same bullet text as today:

1. `# SDD Agent Handoff`
2. blank line
3. `You are implementing a change under Structured Vibe Coding (local SDD).`
4. blank line
5. `## Change`
6. `- Title: ${ctx.meta.title}`
7. `- ID: ${ctx.id}`
8. `- Workflow: ${ctx.meta.workflow}`
9. `- Change path: ${ctx.displayPath}`
10. blank line
11. `## Constraints` and the five bullets that exist today, including the em dash in `Local development only — verify on this machine.` Paths still come from `guidancePaths`.
12. blank line
13. `## Artifacts to read`, then the documentation-map bullet, the memory bullet, then every stage artifact as `${ctx.displayPath}/${a.path}` in workflow order.
14. blank line

The stable prefix ends at that blank line. It must not contain the current stage id, the stage goal, the stage instructions, the current-stage artifact list, the code-context pointer, the MCP block, any retrieved chunk, or the closing `sdd next` sentence.

Volatile tail, in this order. Omit a conditional block the same way the code omits it today:

1. `## Stage`, then `- Current stage: ${stageId}${title ? ` (${title})` : ""}`, then a blank line. This is the only copy of that bullet. It leaves `## Change`.
2. `## Stage goal` and `stage.summary` when the summary is non-empty.
3. `## Instructions` and `stage.agent_context.instructions` when those instructions exist.
4. `## Current stage artifacts`, then each current artifact as `- ${path}${required ? " (required)" : ""}`. Always emit the heading, as today.
5. `## Code context (product code)` only when the stage id is `implement` or `local_verify`, with the same body lines as today.
6. The MCP block, unchanged: fetch when configured, the “No sources” lines when there are none, the non-fatal skip line on throw.
7. `## Retrieved context`, a blank line, `<!-- retrieved-context:start -->`, the inner text, `<!-- retrieved-context:end -->`, a blank line.
8. `When done with this stage, the human will run \`sdd next\` or \`sdd verify\` / \`sdd complete\`.`

The test stages are `clarify_intent` and `clarify_design` on one feature change whose title, id, and workflow do not contain those strings (title `Stable prefix` is fine). `implement` is a substring of the standing sentence `You are implementing`, and `design` is a substring of `design.md` in the artifact list, so those ids are the wrong assertion. The shared prefix is `text.slice(0, text.indexOf("\n## Stage\n"))`. Both stages produce the same prefix. The prefix does not contain `clarify_intent` or `clarify_design`. Each tail contains its own stage id. `clarify-intent.md` is not a match for `clarify_intent`.

`writeAgentHandoff` still prepends the auto banner, but the stage clause moves out of it. The banner is:

```text
# SDD handoff (auto)

> Generated for the AI coding agent configured at init.  
> Change: **${title}** · `${id}`

Also read: `.sdd/active-context.md`, `.sdd/protocol.md`, `${constitution}` if present.

---
```

Keep the two trailing spaces on the `Generated` line. The file’s leading bytes are this banner plus the stable prompt prefix. They do not contain the stage id. The stage remains in the `## Stage` tail.

Do not change `formatStatus`. Do not remove the stage from the active-context banner. `.sdd/active-context.md` is status, then the prompt, so the file as a whole is not a stage-free prefix.

Retrieved chunk text is never part of the prefix. A summary of another change can mention a stage id only inside the retrieved-context tail.

## What stays byte-identical

Embeddings off, cold or warm cache:

- S1 code search at budgets 120, 105, 30, and 19, including the budget-120 stdout at 108 tokens. No `Mode:` line, no cache banner, no `· summary`.
- S1 specs search for `AlphaSectionBody` and S1 memory search for `MemoryAlphaBody`. Those bodies are under 80 tokens, so the summary equals the body and the form stays `full`.
- Context budgets 87 and 88. `generateCodeContext` packs code only.
- Handoff inner text for a change titled `function` at budget 87, the bytes between the markers after one leading and one trailing newline, equal to the S1 `SLICE_87` code blocks.

Code-only packed blocks stay on that list even when the result cache is warm. The S2 sentence that embeddings-off handoff inner text is byte-identical to S1 still holds for those code-only blocks. It does not hold for a handoff or a specs/memory search once a chunk is emitted as `· summary`.

`sdd search` stdout gains no new line when the cache hits. The CLI does not change. Hybrid `Mode: hybrid` and the embeddings warning stay the S2 behavior. Summary text is not embedded, so turning embeddings on does not embed a summary.

The handoff file’s section order and the removed stage clause are an intentional break with the old prefix. Tests that only check a repo-relative change path still pass.

## Fallback

Same class of rule as the S2 embeddings fallback, and a different sentence. Do not print `Embeddings are unavailable. Using keyword search.` for a summary or cache failure. Do not print any new sentence inside the retrieved-context markers. Do not print an absolute path.

- One chunk’s `extractiveSummary` throws, or the summary read/write throws: that chunk has no summary and uses full then signature. Other chunks continue.
- The whole summary pass throws: pack the hits with no summary fields.
- Cache read or cache write throws, or the payload does not parse: ignore the cache and pack as today.
- Handoff still returns exit 0. `buildRetrievedInner` does not turn these failures into `Retrieved context skipped:`. That sentence stays reserved for the existing config, index, and rank failures, still passed through `safeMessage`.
- Do not cache the skipped-error string.

## Exclude

`loadExcluder` is unchanged and still runs before chunking. Summaries are computed only from chunk rows, so an excluded path, a secret path, and `.env` are never summarized and never written to `result_cache`. Do not open those files from the summarizer.

The fixture is the S1 pair: `review-private/birth.jhd` containing `FAKE_BIRTH_RECORD_S1`, `.env` containing `fake-secret-s1-do-not-index`, `exclude` listing `*.jhd` and `review-private/`. With embeddings off, those full strings are absent from `spec_summaries`, from `result_cache`, from `result_cache_files`, from handoff bytes, from context markdown, from budgeted search text except a `Query:` line when the user searched for them, and from the raw bytes of `.sdd/index.db`. A search whose query is one of those strings is recomputed, not served from the cache, and it still writes no cache row.

## Gitignore

No new ignore line and no new file under `.sdd/`. Summaries and the result cache are tables in `.sdd/index.db`, which `sdd init` already ignores, along with `index.db-journal`, `index.db-wal`, and `index.db-shm`. Do not add a `summaries/` directory. The seven `.sdd/.gitignore` lines stay:

```text
handoff.md
active-context.md
index.db
index.db-journal
index.db-wal
index.db-shm
models/
```

## Docs

Add one short paragraph. Do not rewrite the embeddings paragraph. Do not rewrite the code-point estimate paragraph. Do not mention `sdd cost`. Do not edit `docs/guides/code-context.md`.

- `docs/reference/cli.md`, after the embeddings paragraph: related change specs and memory pages can be packed as a short extractive summary; the active change and code stay full; the keyword index is unchanged; repeated searches are cached in `.sdd/index.db` and search text does not gain a cache banner.
- `docs/reference/agents.md`, next to the handoff description: the handoff prompt puts the change title, id, workflow, path, constraints, and the artifact list before the stage, its instructions, MCP, and retrieved context, and that leading text is the same on every stage of the change.

## Components / modules

- `packages/core/src/search/summarize.ts`: `SUMMARY_TOKEN_CAP`, `extractiveSummary`. Export both from `search/index.ts`.
- `packages/core/src/search/schema.ts`: the three `CREATE TABLE IF NOT EXISTS` statements. No `chunks` migration.
- `packages/core/src/search/pack.ts`: `summary` form, the fall-through order, the path+symbol+startLine dedup.
- `packages/core/src/search/types.ts`: `SearchHit.form` includes `"summary"`. Optional `summary?: string` on `RawHit`.
- `packages/core/src/search/builtin.ts`: `deletePath` removes summary rows and dependent cache rows. FTS and vec writes stay.
- `packages/core/src/search/result-cache.ts`: key, read, write.
- `packages/core/src/search/registry.ts`: attach summaries in `buildRetrievedInner` and in the search path, and wrap both with the cache. Pass the active change directory into the handoff inner builder.
- `packages/core/src/code-context/index.ts`: channel `context`. On a hit, splice the stored pack text after `## Slices\n\n` and do not run FTS.
- `packages/core/src/agent-handoff.ts`: section order only.
- `packages/core/src/agents.ts`: drop the stage clause from the `writeAgentHandoff` banner only.
- `packages/core/src/__tests__/search-s3.test.ts`: the cases in `tasks.md`.
- The two doc paragraphs.

Do not edit `packages/core/src/report.ts`, `packages/core/package.json`, `packages/cli`, `search.yaml`’s schema or the shipped default body, or either copy of `feature.yaml`. `generateCodeContext`’s reason strings stay. `.sdd/workflows/feature.yaml` already verifies with `pnpm test`. Leave that command list alone.

## Data flow

1. `loadSearchConfig`. Invalid file throws `search.yaml is invalid` before any summary or cache work.
2. `index()` syncs files as S2 does. It does not build summaries. `deletePath` clears that path’s summary rows and the cache rows that list it.
3. Search, context, or handoff tries the result cache. A search or handoff hit returns the stored text and does not pack again. A context hit splices that text after `## Slices\n\n` and does not run FTS. A query or payload that contains `FAKE_BIRTH_RECORD_S1` or `fake-secret-s1-do-not-index` is never a hit and is never stored.
4. On a miss, rank as today (keyword, or RRF when that scope is hybrid-ready). For each summarizable hit, load or build the summary from the chunk body.
5. `packHits` walks the ranked list under the budget.
6. A successful pack is written to `result_cache`. A write failure is ignored. The returned text is the pack either way.
7. Handoff places that inner text in the volatile tail, after the stable prefix.
8. `sdd report` still does not read `index.db`.

## Alternatives considered

- An LLM summary, or a `fastembed` summary: rejected. The phase is offline, deterministic, and limited to code that is already in the process. A model call would also break the byte pin.
- Replacing `chunks.body` with the summary: rejected. Ranking would change, and the S1 keyword pins would move.
- A global `meta` generation bumped on every index: rejected. Editing file A would flush every cached query, including queries that only touch file B.
- A new `search.yaml` cap: rejected. Version stays 1, and a required key would invalidate existing files.
- A summary file outside `index.db`: rejected. The database is already git-ignored, and a second file is another ignore line for no gain.
- Putting the stage id in the prefix “because the banner already has it”: rejected. The banner loses the stage clause so `.sdd/handoff.md` can actually share a prefix.
- Reusing the embeddings warning sentence for a cache miss: rejected. Cache failure is silent. The embeddings sentence stays on the embeddings path only.

## Risks

- The accepted stale-hit hole above. Tests prove the other direction: an entry that does not list A survives an edit of A, and an entry that lists A does not.
- `· summary` is three letters longer than `· full`. Fall-through to full then signature is what keeps a previously packed hit. A test packs the same ranked list with summaries disabled and with summaries enabled, at a budget where the full form fits, and the `###` line is in both.
- Prompt caching only helps a host that caches a stable prefix. This change only orders the bytes. It does not call a model.
- Active-context still names the stage above the prompt. Agents that paste that whole file do not get the prefix. The handoff file does.
- AstroApp before/after cells are blank until `local_verify`. The S2 counts are not inputs to those cells.
