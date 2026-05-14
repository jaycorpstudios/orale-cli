import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  treeshake: true,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  esbuildOptions(options) {
    options.jsx = 'automatic';
    // esbuild strips 'node:' prefix from built-ins — override with a plugin
    // to keep 'node:sqlite' intact in the output so Node resolves it correctly
    options.plugins = [
      ...(options.plugins ?? []),
      {
        name: 'keep-node-prefix',
        setup(build) {
          build.onResolve({ filter: /^node:sqlite$/ }, () => ({
            path: 'node:sqlite',
            external: true,
          }));
        },
      },
    ];
  },
});
