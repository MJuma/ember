import { enhance } from './page';
import { startSettings } from './store';
import { watchSubredditStyles } from './subreddit';

/*
 * Old reddit's pages: everything on old.reddit.com, and www.reddit.com for accounts that opted out of
 * the redesign, which serves the same pages there. The redesign (www.reddit.com for everyone else, and
 * pages like settings even then) is left alone. Old reddit's <html> start tag has xml:lang and the
 * redesign's doesn't, and it's already parsed at document_start.
 */
const oldReddit = location.hostname === 'old.reddit.com' || document.documentElement.hasAttribute('xml:lang');

if (oldReddit) {
    // Runs at document_start: the theme applies before the page first paints.
    startSettings();
    watchSubredditStyles();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhance, { once: true });
    } else {
        enhance();
    }
}
