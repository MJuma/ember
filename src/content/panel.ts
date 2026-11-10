import { DEFAULTS, encodeSettings } from '../lib/settings';
import type { SettingKey, Settings } from '../lib/settings';
import { colorAuthors } from './comments';
import { clearVisits, countVisits } from './newComments';
import { settings, updateSettings } from './store';

/** A choice's value, its label and (optionally) a line under it. */
type Option<T extends string> = readonly [T, string, string?];

// The stored values stay as they were; only the labels are new.
const THEMES: readonly Option<Settings['theme']>[] = [
    ['system', 'Automatic', 'Midnight or Paper, following your system.'],
    ['dusk', 'Midnight', 'Blue-black with orange accents.'],
    ['dark', 'Charcoal', 'Warm dark grays.'],
    ['dim', 'Slate', 'Soft blue-gray, lower contrast.'],
    ['black', 'Black', 'Pure black, for OLED screens.'],
    ['light', 'Paper', 'Dark text on a warm off-white.'],
];

const BARS: readonly Option<Settings['bars']>[] = [
    ['colorful', 'Colorful'],
    ['pastel', 'Pastel'],
    ['ocean', 'Ocean'],
    ['sunset', 'Sunset'],
    ['gray', 'Gray'],
];

const THREAD_SHORTCUTS: readonly [string, string][] = [
    ['n / p', 'Next / previous top-level comment'],
    ['j / k', 'Next / previous comment'],
    ['N / P', 'Next / previous new comment'],
    ['c', 'Collapse / expand the comment you’re reading'],
];

const LIST_SHORTCUTS: readonly [string, string][] = [
    ['j / k', 'Next / previous post'],
    ['Enter', 'Comments (⇧ in a new tab)'],
    ['o', 'Open the link (⇧O in a new tab)'],
    ['x', 'Expand the post'],
    ['X', 'Expand / collapse all images and videos'],
    ['a / z', 'Upvote / downvote'],
    ['s / h', 'Save / hide'],
];

