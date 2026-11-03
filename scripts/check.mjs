// Loads Ember into saved old.reddit pages (test/fixtures, from `pnpm fixtures`) in Chromium, checks
// its behavior and saves screenshots to .measure/shots. Ember is injected first in <head>, like
// document_start, and its stylesheet goes before Reddit's, the least favorable cascade order.
// `pnpm check [behavior|new|list|shots|substyles]` runs one part. Needs Playwright's Chromium:
// `pnpm exec playwright-core install chromium`.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const FIXTURES = join(ROOT, 'test/fixtures');
const SHOTS = join(ROOT, '.measure/shots');
mkdirSync(SHOTS, { recursive: true });
if (!existsSync(join(FIXTURES, 'deep-thread-post.html'))) {
    process.stderr.write('No fixtures: save some old.reddit pages and run `pnpm fixtures` first.\n');
    process.exit(1);
}
// The thread fixture is served at its real path, so Ember sees a thread URL.
const THREAD = new URL(readFileSync(join(FIXTURES, 'deep-thread-post.html'), 'utf8').match(/<link rel="canonical" href="([^"]+)"/)[1]).pathname;
const THREAD_ID = THREAD.split('/comments/')[1].split('/')[0];
const PAGES = {
    [THREAD]: 'deep-thread-post',
    '/r/sub/': 'subreddit-page',
    '/': 'homepage',
    '/r/sub/comments/abc123/self/': 'self-post',
    '/user/someone/': 'userpage',
};
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

const STUB = `
(() => {
    const seed = JSON.parse(sessionStorage.getItem('seed') || '{}');
    const listeners = [];
    const area = (name) => {
        const data = seed[name] || {};
        return {
            get: async (key) => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
            set: async (values) => {
                const changes = {};
                for (const [key, value] of Object.entries(values)) {
                    changes[key] = { oldValue: data[key], newValue: value };
                    data[key] = value;
                }
                seed[name] = data;
                sessionStorage.setItem('seed', JSON.stringify(seed));
                for (const listener of listeners) listener(changes, name);
            },
        };
    };
    window.browser = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (fn) => listeners.push(fn) } } };
})();`;

