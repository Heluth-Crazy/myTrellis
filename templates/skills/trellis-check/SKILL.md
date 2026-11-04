---
name: trellis-check
description: Verify work before calling it done by checking the change against the task's acceptance criteria and the relevant spec, running the project's checks, and recording a short validation.md. Use after implementing and before committing or reporting completion.
---

# Check the work

1. Find the task: the folder you are working in, or the one the user or branch names. With no task, check
   against the user's request.
2. Read the whole change (`git status`, `git diff`, untracked files) against each acceptance criterion and the
   relevant `.trellis/spec/` rules. Look for unmet criteria, broken callers, unrelated edits and leftover
   debug code.
3. Run the checks the project defines (AGENTS.md or CLAUDE.md, package scripts, CI config): lint, type check,
   and the tests that cover the change. Run them yourself. Don't rely on earlier reports, including your own.
4. Fix failures and run the checks again. If something can't be fixed within the task, say so plainly.
5. If there is a task folder, write or update `validation.md` in it (with no task, skip this step; don't
   create a folder just for it):
   - each check and its result;
   - how each acceptance criterion was verified;
   - anything not verified, and why.

   Summaries only, no raw logs.
6. Report what passed, what didn't, and what's left.
