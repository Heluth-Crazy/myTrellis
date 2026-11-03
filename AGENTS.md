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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Trellis** (14336 symbols, 20870 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Trellis/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Trellis/clusters` | All functional areas |
| `gitnexus://repo/Trellis/processes` | All execution flows |
| `gitnexus://repo/Trellis/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
