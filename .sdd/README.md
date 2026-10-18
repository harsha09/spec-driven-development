<!-- sdd:generated sha256=478127dae0620d8e07d3a03aa74f4ce0388539d87ea4be82065bd7044779218c (sdd regenerates this file only while it is unchanged; edit freely) -->
# Structured Vibe Coding (SDD)

This directory configures local Spec-Driven Development for this repo.

- `config.yaml` — project settings and per-change policy
- `workflows/` — YAML workflow packs (customize freely)
- `templates/` — markdown templates for stage artifacts
- `protocol.md` / `active-context.md` — agent playbook + live task (after agent install)

Work lives in `../changes/<id>/`. Completed packs stay there with `status: completed`.
Promote lasting decisions into `../memory/`. (Archive-on-complete is opt-in.)

**Documentation map (stable):** `../memory/index.md`  
**Change-scoped docs:** `../changes/<id>/`

## Quick commands

```bash
sdd new "My feature"
sdd status
sdd next
sdd verify
sdd complete
```
