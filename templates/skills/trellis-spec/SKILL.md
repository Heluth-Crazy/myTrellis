---
name: trellis-spec
description: Record project knowledge the code doesn't show in .trellis/spec/, such as decisions and their reasons, contracts between layers, platform pitfalls, and approaches that failed. Use after a task that taught something, when the user states a rule to remember, or to start a spec for a project that has none.
---

# Update the spec

1. Decide whether it belongs. Would a capable newcomer reading the code get this wrong? Skip anything the
   code, types, tests or git history already make clear.
2. Find the place: the `.trellis/spec/<area>/` folder for that part of the code. List each file in the area's
   `index.md` with one line on what it covers. For a new area, create `<area>/index.md`.
3. Write it short: the rule, why it exists, and an example or the files it applies to.
4. Prefer editing an existing entry to adding a new one. Delete entries that are no longer true, and fix
   paths that have moved.
5. Keep each file under about 200 lines. Split by topic when one grows past that.

## Starting a spec from scratch

Read the code first. Write down only what is not obvious from it: the architecture boundaries, how the layers
talk to each other, conventions the tools don't enforce, and known traps. One area per top-level part of the
project is enough to start. A short, correct spec beats a long, generic one.
