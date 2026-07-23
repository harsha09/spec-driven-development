# Agents vs IDEs

> `sdd init` installs an **AI coding agent** host — not a VS Code or IntelliJ extension.

IDEs edit files. Agents generate and reason. Spec Kit–style tools target agent files (`.github/agents`, `.claude/agents`, `.grok/rules`).

```bash
sdd init --here --ai grok
# writes .grok/rules/sdd.md + AGENTS.md — no marketplace extension
```

Use any editor. Process is the CLI. Thin agent stubs plus `.sdd/protocol.md` keep one source of process truth.

## Related

- [Agents setup guide](/guides/agents)  
