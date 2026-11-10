import { colorAuthors, collapseOnHeaderClick, linkAge } from './comments';
import { enhanceList, runList } from './listing';
import type { ListCommand } from './listing';
import { mountNavBar, run } from './navbar';
import type { Command } from './navbar';
import { showNewCounts, trackNewComments } from './newComments';
import type { NewComments } from './newComments';
import { mountSettingsLink, openPanel, panelOpen } from './panel';
import { settings } from './store';

const THREAD_KEYS: Record<string, Command> = {
    'n': 'next-top',
    'p': 'prev-top',
    'j': 'next',
    'k': 'prev',
    'N': 'next-new',
    'P': 'prev-new',
    'c': 'toggle',
};

const LIST_KEYS: Record<string, ListCommand> = {
    'j': 'next',
    'k': 'prev',
    'Enter': 'comments',
    'Shift+Enter': 'comments-tab',
    'o': 'open',
    'O': 'open-tab',
    'x': 'expand',
    'X': 'expand-all',
    'a': 'up',
    'z': 'down',
    's': 'save',
    'h': 'hide',
};

function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

/** Enter on a focused link or button belongs to it. */
function isControl(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('a, button, summary, [role="button"]') !== null;
}

function installKeys(thread: boolean): void {
    window.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || panelOpen() || isTyping(event.target)) {
            return;
        }
        if (event.key === '?') {
            event.preventDefault();
            openPanel();
            return;
        }
        // `?` above always opens settings, so the keys can be turned back on from the keyboard.
        if (thread) {
            const command = settings().threadKeys ? THREAD_KEYS[event.key] : undefined;
            if (command) {
                event.preventDefault();
                run(command);
            }
            return;
        }
        const name = event.key === 'Enter' && event.shiftKey ? 'Shift+Enter' : event.key;
        const command = settings().listKeys ? LIST_KEYS[name] : undefined;
        if (command && !(event.key === 'Enter' && isControl(event.target))) {
            event.preventDefault();
            runList(command);
        }
    });
}

function commentsIn(nodes: Iterable<Node>): HTMLElement[] {
    const found: HTMLElement[] = [];
    for (const node of nodes) {
        if (node instanceof HTMLElement) {
            if (node.matches('.thing.comment')) {
                found.push(node);
            }
            found.push(...node.querySelectorAll<HTMLElement>('.thing.comment'));
        }
    }
    return found;
}

function enhanceThread(area: HTMLElement): void {
    const comments = [...area.querySelectorAll<HTMLElement>('.thing.comment')];
    for (const comment of comments) {
        linkAge(comment);
    }
    collapseOnHeaderClick(area);
    const nav = mountNavBar();
    let tracker: NewComments | undefined;
    if (settings().newComments) {
        trackNewComments(comments, () => nav?.update()).then((found) => {
            tracker = found;
        }, () => undefined);
    }
    // "Load more comments" and "continue this thread" add comments after the page has loaded.
    new MutationObserver((records) => {
        const added = commentsIn(records.flatMap((record) => [...record.addedNodes]));
        if (added.length === 0) {
            return;
        }
        for (const comment of added) {
            linkAge(comment);
        }
        colorAuthors(area);
        tracker?.add(added);
        nav?.update();
    }).observe(area, { childList: true, subtree: true });
}

export function enhance(): void {
    colorAuthors(document);
    mountSettingsLink();
    const area = document.querySelector<HTMLElement>('.commentarea');
    installKeys(area !== null);
    if (area) {
        enhanceThread(area);
    } else {
        enhanceList();
        if (settings().newComments) {
            showNewCounts();
        }
    }
}