const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://x').pathname;
    if (path === '/__ember.css' || path === '/__ember.js') {
        response.writeHead(200, { 'content-type': TYPES[extname(path)] });
        response.end(readFileSync(join(ROOT, 'dist', path.slice(3))));
        return;
    }
    const asset = path.match(/\/assets\/([^/]+)$/);
    if (asset) {
        const file = join(FIXTURES, 'assets', decodeURIComponent(asset[1]));
        if (existsSync(file)) {
            response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
            response.end(readFileSync(file));
            return;
        }
        response.writeHead(404).end();
        return;
    }
    const name = PAGES[path];
    if (!name) {
        response.writeHead(404).end();
        return;
    }
    // ?plain serves the page without Ember, to compare against.
    const plain = new URL(request.url, 'http://x').searchParams.has('plain');
    const html = readFileSync(join(FIXTURES, `${name}.html`), 'utf8')
        .replace(/href="assets\//g, 'href="/assets/')
        .replace(/src="assets\//g, 'src="/assets/')
        .replace('<head>', plain ? '<head>' : `<head><link rel="stylesheet" href="/__ember.css"><script>${STUB}</script><script src="/__ember.js"></script>`);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
});
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const failures = [];
function check(label, ok, detail = '') {
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}\n`);
    if (!ok) failures.push(label);
}

async function open(path, seed = {}, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: options.colorScheme ?? 'dark' });
    await context.addInitScript((value) => {
        if (!sessionStorage.getItem('seed')) sessionStorage.setItem('seed', value);
    }, JSON.stringify(seed));
    const page = await context.newPage();
    const errors = [];
    // Reddit's inline onclick handlers survive in the fixtures, without the scripts they call.
    page.on('pageerror', (error) => { if (!/click_thing|is not defined/.test(error.message)) errors.push(error.message); });
    await page.goto(origin + path, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    return { page, context, errors };
}

/** Top of the first post to the bottom of the last, in a listing. */
function postsHeight(page) {
    return page.evaluate(() => {
        const rows = [...document.querySelectorAll('#siteTable > .thing.link')];
        return Math.round(rows.at(-1).getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top);
    });
}

const only = process.argv[2];

// ── Thread: behavior ────────────────────────────────────────
if (!only || only === 'behavior') {
    const { page, context, errors } = await open(THREAD);
    const attrs = await page.evaluate(() => Object.fromEntries(Object.entries(document.documentElement.dataset)));
    check('html attributes', attrs.ember === '' && attrs.emberTheme === 'dusk' && attrs.emberWidth === 'wide', JSON.stringify(attrs));
    check('colored threads + author colors on by default', await page.evaluate(() => document.documentElement.hasAttribute('data-ember-threads') && document.documentElement.hasAttribute('data-ember-authors')));
    check('sidebar hidden', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).display === 'none'));
    check('subreddit stylesheet off', await page.evaluate(() => document.querySelector('link[title=applied_subreddit_stylesheet]').media === 'not all'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('dusk background', bg === 'rgb(16, 18, 22)', bg);

    const author = await page.evaluate(() => {
        const link = document.querySelector('.commentarea .thing.comment a.author:not(.submitter)');
        return { hue: link.style.getPropertyValue('--name-h'), color: getComputedStyle(link).color };
    });
    check('author colored', author.hue !== '' && author.color !== 'rgb(255, 255, 255)', JSON.stringify(author));

    const age = await page.evaluate(() => {
        const link = document.querySelector('.commentarea .thing.comment > .entry > .tagline > a.ember-age');
        return link ? { href: link.getAttribute('href'), title: link.title, text: link.textContent } : null;
    });
    check('age is a permalink', age !== null && age.href.includes(`/comments/${THREAD_ID}/`) && age.title !== '', JSON.stringify(age));

    const children = await page.evaluate(() => [...new Set([...document.querySelectorAll('.commentarea .thing.comment')].flatMap((c) => [...c.children].map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`)))]);
    process.stdout.write(`     comment children: ${children.join(', ')}\n`);

    const nav = await page.locator('#ember-nav').textContent();
    check('nav bar mounted', nav !== null && /threads|\//.test(nav), nav?.trim());

    // Header click collapses; clicking the author link doesn't.
    const first = page.locator('.commentarea > .sitetable > .thing.comment').first();
    const tagline = first.locator(':scope > .entry > .tagline');
    const clickHeader = async () => {
        const box = await tagline.boundingBox();
        await tagline.click({ position: { x: box.width - 4, y: box.height / 2 } });
    };
    await clickHeader();
    check('header click collapses', await first.evaluate((c) => c.classList.contains('collapsed')));
    await clickHeader();
    check('header click expands', await first.evaluate((c) => !c.classList.contains('collapsed')));

    // Keys: n jumps to the next top-level comment, p back, j to the next comment.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    const afterN = await page.evaluate(() => {
        const tops = [...document.querySelectorAll('.commentarea > .sitetable > .thing.comment')];
        return { y: Math.round(scrollY), top: Math.round(tops[0].querySelector(':scope > .entry').getBoundingClientRect().top), nav: document.querySelector('.ember-nav-pos').textContent };
    });
    check('n jumps to first top-level', afterN.top === 12, JSON.stringify(afterN));
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    const afterN2 = await page.evaluate(() => document.querySelector('.ember-nav-pos').textContent);
    check('n again → 2 / N', afterN2.startsWith('2 /'), afterN2);
    await page.keyboard.press('p');
    await page.waitForTimeout(100);
    check('p → 1 / N', (await page.evaluate(() => document.querySelector('.ember-nav-pos').textContent)).startsWith('1 /'));
    await page.keyboard.press('j');
    await page.waitForTimeout(100);
    const afterJ = await page.evaluate(() => {
        const at = [...document.querySelectorAll('.commentarea .thing.comment')].find((c) => Math.round(c.querySelector(':scope > .entry').getBoundingClientRect().top) === 12);
        return at ? at.parentElement.closest('.thing.comment') !== null : null;
    });
    check('j → first reply', afterJ === true, String(afterJ));
    await page.keyboard.press('c');
    check('c collapses current', await page.evaluate(() => document.querySelectorAll('.commentarea .thing.comment.collapsed').length > 0));

    // Settings: ? opens; changing theme updates the page and sync storage; clicking outside closes.
    await page.keyboard.press('?');
    check('? opens settings', await page.evaluate(() => document.querySelector('#ember-settings')?.open === true));
    await page.screenshot({ path: join(SHOTS, 'settings.png') });
    await page.locator('#ember-settings input[value=light]').check();
    const theme = await page.evaluate(() => ({ attr: document.documentElement.dataset.emberTheme, stored: JSON.parse(sessionStorage.getItem('seed')).sync?.settings }));
    check('theme change applies + syncs', theme.attr === 'light' && theme.stored?.theme === 'light', JSON.stringify(theme));
    await page.locator('#ember-settings input[data-key=showSidebar]').check();
    check('sidebar switch shows sidebar', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).display !== 'none'));
    await page.locator('#ember-settings input[data-key=showSidebar]').uncheck();
    await page.screenshot({ path: join(SHOTS, 'settings-light.png') });
    await page.mouse.click(20, 450);
    check('click outside closes', await page.evaluate(() => document.querySelector('#ember-settings').open === false));
    const link = await page.locator('#ember-open').count();
    check('settings link in header', link === 1);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ── Thread: new comments ────────────────────────────────────
