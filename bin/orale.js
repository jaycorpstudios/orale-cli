#!/usr/bin/env node
// In production this file is the compiled output at dist/cli/index.js
// During development, tsx handles TypeScript directly via the npm script
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if compiled dist/ exists, otherwise instruct to use `npm run orale`
import { existsSync } from 'fs';

const distEntry = join(__dirname, '..', 'dist', 'cli', 'index.js');
if (existsSync(distEntry)) {
  await import(distEntry);
} else {
  // Development: use tsx
  const { execa } = await import('execa');
  const srcEntry = join(__dirname, '..', 'src', 'cli', 'index.ts');
  const result = await execa('npx', ['tsx', srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    reject: false,
  });
  process.exit(result.exitCode ?? 0);
}
