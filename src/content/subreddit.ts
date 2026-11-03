import { onSettings, settings } from './store';

const SELECTOR = 'link[title="applied_subreddit_stylesheet"]';

function sync(): void {
    const links = document.querySelectorAll<HTMLLinkElement>(SELECTOR);
    const subredditLook = settings().subredditStyles && links.length > 0;
    for (const link of links) {
        // media="not all" keeps the stylesheet from applying without removing it, so it can come back.
        link.media = subredditLook ? 'all' : 'not all';
    }
    // Ember's theme steps aside for the subreddit's own look; its comment layout and controls stay.
    document.documentElement.toggleAttribute('data-ember', !subredditLook);
}

/**
 * Subreddits' own stylesheets would fight Ember's theme, so they're switched off as soon as they
 * appear (before they paint), unless turned on in settings.
 */
export function watchSubredditStyles(): void {
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
        sync();
        observer.disconnect();
    }, { once: true });
    onSettings(sync);
}
