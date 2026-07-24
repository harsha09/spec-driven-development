# Build a simple feature

Step-by-step path for a normal product feature (not a one-line hotfix, not full enterprise ARB).

## 1. Init (once per app)

```bash
cd your-app
sdd init --here --ai copilot    # or grok | claude
sdd doctor
```

## 2. Start a feature pack

```bash
sdd new "Add CSV export for reports" -w feature -y
```

Or omit `-w feature` and accept the recommendation if the title already sounds like a feature.

## 3. Work the stages

Typical flow (optional clarify/brainstorm stages can be skipped):

```bash
# Stage: intent — fill changes/<id>/feature.md
# Paste real scope, users, non-goals, success criteria
sdd next

# Optional: sdd skip clarify_intent -r "clear"
# Optional: sdd skip brainstorm -r "one approach"

# Stage: design — fill design.md
sdd next

# Optional clarify_design skip if needed

# Stage: tasks — fill tasks.md
sdd next

# Stage: implement — write product code (agent or you)
sdd next

# Stage: local_verify
sdd verify
sdd complete
```

## Sample `feature.md` body

```markdown
# Feature

Users need to download the current report as CSV for offline analysis.

## Users
Analysts who already can view the report in the app.

## Scope
- Export visible columns for the filtered result set
- Stream large results

## Non-goals
- PDF export
- Scheduled email of exports

## Success
Download completes for 10k rows without timeout; file opens in Excel.
```

## Tips

- Empty templates block `sdd next` — write real sentences  
- Mid-flight polish: `sdd refine` or `sdd refine design`  
- Code focus for agents: `sdd context --path … --symbol …`  
- See stage map: [Built-in workflows](../reference/workflows)  

## Related

- [First change tutorial](../tutorials/first-change) (hotfix-oriented)  
- [Everyday loop](./everyday-loop)  
- [Enterprise path](./enterprise)  
