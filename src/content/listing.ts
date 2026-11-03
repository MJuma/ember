/** Post lists (front page, subreddits, user pages): a selected post the keys act on, and expand all. */

export type ListCommand = 'next' | 'prev' | 'comments' | 'comments-tab' | 'open' | 'open-tab' | 'expand' | 'expand-all' | 'up' | 'down' | 'save' | 'hide';

/** The posts (and, on user pages, comments) in the list, skipping hidden ones. */
function rows(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('#siteTable > .thing')].filter((row) => row.getClientRects().length > 0);
}

let selected: HTMLElement | undefined;

function select(row: HTMLElement, reveal: boolean): void {
    selected?.classList.remove('ember-selected');
    selected = row;
    row.classList.add('ember-selected');
    if (reveal) {
        // The stylesheet's scroll-margin keeps a little of the posts around it in view.
        row.scrollIntoView({ block: 'nearest' });
    }
}

/** The selected post, or (when there's none yet) the first one on screen. */
function current(): HTMLElement | undefined {
    const list = rows();
    if (selected && list.includes(selected)) {
        return selected;
    }
    const onScreen = list.find((row) => row.getBoundingClientRect().bottom > 0);
    if (onScreen) {
        select(onScreen, true);
    }
    return onScreen;
}

function step(direction: 1 | -1): void {
    const list = rows();
    const at = selected ? list.indexOf(selected) : -1;
    const target = at < 0 ? current() : list[at + direction];
    if (target) {
        select(target, true);
    }
}

function find(row: HTMLElement, selector: string): HTMLElement | null {
    return row.querySelector<HTMLElement>(selector);
}

function openInTab(link: HTMLElement | null): void {
    if (link instanceof HTMLAnchorElement) {
        window.open(link.href, '_blank', 'noopener');
    }
}

/** Media posts' expand buttons (images, videos, galleries and crossposts, but not text posts). */
function mediaButtons(): HTMLElement[] {
    return rows().flatMap((row) => [...row.querySelectorAll<HTMLElement>('.expando-button:not(.selftext)')]);
}

let expandAllLink: HTMLAnchorElement | undefined;

/** Expands every image, video and gallery in the list, or collapses them if they're all open. */
function expandAll(): void {
    const buttons = mediaButtons();
    const opening = buttons.some((button) => button.classList.contains('collapsed'));
    for (const button of buttons) {
        if (button.classList.contains(opening ? 'collapsed' : 'expanded')) {
            button.click();
        }
    }
    if (expandAllLink) {
        expandAllLink.textContent = opening ? 'collapse all' : 'expand all';
    }
}

export function runList(command: ListCommand): void {
    if (command === 'next' || command === 'prev') {
        step(command === 'next' ? 1 : -1);
        return;
    }
    if (command === 'expand-all') {
        expandAll();
        return;
    }
    const row = current();
    if (!row) {
        return;
    }
    // Reddit's own buttons and links do the work, so its handling (and your preferences) apply.
    switch (command) {
        case 'comments':
            find(row, '.buttons a.bylink')?.click();
            break;
        case 'comments-tab':
            openInTab(find(row, '.buttons a.bylink'));
            break;
        case 'open':
            find(row, 'a.title')?.click();
            break;
        case 'open-tab':
            openInTab(find(row, 'a.title'));
            break;
        case 'expand':
            find(row, '.expando-button')?.click();
            break;
        case 'up':
            find(row, ':scope > .midcol .arrow.up, :scope > .midcol .arrow.upmod')?.click();
            break;
        case 'down':
            find(row, ':scope > .midcol .arrow.down, :scope > .midcol .arrow.downmod')?.click();
            break;
        case 'save':
            find(row, '.buttons .save-button a')?.click();
            break;
        case 'hide': {
            const list = rows();
            const at = list.indexOf(row);
            const next = list[at + 1] ?? list[at - 1];
            find(row, '.buttons a[data-event-action="hide"]')?.click();
            if (next) {
                select(next, true);
            }
            break;
        }
    }
}

export function enhanceList(): void {
    if (rows().length === 0) {
        return;
    }
    // Clicking a post selects it, so the keys pick up from there. Only your own clicks: expand all
    // clicks posts' buttons too.
    document.querySelector('#siteTable')?.addEventListener('click', (event) => {
        const row = event.target instanceof Element ? event.target.closest<HTMLElement>('#siteTable > .thing') : null;
        if (row && event.isTrusted) {
            select(row, false);
        }
    });
    const tabs = document.querySelector('#header .tabmenu');
    if (tabs && mediaButtons().length > 0) {
        const item = document.createElement('li');
        expandAllLink = document.createElement('a');
        expandAllLink.href = '#';
        expandAllLink.id = 'ember-expand-all';
        expandAllLink.textContent = 'expand all';
        expandAllLink.title = 'Expand every image, video and gallery (X)';
        expandAllLink.addEventListener('click', (event) => {
            event.preventDefault();
            expandAll();
        });
        item.append(expandAllLink);
        tabs.append(item);
    }
}
