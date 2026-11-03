import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { projectPath } from './project.js';

export const platforms = ['claude', 'codex', 'kimi', 'pi', 'opencode'] as const;
export type Platform = typeof platforms[number];
export interface Manifest {
  tool: 'trellis-lite';
  version: string;
  platforms: Platform[];
  files: Record<string, string>;
  blocks: Record<string, string>;
}

export function hash(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Hash managed text files independent of Git's checkout line endings. */
export function fileHash(bytes: string | Buffer): string {
  return hash((typeof bytes === 'string' ? bytes : bytes.toString('utf8')).replace(/\r\n/g, '\n'));
}

export function readManifest(root: string, shared: string[] = []): Manifest | undefined {
  const file = projectPath(root, '.trellis/manifest.json');
  if (!existsSync(file)) return undefined;
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object') throw new Error('Invalid Lite manifest');
  const m = value as Manifest;
  if (m.tool !== 'trellis-lite' || typeof m.version !== 'string' || !Array.isArray(m.platforms) || !m.platforms.every(p => platforms.includes(p)) || !m.files || !m.blocks) {
    throw new Error('Invalid Lite manifest');
  }
  for (const entries of [m.files, m.blocks]) {
    if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid Lite manifest');
    for (const [relative, digest] of Object.entries(entries)) {
      if (!relative || relative.includes('\0') || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid manifest path');
      if (!shared.some(folder => relative.startsWith(`${folder}/`))) projectPath(root, relative);
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid manifest hash');
    }
  }
  if (Object.keys(m.blocks).some(p => p !== 'AGENTS.md' && p !== 'CLAUDE.md')) throw new Error('Invalid manifest block path');
  return m;
}
