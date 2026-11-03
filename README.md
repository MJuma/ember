<p align="center"><img src="src/icons/ember.svg" width="96" height="96" alt=""></p>

<h1 align="center">Ember</h1>

<p align="center"><b>A dark skin for old.reddit.com in Firefox, with colored comment threads.</b><br>
Flat comment threads with a colored bar for each level, every author in their own color, jumps between top-level comments, and the comments that are new since your last visit.</p>

<p align="center"><a href="https://github.com/MJuma/ember/releases/latest/download/ember.xpi"><b>Install for Firefox</b></a> · <a href="#using-it">Using it</a> · <a href="#development">Development</a></p>

<p align="center"><img src="docs/demo.gif" width="800" alt="A plain white old.reddit thread flips to Ember's dark theme: flat comments with a colored bar for each reply level and every author in their own color. Pressing n jumps from one top-level comment to the next while the bar at the bottom right counts 1 / 12 to 4 / 12. After a reload, five comments carry an orange new tag and pressing N lands on each one. The theme then cycles through Dusk, Dark, Dim, Black and Light."></p>

Ember restyles Reddit's own pages; it doesn't use Reddit's API. You stay logged in to old.reddit.com as usual, and voting, replying, saving and everything else is Reddit's own.

## Install

1. Download [`ember.xpi`](https://github.com/MJuma/ember/releases/latest/download/ember.xpi) from the [latest release](https://github.com/MJuma/ember/releases/latest). Firefox offers to install it.
2. Open [old.reddit.com](https://old.reddit.com/) and log in. Ember only runs there, not on www.reddit.com.

Ember updates itself. Each release publishes an `updates.json` that Firefox checks about once a day; to check now, use `about:addons` → ⚙ → *Check for Updates*. Ember is signed by Mozilla as an *unlisted* add-on, so it isn't on addons.mozilla.org.

For an app-like window, pin an old.reddit.com tab (right-click the tab → *Pin Tab*) or keep it in a window of its own. Firefox for Mac can't install a site as an app.

## Using it

- **Themes:** System (Dusk or Light, following macOS), Dusk, Dark, Dim, Black (OLED) and Light. The theme is applied before the page first paints, so there's no flash of Reddit's white page.

  <img src="docs/themes.png" width="800" alt="The same thread in Ember's Dusk, Dim, Black and Light themes, each with a colored bar per reply level.">
- **Comments:** each comment sits flat on the page with a thin line above it, and replies get a short bar in their level's color, so you can tell where you are in a deep thread. Click a comment's header (outside its links) to collapse or expand it; selecting text doesn't. A comment's age (*4 hours ago*) links to the comment itself, and hovering it shows the exact time. Turn **Colored threads** off for Reddit's nested boxes, and change **Reply indent** to Compact, Normal or Wide.
- **Author colors:** each person's name gets a color of its own, the same everywhere, so you can follow who's who in a thread. The post's author (OP) is orange.
- **Jumping around a thread:** the bar in the bottom-right corner shows which top-level comment you're reading (*3 / 137*); ▲ and ▼ jump to the previous and next one, and **N new** jumps to the next new comment. Keys:

  | Key | Does |
  | --- | --- |
  | `n` / `p` | Next / previous top-level comment |
  | `j` / `k` | Next / previous comment |
  | `N` / `P` | Next / previous new comment |
  | `c` | Collapse or expand the comment you're reading |
  | `?` | Ember settings |

- **New comments:** when you come back to a thread, comments posted since your last visit have an orange tint and a *new* tag. They stay new until they've been on screen for a moment, so refreshing doesn't lose any you hadn't scrolled to. Visits are remembered for 30 days, on this computer only. Only the whole thread counts as a visit; a single comment's permalink page doesn't. In post lists, a thread you've read shows how many comments are new to you since (*41 comments* **+6 new**), counting the ones you didn't reach last time.
- **Post lists:** press `j` / `k` to move between posts (or click one), then act on the selected post with a key. **expand all** in the tabs (or `X`) opens every image, video and gallery in the list in place, and closes them again. The keys click Reddit's own links and buttons, so your Reddit preferences (like opening links in a new tab) still apply.

  | Key | Does |
  | --- | --- |
  | `j` / `k` | Next / previous post |
  | `Enter` | Comments (`⇧Enter` in a new tab) |
  | `o` | Open the link (`⇧O` in a new tab) |
  | `x` / `X` | Expand the post / expand or collapse all images and videos |
  | `a` / `z` | Upvote / downvote |
  | `s` / `h` | Save / hide |

  <img src="docs/posts.png" width="800" alt="Ember's front page: posts as dense as Reddit's, placeholder thumbnails in the theme's colors, orange +5 new, +12 new and +3 new badges beside the comment counts of threads read before, and the second post selected with an orange bar.">

- **Layout:** the column is Wide by default (85% of the window); Full and Narrow are in settings. The subreddit sidebar is hidden; turn on **Show sidebar** to bring it back. Promoted posts, the multireddit bar down the left of the homepage, and the *Get new Reddit* button are hidden. Placeholder thumbnails (text posts, links, NSFW, spoilers) are drawn in the theme's colors instead of Reddit's light gray boxes.
- **Subreddit styles:** subreddits' own stylesheets are off, since they'd fight the theme. Turn on **Subreddit styles** to see each subreddit's own look instead of Ember's theme; the comment layout, colors and navigation keep working.
- **Settings:** click **ember** next to your username at the top right, or press `?`. Settings sync between computers with Firefox Sync when *Add-ons* is ticked in Settings → Sync.

Ember makes no network requests and collects nothing. It needs only the `storage` permission and access to old.reddit.com.

## Development

### Commands

```bash
pnpm dev                  # Firefox with Ember loaded, rebuilding and reloading on save
pnpm test                 # vitest unit tests for the pure modules in src/lib
pnpm lint                 # oxlint (type-aware) + web-ext lint
pnpm build                # type-check, then bundle into dist/
pnpm fixtures [pages]     # scrub saved old.reddit pages into test/fixtures (see Fixtures)
pnpm check [part]         # load Ember into the fixtures in Chromium: behavior checks + screenshots
pnpm sign                 # signed .xpi, with AMO keys from the Keychain (see Releasing)
```

`pnpm dev` keeps its Firefox profile in `.dev-profile`, so log in to Reddit the first time and you stay logged in.

`pnpm lint` reports warnings about `innerHTML`. They're expected: the settings panel escapes everything it renders (`escape` in `src/content/panel.ts`), and the nav bar's markup is static.

### Fixtures

Reddit sends logged-out visitors from old.reddit.com to a login page and blocks automated logins, so the checks use pages you save yourself. In Firefox, save some old.reddit pages with *File → Save Page As… → Web Page, complete* (a long thread named `deep-thread-post.html` and a subreddit named `subreddit-page.html` are the ones `pnpm check` needs), then run `pnpm fixtures ~/Downloads/*.html`. The script removes scripts (where the session token lives), your account links and subscriptions, and form values, replaces your username with `ember_user`, and copies only stylesheets and images. Fixtures stay out of git: they're other people's posts.

`pnpm check` serves the fixtures at their real paths, stubs `browser.storage`, and injects Ember first in `<head>` (like `document_start`, with its stylesheet before Reddit's). It checks the theme, collapsing, keys, the nav bar, settings, new comments, post lists (keys, *+N new*, expand all, and that they're as dense as Reddit's) and subreddit styles, and saves screenshots of every theme to `.measure/shots/`. It needs Playwright's Chromium (`pnpm exec playwright-core install chromium`); Playwright's Firefox doesn't start on macOS here, so check in real Firefox with `pnpm dev` too.

### Releasing

Bump `version` in both `src/manifest.json` and `package.json` (CI checks they match) and push to `master`. [`release.yml`](.github/workflows/release.yml) builds, runs the tests and lint, has Mozilla sign the add-on (unlisted), and publishes a GitHub Release `v<version>` with `ember.xpi` and `updates.json`. Pushes that don't change the version don't release. Installed copies pick up the new version through `update_url` in the manifest, which points at the latest release's `updates.json`.

Signing needs two repository secrets, `AMO_JWT_ISSUER` (like `user:12345:67`) and `AMO_JWT_SECRET` (64 hex characters), from <https://addons.mozilla.org/developers/addon/api/key/>. The same keys as any other add-on of yours work.

Mozilla signs each version number once, so leave signing to CI. `pnpm sign` is for a one-off local build of a version you won't release; it reads the same keys from the macOS Keychain (or `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`):

```bash
security add-generic-password -U -s amo-jwt-issuer -a "$USER" -w   # JWT issuer
security add-generic-password -U -s amo-jwt-secret -a "$USER" -w   # JWT secret
```

### How it's put together

Ember is one content script and one stylesheet, injected into old.reddit.com at `document_start`. The stylesheet does almost everything: it keys off attributes the script sets on `<html>` (`data-ember-theme`, `data-ember-threads` and so on), so a setting changes the page without re-rendering anything. Ember's own controls are plain elements in the page.

| File | Role |
| --- | --- |
| `src/manifest.json` | Content script for `https://old.reddit.com/*`, `storage` permission. |
| `src/content/ember.css` | Themes, layout, colored threads, author colors, new comments, and Ember's nav bar and settings panel. |
| `src/content/main.ts` | Entry point. Applies settings and turns off subreddit styles at `document_start`, then enhances the page once it's parsed. |
| `src/content/store.ts` | Settings in `storage.sync`, mirrored to the page's `localStorage` so the theme is applied synchronously before first paint. Sets the `<html>` attributes. |
| `src/content/subreddit.ts` | Switches subreddit stylesheets off (`media="not all"`) as they appear, unless Subreddit styles is on; sets `data-ember` when Ember's theme applies. |
| `src/content/page.ts` | Author colors, the settings link, keys, and the thread or post-list features, including comments added later by *load more comments*. |
| `src/content/listing.ts` | Post lists: the selected post, its keys, and expand all. |
| `src/content/comments.ts` | Collapsing from the header, the age permalink, author hues. |
| `src/content/navbar.ts` | The jump commands and the floating nav bar. |
| `src/content/newComments.ts` | Which comments are new, marking them seen as they're read, and saving the visit (with the thread's comment count) in `storage.local`; the *+N new* counts on post lists. |
| `src/content/panel.ts` | The settings dialog. |
| `src/lib/` | Pure, tested logic: the settings schema and decoding, visits, jump targets, name hues. |
| `scripts/build.mjs` | esbuild bundle of the content script into `dist/`, plus the stylesheet, manifest and icons. `--watch` for `pnpm dev`. |
| `scripts/dev.mjs`, `scripts/fixtures.mjs`, `scripts/check.mjs` | `pnpm dev`, `pnpm fixtures`, `pnpm check`. |
| `.github/workflows/` | `ci.yml` builds, tests and lints pull requests; `release.yml` signs and releases version bumps. |
| `docs/` | README media: the demo GIF, stills and the social preview. They show Ember's real script and stylesheet on made-up old.reddit pages (no real users or posts), rendered with the `/brag-slim` skill; its work files stay in the git-ignored `brag-output/`. |
