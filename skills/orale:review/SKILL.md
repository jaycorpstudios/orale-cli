---
name: orale:review
description: Address unresolved GitHub PR review comments for orale tasks in code-review status. Use when the user runs /orale:review or asks to address review comments on a task.
user-invocable: true
---

# orale:review

Address unresolved GitHub PR review comments for tasks in `code-review` status.

## Trigger

The user runs `/orale:review` (optionally with a task ID: `/orale:review AUTH-003`).

---

## Workflow

1. **Identify the task(s)**
   - If the user provided a task ID, use it
   - Otherwise, run: `orale tasks list --status code-review --project $PWD`
   - Present the list and ask which task(s) to address

2. **Check for review comments**
   Run the orale CLI to address review comments:
   ```bash
   npx orale-cli run <task-id> --project $PWD --address-review-comments
   ```
   
   Or if you want to check first:
   ```bash
   npx orale-cli tasks show <task-id>
   ```
   Then check the `pr_url` field and verify with `gh pr view`.

3. **Report results**
   After the command completes, report which threads were addressed and the PR URL.
