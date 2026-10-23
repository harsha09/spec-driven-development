# Design

> **Issue 21 workflow and artifact tokens** · `2026-10-23-issue-21-workflow-and-artifact-tokens`

## Approach

Count files that are already on disk. `countTokens` in `packages/core/src/search/tokenize.ts` is the cl100k counter. `sdd workflows` keeps its one-line list, then prints the token inventory under it.

## Seams

| Piece | Change |
|---|---|
| `formatTokenInventory` | Plain text for every workflow, then the active change when one exists |
| Workflow file | Token count of `.sdd/workflows/<name>.yaml` |
| Artifact template | The same template lookup `sdd next` uses, counted before `{{title}}` is filled in |
| Active change | Token count of each artifact path under the change directory |
| CLI | `sdd workflows` prints that text. No new command. |

A directory artifact is labeled `directory` and is not added to the total. A missing template is `missing`. An unwritten change file is `not written`. The artifact total adds only counted files.

## Risks

The same template used by two stages is counted twice, once per artifact file that would be written. The active-change section counts the filled files, so those numbers differ from the template numbers.
