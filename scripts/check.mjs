// Loads Ember into saved old.reddit pages (test/fixtures, from `pnpm fixtures`) in Chromium, checks
// its behavior and saves screenshots to .measure/shots. Ember is injected first in <head>, like
// document_start, and its stylesheet goes before Reddit's, the least favorable cascade order.
// `pnpm check [behavior|new|list|settings|sidebar|dark|redesign|shots|substyles]` runs one part. Needs Playwright's Chromium:
// `pnpm exec playwright-core install chromium`.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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
// A page in the redesign, which www.reddit.com serves too (its <html> tag, and classes old reddit uses).
const REDESIGN = '<!DOCTYPE html><html lang="en-US" class="theme-beta" dir="ltr"><head><title>Settings</title></head>'
    + '<body><div class="side">side</div><div class="content listing-chooser">content</div><a class="author">someone</a></body></html>';
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
            remove: async (key) => {
                const changes = { [key]: { oldValue: data[key] } };
                delete data[key];
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
    if (path === '/settings/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(REDESIGN.replace('<head>', `<head><link rel="stylesheet" href="/__ember.css"><script>${STUB}</script><script src="/__ember.js"></script>`));
        return;
    }
    // Any fixture, for the dark mode scan.
    const fixture = path.match(/^\/__fixture\/([\w-]+)\/$/)?.[1];
    const name = fixture && existsSync(join(FIXTURES, `${fixture}.html`)) ? fixture : PAGES[path];
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
    check('sidebar shown by default', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).display !== 'none'));
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

    // A permalink page marks its comment with `usertext border`, which Reddit paints pale yellow.
    const linked = await page.evaluate(() => {
        const form = document.querySelector('.commentarea .thing.comment .thing.comment > .entry form.usertext');
        form.classList.add('border');
        const code = form.querySelector('.md').appendChild(document.createElement('code'));
        const result = { body: getComputedStyle(form.querySelector('.usertext-body')).backgroundColor, code: getComputedStyle(code).backgroundColor };
        code.remove();
        form.classList.remove('border');
        return result;
    });
    check('permalinked comment in Ember\'s colors', !['rgb(255, 255, 204)', 'rgb(255, 255, 255)'].includes(linked.body) && linked.code === 'rgb(23, 26, 31)', JSON.stringify(linked));

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
    {
        const off = await open(THREAD, { sync: { settings: { threadKeys: false } } });
        // Reddit collapses some low-scored comments itself.
        const before = await off.page.evaluate(() => document.querySelectorAll('.commentarea .thing.comment.collapsed').length);
        await off.page.keyboard.press('n');
        await off.page.keyboard.press('c');
        await off.page.waitForTimeout(100);
        const state = await off.page.evaluate(() => ({ y: scrollY, collapsed: document.querySelectorAll('.commentarea .thing.comment.collapsed').length }));
        await off.page.keyboard.press('?');
        const opened = await off.page.evaluate(() => document.querySelector('#ember-settings')?.open === true);
        check('thread keys off: n and c do nothing, ? still opens settings', state.y === 0 && state.collapsed === before && opened, JSON.stringify({ ...state, before, opened }));
        await off.context.close();
    }

    // Settings: ? opens; changing theme updates the page and sync storage; clicking outside closes.
    await page.keyboard.press('?');
    check('? opens settings', await page.evaluate(() => document.querySelector('#ember-settings')?.open === true));
    await page.screenshot({ path: join(SHOTS, 'settings.png') });
    await page.locator('#ember-settings input[value=light]').check();
    const theme = await page.evaluate(() => ({ attr: document.documentElement.dataset.emberTheme, stored: JSON.parse(sessionStorage.getItem('seed')).sync?.settings }));
    check('theme change applies + syncs', theme.attr === 'light' && theme.stored?.theme === 'light', JSON.stringify(theme));
    await page.locator('#ember-settings input[data-key=showSidebar]').uncheck();
    check('sidebar switch hides the sidebar', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).display === 'none'));
    await page.locator('#ember-settings input[data-key=showSidebar]').check();
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
    // Turning the post list keys off clears the highlight; then neither keys nor clicks select.
    await page.keyboard.press('?');
    await page.locator('#ember-settings input[data-key=listKeys]').uncheck();
    check('list keys off: highlight cleared, keys greyed out', await page.evaluate(() => document.querySelector('.ember-selected') === null && document.querySelector('#ember-settings fieldset[data-needs=listKeys]').disabled));
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.locator(`[data-fullname="${list[0]}"] > .rank`).click();
    check('list keys off: j and clicks don\'t select', await selected() === null, String(await selected()));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ── Sidebar: themed, and the page with it takes the chosen width ─
