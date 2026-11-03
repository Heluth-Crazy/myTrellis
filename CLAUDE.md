<!-- TRELLIS:START -->
# Trellis

Project knowledge lives in `.trellis/`. Nothing is injected; read what the task needs.

- `.trellis/spec/` holds what the code can't tell you: decisions and their reasons, contracts between layers,
  platform pitfalls. Before changing an area, read the matching `index.md` there. Skip it for trivial edits.
- `.trellis/tasks/<MM-DD-slug>/` is one folder per piece of work that spans sessions, needs a plan the user
  should see, or is handed to another agent. `prd.md` holds the goal and acceptance criteria. Add short notes
  as needed: `findings.md`, `validation.md`, `brief-<name>.md`.

How to work:

- Small, clear requests: just do them. No task folder.
- Larger or unclear work: write `prd.md` first (skill `trellis-plan`), agree on it, then build.
- Before saying it's done: check against the acceptance criteria and run the project's checks
  (skill `trellis-check`).
- Handing work to another agent, or pausing: write a brief (skill `trellis-handoff`). After a context reset,
  re-read the task folder before continuing.
- Learned something the code doesn't show? Record it in the spec (skill `trellis-spec`).
- Keep task folders small: summaries, not raw logs, dumps or backups.
<!-- TRELLIS:END -->

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
