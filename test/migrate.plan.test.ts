import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildMigrationPlan, executeMigration, migrationReport, restoreMigration } from '../src/migrate.js';
import { init } from '../src/install.js';
import { hash } from '../src/manifest.js';

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture(): { root: string; backup: string } {
  const parent = mkdtempSync(path.join(tmpdir(), 'lite-plan-'));
  temporary.push(parent);
  const root = path.join(parent, 'project');
  mkdirSync(path.join(root, '.trellis', 'scripts'), { recursive: true });
  writeFileSync(path.join(root, '.trellis', 'scripts', 'task.py'), 'legacy\r\n');
  return { root, backup: path.join(parent, 'backups') };
}
it('rejects a project change after planning before backup or mutation', () => {
  const { root, backup } = fixture();
  const plan = buildMigrationPlan(root);
  writeFileSync(path.join(root, '.trellis', 'scripts', 'task.py'), 'later edit');
  expect(() => executeMigration(plan, backup)).toThrow('changed since planning');
  expect(existsSync(backup)).toBe(false);
  expect(readFileSync(path.join(root, '.trellis', 'scripts', 'task.py'), 'utf8')).toBe('later edit');
});
it('rejects an internal backup before changing any files', () => {
  const { root } = fixture();
  expect(() => executeMigration(buildMigrationPlan(root), path.join(root, 'backup'))).toThrow('outside the project');
  expect(readFileSync(path.join(root, '.trellis', 'scripts', 'task.py'), 'utf8')).toBe('legacy\r\n');
});
it('verifies the complete backup before restoring any files', () => {
  const { root, backup } = fixture();
  const saved = executeMigration(buildMigrationPlan(root), backup);
  writeFileSync(path.join(saved, 'files', '.trellis', 'scripts', 'task.py'), 'corrupt');
  const manifest = readFileSync(path.join(root, '.trellis', 'manifest.json'));
  expect(() => restoreMigration(root, saved)).toThrow('hash mismatch');
  expect(readFileSync(path.join(root, '.trellis', 'manifest.json'))).toEqual(manifest);
  expect(existsSync(path.join(root, '.trellis', 'scripts', 'task.py'))).toBe(false);
});
it('preserves later edits and restores only after conflicts have been resolved', () => {
  const { root, backup } = fixture();
  const saved = executeMigration(buildMigrationPlan(root), backup);
  writeFileSync(path.join(root, '.trellis', 'manifest.json'), 'later edit');
  expect(() => restoreMigration(root, saved)).toThrow('later edit');
  expect(readFileSync(path.join(root, '.trellis', 'manifest.json'), 'utf8')).toBe('later edit');
});
it('restores original empty directories and removes created directories', () => {
  const { root, backup } = fixture();
  mkdirSync(path.join(root, '.claude', 'empty'), { recursive: true });
  const saved = executeMigration(buildMigrationPlan(root), backup);
  restoreMigration(root, saved);
  expect(readFileSync(path.join(root, '.trellis', 'scripts', 'task.py'), 'utf8')).toBe('legacy\r\n');
  expect(readdirSync(path.join(root, '.claude', 'empty'))).toEqual([]);
  expect(existsSync(path.join(root, '.trellis', 'manifest.json'))).toBe(false);
});
it.each([false, true])('removes OpenCode dependencies only when its package is deleted (user dependency: %s)', userDependency => {
  const { root, backup } = fixture();
  mkdirSync(path.join(root, '.opencode', 'node_modules'), { recursive: true });
  const packageFile = path.join(root, '.opencode', 'package.json');
  writeFileSync(packageFile, JSON.stringify({ dependencies: { '@opencode-ai/plugin': '1', ...(userDependency ? { 'user-package': '1' } : {}) } }));
  const dependency = path.join(root, '.opencode', 'node_modules', 'plugin.js');
  const lock = path.join(root, '.opencode', 'package-lock.json');
  writeFileSync(dependency, 'dependency bytes');
  writeFileSync(lock, 'lock bytes');
  const saved = executeMigration(buildMigrationPlan(root), backup);
  expect(existsSync(dependency)).toBe(userDependency);
  expect(existsSync(lock)).toBe(userDependency);
  expect(existsSync(packageFile)).toBe(userDependency);
  restoreMigration(root, saved);
  expect(readFileSync(dependency, 'utf8')).toBe('dependency bytes');
  expect(readFileSync(lock, 'utf8')).toBe('lock bytes');
});
it('ignores hash-file ownership claims over protected user files and .git', () => {
  const { root, backup } = fixture();
  const protectedFiles = ['.git/config', '.trellis/spec/custom.md', '.trellis/tasks/user/check.jsonl', '.trellis/workspace/user/notes.md'];
  for (const relative of protectedFiles) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), `user bytes ${relative}\r\n`);
  }
  writeFileSync(path.join(root, '.trellis', '.template-hashes.json'), JSON.stringify({ hashes: Object.fromEntries(protectedFiles.map(relative => [relative, '0'.repeat(64)])) }));
  const saved = executeMigration(buildMigrationPlan(root), backup);
  for (const relative of protectedFiles) expect(readFileSync(path.join(root, relative), 'utf8')).toBe(`user bytes ${relative}\r\n`);
  restoreMigration(root, saved);
  for (const relative of protectedFiles) expect(readFileSync(path.join(root, relative), 'utf8')).toBe(`user bytes ${relative}\r\n`);
});
it('keeps an edited structured config intact with --keep-edited and reports its dangling references', () => {
  const { root, backup } = fixture();
  mkdirSync(path.join(root, '.claude'), { recursive: true });
  const config = '{"user":true,"hooks":{"SessionStart":[{"hooks":[{"command":"python .trellis/scripts/task.py"}]}]}}';
  writeFileSync(path.join(root, '.claude', 'settings.json'), config);
  const plan = buildMigrationPlan(root, { keepEdited: true });
  expect(plan.kept).toContain('.claude/settings.json');
  expect(plan.leftovers).toContain('.claude/settings.json');
  executeMigration(plan, backup);
  expect(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).toBe(config);
});
it('removes generated files and whole upstream backups even with --keep-edited', () => {
  const { root, backup } = fixture();
  const generated = ['.trellis/.developer', '.trellis/.current-task', '.trellis/.version', '.trellis/.ralph-state.json', '.trellis/.runtime/events.json', '.trellis/scripts/__pycache__/task.pyc', '.trellis/scripts/task.pyc', '.trellis/.backup-old/AGENTS.md', '.trellis/.backup-old/.claude/settings.json'];
  for (const relative of generated) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), relative.endsWith('AGENTS.md') ? '<!-- TRELLIS:START -->old<!-- TRELLIS:END -->' : 'generated bytes');
  }
  mkdirSync(path.join(root, '.trellis', '.backup-empty'));
  const plan = buildMigrationPlan(root, { keepEdited: true });
  for (const relative of generated) expect(plan.changes.find(c => c.relative === relative)).toMatchObject({ group: 'removed', after: undefined });
  const saved = executeMigration(plan, backup);
  expect(existsSync(path.join(root, '.trellis', '.backup-old'))).toBe(false);
  expect(existsSync(path.join(root, '.trellis', '.backup-empty'))).toBe(false);
  restoreMigration(root, saved);
  for (const relative of generated) expect(existsSync(path.join(root, relative))).toBe(true);
  expect(readdirSync(path.join(root, '.trellis', '.backup-empty'))).toEqual([]);
});
it('stores only paths, modes and raw hashes in backup metadata, regardless of payload size', () => {
  const { root, backup } = fixture();
  const payload = Buffer.alloc(2 * 1024 * 1024, 117);
  writeFileSync(path.join(root, '.trellis', 'scripts', 'payload.bin'), payload);
  const plan = buildMigrationPlan(root);
  const saved = executeMigration(plan, backup);
  const metadata = readFileSync(path.join(saved, 'plan.json'), 'utf8');
  const record = JSON.parse(metadata) as { format: number; changes: Array<Record<string, unknown>> };
  expect(record.format).toBe(2);
  expect(metadata.length).toBeLessThan(10_000);
  expect(record.changes.every(c => !('before' in c) && !('after' in c))).toBe(true);
  const stored = record.changes.find(c => c.relative === '.trellis/scripts/payload.bin');
  expect(stored?.beforeHash).toBe(hash(payload));
  expect(readFileSync(path.join(saved, 'files', '.trellis', 'scripts', 'payload.bin')).equals(payload)).toBe(true);
  restoreMigration(root, saved);
  expect(readFileSync(path.join(root, '.trellis', 'scripts', 'payload.bin')).equals(payload)).toBe(true);
});
it('limits each reported path list to ten and stores the complete lists in the backup plan', () => {
  const { root, backup } = fixture();
  for (let i = 0; i < 13; i++) writeFileSync(path.join(root, '.trellis', 'scripts', `edited-${i.toString().padStart(2, '0')}.py`), 'custom');
  const plan = buildMigrationPlan(root);
  plan.kept = Array.from({ length: 12 }, (_, i) => `kept-${i}`);
  plan.leftovers = Array.from({ length: 14 }, (_, i) => `leftover-${i}`);
  const report = migrationReport(plan).join('\n');
  expect(report).toContain("... and 4 more (full list in the backup's plan.json)");
  expect(report).toContain("... and 2 more (full list in the backup's plan.json)");
  expect(report).not.toContain('  .trellis/scripts/edited-10.py');
  expect(report).not.toContain('  kept-10');
  expect(report).not.toContain('  leftover-10');
  const saved = executeMigration(plan, backup);
  const record = JSON.parse(readFileSync(path.join(saved, 'plan.json'), 'utf8')) as { kept: string[]; leftovers: string[]; changes: unknown[] };
  expect(record.kept).toEqual(plan.kept);
  expect(record.leftovers).toEqual(plan.leftovers);
  expect(record.changes).toHaveLength(plan.changes.length);
});
it('keeps unchanged CRLF Lite files intact both alone and alongside upstream remnants', () => {
  const { root } = fixture();
  rmSync(path.join(root, '.trellis', 'scripts'), { recursive: true });
  init(root, ['codex']);
  const manifest = JSON.parse(readFileSync(path.join(root, '.trellis', 'manifest.json'), 'utf8')) as { files: Record<string, string> };
  for (const relative of Object.keys(manifest.files)) {
    const file = path.join(root, relative);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  }
  expect(buildMigrationPlan(root).changes).toEqual([]);
  mkdirSync(path.join(root, '.trellis', 'scripts'));
  writeFileSync(path.join(root, '.trellis', 'scripts', 'old.py'), 'old');
  const plan = buildMigrationPlan(root);
  for (const relative of Object.keys(manifest.files)) expect(plan.changes.some(c => c.relative === relative)).toBe(false);
});
