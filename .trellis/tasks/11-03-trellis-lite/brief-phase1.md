# Brief: Trellis Lite phase 1

You are implementing phase 1 of Trellis Lite in `D:/project/myTrellis`, branch `lite` (already checked out).

## Read first

- `.trellis/tasks/11-03-trellis-lite/prd.md`: goal and acceptance criteria.
- `.trellis/tasks/11-03-trellis-lite/design.md`: the design. Phase 1 = sections "Repository layout",
  "Targets", "Managed block", "Manifest", "Commands" (everything except migrate), "Tests" (non-migration).
- `templates/`: the product copy (block, four skills, task PRD, spec index). Don't reword it. If something in
  it looks wrong, leave it and mention it in your report.

This repo also contains an upstream Trellis install used by the old project (`.trellis/workflow.md`, the
TRELLIS block in AGENTS.md, `.claude/`, `.codex/`, ...). It does not apply to this work: don't run
`task.py`, don't follow its phase workflow, and don't edit those files. Phase 3 migrates them.

## Do

1. Replace the monorepo with a single root package as the design describes. Delete the listed upstream
   paths with `git rm` so the history stays clear. Upstream source stays readable in
   `D:/project/myTrellis-upstream` (read-only; never write there).
2. Implement `init`, `update`, `uninstall`, `task new|list|archive`, `--version`, `--help`. Add a `migrate`
   subcommand that only prints "not implemented yet" (phase 2).
3. Resolve `templates/` relative to the package root so it works from `dist/` and from tests.
4. Tests with vitest, temp dirs under the OS temp dir, removed in `afterEach`.
5. Short README.md and CONTRIBUTING.md. A minimal `.github/workflows/ci.yml` (`npm ci`, `npm run build`,
   `npm test` on windows-latest and ubuntu-latest); delete upstream workflows that no longer apply.

## Constraints

- npm only (pnpm is not installed). No runtime dependencies; dev dependencies limited to typescript,
  vitest, @types/node.
- Don't install anything globally and don't run `npm link`: a global upstream `trellis` is installed and
  must stay. Run the CLI as `node bin/trellis.js`.
- Don't commit. Claude reviews and commits.
- Never kill processes by image name (`taskkill /IM`, `Stop-Process -Name`, `pkill`, `killall`). Only kill
  PIDs you started.
- Keep artifacts bounded: no logs, dumps or scratch files in the repo; delete your temp dirs.
- Write LF line endings in generated files. Handle Windows paths.
- Time budget: about 90 minutes. Don't rerun the full suite more than needed.

## Verify

```
npm install
npm run build
npm test
node bin/trellis.js init --claude --codex   # in a scratch git repo under the OS temp dir, then delete it
```

## Report back (at most 25 lines)

Files added and deleted (summary), commands implemented, test count and result, what you ran by hand, any
deviations from the design and why, open questions, and template wording you think is wrong.
