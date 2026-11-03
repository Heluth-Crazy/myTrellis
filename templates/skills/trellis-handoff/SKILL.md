---
name: trellis-handoff
description: Hand work to another agent or a future session by writing a self-contained brief in the task folder. Use when delegating to another agent CLI (Claude Code, Codex, Kimi, Pi, OpenCode), when context is running out, or when pausing work.
---

# Write a brief

The reader shares none of your context. Write `brief-<name>.md` in the task folder with:

- **Goal and done criteria**: point to `prd.md` and say what "done" means for this piece.
- **Where things are**: files, commands, branches and spec pages to read. Give paths, don't paste content.
- **What's known**: findings, decisions already made, and approaches that were tried and failed, with the
  reason.
- **Constraints**: what not to touch, safety rules (no destructive git commands, no killing processes by
  name), and a time budget.
- **How to verify**: the exact commands.
- **What to report back**: for example the changed files, check results and open questions, in a few lines.
  Long output goes to a file in the task folder.

To resume your own work after a context reset, use `brief-resume.md` and update it instead of adding new
briefs.

When the other agent reports back, verify its claims (run the checks again) before accepting the work.
