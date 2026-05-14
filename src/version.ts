import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __VERSION__: string | undefined;

function getVersion(): string {
  if (typeof __VERSION__ !== 'undefined') return __VERSION__;
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
  return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;
}

export const VERSION = getVersion();
