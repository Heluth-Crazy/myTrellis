import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { init, uninstall, update } from '../src/install.js';
import { fileHash, hash, readManifest } from '../src/manifest.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-line-endings-'));
  mkdirSync(path.join(root, '.git'));
  roots.push(root);
  return root;
}

function crlf(content: Buffer): string {
  return content.toString('utf8').replace(/\r?\n/g, '\r\n');
}

describe('managed file line endings', () => {
  it('treats CRLF checkouts as clean for update and uninstall', () => {
    const root = project();
    init(root, ['codex']);
    const manifest = readManifest(root)!;
    const files = Object.keys(manifest.files);
    const previousMtimes = new Map<string, number>();
    for (const relative of files) {
      const file = path.join(root, ...relative.split('/'));
      writeFileSync(file, crlf(readFileSync(file)), 'utf8');
      const old = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(file, old, old);
      previousMtimes.set(relative, old.getTime());
    }

    expect(update(root)).toEqual(['Up to date.']);
    for (const relative of files) {
      const file = path.join(root, ...relative.split('/'));
      expect(Math.abs(statSync(file).mtimeMs - previousMtimes.get(relative)!)).toBeLessThan(2_000);
      expect(readFileSync(file).includes(Buffer.from('\r\n'))).toBe(true);
    }

    uninstall(root);
    for (const relative of files) expect(existsSync(path.join(root, ...relative.split('/')))).toBe(false);
  });

  it('still keeps content edits despite CRLF normalization', () => {
    const root = project();
    init(root, ['codex']);
    const relative = '.agents/skills/trellis-plan/SKILL.md';
    const file = path.join(root, ...relative.split('/'));
    writeFileSync(file, `${crlf(readFileSync(file))}edited\r\n`, 'utf8');

    expect(update(root)).toContain(`Kept edited file: ${relative}`);
    expect(uninstall(root)).toContain(`Kept edited file: ${relative}`);
    expect(existsSync(file)).toBe(true);
  });

  it('normalizes only CRLF for managed-file hashes', () => {
    expect(fileHash('one\ntwo\n')).toBe(fileHash('one\r\ntwo\r\n'));
    expect(fileHash('one\rtwo\n')).not.toBe(fileHash('one\ntwo\n'));
    expect(hash('one\r\ntwo\r\n')).not.toBe(fileHash('one\r\ntwo\r\n'));
  });
});
