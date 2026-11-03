import { hash } from './manifest.js';

export const START = '<!-- TRELLIS:START -->';
export const END = '<!-- TRELLIS:END -->';

export function blockRange(text: string): { start: number; end: number; content: string } | undefined {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 && end === -1) return undefined;
  if (start === -1 || end < start || text.indexOf(START, start + START.length) !== -1 || text.indexOf(END, end + END.length) !== -1) {
    throw new Error('Malformed or multiple TRELLIS blocks');
  }
  return { start, end: end + END.length, content: text.slice(start + START.length, end) };
}

export function blockContent(template: string): string {
  return `\n${template.trimEnd()}\n`;
}

// Hash block content independent of the host file's line endings.
export function blockHash(content: string): string {
  return hash(content.replace(/\r\n/g, '\n'));
}

// The block follows the file's existing line endings so CRLF files stay consistent.
export function putBlock(text: string, content: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = `${START}${content}${END}`.replace(/\r?\n/g, eol);
  const range = blockRange(text);
  return range ? text.slice(0, range.start) + block + text.slice(range.end) : block + (text ? `${eol}${eol}${text}` : eol);
}

export function stripBlock(text: string): string {
  const range = blockRange(text);
  return range ? text.slice(0, range.start) + text.slice(range.end) : text;
}