if (!only || only === 'sidebar') {
    for (const [path, name] of [['/', 'home'], ['/r/sub/', 'subreddit'], [THREAD, 'thread']]) {
        for (const width of ['wide', 'narrow', 'full']) {
            const { page, context, errors } = await open(path, { sync: { settings: { width } } });
            const layout = await page.evaluate(() => {
                const side = document.querySelector('body > .side').getBoundingClientRect();
                const content = document.querySelector('body > .content').getBoundingClientRect();
                const page = document.documentElement.clientWidth;
                // Reddit's light boxes and buttons: anything in the sidebar still painted near-white.
                const light = [...document.querySelectorAll('.side *')]
                    .filter((element) => element.getClientRects().length > 0)
                    .filter((element) => /^rgba?\((2[3-5]\d), (2[3-5]\d), (2[3-5]\d)(, 1)?\)$/.test(getComputedStyle(element).backgroundColor) || /url\(.*sprite-reddit/.test(getComputedStyle(element).backgroundImage))
                    .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
                // Anything in the content that reaches into the sidebar's column.
                const under = [...document.querySelectorAll('body > .content *')]
                    .filter((element) => {
                        const box = element.getBoundingClientRect();
                        return box.width > 0 && box.height > 0 && box.right > side.left + 0.5 && box.left < side.right && box.bottom > side.top && box.top < side.bottom;
                    })
                    .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
                return { gaps: [Math.round(content.left), Math.round(page - side.right)], gap: Math.round(side.left - content.right), sideWidth: Math.round(side.width), contentWidth: Math.round(content.width), light: [...new Set(light)], under: [...new Set(under)].slice(0, 8) };
            });
            check(`sidebar ${name} ${width}: page centered, content stops before the sidebar`, Math.abs(layout.gaps[0] - layout.gaps[1]) <= 2 && layout.gap >= 10 && layout.sideWidth === 300 && layout.under.length === 0, JSON.stringify(layout));
            if (width === 'wide') {
                check(`sidebar ${name}: no light boxes or Reddit sprites left`, layout.light.length === 0, layout.light.join(', '));
                await page.screenshot({ path: join(SHOTS, `sidebar-${name}.png`) });
            }
            check(`sidebar ${name} ${width}: no page errors`, errors.length === 0, errors.join(' | '));
            await context.close();
        }
    }
    const light = await open(THREAD, { sync: { settings: { theme: 'light' } } });
    await light.page.screenshot({ path: join(SHOTS, 'sidebar-thread-light.png') });
    await light.context.close();
    // Wiki pages: Reddit's own 325px of room for the sidebar is Ember's to manage.
    for (const wiki of ['wiki-page', 'reddit-wiki-page'].filter((name) => existsSync(join(FIXTURES, `${name}.html`)))) {
        const { page, context } = await open(`/__fixture/${wiki}/`);
        const room = await page.evaluate(() => Math.round(document.querySelector('body > .content').getBoundingClientRect().right - document.querySelector('.wiki-page-content').getBoundingClientRect().right));
        check(`${wiki}: the wiki text reaches the sidebar's column`, room < 40, `${room}px to spare`);
        await context.close();
    }
    // A page without a sidebar (the inbox) doesn't keep room for one.
    if (existsSync(join(FIXTURES, 'reddit-inbox-page.html'))) {
        const inbox = await open('/__fixture/reddit-inbox-page/');
        const gaps = await inbox.page.evaluate(() => {
            const content = document.querySelector('body > .content').getBoundingClientRect();
            return [Math.round(content.left), Math.round(document.documentElement.clientWidth - content.right)];
        });
        check('no sidebar on the page: one centered column', Math.abs(gaps[0] - gaps[1]) <= 2, JSON.stringify(gaps));
        await inbox.context.close();
    }
}

// ── Dark mode scan: every saved page, in Midnight and Paper ──
// The scan runs in the page, so its helpers are sent there with it (SCAN below).
function parseColor(color) {
    const m = color.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
    return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) } : null;
}

