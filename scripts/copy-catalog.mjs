import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../dist/legacy/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/legacy/catalog.json', import.meta.url), new URL('../dist/legacy/catalog.json', import.meta.url));
