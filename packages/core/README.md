# `@structured-vibe-coding/core`

Core engine for **Structured Vibe Coding** — local-first Spec-Driven Development.

Used by:

- `@structured-vibe-coding/cli` (`sdd` command)
- VS Code / Cursor extension (`packages/vscode`)

## Install

```bash
npm install @structured-vibe-coding/core
```

## Usage

```ts
import { initProject, createChange, advanceStage, loadConfig } from "@structured-vibe-coding/core";

const root = process.cwd();
await initProject({ projectRoot: root });
const config = await loadConfig(root);
const change = await createChange({
  projectRoot: root,
  config,
  title: "Add feature X",
  workflowName: "feature",
});
await advanceStage(root, config, change.id);
```

See the [repository README](https://github.com/structured-vibe-coding/spec-driven-development) for workflows, customization, and CLI docs.

## License

MIT