function escape(text: string): string {
    return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

function checked(key: SettingKey, value: string | boolean): string {
    return settings()[key] === value ? ' checked' : '';
}

/** Settings that only apply with another one on (like colored threads) are greyed out while it's off. */
function needs(key: SettingKey | undefined): string {
    return key ? ` data-needs="${key}"` : '';
}

function radios<T extends string>(key: SettingKey, options: readonly Option<T>[], swatch: (value: T) => string): string {
    return options.map(([value, label, detail]) => `
        <label class="ember-option">
            <input type="radio" name="${key}" value="${value}" data-key="${key}"${checked(key, value)}>
            ${swatch(value)}<span>${escape(label)}${detail ? `<small>${escape(detail)}</small>` : ''}</span>
        </label>`).join('');
}

function themeSwatch(value: string): string {
    return `<span class="ember-swatch" data-swatch="${value}">Aa</span>`;
}

/** A palette's first five colors, side by side. */
function barsSwatch(value: string): string {
    return `<span class="ember-bars" data-bars="${value}"><span></span><span></span><span></span><span></span><span></span></span>`;
}

function segmented(key: SettingKey, label: string, options: readonly [string, string][], help = '', needed?: SettingKey): string {
    return `
        <fieldset class="ember-row ember-segmented"${needs(needed)}>
            <legend>${escape(label)}${help ? `<small>${escape(help)}</small>` : ''}</legend>
            <div>${options.map(([value, text]) => `
                <label><input type="radio" name="${key}" value="${value}" data-key="${key}"${checked(key, value)}><span>${escape(text)}</span></label>`).join('')}
            </div>
        </fieldset>`;
}

function toggle(key: SettingKey, label: string, help: string): string {
    return `
        <label class="ember-row ember-switch-row">
            <span>${escape(label)}<small>${escape(help)}</small></span>
            <input type="checkbox" role="switch" class="ember-switch" data-key="${key}"${checked(key, true)}>
        </label>`;
}

/** A switch for a set of keys, then the keys (greyed out while it's off). */
function keys(key: SettingKey, label: string, help: string, list: readonly [string, string][]): string {
    const rows = list.map(([combo, text]) => `<div class="ember-row"><kbd>${escape(combo)}</kbd><span>${escape(text)}</span></div>`).join('');
    return `
        <div class="ember-group ember-keys">
            ${toggle(key, label, help)}
            <fieldset class="ember-key-rows"${needs(key)}>${rows}</fieldset>
        </div>`;
}

/** A row in Data: what's kept (filled in by `updateData`) and a button to clear it. */
function dataRow(name: string, label: string, action: string, button: string): string {
    return `
        <div class="ember-row" data-data="${name}">
            <span>${escape(label)}<small></small></span>
            <button type="button" class="ember-action" data-action="${action}">${escape(button)}</button>
        </div>`;
}

interface SampleComment {
    author: string;
    points: string;
    age: string;
    text: string;
    op?: boolean;
    isNew?: boolean;
    reply?: SampleComment;
}

/** Made-up people and words; Reddit's markup, so Reddit's and Ember's styles draw it like the real thing. */
const SAMPLE_THREAD: SampleComment = {
    author: 'tern',
    points: '48 points',
    age: '2 hours ago',
    text: 'How long does it last on a cloudy day?',
    reply: {
        author: 'maple',
        points: '31 points',
        age: '1 hour ago',
        text: 'About three days on the battery.',
        op: true,
        reply: { author: 'quietfox', points: '6 points', age: '5 minutes ago', text: 'Mine made it through a whole winter.', isNew: true },
    },
};

function sampleComment(comment: SampleComment): string {
    const reply = comment.reply ? `<div class="sitetable listing">${sampleComment(comment.reply)}</div>` : '';
    return `
        <div class="thing comment noncollapsed"${comment.isNew ? ' data-sample-new' : ''}>
            <div class="midcol unvoted"><div class="arrow up"></div><div class="arrow down"></div></div>
            <div class="entry unvoted">
                <p class="tagline"><a class="expand">[–]</a><a class="author${comment.op ? ' submitter' : ''}">${escape(comment.author)}</a> <span class="score unvoted">${escape(comment.points)}</span> <a class="ember-age"><time>${escape(comment.age)}</time></a></p>
                <div class="usertext-body"><div class="md"><p>${escape(comment.text)}</p></div></div>
            </div>
            <div class="child">${reply}</div>
        </div>`;
}

/**
 * A post and a few replies, so changes show even on a post list. It isn't a .commentarea, so
 * nothing that reads the thread (keys, the nav bar, new comments) sees it; the colored-thread rules
 * in ember.css name .ember-sample-comments too. Inert: it's a picture, not something to click.
 */
const SAMPLE = `
    <div class="ember-sample" inert>
        <div class="ember-sample-frame">
            <div class="thing link self">
                <span class="rank">1</span>
                <div class="midcol unvoted"><div class="arrow up"></div><div class="score unvoted">1.2k</div><div class="arrow down"></div></div>
                <a class="thumbnail self"></a>
                <div class="entry unvoted"><div class="top-matter">
                    <p class="title"><a class="title">My solar weather station</a> <span class="domain">(<a>self.example</a>)</span></p>
                    <p class="tagline">submitted <time>3 hours ago</time> by <a class="author">maple</a></p>
                    <ul class="flat-list buttons"><li class="first"><a class="bylink comments">42 comments</a><a class="ember-new-count" data-sample-new>+1 new</a></li><li><a>share</a></li><li><a>save</a></li></ul>
                </div></div>
                <div class="clearleft"></div>
            </div>
            <div class="ember-sample-comments"><div class="sitetable nestedlisting">${sampleComment(SAMPLE_THREAD)}</div></div>
        </div>
    </div>`;

function render(): string {
    return `
        <div class="ember-panel">
            <header><h2>Ember</h2><button type="button" class="ember-close" aria-label="Close">×</button></header>
            ${SAMPLE}
            <div class="ember-body">
                <h3>Theme</h3><div class="ember-group">${radios('theme', THEMES, themeSwatch)}</div>
                <h3>Comments</h3>
                <div class="ember-group">
                    ${toggle('coloredThreads', 'Colored threads', 'Flat comments, with a bar in each reply level’s color.')}
                    ${segmented('threadStyle', 'Thread style', [['flat', 'Flat'], ['cards', 'Cards']], 'Cards put each thread in a card, with every reply in a box inside its parent’s.', 'coloredThreads')}
                    ${segmented('indent', 'Reply indent', [['compact', 'Compact'], ['normal', 'Normal'], ['wide', 'Wide']], '', 'coloredThreads')}
                    ${toggle('authorColors', 'Author colors', 'Each person’s name in their own color.')}
                    ${toggle('newComments', 'Highlight new comments', 'Comments posted since your last visit to a thread, and how many on post lists.')}
                </div>
                <h3>Comment bars</h3>
                <fieldset class="ember-group" aria-label="Comment bars"${needs('coloredThreads')}>${radios('bars', BARS, barsSwatch)}</fieldset>
                <h3>Pages</h3>
                <div class="ember-group">
                    ${segmented('width', 'Width', [['full', 'Full'], ['wide', 'Wide'], ['narrow', 'Narrow']])}
                    ${toggle('showSidebar', 'Show sidebar', 'The subreddit’s sidebar on the right.')}
                    ${toggle('subredditStyles', 'Subreddit styles', 'Let subreddits apply their own look instead of Ember’s theme.')}
                </div>
                <h3>Keys in a thread</h3>
                ${keys('threadKeys', 'Thread keys', 'Jump between comments and collapse them from the keyboard.', THREAD_SHORTCUTS)}
                <h3>Keys on post lists</h3>
                ${keys('listKeys', 'Post list keys', 'Select a post with j/k or a click (it’s highlighted), then act on it with a key.', LIST_SHORTCUTS)}
                <h3>Any page</h3>
                <div class="ember-group ember-keys"><div class="ember-row"><kbd>?</kbd><span>These settings</span></div></div>
                <h3>Data</h3>
                <div class="ember-group">
                    ${dataRow('settings', 'Settings', 'reset-settings', 'Reset')}
                    ${dataRow('history', 'Reading history', 'clear-history', 'Clear')}
                </div>
            </div>
        </div>`;
}

let dialog: HTMLDialogElement | undefined;

export function panelOpen(): boolean {
    return dialog?.open === true;
}

function setDataRow(name: string, detail: string, empty: boolean): void {
    const row = dialog?.querySelector(`[data-data="${name}"]`);
    const text = row?.querySelector('small');
    const button = row?.querySelector('button');
    if (text && button) {
        text.textContent = detail;
        button.disabled = empty;
    }
}

function updateData(): void {
    const changed = Object.keys(encodeSettings(settings())).length;
    setDataRow('settings', changed === 0 ? 'All at their defaults.' : `${plural(changed, 'setting', 'settings')} changed from the defaults.`, changed === 0);
    countVisits().then((threads) => {
        setDataRow('history', threads === 0
            ? 'Nothing yet. Threads you read are remembered for 30 days, to find new comments.'
            : `${plural(threads, 'thread', 'threads')}: when you last read each, and the new comments you didn’t reach. Kept 30 days.`, threads === 0);
    }, () => undefined);
}

/** Matches the panel to the settings: what's greyed out, the sample's new comment, and Data's counts. */
function sync(): void {
    const current = settings();
    for (const set of dialog?.querySelectorAll<HTMLFieldSetElement>('fieldset[data-needs]') ?? []) {
        set.disabled = current[set.dataset['needs'] as SettingKey] !== true;
    }
    for (const element of dialog?.querySelectorAll<HTMLElement>('[data-sample-new]') ?? []) {
        if (element.classList.contains('comment')) {
            element.classList.toggle('ember-new', current.newComments);
        } else {
            element.hidden = !current.newComments;
        }
    }
    updateData();
}

function fill(): void {
    if (!dialog) {
        return;
    }
    const scroll = dialog.querySelector('.ember-body')?.scrollTop ?? 0;
    dialog.innerHTML = render();
    const sample = dialog.querySelector('.ember-sample');
    if (sample) {
        colorAuthors(sample);
    }
    const body = dialog.querySelector('.ember-body');
    if (body) {
        body.scrollTop = scroll;
    }
    sync();
}

function runAction(action: string | undefined): void {
    if (action === 'reset-settings' && confirm('Reset every Ember setting to its default? With Firefox Sync, this applies on your other devices too.')) {
        updateSettings(DEFAULTS);
        fill();
    } else if (action === 'clear-history' && confirm('Forget which threads you’ve read? New-comment highlights and “+N new” counts start over.')) {
        clearVisits().then(updateData, () => undefined);
    }
}

export function openPanel(): void {
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'ember-settings';
        dialog.setAttribute('aria-label', 'Ember settings');
        document.body.append(dialog);
        dialog.addEventListener('change', (event) => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const key = input?.dataset['key'] as SettingKey | undefined;
            if (input && key) {
                updateSettings({ [key]: input.type === 'checkbox' ? input.checked : input.value });
                sync();
            }
        });
        dialog.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            // The dialog fills the screen around the panel, so a click on it is a click outside the panel.
            if (event.target === dialog || target?.closest('.ember-close')) {
                dialog?.close();
                return;
            }
            runAction(target?.closest<HTMLElement>('[data-action]')?.dataset['action']);
        });
    }
    // Scrolled back to the top on every open.
    dialog.innerHTML = '';
    fill();
    dialog.showModal();
}

/** An "ember" link in Reddit's header, next to your account links. */
export function mountSettingsLink(): void {
    const link = document.createElement('a');
    link.id = 'ember-open';
    link.href = '#';
    link.textContent = 'ember';
    link.title = 'Ember settings (?)';
    link.addEventListener('click', (event) => {
        event.preventDefault();
        openPanel();
    });
    const account = document.querySelector('#header-bottom-right');
    if (account) {
        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.textContent = '|';
        account.append(separator, link);
    } else {
        link.classList.add('ember-open-floating');
        document.body.append(link);
    }
}
