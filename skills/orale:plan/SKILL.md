---
name: orale:plan
description: Plan a feature interactively — explore the codebase, clarify requirements, and produce a structured implementation proposal with file impact analysis. Use when the user runs /orale:plan or asks to plan a new feature with orale.
user-invocable: true
---

# orale:plan

Interactively plan a feature: explore the codebase, clarify requirements, identify files, and produce a structured proposal ready for task decomposition.

## Trigger

The user runs `/orale:plan` from any project directory.

---

## Workflow

### Phase 1 — Understand

Explore the codebase and clarify requirements with the user until you have a complete picture of what needs to be built:

- What is the feature or change?
- Which parts of the codebase are affected?
- What are the constraints, edge cases, acceptance criteria?
- Are there external dependencies (APIs, services, schema changes)?
- Are there existing patterns or utilities to reuse?
- **PR strategy** — present all three options and wait for the user's explicit choice before continuing:
  1. **PR per task → main** (`pr-per-task`) — each task gets its own PR directly to main. Best for small, independent features.
  2. **PR per task → integration branch** (`pr-per-task-to-integration`) — each task PR targets an integration branch; the integration branch is later merged to main. Best for team review workflows.
  3. **Local integration branch — one final PR** (`local-integration`) — all tasks commit on a shared branch; a single combined PR is opened at the end. Best for large features or a clean history.
  If option 2 or 3: also ask for the integration branch name (e.g. `integration/auth-rework`).

Read relevant source files. Ask focused questions — one topic at a time, not a wall of questions. Do not proceed to Phase 2 until you fully understand the work.

---

### Phase 2 — Produce a Feature Proposal

Write a structured proposal document in the conversation (do NOT save to disk):

```markdown
# Feature: {Feature Title}

**Project:** {$PWD}
**Date:** {today}

## Summary
One paragraph describing what will be built and why.

## Scope
What is explicitly in scope and out of scope.

## Technical Approach
How the feature will be implemented at a high level.

**PR Workflow:** {strategy chosen by user — e.g. `pr-per-task` / `pr-per-task-to-integration` (integration branch: `name`) / `local-integration`}

## Files Affected
| File | Change Type | Description |
|------|-------------|-------------|
| src/auth/jwt.service.ts | Create | New JWT service |
| src/auth/types.ts | Modify | Add TokenPayload type |

## Key Decisions
- Decision 1 and rationale
- Decision 2 and rationale

## Open Questions
- Anything still unclear that needs answering before implementation
```

Ask the user: "Does this proposal look correct? Any adjustments before I break it into tasks?"

Wait for explicit approval. If there are open questions, resolve them first.

---

## Completion

Once the user approves the proposal, suggest the next step:

```
Feature plan complete. Next step:

Run /orale:tasks to decompose this plan into executable tasks.
```
