// Rebuilds on save and runs Firefox with Ember loaded. The Firefox profile lives in .dev-profile,
// so you log in to Reddit once and stay logged in between runs. Extra arguments go to `web-ext run`
// (`pnpm dev --firefox=nightly`).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const builder = spawn(process.execPath, [`${root}scripts/build.mjs`, '--watch'], { stdio: 'inherit' });

// Give the first build a moment before Firefox loads dist/.
await new Promise((resolve) => {
    setTimeout(resolve, 1500);
});
// web-ext reads Firefox's profiles.ini (under $HOME) to make sure it isn't keeping changes to your
// real profile; macOS may block that read. The profile here is always .dev-profile, so on macOS
// point it at an empty folder instead. Firefox inherits it, and on Linux it would lose the fonts
// and GTK theme under the real $HOME, so leave it alone there.
const env = process.platform === 'darwin'
    ? { ...process.env, HOME: mkdtempSync(join(tmpdir(), 'ember-dev-')) }
    : process.env;
const firefox = spawn(join(root, 'node_modules/.bin/web-ext'), [
    'run',
    '--source-dir', `${root}dist`,
    '--firefox-profile', `${root}.dev-profile`,
    '--profile-create-if-missing',
    '--keep-profile-changes',
    '--start-url', 'https://old.reddit.com/',
    ...process.argv.slice(2),
], { stdio: 'inherit', env });

const stop = () => {
    builder.kill();
    firefox.kill();
};
process.on('SIGINT', stop);
firefox.on('exit', () => {
    builder.kill();
    process.exit(0);
});
