# Structured Vibe Coding — IntelliJ plugin

JetBrains IDEs (IntelliJ IDEA, WebStorm, etc.) integration for SDD.

## Approach

This plugin is **CLI-backed**: UI actions run the `sdd` binary on your PATH (same core as VS Code / Claude Code / Copilot integrations).

```text
IntelliJ action → Process sdd … → .sdd/ + changes/ on disk
GitHub Copilot (JetBrains) → reads .github/copilot-instructions.md + .sdd/active-context.md
```

## Prerequisites

```bash
npm i -g @structured-vibe-coding/cli
# or: ensure `sdd` is on PATH from monorepo build
sdd --help
```

## Build & run

Requires **JDK 17+**.

```bash
cd packages/intellij
./gradlew buildPlugin
# Output: build/distributions/structured-vibe-sdd-*.zip

./gradlew runIde   # sandboxed IDE with the plugin
```

Install zip: **Settings → Plugins → ⚙️ → Install Plugin from Disk…**

## Actions (Tools → SDD)

| Action | CLI |
|--------|-----|
| Initialize | `sdd init` |
| New Change | `sdd new "…"` (prompts) |
| Status | `sdd status` |
| Next Stage | `sdd next` |
| Local Verify | `sdd verify` |
| Complete | `sdd complete` |
| Refresh Agent Context | `sdd agents refresh` |
| Install Agent Files | `sdd agents install` |

## GitHub Copilot in IntelliJ

1. Install **GitHub Copilot** JetBrains plugin  
2. In the project: `sdd init` (or **SDD: Install Agent Files**) so `.github/copilot-instructions.md` and `AGENTS.md` exist  
3. After each stage: **Refresh Agent Context** so `.sdd/active-context.md` is current  
4. Copilot Chat uses those repo instructions automatically  

## Claude Code

Use the same repo files under `.claude/skills/sdd/` (from `sdd agents install`). Claude Code is terminal-based; IntelliJ is optional.

## Tests

```bash
./gradlew test
```

Unit tests verify Process command construction (no full IDE required for CI on machines without display).
