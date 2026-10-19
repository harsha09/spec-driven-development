# Local test plan

> **Document a local SDD_ROLE_MODEL example** · `2026-10-19-document-a-local-sdd-role-model-example`

Node v20.19.3. Branch `story/issue-37/S-003` from main `cb20443`. No network.

| # | Check | Expected |
|---|--------|----------|
| 1 | Author prompt | `{text:"Draft from the local example."}` |
| 2 | Critique prompt | `text` is `Checked the draft.` Gap cite is `CHK-001`. Gap text is `The draft misses this check.` |
| 3 | Revision prompt | `text` is `Revised draft.`, `changed` is every gap cite, action is `write_file` on `notes/draft.md`. |
| 4 | Script source | No `import` and no URL. |
| 5 | `pnpm test` | Pass. |
