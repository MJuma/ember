import { decodeSettings, encodeSettings, resolveTheme } from '../lib/settings';
import type { Settings } from '../lib/settings';

/** Settings live in Firefox Sync; a copy in the page's localStorage is read synchronously at load. */
const SYNC_KEY = 'settings';
const MIRROR_KEY = 'ember:settings';

const prefersLight = matchMedia('(prefers-color-scheme: light)');
const listeners = new Set<(settings: Settings) => void>();

function mirrored(): Settings {
    try {
        return decodeSettings(JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '{}'));
    } catch {
        return decodeSettings({});
    }
}

let current = mirrored();

export function settings(): Settings {
    return current;
}

export function onSettings(listener: (settings: Settings) => void): void {
    listeners.add(listener);
}

/** The stylesheet keys everything off attributes on <html>. */
function apply(next: Settings): void {
    current = next;
    const root = document.documentElement;
    root.dataset['emberTheme'] = resolveTheme(next.theme, prefersLight.matches);
    root.dataset['emberWidth'] = next.width;
    root.dataset['emberIndent'] = next.indent;
    root.toggleAttribute('data-ember-threads', next.coloredThreads);
    root.toggleAttribute('data-ember-authors', next.authorColors);
    root.toggleAttribute('data-ember-sidebar', next.showSidebar);
    try {
        localStorage.setItem(MIRROR_KEY, JSON.stringify(encodeSettings(next)));
    } catch {
        // Storage blocked: the theme just applies a moment later on the next load.
    }
    for (const listener of listeners) {
        listener(next);
    }
}

export function startSettings(): void {
    apply(current);
    browser.storage.sync.get(SYNC_KEY).then((stored) => {
        apply(decodeSettings(stored[SYNC_KEY]));
    }, () => undefined);
    browser.storage.onChanged.addListener((changes, area) => {
        const change = changes[SYNC_KEY];
        if (area === 'sync' && change) {
            apply(decodeSettings(change.newValue));
        }
    });
    prefersLight.addEventListener('change', () => {
        apply(current);
    });
}

export function updateSettings(patch: Partial<Settings>): void {
    const next = { ...current, ...patch };
    apply(next);
    browser.storage.sync.set({ [SYNC_KEY]: encodeSettings(next) }).catch(() => undefined);
}
