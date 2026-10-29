---
title: AI agents setup for sdd
description: Connect sdd to one AI host — GitHub Copilot, Claude Code, Grok, Ollama, or Kilo Code — with a single init command.
---

# Set up your AI

You only need **one** AI coding tool. `sdd` installs a few small files for that tool and keeps the real rules in one place.

> Your **editor** (VS Code, Cursor, …) is not the AI.  
> Your **AI** (Copilot, Grok, Claude, Ollama, or Kilo) is what writes with you.

---

## Just set it up (this is enough)

```bash
# In your app folder — pick ONE:
sdd setup --ai copilot          # GitHub Copilot, plus planner, architect, and builder
# sdd setup --ai grok
# sdd setup --ai claude
# sdd setup --ai ollama         # then: ollama pull llama3.2
# sdd setup --ai kilo           # Kilo Code CLI

sdd doctor
sdd go "My first change"
```

`sdd init --here --ai copilot` installs that same host when you want to choose the workflow with `sdd new` yourself.

That’s it for day one. The AI often opens after process commands so it can help with the current step.

**Learn without the AI opening?** Add `--no-agent` (see [tutorial](../tutorials/first-change)).

**No AI host at all?** Run `sdd setup --no-agent` or `sdd init --here --no-agent`. sdd installs no host files and no `AGENTS.md`, and nothing ever launches. `sdd doctor` treats this as a valid setup.

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
| Kilo Code CLI | `kilo` |

Full host details: [Available agents](../reference/agents).

---

## What happens when I run commands?

| After this… | Does the AI open? |
|-------------|-------------------|
| `sdd new`, `next`, `verify`, `complete`, `agent`, … | **Yes** (unless `--no-agent`) |
| `sdd status`, `doctor`, `workflows`, `backlog list` | **No** |

| AI | How it runs |
|----|-------------|
| **grok** / **claude** / **ollama** / **kilo** | Terminal launches the CLI |
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

**One host at a time.** Installing a new AI removes the other hosts’ sdd-generated stubs so you don’t get a mess of them. Files you wrote yourself, other tools’ files, and sdd files you edited are never overwritten or deleted. sdd lists them as kept.

---

## Optional: roles (Copilot / Claude)

Some hosts get small role files (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`).  
They only say “read the live context, then the playbook.” Grok and Ollama use a single short brief instead.

---

## A product team is a different set of files

The host files above point an AI at the playbook. A product team is `.sdd/team.yaml` plus role files under `.sdd/roles/`.

```bash
sdd team init --template software
sdd team show
```

Room and check commands are in the [everyday loop](./everyday-loop) and the [CLI reference](../reference/cli).

---

## Related

- [Start in 10 minutes](../tutorials/first-change)  
- [Everyday loop](./everyday-loop)  
- [Available agents](../reference/agents)  
