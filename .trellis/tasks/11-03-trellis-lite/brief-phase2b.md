# Brief: phase 2 follow-ups (from review and real-project dry runs)

Phase 2 is committed. These fixes come from Claude's review and from `migrate --dry-run` on copies of nine
real projects in `D:/project/myTrellis-scratch/real/` (read them freely; you may run migrate on them, but
re-copy with `D:/project/myTrellis-scratch/copy-real.sh` afterwards if you change them).

1. **Platform detection in migrate.** Today only platforms that own migrated files are selected, so:
   - `real/ThreadTerm-mobile` (only `.trellis/` and an AGENTS.md block) prints "(none supported)": the block
     is stripped and nothing replaces it;
   - `real/ThreadTerm-v3` (`.claude/` with non-Trellis skills, CLAUDE.md, Trellis skills in `.agents/skills`)
     selects only `opencode`.

   Select the union of: platforms owning migrated files; the same directory detection `init` uses
   (`.claude`, `.codex`, `.kimi-code`, `.pi`, `.opencode`); `claude` when CLAUDE.md exists; and `codex` when
   an agents-target signal exists (AGENTS.md had a TRELLIS block, or upstream `.agents/skills/trellis-*`)
   but no agents-target platform was selected. With upstream evidence, never end with zero platforms. Add
   tests shaped like both projects.
2. **Generated files are never "edited".** `.trellis/.developer`, `.current-task`, `.version`,
   `.template-hashes.json`, `.ralph-state.json`, `.trellis/.runtime/**`, any `__pycache__/**` or `*.pyc`
   go to "removed". Only template content files can be "edited-and-removed".
3. **Upstream update backups.** `.trellis/.backup-*/` folders (made by upstream `trellis update`) are removed
   whole as "removed". Today only the `__pycache__` files inside are removed (see `real/ThreadTerm`).
4. **Narrower scrubbers.** `.codex/config.toml`: remove `project_doc_fallback_filenames` only when its value
   is exactly `["AGENTS.md"]`. `.pi/settings.json`: remove `enableSkillCommands` only when the file also had
   the Trellis extension entry.
5. **Line endings in install hashes.** Git with `core.autocrlf=true` (the default on Windows, and set on this
   machine) checks managed files out with CRLF. `update`, `uninstall` and migrate's Lite-manifest checks
   must compare hashes on CRLF→LF normalized text (blocks already do), so a CRLF checkout of unchanged files
   reports "Up to date." and is not "edited". Test it.
6. **Bounded backups.** `plan.json` stores every file's bytes in base64 (`before`/`after`) on top of
   `files/`, which doubles large removals such as `.opencode/node_modules`. Store paths, modes and hashes in
   `plan.json`; keep original bytes only under `files/`. For the "later edit" check during restore, store
   the hash of the written content instead of the content.
7. **Report length.** List at most 10 paths per group, then "... and N more (full list in the backup's
   plan.json)".
8. **Test time.** Report how long `npm test` takes with `TL_FIXTURES` set. If the fixture group takes more
   than about 2 minutes, make it cheaper (for example, run full restore round trips on 3 representative
   versions and plan-only checks on the rest).

Constraints as before: npm only, no runtime dependencies, no global installs, don't commit, never kill
processes by image name, no persistent files in the OS temp folder, keep artifacts bounded, LF endings.
Don't change `templates/` (Claude edits those).

Verify: `npm run build && npm test`, `TL_FIXTURES=D:/project/myTrellis-scratch/cache npm test`, and
`migrate --dry-run` on each project in `real/` (paste the first 4 lines of each into your report).

Report back in at most 30 lines.
