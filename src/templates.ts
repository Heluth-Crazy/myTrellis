import { readFileSync } from 'node:fs';

// Both src/ and dist/ live immediately below the package root.
export const packageRoot = new URL('../', import.meta.url);
export const version: string = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')).version;

export function template(name: string): string {
  return readFileSync(new URL(`templates/${name}`, packageRoot), 'utf8').replace(/\r\n/g, '\n');
}
