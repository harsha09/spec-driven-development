# Brainstorm

> **Publish the missing npm package** · `2026-10-29-publish-the-missing-npm-package`

Skipped. One change to the existing publisher. No second workflow.

The 0.18.0 release hit this same `npm view` race. A one-shot pull request published the CLI that time. This change keeps the manual release workflow as the only publisher and teaches it to continue when one package is already on npm.