function channel(value) {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The color text sits on: the nearest background that isn't see-through. */
function backdropOf(element) {
    for (let e = element; e; e = e.parentElement) {
        const color = parseColor(getComputedStyle(e).backgroundColor);
        if (color && color.a > 0.5) {
            return color;
        }
    }
    return parseColor(getComputedStyle(document.body).backgroundColor);
}

function describe(element) {
    return `${element.tagName.toLowerCase()}${[...element.classList].filter((c) => !/^(id-|t\d_)/.test(c)).slice(0, 3).map((c) => `.${c}`).join('')}`;
}

/**
 * What's still in Reddit's light styling: near-white boxes (in a dark theme), text that's hard to read
 * on what's behind it, and Reddit's sprite images.
 */
function scanPage(dark) {
    // A subreddit's own flair colors, and Reddit's deliberately yellow quarantine warnings.
    const ownColors = '[style*="background"], .quarantine-notice, .quarantine-stamp, .btn-quarantine';
    const issues = new Set();
    for (const element of document.querySelectorAll('body *')) {
        if (element.closest('#ember-settings, script, style, noscript') || element.getClientRects().length === 0) {
            continue;
        }
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (box.width < 2 || box.height < 2 || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            continue;
        }
        const background = parseColor(style.backgroundColor);
        if (dark && background && background.a > 0.5 && luminance(background) > 0.45 && !element.closest(ownColors) && !element.matches('img, video')) {
            issues.add(`light box ${describe(element)} ${style.backgroundColor}`);
        }
        // Ember inverts Reddit's logo and draws the vote arrows, thumbnails and expand buttons itself; the cake-day cake reads fine.
        if (/sprite-reddit|redditstatic/.test(style.backgroundImage) && !element.matches('#header-img.default-header, .cakeday, .thumbnail, .thumbnail *, .arrow, .expando-button')) {
            issues.add(`Reddit sprite ${describe(element)}`);
        }
        const text = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 1);
        // Text moved off screen (Reddit's image buttons) isn't read; a subreddit's own flair colors are its choice.
        if (text && Number.parseFloat(style.textIndent) > -999 && !element.closest(ownColors)) {
            const [a, b] = [luminance(parseColor(style.color)), luminance(backdropOf(element))].sort((x, y) => y - x);
            const ratio = (a + 0.05) / (b + 0.05);
            if (ratio < 3) {
                issues.add(`hard to read (${ratio.toFixed(1)}) ${describe(element)} "${element.textContent.trim().slice(0, 24)}"`);
            }
        }
    }
    return [...issues];
}

const SCAN = [parseColor, channel, luminance, backdropOf, describe, scanPage].map(String).join('\n');

if (!only || only === 'dark') {
    const pages = readdirSync(FIXTURES).filter((file) => file.endsWith('.html')).map((file) => file.slice(0, -5));
    for (const [theme, label] of [['dusk', 'Midnight'], ['light', 'Paper']]) {
        const found = [];
        for (const fixture of pages) {
            const { page, context } = await open(`/__fixture/${fixture}/`, { sync: { settings: { theme } } });
            // Search's tips appear when its box has focus.
            await page.evaluate(() => document.querySelector('#search input[name=q]')?.focus());
            found.push(...(await page.evaluate(`(() => { ${SCAN}\nreturn scanPage(${theme !== 'light'}); })()`)).map((issue) => `${fixture}: ${issue}`));
            await context.close();
        }
        check(`dark mode scan, ${label}: ${pages.length} pages without light boxes, hard-to-read text or Reddit sprites`, found.length === 0, found.slice(0, 10).join(' | '));
    }
}

