# Design

> **Write each guide draft under its own headings** · `2026-10-29-write-each-guide-draft-under-its-own-headings`

The architect proposes these seams. The person has not signed this change.

## Approach

`runGuide` drafts one required artifact at a time. `guideDraftPrompt` names the stage, the instructions already on that stage, the artifact path, the template's `##` headings, and earlier required files that are already substantive. The reply stays JSON. The runner writes the headings. `authorPrompt`, `parseReply`, and the accepted-section critic stay as they are.

## Components / modules

`packages/core/src/role/guide.ts` owns the loop, the one-file write, and the results file. `packages/core/src/role/prompts.ts` adds `guideDraftPrompt`. `packages/core/src/artifacts.ts` adds `headingsFilled` for the guide only. `isSubstantiveArtifactContent` stays the floor for `sdd next`.

## Data flow

The runner reads headings from the template named on the artifact. A missing part, a dash, `Task N`, or an empty traceability row fails `headingsFilled`. The guide stops and does not write that file. `local-test-results.md` skips the model. A stage with no required file advances without a model call.

## Alternatives considered

A second role could critique the draft. The product manager required that out of this change. The product owner and the architect marked it optional. Filling the shipped templates was rejected because `stage-complete.test.ts` requires those files to stay non-substantive.

## Risks

The prompt is longer because it carries earlier files. A heading check can stop a draft that renames a heading. The runner does not search the repo, so the model is told not to invent a module or a command result.
