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