// ── The redesign: left alone ────────────────────────────────
if (!only || only === 'redesign') {
    const { page, context, errors } = await open('/settings/');
    await page.keyboard.press('?');
    const state = await page.evaluate(() => ({
        attrs: Object.keys(document.documentElement.dataset),
        bg: getComputedStyle(document.documentElement).getPropertyValue('--bg'),
        side: getComputedStyle(document.querySelector('.side')).display,
        chooser: getComputedStyle(document.querySelector('.listing-chooser')).display,
        ember: document.querySelectorAll('[id^="ember-"], [class*="ember-"]').length,
    }));
    check('redesign page: no attributes, styles or controls', state.attrs.length === 0 && state.bg === '' && state.side === 'block' && state.chooser === 'block' && state.ember === 0, JSON.stringify(state));
    check('redesign page: no errors', errors.length === 0, errors.join(' | '));
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
            // The page ends at the sidebar's right edge when it's shown.
            gaps: [Math.round(content.left), Math.round(document.documentElement.clientWidth - Math.max(content.right, document.querySelector('.side').getBoundingClientRect().right))],
            placeholder: self ? getComputedStyle(self).backgroundImage : null,
        };
    });
    check('home: multireddit chooser hidden', layout.chooser === 'none', layout.chooser);
    check('home: column centered', Math.abs(layout.gaps[0] - layout.gaps[1]) <= 2, JSON.stringify(layout.gaps));
    check('home: placeholder thumbnails themed', layout.placeholder === 'none', String(layout.placeholder));
    const plain = await open('/?plain');
    // With the sidebar hidden, a page of posts takes no more room than on Reddit itself (a few px of
    // rounding allowed). The sidebar's column costs some width on laptop-size windows, by choice.
    const bare = await open('/', { sync: { settings: { showSidebar: false } } });
    const [themed, original] = [await postsHeight(bare.page), await postsHeight(plain.page)];
    check('home: posts as dense as Reddit (sidebar hidden)', themed <= original * 1.01, `${themed}px vs Reddit ${original}px`);
    await bare.context.close();
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
    const cards = await open(THREAD, { sync: { settings: { subredditStyles: true, threadStyle: 'cards' } } });
    await cards.page.evaluate(() => document.querySelector('.commentarea > .sitetable > .thing.comment').scrollIntoView());
    await cards.page.screenshot({ path: join(SHOTS, 'thread-own-style-cards.png') });
    await cards.context.close();
}

