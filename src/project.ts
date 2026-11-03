import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function normalizePath(value: string): string {
  if (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(value)) return `${value[1]}:${value.slice(2)}`;
  return value;
}

export function projectRoot(cwd = process.cwd()): string {
  const start = realpathSync(path.resolve(normalizePath(cwd)));
  if (start === realpathSync(homedir())) throw new Error('Refusing to run in the home directory');
  let current = start;
  while (true) {
    if (existsSync(path.join(current, '.git')) || existsSync(path.join(current, '.trellis'))) {
      if (current === realpathSync(homedir())) throw new Error('Refusing to run in the home directory');
      return current;
    }
    const parent = path.dirname(current);
    // An uninitialized folder is its own project, never the filesystem root
    // reached while searching its ancestors.
    if (parent === current) return start;
    current = parent;
  }
}

// Reject traversal and linked ancestors before reading or writing managed paths.
export function projectPath(root: string, relative: string): string {
  if (!relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(p => p === '..' || p === '.')) {
    throw new Error(`Unsafe project path: ${relative}`);
  }
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Unsafe project path: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Refusing linked path: ${relative}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}
