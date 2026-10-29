# Feature

> **Publish the missing npm package** · `2026-10-29-publish-the-missing-npm-package` · 2026-10-29

This is a proposal. The person has not signed it.

## Problem

Release run 40867700514 published `@structured-vibe-coding/core@0.19.0` and then stopped. `npm view` did not show that version within 30 seconds (6 tries, 5 seconds apart). The CLI stayed at 0.18.0. The release commit and the git tag were not created. A few minutes later the registry listed core 0.19.0. The CLI still has no 0.19.0.

The next release run would see core 0.19.0 and patch-bump both packages, because the guard treats either package as enough. That would leave core 0.19.0 without a matching CLI.

## Users

Someone installing `@structured-vibe-coding/cli` from npm.

## Scope

`scripts/publish-npm.sh` waits about five minutes for `npm view`, and skips a package that is already on npm. `scripts/ensure-unpublished-version.mjs` patch-bumps only when both packages already have the version. `docs/maintainers/ci-cd.md` says the same thing.

## Out of this change

No change to product TypeScript. No hand-written version bump. No second publish workflow. The manual release workflow remains the only publisher. Issue #88 and issue #54 stay open.

## Success

A release run whose core version is already on npm still publishes the CLI at that same version, then commits the tag.