// ── Settings: the sample, thread style, bars, data ─────────
if (!only || only === 'settings') {
    const recent = Date.now() - 60000;
    const { page, context, errors } = await open(THREAD, { local: { visits: { abc: { at: recent, unseen: [] }, old: { at: 0, unseen: [] } } } });
    page.on('dialog', (dialog) => dialog.accept());
    const navText = () => page.evaluate(() => document.querySelector('.ember-nav-pos').textContent);
    const before = await navText();
    await page.keyboard.press('?');
    await page.waitForTimeout(100);
    const sample = await page.evaluate(() => {
        const root = document.querySelector('#ember-settings .ember-sample');
        const reply = root?.querySelector('.thing.comment .thing.comment');
        return {
            inert: root?.inert,
            height: Math.round(root?.getBoundingClientRect().height ?? 0),
            bar: reply ? getComputedStyle(reply, '::before').backgroundColor : null,
            hue: root?.querySelector('a.author:not(.submitter)')?.style.getPropertyValue('--name-h'),
            fresh: root?.querySelectorAll('.ember-new').length,
        };
    });
    check('settings: sample shown, inert, drawn as colored threads', sample.inert === true && sample.height > 150 && sample.bar === 'rgb(79, 179, 217)' && sample.hue !== '' && sample.fresh === 1, JSON.stringify(sample));
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await page.waitForTimeout(50);
    check('settings: nav bar ignores the sample', await navText() === before, `${before} → ${await navText()}`);
    check('settings: theme labels', await page.locator('#ember-settings label:has(input[value=dusk])').textContent().then((text) => text.includes('Midnight') && text.includes('Blue-black')));
    await page.screenshot({ path: join(SHOTS, 'settings-sample.png') });

    const reply = () => page.evaluate(() => {
        const top = document.querySelector('.commentarea > .sitetable > .thing.comment');
        const child = top.querySelector('.thing.comment');
        return {
            bar: getComputedStyle(child, '::before').backgroundColor,
            content: getComputedStyle(child, '::before').content,
            topRadius: getComputedStyle(top).borderTopLeftRadius,
            topBg: getComputedStyle(top).backgroundColor,
            childBg: getComputedStyle(child).backgroundColor,
            childEdge: getComputedStyle(child).borderLeftWidth,
            gap: (() => {
                // A reply that ends its parent's replies (not followed by "load more comments").
                const last = [...document.querySelectorAll('.commentarea .thing.comment .thing.comment')].find((c) => [...c.parentElement.children].findLast((e) => e.matches('.thing')) === c);
                return Math.round(last.closest('.child').getBoundingClientRect().bottom - last.getBoundingClientRect().bottom);
            })(),
        };
    });
    await page.locator('#ember-settings input[value=ocean]').check();
    const ocean = await reply();
    check('bars: palette recolors the bars', ocean.bar === 'rgb(35, 181, 166)', ocean.bar);
    await page.screenshot({ path: join(SHOTS, 'settings-bars.png') });
    check('bars: stickied green stays', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--green').trim() === '#6cc070'));
    await page.locator('#ember-settings label:has(> input[value=cards])').click();
    const cards = await reply();
    check('cards: thread in a rounded card, reply in a shaded box', cards.content === 'none' && cards.topRadius === '10px' && cards.topBg !== cards.childBg && cards.childEdge === '2px', JSON.stringify(cards));
    check('cards: space under the last reply inside its parent', cards.gap >= 6, String(cards.gap));
    await page.screenshot({ path: join(SHOTS, 'settings-cards.png') });
    await page.locator('#ember-settings input[data-key=newComments]').uncheck();
    check('sample follows Highlight new comments', await page.evaluate(() => document.querySelectorAll('#ember-settings .ember-sample .ember-new').length === 0 && document.querySelector('#ember-settings .ember-sample .ember-new-count').hidden));
    await page.locator('#ember-settings input[data-key=newComments]').check();
    await page.locator('#ember-settings input[data-key=coloredThreads]').uncheck();
    check('thread-only settings grey out without colored threads', await page.evaluate(() => [...document.querySelectorAll('#ember-settings fieldset[data-needs=coloredThreads]')].every((set) => set.disabled)));
    await page.locator('#ember-settings input[data-key=coloredThreads]').check();
    check('…and come back with it', await page.evaluate(() => [...document.querySelectorAll('#ember-settings fieldset[data-needs=coloredThreads]')].every((set) => !set.disabled)));

    // Data: counts, then clear and reset.
    const dataRow = (name) => page.evaluate((key) => {
        const row = document.querySelector(`#ember-settings [data-data="${key}"]`);
        return { text: row.querySelector('small').textContent, disabled: row.querySelector('button').disabled };
    }, name);
    await page.waitForTimeout(100);
    const changed = await dataRow('settings');
    check('data: counts changed settings', changed.text.startsWith('2 settings') && !changed.disabled, changed.text);
    const history = await dataRow('history');
    check('data: counts threads read (expired ones not)', history.text.startsWith('2 threads') && !history.disabled, history.text);
    await page.locator('#ember-settings [data-action=clear-history]').click();
    await page.waitForTimeout(100);
    const cleared = await dataRow('history');
    const visits = await page.evaluate(() => JSON.parse(sessionStorage.getItem('seed')).local?.visits);
    check('data: clear forgets the history', visits === undefined && cleared.text.startsWith('Nothing yet') && cleared.disabled, JSON.stringify({ visits, cleared }));
    await page.screenshot({ path: join(SHOTS, 'settings-data.png') });
    await page.locator('#ember-settings [data-action=reset-settings]').click();
    await page.waitForTimeout(100);
    const reset = await page.evaluate(() => ({
        stored: JSON.parse(sessionStorage.getItem('seed')).sync?.settings,
        bars: document.documentElement.dataset.emberBars,
        style: document.documentElement.dataset.emberThreadStyle,
        cardsChecked: document.querySelector('#ember-settings input[value=cards]').checked,
    }));
    check('data: reset restores the defaults', JSON.stringify(reset.stored) === '{}' && reset.bars === 'colorful' && reset.style === 'flat' && !reset.cardsChecked, JSON.stringify(reset));
    check('data: settings row then reads defaults', (await dataRow('settings')).disabled);
    await page.keyboard.press('Escape');
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    check('keys after closing still use the real thread', (await navText()).startsWith('1 /'), await navText());
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();

    for (const theme of ['dusk', 'light']) {
        const shot = await open(THREAD, { sync: { settings: { theme, threadStyle: 'cards' } } });
        await shot.page.evaluate(() => {
            const deep = [...document.querySelectorAll('.commentarea .thing.comment')].find((c) => c.querySelectorAll('.thing.comment .thing.comment .thing.comment').length > 0);
            deep?.scrollIntoView();
        });
        await shot.page.screenshot({ path: join(SHOTS, `thread-cards-${theme}.png`) });
        await shot.context.close();
    }
    const list = await open('/r/sub/', { sync: { settings: { bars: 'sunset' } } });
    await list.page.keyboard.press('?');
    await list.page.waitForTimeout(100);
    await list.page.screenshot({ path: join(SHOTS, 'settings-on-list.png') });
    await list.page.keyboard.press('Escape');
    await list.page.keyboard.press('j');
    check('post list: keys skip the sample', await list.page.evaluate(() => document.querySelector('.ember-selected')?.closest('#siteTable') !== null));
    check('post list: no page errors', list.errors.length === 0, list.errors.join(' | '));
    await list.context.close();
}

await browser.close();
server.close();
process.stdout.write(failures.length ? `\n${failures.length} failed\n` : '\nall passed\n');
process.exitCode = failures.length ? 1 : 0;
