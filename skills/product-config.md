# Product configuration

The skill pack does not name a product, a person, a vendor, a banned tool, or a path command. The product repository supplies those in `.sdd/skill-config.yaml`. `sdd init` does not write that file. Copy [`product-config.example.yaml`](product-config.example.yaml) when a product wants the pack, and leave a key empty when the answer is not known.

An empty key means the skill asks the person. It does not invent the value. The only default this pack assumes, when `authority` is omitted, is the word `human`. That is the approver already written on the shipped role files, and it means the person.

| Key | What the product puts here |
| --- | --- |
| `product_name` | The display name, and nothing else. |
| `authority` | Who may accept a spec. `human` means the person. Any other value must already be an approver on that product's team file. |
| `constitution_path` | Where non-negotiables live. The CLI default is `memory/constitution.md`. |
| `design_artifact` | File name of the design note inside the active change. The feature workflow uses `design.md`. |
| `acceptance_artifact` | File name of the acceptance note when the workflow has one. The patch workflow uses `acceptance.md`. |
| `qa_artifact` | File name of the QA note. The software-team workflow uses `qa-testing.md`. |
| `ux_artifact` | File name for the UX note. The pack suggests `ux.md`. The CLI does not require it. |
| `ui_binding_artifact` | File name for the UI binding. The pack suggests `ui-binding.md`. |
| `implementation_note` | File name for the implementer's note. The pack suggests `implementation-note.md`. |
| `module_roots` | Directories the implementer may edit. Empty means ask before naming a source path. |
| `tools` | Commands an agent may run, written as the product runs them. |
| `verify_commands` | Commands whose output counts as evidence. |
| `banned_actions` | Extra never-rules. They add to a skill's own never list. They do not replace it. |
| `ui_components` | Component names the UI binder may use. Empty means ask, and do not invent a library. |
| `persistence` | How this product stores data, in the product's words. Empty means describe durability without naming an engine or a vendor. |
| `locales` | Languages the UX writer may write. Empty means ask before writing copy a customer will read. |

Do not put secrets, tokens, account names, or machine paths in this file.
