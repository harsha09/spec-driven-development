# Feature

> **Write each guide draft under its own headings** · `2026-10-29-write-each-guide-draft-under-its-own-headings`

The product manager proposes this reading. The person has not signed it.

## Problem / opportunity

`sdd go` asks the model for one stage draft and does not name the file or its headings. Feature, design, and tasks can come back as the same kind of paragraph. On local verify, one reply is written into both the plan and the results.

## Users & value

A person who runs `sdd go` with a role model gets a change pack a builder can follow. The person still sees the short reading on the screen. The pack stays hidden.

## Scope

Each required file is drafted on its own. The runner writes the template headings and places the model's sentences under them. Design can see the feature file. Tasks can see the feature file and the design file. A heading that is still empty stops the guide. `local-test-results.md` is written by the runner and says no command was run. Implement has no file, so the model is not called.

## Non-goals

No critic pass in this change. No new command. No change to `sdd next`'s length check. Shipped templates stay stubs. No promise that these files reduce bugs. No version bump and no npm publish.

## Success criteria

A guide test shows feature, design, and tasks are different files, each with its own heading and sentence. The tasks prompt contains the feature body and the design body. A `Task 1` line does not fill Breakdown. The results file is not a copy of the plan and does not say the tests passed. Implement adds no draft prompt.

## Risks / open questions

A model that omits a heading stops the guide. The person is not asked to type that heading. A later change can add a critic. This file is a proposal. The person has not signed it.
