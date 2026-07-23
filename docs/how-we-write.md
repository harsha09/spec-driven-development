# How we write docs

> **Point:** Every page has one job and one cognitive mode — so you never mix a tutorial with a flag encyclopedia.

## Diátaxis (structure)

| Mode | You need to… | In this site |
|------|----------------|--------------|
| **Tutorial** | Learn by doing | [First change](/tutorials/first-change) |
| **How-to** | Achieve a goal | [Guides](/guides/agents) |
| **Reference** | Look up a fact | [CLI](/reference/cli) |
| **Explanation** | Understand why | [Concepts](/concepts/why-sdd) |

Do not put “why we built it” in the middle of install steps.

---

## PREP (paragraphs that stick)

1. **Point** — the claim in one line  
2. **Reason** — why it matters  
3. **Example** — command, file, or story  
4. **Point** — restate so it lands  

Use PREP in concepts and guide intros.

---

## PSB (open a guide)

| Letter | Meaning |
|--------|---------|
| **P**roblem | Pain before `sdd` |
| **S**olution | What you do with `sdd` |
| **B**enefit | Outcome for the team |

---

## What · So what · Now what

| Layer | Question |
|-------|----------|
| **What** | What is true? |
| **So what** | Why should I care? |
| **Now what** | What do I run or open next? |

Ideal for home page and concept closings.

---

## What · When · How

| Layer | Question |
|-------|----------|
| **What** | Artifact / command / feature |
| **When** | Stage or situation |
| **How** | Concrete steps |

Ideal for reference intros and “everyday loop” guides.

---

## Page skeleton (copy this)

```markdown
# Title as a job or question

> One-sentence answer (search + humans).

## Problem · Solution · Benefit
...

## What / When / How
...

## Steps (how-to) or Explanation (concept)
...

## Now what
- Link to next page
```

**SEO:** one H1, descriptive title, first paragraph answers the query, stable path under `/guides/`, `/tutorials/`, `/reference/`, `/concepts/`.
