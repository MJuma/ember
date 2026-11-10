import { newCommentIds, newSinceVisit, nextVisit, pruneVisits, threadIdFromPath } from '../lib/visits';
import type { Visit } from '../lib/visits';
import { stampOf } from './comments';

const VISITS_KEY = 'visits';
/** A new comment counts as seen once it has been on screen this long. */
const SEEN_DWELL_MS = 400;
const SAVE_DELAY_MS = 1000;

export interface NewComments {
    /** New since your last visit; grows as "load more comments" adds some. */
    fresh: Set<string>;
    /** Mark comments added to the page later (e.g. "load more comments"). */
    add: (comments: readonly HTMLElement[]) => void;
}

/** Only the full thread (not one comment's permalink page, which shows a part of it) counts as a visit. */
function fullThreadId(): string | undefined {
    const id = threadIdFromPath(location.pathname);
    const rest = location.pathname.split(`/comments/${id}/`)[1]?.split('/').filter(Boolean) ?? [];
    return id && rest.length <= 1 ? id : undefined;
}

async function loadVisits(): Promise<Record<string, Visit>> {
    const stored = await browser.storage.local.get(VISITS_KEY);
    const visits: unknown = stored[VISITS_KEY];
    return visits && typeof visits === 'object' ? visits as Record<string, Visit> : {};
}

/** How many threads the reading history remembers (Settings › Data). */
export async function countVisits(): Promise<number> {
    return Object.keys(pruneVisits(await loadVisits(), Date.now())).length;
}

/** Forgets every thread you've read: new-comment highlights and "+N new" start over. */
export function clearVisits(): Promise<void> {
    return browser.storage.local.remove(VISITS_KEY);
}

/** A post's total comment count, from its row in a post list or at the top of its thread. */
function commentCount(post: Element | null): number | undefined {
    const count = post instanceof HTMLElement ? Number.parseInt(post.dataset['commentsCount'] ?? '', 10) : Number.NaN;
    return Number.isFinite(count) ? count : undefined;
}

/**
 * Highlights comments posted since your last visit to this thread. They stay new until they've
 * been on screen for a moment, so a refresh doesn't lose any you hadn't reached.
 */
export async function trackNewComments(comments: readonly HTMLElement[], onChange: () => void): Promise<NewComments | undefined> {
    const threadId = fullThreadId();
    if (!threadId) {
        return undefined;
    }
    // Comments posted after this moment weren't on the page, so they count as new next time.
    const loadedAt = Date.now();
    const count = commentCount(document.querySelector('#siteTable > .thing.link'));
    const visit = (await loadVisits())[threadId];
    const fresh = new Set<string>();
    const seen = new Set<string>();
    let saveTimer = 0;

    const save = (): void => {
        clearTimeout(saveTimer);
        loadVisits().then((visits) => {
            visits[threadId] = nextVisit(loadedAt, fresh, seen, count);
            return browser.storage.local.set({ [VISITS_KEY]: pruneVisits(visits, Date.now()) });
        }).catch(() => undefined);
    };
    const saveSoon = (): void => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
    };

    const timers = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const id = (entry.target.closest<HTMLElement>('.thing.comment'))?.dataset['fullname'];
            if (!id) {
                continue;
            }
            if (entry.isIntersecting) {
                timers.set(entry.target, window.setTimeout(() => {
                    seen.add(id);
                    observer.unobserve(entry.target);
                    saveSoon();
                }, SEEN_DWELL_MS));
            } else {
                clearTimeout(timers.get(entry.target));
            }
        }
    });

    const add = (added: readonly HTMLElement[]): void => {
        const stamps = added.flatMap((comment) => stampOf(comment) ?? []);
        const found = newCommentIds(stamps, visit);
        for (const comment of added) {
            const id = comment.dataset['fullname'];
            if (id && found.has(id)) {
                fresh.add(id);
                comment.classList.add('ember-new');
                const entry = comment.querySelector(':scope > .entry');
                if (entry) {
                    observer.observe(entry);
                }
            }
        }
        if (found.size > 0) {
            onChange();
        }
    };

    add(comments);
    save();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            save();
        }
    });
    window.addEventListener('pagehide', save);
    return { fresh, add };
}

/** Puts "+6 new" beside the comments link of each post in the list whose thread you've read before. */
function renderNewCounts(visits: Record<string, Visit>): void {
    for (const post of document.querySelectorAll<HTMLElement>('#siteTable > .thing.link')) {
        const id = post.dataset['fullname']?.replace(/^t3_/, '');
        const count = commentCount(post);
        const fresh = id && count !== undefined ? newSinceVisit(visits[id], count) : undefined;
        const link = post.querySelector<HTMLAnchorElement>('.buttons a.comments');
        let badge = post.querySelector<HTMLAnchorElement>('.ember-new-count');
        if (!link || !fresh) {
            badge?.remove();
            continue;
        }
        if (!badge) {
            badge = document.createElement('a');
            badge.className = 'ember-new-count';
            link.after(badge);
        }
        badge.href = link.href;
        badge.textContent = `+${fresh} new`;
    }
}

function refreshNewCounts(): void {
    loadVisits().then(renderNewCounts, () => undefined);
}

/** Keeps the post list's "+N new" counts up to date as you read threads. */
export function showNewCounts(): void {
    refreshNewCounts();
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[VISITS_KEY]) {
            refreshNewCounts();
        }
    });
    // Going back from a thread restores this page as it was, from the back/forward cache.
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            refreshNewCounts();
        }
    });
}
