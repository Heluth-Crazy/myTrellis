import { hash } from '../manifest.js';

export interface Catalog { versions: string[]; paths: Record<string, string[]> }
export const platformFolders = ['.claude', '.agents', '.codex', '.kimi-code', '.pi', '.opencode', '.cursor', '.kilocode', '.kiro', '.gemini', '.agent', '.devin', '.windsurf', '.qoder', '.codebuddy', '.github', '.factory', '.dsh', '.reasonix', '.zcode', '.trae', '.omp', '.grok', '.snow', '.iflow'];
export function normalizedHash(bytes: Buffer | string): string {
  return hash(bytes.toString().replace(/\r\n/g, '\n').replace(/python3 /g, 'python '));
}
export function protectedPath(relative: string): boolean {
  return /^(?:\.git(?:\/|$)|\.trellis\/(?:spec|tasks|workspace)(?:\/|$))/i.test(relative);
}
export function generatedPath(relative: string): boolean {
  return /^\.trellis\/(?:\.developer|\.current-task|\.version|\.template-hashes\.json|\.ralph-state\.json)$/.test(relative)
    || /^\.trellis\/(?:\.runtime|\.backup-[^/]+)(?:\/|$)/.test(relative)
    || relative.split('/').includes('__pycache__') || relative.endsWith('.pyc');
}
export function internalPath(relative: string): boolean {
  return /^\.trellis\/(?:scripts|agents|\.runtime)(?:\/|$)/.test(relative)
    || /^\.trellis\/(?:workflow\.md|config\.yaml|worktree\.yaml|\.developer|\.current-task|\.version|\.template-hashes\.json|\.gitignore|\.ralph-state\.json)$/.test(relative)
    || (relative.startsWith('.trellis/') && relative.split('/').includes('__pycache__'));
}
export function patternPath(relative: string): boolean {
  return platformFolders.includes(relative.split('/')[0] ?? '')
    && /\/(?:skills|agents|commands|prompts|workflows)\/(?:trellis-[^/]+(?:\/|$)|trellis\/)/.test(relative);
}
export function classify(relative: string, bytes: Buffer | string, inventory: Record<string, string>, catalog: Catalog): { source: 'hash-file' | 'catalog' | 'pattern' | 'unknown'; edited: boolean } {
  if (protectedPath(relative)) return { source: 'unknown', edited: false };
  const originals = [...(catalog.paths[relative] ?? []), ...(inventory[relative] ? [inventory[relative]!] : [])];
  const edited = !generatedPath(relative) && !originals.includes(hash(bytes)) && !originals.includes(normalizedHash(bytes));
  if (Object.hasOwn(inventory, relative)) return { source: 'hash-file', edited };
  if (Object.hasOwn(catalog.paths, relative)) return { source: 'catalog', edited };
  if (internalPath(relative) || patternPath(relative) || generatedPath(relative)) return { source: 'pattern', edited };
  return { source: 'unknown', edited: false };
}
