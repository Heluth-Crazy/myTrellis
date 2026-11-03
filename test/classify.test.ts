import { describe, expect, it } from 'vitest';
import { classify, normalizedHash, protectedPath } from '../src/legacy/classify.js';
import { hash } from '../src/manifest.js';

describe('legacy ownership classification', () => {
  const relative = '.claude/hooks/session-start.py';
  const content = 'python .trellis/scripts/task.py\n';
  const catalog = { versions: ['test'], paths: { [relative]: [normalizedHash(content)] } };
  it('recognizes catalog paths after CRLF and python normalization', () => {
    expect(classify(relative, content.replace('python ', 'python3 ').replace('\n', '\r\n'), {}, catalog)).toEqual({ source: 'catalog', edited: false });
  });
  it('gives the hash-file inventory priority and accepts its original byte hash', () => {
    expect(classify(relative, content, { [relative]: hash(content) }, catalog)).toEqual({ source: 'hash-file', edited: false });
  });
  it('marks edited inventory and catalog files', () => {
    expect(classify(relative, 'edited', {}, catalog)).toEqual({ source: 'catalog', edited: true });
    expect(classify('custom-owned.txt', 'edited', { 'custom-owned.txt': hash(content) }, catalog)).toEqual({ source: 'hash-file', edited: true });
  });
  it('limits pattern recognition to known platform namespaces', () => {
    expect(classify('.cursor/commands/trellis/custom.md', '', {}, catalog).source).toBe('pattern');
    expect(classify('.agents/skills/trellis-custom/SKILL.md', '', {}, catalog).source).toBe('pattern');
    for (const path of ['src/skills/trellis-custom/file', '.claude/skills/custom/SKILL.md', '.claude/user.md']) expect(classify(path, '', {}, catalog).source).toBe('unknown');
  });
  it('protects user content even when an inventory claims it', () => {
    for (const path of ['.git/config', '.trellis/spec/index.md', '.trellis/tasks/archive/task.json', '.trellis/workspace/user/file', '.TRELLIS/SPEC/INDEX.MD']) {
      expect(protectedPath(path)).toBe(true);
      expect(classify(path, '', { [path]: hash('') }, catalog)).toEqual({ source: 'unknown', edited: false });
    }
  });
});
