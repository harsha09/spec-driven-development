---
title: AI agents setup for sdd
description: Connect sdd to GitHub Copilot, Grok, Claude Code, or Ollama in one command. Simple setup first; details later.
---

# Set up your AI

You only need **one** AI coding tool. `sdd` installs a few small files for that tool and keeps the real rules in one place.

> Your **editor** (VS Code, Cursor, …) is not the AI.  
> Your **AI** (Copilot, Grok, Claude, Ollama) is what writes with you.

---

## Just set it up (this is enough)

```bash
# In your app folder — pick ONE:
sdd init --here --ai copilot    # GitHub Copilot
# sdd init --here --ai grok
# sdd init --here --ai claude
# sdd init --here --ai ollama   # then: ollama pull llama3.2

sdd doctor
sdd new "My first change" -w hotfix -y
```

That’s it for day one. The AI often opens after process commands so it can help with the current step.

**Learn without the AI opening?** Add `--no-agent` (see [tutorial](../tutorials/first-change)).

**Switch AI later:**

```bash
sdd agents install --ai claude --force
```

---

## Which AI should I pick?

| You already use… | Choose |
|------------------|--------|
| Copilot in VS Code / Cursor | `copilot` |
| Grok Build CLI | `grok` |
| Claude Code CLI | `claude` |
| Local models only | `ollama` |

Full host details: [Available agents](../reference/agents).

---

## What happens when I run commands?

| After this… | Does the AI open? |
|-------------|-------------------|
| `sdd new`, `next`, `verify`, `complete`, `agent`, … | **Yes** (unless `--no-agent`) |
| `sdd status`, `doctor`, `workflows`, `feature list` | **No** |

| AI | How it runs |
|----|-------------|
| **grok** / **claude** / **ollama** | Terminal launches the CLI |
| **copilot** | Open Copilot Chat → agent `sdd` (handoff file is refreshed) |

Skip the AI once: `--no-agent` or `SDD_NO_AGENT=1`.

---

## Where do the rules live?

You don’t need to memorize this on day one.

| File | Role |
|------|------|
| `.sdd/protocol.md` | The one short playbook |
| `.sdd/active-context.md` | What you’re doing *right now* |
| `.sdd/handoff.md` | Brief the AI just saw |
| Host folder (`.github/agents`, `.grok/rules`, …) | Tiny pointers to the playbook |

**One host at a time.** Installing a new AI removes the other hosts’ agent folders so you don’t get a mess of stubs.

---

## Optional: roles (Copilot / Claude)

Some hosts get small role files (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`).  
They only say “read the live context, then the playbook.” Grok and Ollama use a single short brief instead.

---

## Related

- [Start in 10 minutes](../tutorials/first-change)  
- [Everyday loop](./everyday-loop)  
- [Available agents](../reference/agents)  
