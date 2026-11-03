import { nameHue } from '../lib/nameHue';
import type { CommentStamp } from '../lib/visits';

/** A comment's own header (not its replies'). */
export function taglineOf(comment: Element): HTMLElement | null {
    return comment.querySelector<HTMLElement>(':scope > .entry > .tagline');
}

export function stampOf(comment: HTMLElement): CommentStamp | undefined {
    const created = Date.parse(taglineOf(comment)?.querySelector('time.live-timestamp')?.getAttribute('datetime') ?? '');
    const id = comment.dataset['fullname'];
    return id && Number.isFinite(created) ? { id, created } : undefined;
}

/** Each author's name gets their own hue (the stylesheet decides whether to use it). */
export function colorAuthors(root: ParentNode): void {
    for (const author of root.querySelectorAll<HTMLElement>('a.author:not([data-ember-hue])')) {
        const name = author.textContent?.trim();
        if (name) {
            author.style.setProperty('--name-h', String(nameHue(name)));
            author.dataset['emberHue'] = '';
        }
    }
}

/** The comment's age links to the comment itself (like HN), with the exact local time on hover. */
export function linkAge(comment: HTMLElement): void {
    const time = taglineOf(comment)?.querySelector<HTMLTimeElement>(':scope > time.live-timestamp');
    const permalink = comment.dataset['permalink'];
    if (!time || !permalink || time.parentElement?.classList.contains('ember-age')) {
        return;
    }
    const link = document.createElement('a');
    link.className = 'ember-age';
    link.href = new URL(permalink, location.origin).href;
    const created = new Date(time.dateTime);
    if (!Number.isNaN(created.getTime())) {
        link.title = created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        time.removeAttribute('title');
    }
    time.replaceWith(link);
    link.append(time);
}

export function isCollapsed(comment: Element): boolean {
    return comment.classList.contains('collapsed');
}

/** Collapse or expand a comment, the way old reddit's own [–] link does. */
export function setCollapsed(comment: HTMLElement, collapsed: boolean): void {
    comment.classList.toggle('collapsed', collapsed);
    comment.classList.toggle('noncollapsed', !collapsed);
    const expand = taglineOf(comment)?.querySelector('a.expand');
    if (expand) {
        expand.textContent = collapsed ? '[+]' : '[–]';
    }
}

/**
 * Clicking anywhere in a comment's header (outside its links) collapses or expands it; the text
 * stays selectable, and a click that ends a text selection is ignored.
 */
export function collapseOnHeaderClick(area: HTMLElement): void {
    area.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const tagline = target?.closest('.thing.comment > .entry > .tagline');
        const comment = tagline?.closest<HTMLElement>('.thing.comment');
        if (!comment || target?.closest('a, button, input, label, select, textarea') || window.getSelection()?.isCollapsed === false) {
            return;
        }
        setCollapsed(comment, !isCollapsed(comment));
    });
}
