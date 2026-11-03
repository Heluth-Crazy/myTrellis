---
name: trellis-plan
description: Plan larger or unclear work before building it by writing the task's prd.md with a goal and testable acceptance criteria. Use when a request is large, ambiguous, will span sessions, or will be handed to another agent.
---

# Plan a task

1. Create the folder: `trellis task new <slug>`. Without the CLI, create `.trellis/tasks/<MM-DD>-<slug>/`
   using today's date.
2. Investigate before asking. Read the relevant code and `.trellis/spec/` first. For decisions the user owns
   (product behavior, scope, trade-offs with a real cost), write the option you recommend into `prd.md`
   under **Decisions**, marked "proposed", and raise them all together when you show the plan. Stop to ask
   before writing only when no reasonable default exists.
3. Write `prd.md`:
   - **Goal**: one or two sentences, in the user's terms.
   - **Acceptance criteria**: observable and testable ("running X shows Y", "a test covers Z").
   - **Out of scope**: what this task will not do.
   - **Decisions**: answers the user gave, and proposed defaults awaiting their confirmation.
   - **Notes** (optional): constraints, risks, open questions.

   It is a contract, not a design document. Put a technical design in `design.md` only when the approach
   itself needs review.
4. If the work splits into parts that ship separately, list them in order in `prd.md`. Use separate task
   folders only when the parts will happen in different sessions or branches.
5. Show the user the goal, the criteria and any open decisions, and build once they agree. If they already
   said to go ahead, go ahead.
