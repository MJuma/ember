// Turns old.reddit.com pages you saved from Firefox (File › Save Page As… › Web Page, complete)
// into local test fixtures. Old reddit needs a login and blocks automated browsers, so pages come
// from your own browser.
//
//   pnpm fixtures ~/Downloads/Reddit/*.html
//
// Each page goes to test/fixtures/<name>.html without its scripts (where the session token and
// account details live), with your username replaced, your subscriptions removed and form values
// cleared. Its stylesheets and images go to test/fixtures/assets/ so it renders offline. Both are
// git-ignored, so neither your details nor other people's posts get published.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const KEEP = new Set(['.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2']);
const files = process.argv.slice(2);
if (files.length === 0) {
    process.stderr.write('Usage: pnpm fixtures <saved page.html> …\n');
    process.exit(1);
}

const out = new URL('../test/fixtures/', import.meta.url).pathname;
mkdirSync(join(out, 'assets'), { recursive: true });

for (const file of files) {
    const name = basename(file).replace(/\.html?$/, '');
    const filesDir = `${name}_files`;
    const dom = new JSDOM(readFileSync(file, 'utf8'));
    const { document } = dom.window;
    const user = document.querySelector('#header-bottom-right .user a')?.textContent?.trim();
    for (const node of document.querySelectorAll('script, noscript, iframe, input[name="uh"], #header-bottom-right, #sr-header-area')) {
        node.remove();
    }
    for (const input of document.querySelectorAll('input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"]), textarea')) {
        input.removeAttribute('value');
        input.textContent = '';
    }
    // Point stylesheets and images at the shared assets folder; drop anything else saved with the page.
    for (const node of document.querySelectorAll('[href], [src]')) {
        for (const attribute of ['href', 'src']) {
            const value = node.getAttribute(attribute);
            if (!value?.startsWith(`${filesDir}/`)) {
                continue;
            }
            const asset = decodeURIComponent(value.slice(filesDir.length + 1));
            const source = join(dirname(file), filesDir, asset);
            if (KEEP.has(extname(asset).toLowerCase()) && existsSync(source)) {
                copyFileSync(source, join(out, 'assets', asset));
                node.setAttribute(attribute, `assets/${asset}`);
            } else {
                node.remove();
            }
        }
    }
    let html = dom.serialize();
    if (user) {
        html = html.replaceAll(user, 'ember_user');
    }
    writeFileSync(join(out, `${name}.html`), html);
    process.stdout.write(`test/fixtures/${name}.html${user ? ' (username replaced)' : ''}\n`);
}
