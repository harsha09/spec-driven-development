---
title: External MCP sources for sdd
description: Configure design systems, org libraries, and AST engines as MCP sources that sdd calls at the right stage — sdd is the MCP client.
---

# External MCP sources

sdd is an **MCP client**. You register servers that know your **design system**, **org libraries**, or **AST/code search**. sdd calls them when the process needs that context.

```text
Design-system MCP  ──┐
Org library MCP    ──┼──►  sdd (client)  ──► handoff / stage work
AST search MCP     ──┘         │
                               │ match: stage · workflow · intents · keywords
```

There is **no** “sdd MCP server for Cursor to drive `sdd next`” in this model. Process stays the **CLI** (`sdd new` / `next` / …). MCP is for **pulling external knowledge**.

---

## Use cases

| Use case | Example source | Typical stages |
|----------|----------------|----------------|
| UI/UX kit | `@acme/design-system-mcp` | design, implement, stories |
| Org / internal library | custom MCP over your packages | design, implement |
| AST / code search engine | org or third-party AST MCP | implement, code_research |
| API catalog | internal API MCP | design, lld, implement |

---

## Configure a source

```bash
cd your-app
sdd init --here --ai copilot   # creates empty .sdd/mcp.yaml

# Design system
sdd mcp sources add \
  --id design-system \
  --description "Acme design system" \
  --command npx \
  --arg -y --arg @acme/design-system-mcp \
  --stages design,implement \
  --intents ui,design \
  --keywords button,component,token \
  --tool search_components \
  --tool-arg query={{query}} \
  --priority 20

# External AST / code search
sdd mcp sources add \
  --id code-ast \
  --command npx \
  --arg -y --arg @acme/ast-search-mcp \
  --cwd '{{projectRoot}}' \
  --stages implement,code_research \
  --intents code \
  --tool search \
  --tool-arg query={{query}} \
  --tool-arg root={{projectRoot}} \
  --priority 30
```

List / match / test / fetch:

```bash
sdd mcp sources list
sdd mcp sources list --stage implement --query "primary button"
sdd mcp sources test design-system --query "button"
sdd mcp fetch --query "primary button" --intents ui
```

---

## When sdd calls a source

| Moment | Behavior |
|--------|----------|
| **Handoff** (`sdd agent`, process that writes handoff) | If `auto_fetch_on_handoff: true`, match sources to **stage + workflow + title**, call each `invoke.tool`, embed under **External MCP context** |
| **`sdd mcp fetch`** | Explicit pull now |
| Stage / keywords / intents don’t match | Source skipped |

Config file: **`.sdd/mcp.yaml`**

Templates in args: `{{query}}` `{{title}}` `{{stage}}` `{{workflow}}` `{{projectRoot}}`

---

## Commands

| Command | Purpose |
|---------|---------|
| `sdd mcp sources list` | Show sources |
| `sdd mcp sources add …` | Register source + when + invoke |
| `sdd mcp sources test <id>` | List tools or call invoke |
| `sdd mcp sources remove <id>` | Drop source |
| `sdd mcp fetch` | Pull matching sources now |

---

## Local AST (optional, not MCP)

Built-in TypeScript slices (no external server):

```bash
sdd context --path src/app.ts --symbol main --stdout
```

See [Code context](./code-context).

## Related

- [CLI reference](../reference/cli)  
- [Everyday loop](./everyday-loop)  
