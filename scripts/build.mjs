// Bundles the content script and stylesheet into dist/ next to the manifest, ready for web-ext.
// `--watch` rebuilds on save (used by `pnpm dev`).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { context } from 'esbuild';

const watch = process.argv.includes('--watch');
const root = new URL('../', import.meta.url).pathname;
const dist = `${root}dist`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(`${root}src/manifest.json`, `${dist}/manifest.json`);
cpSync(`${root}src/icons`, `${dist}/icons`, { recursive: true });

const build = await context({
    entryPoints: [
        { in: `${root}src/content/main.ts`, out: 'ember' },
        { in: `${root}src/content/ember.css`, out: 'ember' },
    ],
    bundle: true,
    format: 'iife',
    target: 'firefox140',
    outdir: dist,
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    logLevel: 'info',
});

if (watch) {
    await build.watch();
} else {
    await build.rebuild();
    await build.dispose();
}
