import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildMigrationPlan, executeMigration, restoreMigration } from '../src/migrate.js';

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
