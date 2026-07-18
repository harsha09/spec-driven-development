# Structured Vibe Coding — VS Code / Cursor extension

Local-first Spec-Driven Development in the editor. Uses the **same core** as the `sdd` CLI (`@structured-vibe-coding/core`).

## Install

### From VSIX (recommended until Marketplace listing)

```bash
# from monorepo root
pnpm install && pnpm build
pnpm package:vscode
# installs packages/vscode/*.vsix
```

In VS Code or Cursor:

1. **Extensions** → `⋯` → **Install from VSIX…**
2. Select the generated `.vsix`

Or CLI:

```bash
code --install-extension packages/vscode/structured-vibe-*.vsix
# Cursor:
cursor --install-extension packages/vscode/structured-vibe-*.vsix
```

### Development

```bash
cd packages/vscode
pnpm build
# Press F5 in VS Code with this folder open, or:
# Extensions: Development Host
```

## Features

| Feature | Description |
|---------|-------------|
| **Activity bar view** | Active changes + stages + artifacts |
| **Command palette** | All SDD commands under “Structured Vibe” / “SDD:” |
| **Initialize / New change** | Same as `sdd init` / `sdd new` |
| **Next / Skip / Switch workflow** | Per-PR customization |
| **Gate approve / waive** | Hard gates (e.g. ARB) |
| **Local verify** | Runs on your machine; output channel |
| **Copy agent handoff** | Clipboard prompt for Cursor Chat / Copilot |
| **Auto-refresh** | Watches `.sdd/`, `changes/`, `archive/` |

## Commands

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- `SDD: Initialize in Workspace`
- `SDD: New Change`
- `SDD: Next Stage`
- `SDD: Skip Stage`
- `SDD: Switch Workflow`
- `SDD: Approve Gate` / `Waive Gate`
- `SDD: Local Verify`
- `SDD: Complete Change`
- `SDD: Copy Agent Handoff`
- `SDD: Show Status`
- `SDD: List Workflows`
- `SDD: Switch Active Change`

## Requirements

- VS Code **1.85+** or Cursor (VS Code compatible)
- A **folder workspace** open (single-root)

The extension does **not** require the CLI to be installed; the core engine is bundled.

## License

MIT
