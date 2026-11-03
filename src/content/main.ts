import { enhance } from './page';
import { startSettings } from './store';
import { watchSubredditStyles } from './subreddit';

// Runs at document_start: the theme applies before the page first paints.
startSettings();
watchSubredditStyles();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance, { once: true });
} else {
    enhance();
}