if (!only || only === 'new') {
    const html = readFileSync(join(FIXTURES, 'deep-thread-post.html'), 'utf8');
    const stamps = [...html.matchAll(/datetime="([^"]+)" class="live-timestamp"/g)].map((m) => Date.parse(m[1])).sort((a, b) => a - b);
    const at = stamps[Math.floor(stamps.length * 0.9)];
    const { page, context, errors } = await open(THREAD, { local: { visits: { [THREAD_ID]: { at, unseen: [] } } } });
    await page.waitForTimeout(300);
    const fresh = await page.evaluate(() => document.querySelectorAll('.ember-new').length);
    check('new comments highlighted', fresh > 0, `${fresh} new of ${stamps.length} stamps`);
    const button = await page.evaluate(() => {
        const b = document.querySelector('.ember-nav-new');
        return { hidden: b.hidden, text: b.textContent };
    });
    check('nav shows N new', !button.hidden && button.text === `${fresh} new`, JSON.stringify(button));
    await page.keyboard.press('N');
    await page.waitForTimeout(150);
    check('N jumps to a new comment', await page.evaluate(() => document.querySelector('.ember-focus')?.classList.contains('ember-new') === true));
    await page.screenshot({ path: join(SHOTS, 'new-comments.png') });
    // Seen ones are saved on pagehide.
    await page.waitForTimeout(600);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(200);
    const saved = await page.evaluate((id) => JSON.parse(sessionStorage.getItem('seed')).local.visits[id], THREAD_ID);
    check('visit saved with unseen', saved && saved.at > Date.now() - 60000 && Array.isArray(saved.unseen), JSON.stringify({ at: saved?.at, unseen: saved?.unseen.length }));
    const total = Number(html.match(/data-comments-count="(\d+)"/)[1]);
    check('visit saves the comment count', saved?.count === total, `${saved?.count} vs ${total}`);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ── Post lists: new counts, keys, expand all ───────────────
if (!only || only === 'list') {
    const html = readFileSync(join(FIXTURES, 'subreddit-page.html'), 'utf8');
    const [[, firstId, firstCount], [, secondId, secondCount]] = [...html.matchAll(/data-fullname="t3_([a-z0-9]+)"[^>]*?data-comments-count="(\d+)"/g)];
    const visits = {
        [firstId]: { at: 0, unseen: ['t1_a'], count: Number(firstCount) - 3 },
        [secondId]: { at: 0, unseen: [], count: Number(secondCount) },
    };
    const { page, context, errors } = await open('/r/sub/', { local: { visits } });
    await page.waitForTimeout(200);
    const badges = await page.evaluate(([a, b]) => [a, b].map((id) => document.querySelector(`[data-fullname="t3_${id}"] .ember-new-count`)?.textContent ?? null), [firstId, secondId]);
    check('post list: +N new for a read thread', badges[0] === '+4 new', String(badges[0]));
    check('post list: no badge when nothing is new', badges[1] === null, String(badges[1]));

    // Record what the keys click and open; stand in for Reddit's scripts that expand and hide posts.
    await page.evaluate(() => {
        window.clicks = [];
        window.opened = [];
        window.open = (url) => { window.opened.push(url); return null; };
        document.addEventListener('click', (event) => {
            const target = event.target;
            window.clicks.push(target.closest('a, .arrow, .expando-button'));
            if (target.closest('a') && !target.closest('#ember-expand-all')) {
                event.preventDefault();
            }
            const button = target.closest('.expando-button');
            if (button) {
                button.classList.toggle('collapsed');
                button.classList.toggle('expanded');
            }
            if (target.closest('a[data-event-action="hide"]')) {
                target.closest('.thing').style.display = 'none';
            }
        }, true);
    });
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#siteTable > .thing')].filter((row) => row.getClientRects().length > 0).map((row) => row.dataset.fullname));
    const selected = () => page.evaluate(() => document.querySelector('.ember-selected')?.dataset.fullname ?? null);
    const lastClick = () => page.evaluate(() => {
        const element = window.clicks.at(-1);
        return element ? `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}|${element.closest('.thing')?.dataset.fullname}|${element.textContent.trim().slice(0, 20)}` : null;
    });
    const list = await rows();
    await page.keyboard.press('j');
    check('j selects the first post', await selected() === list[0], String(await selected()));
    await page.keyboard.press('j');
    check('j → next post', await selected() === list[1]);
    await page.keyboard.press('k');
    check('k → previous post', await selected() === list[0]);
    await page.keyboard.press('a');
    check('a upvotes the selected post', (await lastClick())?.startsWith(`div.arrow.up.`) && (await lastClick()).includes(list[0]), String(await lastClick()));
    await page.keyboard.press('z');
    check('z downvotes', (await lastClick())?.startsWith('div.arrow.down.'), String(await lastClick()));
    await page.keyboard.press('s');
    check('s saves', (await lastClick())?.endsWith('|save'), String(await lastClick()));
    await page.keyboard.press('Enter');
    check('Enter opens comments', (await lastClick())?.startsWith('a.bylink.comments'), String(await lastClick()));
    await page.keyboard.press('o');
    check('o opens the link', (await lastClick())?.startsWith('a.title'), String(await lastClick()));
    await page.keyboard.press('Shift+O');
    await page.keyboard.press('Shift+Enter');
    const opened = await page.evaluate(() => window.opened);
    check('⇧O and ⇧Enter open new tabs', opened.length === 2 && opened[1].includes('/comments/'), JSON.stringify(opened));
    // Clicking a post selects it; x expands it.
    const media = await page.evaluate(() => document.querySelector('#siteTable > .thing .expando-button.video').closest('.thing').dataset.fullname);
    await page.locator(`[data-fullname="${media}"] > .rank`).click();
    check('clicking a post selects it', await selected() === media, String(await selected()));
    await page.keyboard.press('x');
    check('x expands the selected post', await page.evaluate((id) => document.querySelector(`[data-fullname="${id}"] .expando-button`).classList.contains('expanded'), media));
    await page.keyboard.press('h');
    const after = await rows();
    check('h hides it and selects the next post', !after.includes(media) && await selected() === list[list.indexOf(media) + 1], String(await selected()));
    // X expands every image and video, then collapses them.
    check('expand all link in the tabs', await page.locator('#header .tabmenu #ember-expand-all').count() === 1);
    await page.keyboard.press('Shift+X');
    const expanded = await page.evaluate(() => [...document.querySelectorAll('#siteTable > .thing .expando-button')].filter((b) => b.getClientRects().length > 0).map((b) => `${b.classList.contains('selftext') ? 'text' : 'media'}:${b.classList.contains('expanded')}`));
    check('X expands all media, not text posts', expanded.every((state) => state === 'media:true' || state === 'text:false') && expanded.includes('media:true'), [...new Set(expanded)].join(','));
    check('link reads collapse all', await page.locator('#ember-expand-all').textContent() === 'collapse all');
    await page.locator('#ember-expand-all').click();
    check('then collapses them', await page.evaluate(() => [...document.querySelectorAll('#siteTable .expando-button.expanded')].every((b) => b.getClientRects().length === 0)));
    check('expand all leaves the selection alone', await selected() === list[list.indexOf(media) + 1], String(await selected()));
    const badge = await page.evaluate(() => { const b = document.querySelector('.ember-new-count'); return [getComputedStyle(b).color, getComputedStyle(b).backgroundColor]; });
    check('badge text contrasts with its background', badge[0] !== badge[1] && badge[0] === 'rgb(16, 18, 22)', badge.join(' on '));
    await page.screenshot({ path: join(SHOTS, 'list-keys.png') });
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ── Screenshots in each theme ───────────────────────────────
if (!only || only === 'shots') {
    for (const theme of ['dusk', 'dark', 'dim', 'black', 'light']) {
        const { page, context } = await open(THREAD, { sync: { settings: { theme } } });
        await page.screenshot({ path: join(SHOTS, `thread-${theme}.png`) });
        if (theme === 'dusk') {
            // A deep stretch of replies.
            await page.evaluate(() => {
                const deep = [...document.querySelectorAll('.commentarea .thing.comment')].find((c) => c.querySelectorAll('.thing.comment .thing.comment .thing.comment').length > 0);
                deep?.scrollIntoView();
            });
            await page.screenshot({ path: join(SHOTS, 'thread-deep.png') });
        }
        await context.close();
    }
    for (const [path, name] of [['/r/sub/', 'subreddit'], ['/', 'home'], ['/r/sub/comments/abc123/self/', 'self-post'], ['/user/someone/', 'user']]) {
        const { page, context, errors } = await open(path);
        await page.screenshot({ path: join(SHOTS, `${name}.png`) });
        check(`${name}: no page errors`, errors.length === 0, errors.join(' | '));
        await context.close();
    }
    const home = await open('/');
    const layout = await home.page.evaluate(() => {
        const content = document.querySelector('body > .content').getBoundingClientRect();
        const self = document.querySelector('.thumbnail.self');
        return {
            chooser: getComputedStyle(document.querySelector('.listing-chooser')).display,
            gaps: [Math.round(content.left), Math.round(document.documentElement.clientWidth - content.right)],
            placeholder: self ? getComputedStyle(self).backgroundImage : null,
        };
    });
    check('home: multireddit chooser hidden', layout.chooser === 'none', layout.chooser);
    check('home: column centered', Math.abs(layout.gaps[0] - layout.gaps[1]) <= 2, JSON.stringify(layout.gaps));
    check('home: placeholder thumbnails themed', layout.placeholder === 'none', String(layout.placeholder));
    const plain = await open('/?plain');
    const [themed, original] = [await postsHeight(home.page), await postsHeight(plain.page)];
    // A page of posts takes no more room than on Reddit itself (a few px of rounding allowed).
    check('home: posts as dense as Reddit', themed <= original * 1.01, `${themed}px vs Reddit ${original}px`);
    await plain.context.close();
    await home.context.close();
    const { page, context } = await open('/r/sub/', { sync: { settings: { theme: 'light' } } });
    await page.screenshot({ path: join(SHOTS, 'subreddit-light.png') });
    const img = await page.evaluate(() => document.querySelector('#header-img').getBoundingClientRect().height);
    check('subreddit header image capped', img <= 48, String(img));
    await context.close();
}

// ── Subreddit styles on ─────────────────────────────────────
if (!only || only === 'substyles') {
    const { page, context } = await open('/r/sub/', { sync: { settings: { subredditStyles: true } } });
    const state = await page.evaluate(() => ({ themed: document.documentElement.hasAttribute('data-ember'), media: document.querySelector('link[title=applied_subreddit_stylesheet]').media, bg: getComputedStyle(document.body).backgroundColor }));
    check('sub styles on: Ember theme steps aside', !state.themed && state.media === 'all' && state.bg !== 'rgb(16, 18, 22)', JSON.stringify(state));
    await page.screenshot({ path: join(SHOTS, 'subreddit-own-style.png') });
    await context.close();
    const thread = await open(THREAD, { sync: { settings: { subredditStyles: true } } });
    await thread.page.screenshot({ path: join(SHOTS, 'thread-own-style.png') });
    await thread.context.close();
}

await browser.close();
server.close();
process.stdout.write(failures.length ? `\n${failures.length} failed\n` : '\nall passed\n');
process.exitCode = failures.length ? 1 : 0;
