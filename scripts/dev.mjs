// Rebuilds on save and runs Firefox with Ember loaded. The Firefox profile lives in .dev-profile,
// so you log in to Reddit once and stay logged in between runs.
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
// real profile; macOS may block that read. The profile here is always .dev-profile, so point it at
// an empty folder instead.
const firefox = spawn(join(root, 'node_modules/.bin/web-ext'), [
    'run',
    '--source-dir', `${root}dist`,
    '--firefox-profile', `${root}.dev-profile`,
    '--profile-create-if-missing',
    '--keep-profile-changes',
    '--start-url', 'https://old.reddit.com/',
], { stdio: 'inherit', env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), 'ember-dev-')) } });

const stop = () => {
    builder.kill();
    firefox.kill();
};
process.on('SIGINT', stop);
firefox.on('exit', () => {
    builder.kill();
    process.exit(0);
});
