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
- What is the desired PR workflow? (one PR per task to main / one PR per task to an integration branch / a single final PR with all changes)

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

**PR Workflow:** [pr-per-task (default) | pr-per-task-to-integration (integration branch: `name`) | local-integration (one final PR)]

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
