import type { SettingKey, Settings } from '../lib/settings';
import { settings, updateSettings } from './store';

const THEMES: readonly [Settings['theme'], string][] = [
    ['system', 'System (Dusk or Light)'],
    ['dusk', 'Dusk'],
    ['dark', 'Dark'],
    ['dim', 'Dim'],
    ['black', 'Black (OLED)'],
    ['light', 'Light'],
];

const CHOICES: readonly [SettingKey, string, readonly [string, string][]][] = [
    ['width', 'Width', [['full', 'Full'], ['wide', 'Wide'], ['narrow', 'Narrow']]],
    ['indent', 'Reply indent', [['compact', 'Compact'], ['normal', 'Normal'], ['wide', 'Wide']]],
];

const SWITCHES: readonly [SettingKey, string, string][] = [
    ['coloredThreads', 'Colored threads', 'Flat comments, with a bar in each reply level’s color.'],
    ['authorColors', 'Author colors', 'Each person’s name in their own color.'],
    ['newComments', 'Highlight new comments', 'Comments posted since your last visit to a thread, and how many on post lists.'],
    ['showSidebar', 'Show sidebar', 'The subreddit’s sidebar on the right.'],
    ['subredditStyles', 'Subreddit styles', 'Let subreddits apply their own look instead of Ember’s theme.'],
];

const THREAD_SHORTCUTS: readonly [string, string][] = [
    ['n / p', 'Next / previous top-level comment'],
    ['j / k', 'Next / previous comment'],
    ['N / P', 'Next / previous new comment'],
    ['c', 'Collapse / expand the comment you’re reading'],
    ['?', 'These settings'],
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

function keys(list: readonly [string, string][]): string {
    return list.map(([combo, label]) => `<div class="ember-row"><kbd>${escape(combo)}</kbd><span>${escape(label)}</span></div>`).join('');
}

function render(): string {
    const current = settings();
    const themes = THEMES.map(([value, label]) => `
        <label class="ember-option">
            <input type="radio" name="theme" value="${value}" data-key="theme"${current.theme === value ? ' checked' : ''}>
            <span class="ember-swatch" data-swatch="${value}">Aa</span>${escape(label)}
        </label>`).join('');
    const choices = CHOICES.map(([key, label, options]) => `
        <fieldset class="ember-row ember-segmented">
            <legend>${escape(label)}</legend>
            <div>${options.map(([value, text]) => `
                <label><input type="radio" name="${key}" value="${value}" data-key="${key}"${current[key] === value ? ' checked' : ''}><span>${escape(text)}</span></label>`).join('')}
            </div>
        </fieldset>`).join('');
    const switches = SWITCHES.map(([key, label, help]) => `
        <label class="ember-row ember-switch-row">
            <span>${escape(label)}<small>${escape(help)}</small></span>
            <input type="checkbox" role="switch" class="ember-switch" data-key="${key}"${current[key] === true ? ' checked' : ''}>
        </label>`).join('');
    return `
        <div class="ember-panel">
            <header><h2>Ember</h2><button type="button" class="ember-close" aria-label="Close">×</button></header>
            <div class="ember-body">
                <h3>Theme</h3><div class="ember-group ember-themes">${themes}</div>
                <h3>Layout</h3><div class="ember-group">${choices}</div>
                <h3>Comments and pages</h3><div class="ember-group">${switches}</div>
                <h3>Keys in a thread</h3><div class="ember-group ember-keys">${keys(THREAD_SHORTCUTS)}</div>
                <h3>Keys on post lists</h3><div class="ember-group ember-keys">${keys(LIST_SHORTCUTS)}</div>
            </div>
        </div>`;
}

let dialog: HTMLDialogElement | undefined;

export function panelOpen(): boolean {
    return dialog?.open === true;
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
            }
        });
        dialog.addEventListener('click', (event) => {
            // The dialog fills the screen around the panel, so a click on it is a click outside the panel.
            if (event.target === dialog || (event.target instanceof Element && event.target.closest('.ember-close'))) {
                dialog?.close();
            }
        });
    }
    dialog.innerHTML = render();
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
