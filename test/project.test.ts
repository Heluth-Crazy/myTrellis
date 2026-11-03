import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { projectRoot } from '../src/project.js';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

const roots: string[] = [];
afterEach(() => {
  vi.mocked(existsSync).mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('keeps marker-free projects in the starting directory instead of the filesystem root', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'trellis-lite-root-test-'));
  roots.push(root);
  // Ignore machine-specific ancestor markers (including a home Trellis install).
  vi.mocked(existsSync).mockReturnValue(false);
  expect(projectRoot(root)).toBe(realpathSync(root));
  expect(projectRoot(root)).not.toBe(path.parse(root).root);
});
