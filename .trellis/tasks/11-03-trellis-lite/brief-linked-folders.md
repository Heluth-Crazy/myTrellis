# Brief: projects whose Trellis folders link into another project

## Goal and done criteria

`D:/project/ThreadTerm/ThreadTerm-vscode` shares ThreadTerm's spec and tasks: its `.trellis` and `.agents` are
directory junctions into `D:/project/ThreadTerm/ThreadTerm`. ThreadTerm is already migrated to Lite.
ThreadTerm-vscode's own upstream files (`.cursor`, `.grok`, `.kimi-code`, `.opencode`, the `AGENTS.md`
block) still reference `.trellis/scripts`, which no longer exists. Today `trellis migrate` refuses any
linked folder. Done means migrate, update, uninstall, init and task all behave as specified below, with
tests, and a copy of ThreadTerm-vscode migrates cleanly.

## Behavior

1. A top-level folder that migrate inspects (`.trellis`, `.agents`, any platform folder) that is a link
   (symlink or junction) is shared. Migrate never walks, writes or removes anything through it, and never
   removes the link itself. Links nested inside a real folder are still refused, as now.
2. If `.trellis` is linked and the target has no Lite manifest (`manifest.json` with
   `"tool": "trellis-lite"`), refuse with: `.trellis links to <target>; migrate that project first`.
3. Everything else migrates as usual: upstream files in the project's own folders are removed, configs are
   scrubbed and the block is written. Lite files whose destination is inside a linked folder are skipped,
   because the target project provides them. The report adds one line per link:
   `shared: .agents -> <target>`.
4. When `.trellis` is linked, no manifest is written. A second migrate prints "Nothing to migrate.", and
   `--restore` is byte-exact. The backup stays outside the project, as now.
5. `update` in a project with a linked `.trellis` refreshes only the existing TRELLIS blocks in `AGENTS.md`
   and `CLAUDE.md` to the current template. It says the files and manifest belong to the target project.
   `init` and `uninstall` there fail with: `.trellis links to <target>; run this in <target project>`.
6. `task new|list|archive` follow a linked `.trellis`, because sharing tasks is the point of the link.
7. Update `.trellis/spec/migration/index.md` (the invariant about linked folders) and the README's
   "Linked folders" bullet. Keep the wording plain and short.

## Where things are

- `src/migrate.ts` (walk, plan, execute, restore), `src/install.ts`, `src/tasks.ts`, `src/project.ts`
  (`projectPath` refuses symlinks), `test/migrate.plan.test.ts`, `test/migrate.integration.test.ts`.
- On Windows, `fs.symlinkSync(target, link, 'junction')` needs no admin rights. On POSIX the type argument
  is ignored, and CI runs on both.

## Constraints

- Never modify `D:/project/ThreadTerm/ThreadTerm` or `D:/project/ThreadTerm/ThreadTerm-vscode`. For the real
  check, copy ThreadTerm-vscode's own entries (everything except `node_modules`, `dist` and the two junctions)
  into `D:/project/myTrellis-scratch/linked/vscode/`, and copy ThreadTerm's `.trellis` and `.agents` into
  `D:/project/myTrellis-scratch/linked/ThreadTerm/`. Recreate the junctions to that copy, migrate the vscode
  copy, and check `--restore` byte-identity. Remove junctions with `cmd /c rmdir <link>` only. Never run a
  recursive delete through a junction.
- npm only, no runtime dependencies, no global installs, don't commit. Never kill processes by image name. No
  persistent files in the OS temp folder. LF endings. Don't change `templates/`.

## How to verify

`npm run build && npm test`. Then do the copy check above, and run `trellis migrate --dry-run` (as
`node bin/trellis.js`) in the real ThreadTerm-vscode. That command is read-only. Record what you checked in
`validation.md` under a "Linked folders" heading.

## Report back

In at most 20 lines: changed files, test counts, the dry-run report for real ThreadTerm-vscode, and any open
questions.
