# Intent

> **Issue #13: align Node engine requirements and support docs** · `2026-10-12-issue-13-align-node-engine-requirements-and-support-docs` · 2026-10-12

## Problem

The repository and package manifests declare Node.js `>=24`, but the README/tutorial and CLI help say Node 20+ while `sdd doctor` describes 24+ only as recommended. Users on Node 20 receive EBADENGINE warnings even though project tests happen to run locally.

## Proposed change

Keep the package engine requirement at Node 24+, update all install/support guidance to state Node 24+, and make `sdd doctor` report Node 20–23 as unsupported rather than healthy.

## Out of scope

Do not lower package engines, add CI runtimes, or claim Node 20/22 support.

## Local success check

All maintained user-facing docs/help agree on Node 24+, `doctor` passes on Node 24 and fails on older majors, and package manifests retain `>=24`.
