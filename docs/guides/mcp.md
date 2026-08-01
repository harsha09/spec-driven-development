---
title: MCP and sdd — sources vs serve
description: Configure external MCP sources (design systems, org libraries, AST engines) that sdd calls at the right stage, and optionally expose sdd tools to agents.
---

# MCP and sdd

There are **two directions**. Mixing them up is the usual confusion.

```text
┌─────────────────────┐         sdd mcp sources / fetch / handoff
│  Design-system MCP  │◄────────────────────────────────┐
│  Org library MCP    │                                 │
│  AST search MCP     │                                 │
└─────────────────────┘                                 │
                                                        ▼
                                              ┌──────────────────┐
                                              │   sdd (client)   │
                                              │  stages · packs  │
                                              └────────┬─────────┘
                                                       │
                         sdd mcp serve / setup         │
                       (optional)                      │
                                                       ▼
                                              ┌──────────────────┐
                                              │ Cursor / Claude  │
                                              │   (MCP client)   │
                                              └──────────────────┘
```

| Direction | Who calls whom | Command |
|-----------|----------------|---------|
| **A. Sources (what you asked for)** | **sdd calls** your org/lib/AST MCPs | `sdd mcp sources …` · auto on handoff |
| **B. Serve (optional)** | **Agents call** sdd tools | `sdd mcp serve` · `sdd mcp setup` |

---

## A — Use case: expose a UI library / org package / AST engine

### Story

You maintain (or your org runs) an MCP server that can answer:

- “Which button variants exist?” (design system)  
- “How do we call BillingService?” (internal API MCP)  
- “Find symbol `createInvoice`” (AST / code-search MCP)  

You want **sdd to pull that at the right time** (e.g. design or implement), not paste the whole monorepo, and not force every agent to know your private servers.

### 1. Init project

```bash
cd your-app
sdd init --here --ai copilot
# creates .sdd/mcp.yaml (empty sources)
```

### 2. Register sources (easy CLI)

**Design system / UI kit:**

```bash
sdd mcp sources add \
  --id design-system \
  --description "Acme design system" \
  --command npx \
  --arg -y --arg @acme/design-system-mcp \
  --stages design,implement,stories \
  --intents ui,design,component \
  --keywords button,token,theme,component \
  --tool search_components \
  --tool-arg query={{query}} \
  --priority 20
```

**Custom AST / code search engine:**

```bash
sdd mcp sources add \
  --id code-ast \
  --description "Org AST code search" \
  --command npx \
  --arg -y --arg @acme/ast-search-mcp \
  --cwd '{{projectRoot}}' \
  --stages implement,code_research,local_verify \
  --intents code,implement \
  --tool search \
  --tool-arg query={{query}} \
  --tool-arg root={{projectRoot}} \
  --priority 30
```

**Org API catalog:**

```bash
sdd mcp sources add \
  --id api-catalog \
  --command node \
  --arg /opt/acme/api-mcp/dist/index.js \
  --stages design,lld,implement \
  --intents api \
  --tool lookup_api \
  --tool-arg name={{query}}
```

### 3. See what would run

```bash
sdd mcp sources list
sdd mcp sources list --stage implement --query "primary button"
# → MATCH design-system, maybe skip api-catalog
```

### 4. Test connectivity

```bash
sdd mcp sources test design-system
# lists tools if no invoke yet

sdd mcp sources test design-system --query "button"
# calls invoke.tool with {{query}} filled
```

### 5. When does sdd call them?

| Moment | Behavior |
|--------|----------|
| **`sdd agent` / handoff write** | If `auto_fetch_on_handoff: true`, sdd matches sources to **current stage + workflow + title**, calls each `invoke.tool`, embeds text under **External MCP context** in `.sdd/handoff.md` |
| **`sdd mcp fetch`** | Explicit pull now (optional `--source`, `--tool`, `--query`, `--intents`) |
| **Wrong stage** | Source skipped (e.g. design-system not called on pure `vision`) |

Routing uses `.sdd/mcp.yaml` → `when.stages` / `workflows` / `intents` / `keywords`.

### 6. Config file (source of truth)

`.sdd/mcp.yaml`:

```yaml
version: 1
auto_fetch_on_handoff: true
max_chars_per_source: 6000
sources:
  - id: design-system
    description: Acme design system
    command: npx
    args: ["-y", "@acme/design-system-mcp"]
    priority: 20
    when:
      stages: [design, implement]
      intents: [ui, design]
      keywords: [button, component]
    invoke:
      tool: search_components
      args:
        query: "{{query}}"
```

Templates: `{{query}}` `{{title}}` `{{stage}}` `{{workflow}}` `{{projectRoot}}`.

---

## B — Optional: agents call sdd (inbound)

If the **agent host** should drive `sdd_new` / `sdd_next` as tools:

```bash
sdd mcp clients
sdd mcp setup --client cursor --write
# restart host
```

That is **sdd as MCP server**. Useful, but **not** how you attach a design-system library.

---

## Mental model (one line)

| You want… | Configure… |
|-----------|------------|
| sdd to **read** org UI lib / AST / API MCP | **`sdd mcp sources`** + `.sdd/mcp.yaml` |
| Cursor/Claude to **drive** sdd process | **`sdd mcp setup`** + `sdd mcp serve` |

---

## Commands cheat sheet

| Command | Role |
|---------|------|
| `sdd mcp sources list` | Show configured external sources |
| `sdd mcp sources add …` | Register a source + when + invoke |
| `sdd mcp sources test <id>` | List tools or call invoke |
| `sdd mcp sources remove <id>` | Drop a source |
| `sdd mcp fetch` | Pull matching sources now |
| `sdd mcp serve` | Expose sdd tools to agents |
| `sdd mcp setup --client …` | Wire agent host to sdd serve |

## Related

- [Code context (local AST CLI)](./code-context)  
- [CLI reference](../reference/cli)  
