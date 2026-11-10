# AGENTS.md

Guide for agents (and people) working on Ember. Read it before changing anything; [README.md](README.md) is the user-facing companion.

## What Ember is

A Firefox extension (Manifest V3, add-on ID `ember@mjuma`) that restyles and extends old reddit: old.reddit.com, and www.reddit.com for accounts that opted out of the redesign (which serves the same pages there). It adds themes, flat comments with a colored bar per reply level ("colored threads"), per-author name colors, jumping between top-level and new comments, new-comment highlighting that survives a refresh, post-list keys, and expand all. It is one content script and one stylesheet running on Reddit's own pages. It never calls Reddit's API or makes any network request: voting, replying and saving are Reddit's own buttons.

TypeScript, no framework. esbuild bundles `src/content/main.ts` into `dist/ember.js` (one IIFE, `target: firefox140`) and copies `ember.css`, the manifest and icons. Dev tools are `oxlint` (type-aware), `tsc`, `vitest`, `web-ext`, and `playwright-core` + `jsdom` for the fixture checks.

## Ground rules

- **Describe Ember in its own terms.** Don't name or compare it with other Reddit apps or clients in code, docs, media, release notes or commits. Call the comment design "colored threads".
- **No flash before first paint.** The script runs at `document_start`. `store.ts` reads a mirror of the settings from the page's `localStorage` synchronously and sets attributes on `<html>`, and the stylesheet keys everything off those attributes. Don't await anything before `apply()`, and don't move styling into script that waits for `DOMContentLoaded`.
- **Post lists stay as dense as Reddit's.** With the sidebar hidden, a page of posts must not take more height than on plain old.reddit; `pnpm check` compares the two. The sidebar keeps a column of its own (nothing runs under it, unlike Reddit's), which costs some width on laptop-size windows: an accepted trade-off. Reddit's stylesheet sets line heights on inner elements (like `.buttons li`), so check what actually sets a height before adding padding.
- **Ember's CSS loses ties with Reddit's.** Content-script CSS comes before the page's in the cascade. When a rule needs to win, match or beat the specificity of Reddit's own selector (see the `.listing-chooser` margins), and use `!important` only for hiding things or to beat Reddit's own `!important` and inline styles (trophy names, the formatting help's header row).
- **Keep it small and permission-light.** Permissions are `storage` only, and the content script matches old.reddit.com and www.reddit.com. Don't add other hosts, network requests, remote code or frameworks.
- **Leave the redesign alone.** www.reddit.com serves the redesign to most people, and even accounts that opted out get it for pages like settings. `main.ts` runs Ember only on old.reddit.com or where `<html>` has old reddit's `xml:lang`, and every rule in `ember.css` keys off an attribute Ember sets (or Ember's own ids and classes), never a bare `:root` or `:not([data-ember-…])`, since the stylesheet is injected into every matched page. `pnpm check redesign` checks a redesign page stays untouched.
- **Stay compatible with stored data.** `decodeSettings` drops unknown keys and invalid values and fills defaults, so adding a setting is safe. Renaming or removing one resets users' values for it. Never change the add-on ID: it keys storage, AMO signing and auto-update.
- **The repo is public, and Reddit content isn't ours.** No personal data, real usernames, real posts or comments, or work details in code, tests, docs, media or commits. `test/fixtures/` holds real saved Reddit pages and is git-ignored on purpose: never commit them. Media uses the made-up pages in `brag-output/work/demo.mjs`. Keep commits on the repo's local git identity (already set; don't override it).
- **Pushing to `master` can publish a release** (see *Publishing*). Don't push, tag, or bump the version without the owner's go-ahead.

## Layout

| Path | What it is |
| --- | --- |
| `src/manifest.json` | MV3: one content script (`ember.js` + `ember.css`) on `https://old.reddit.com/*` and `https://www.reddit.com/*` at `document_start`, `storage` permission, `update_url` for self-hosted updates, `gecko_android` minimum. |
| `src/content/main.ts` | Entry: on old reddit's pages only, `startSettings()` and `watchSubredditStyles()` at `document_start`, then `enhance()` once the page is parsed. |
| `src/content/store.ts` | Settings in `storage.sync` (key `settings`), mirrored to `localStorage['ember:settings']`. `apply()` sets the `<html>` attributes: `data-ember-theme`, `-width`, `-indent`, `-thread-style`, `-bars`, `-threads`, `-authors`, `-sidebar`. |
| `src/content/subreddit.ts` | Turns subreddit stylesheets off (`media="not all"`) as they appear, and sets `data-ember` (Ember's theme applies) unless *Subreddit styles* is on. |
| `src/content/ember.css` | Everything visual: theme palettes (CSS variables), layout, the sidebar, colored threads (depth colors and Cards' box shades by nesting; bar palettes), author colors, new/focus highlights, thumbnails, the nav bar and the settings dialog. |
| `src/content/page.ts` | Wires a page up: author colors, the settings link, keys (thread keys or post-list keys), thread features, and comments added later by *load more comments*. |
| `src/content/comments.ts` | Collapse from the comment header, the age permalink, author hues. |
| `src/content/navbar.ts` | Thread jump commands (`n`/`p`, `j`/`k`, `N`/`P`, `c`) and the floating `#ember-nav` bar. |
| `src/content/newComments.ts` | New comments on a thread (seen after 400 ms on screen), saving the visit, the *+N new* badges on post lists, and counting or clearing visits for Settings › Data. |
| `src/content/listing.ts` | Post lists: the selected post, its keys, and expand all. Keys click Reddit's own links and buttons. |
| `src/content/panel.ts` | The settings `<dialog>` (HTML strings, escaped): a live sample pinned at the top, the settings, keys, and Data (reset settings, clear reading history). |
| `src/lib/` | Pure, tested logic: `settings.ts` (schema, decode/encode), `visits.ts` (new comments, visit records), `navigation.ts` (jump targets), `nameHue.ts`. Specs sit next to them (`*.spec.ts`). |
| `scripts/build.mjs`, `scripts/dev.mjs` | Bundle into `dist/` (`--watch` for dev); `pnpm dev`. |
| `scripts/fixtures.mjs`, `scripts/check.mjs` | Scrub saved pages into `test/fixtures/`; load Ember into them in Chromium and check behavior. |
| `.github/workflows/` | `ci.yml` (pull requests), `release.yml` (push to `master`). |
| `docs/` | README media: `demo.gif`, `themes.png`, `posts.png`, `cards.png`, `settings.png`, `social-preview.png`. |
| `pnpm-workspace.yaml` | `allowBuilds: esbuild`. Without it pnpm fails the frozen install in CI. |

Local only (git-ignored): `dist/`, `web-ext-artifacts/`, `release/`, `.dev-profile/` (the `pnpm dev` Firefox profile with your Reddit login), `test/fixtures/*.html` and `assets/`, `.measure/` (check screenshots), `brag-output/` (launch video sources).

## Data

**`storage.sync`** (Firefox Sync): `settings` holds only the values that differ from the defaults (`encodeSettings`), so better defaults reach everyone later. The schema lives in `src/lib/settings.ts`:

- `theme`: `system` (default; `dusk` or `light` with the OS) | `dusk` | `dark` | `dim` | `black` | `light`. Settings labels them Automatic, Midnight, Charcoal, Slate, Black and Paper; the stored ids stay as they are.
- `width`: `full` | `wide` (default) | `narrow`
- `indent`: `compact` | `normal` (default) | `wide`
- `threadStyle`: `flat` (default) | `cards`; applies only with `coloredThreads` on, like `indent` and `bars`
- `bars`: `colorful` (default) | `pastel` | `ocean` | `sunset` | `gray`
- booleans: `coloredThreads` (on), `authorColors` (on), `newComments` (on), `showSidebar` (on), `listKeys` (on: post-list keys and click-to-select), `threadKeys` (on), `subredditStyles` (off)

**`localStorage['ember:settings']`** (per origin: old.reddit.com and www.reddit.com each have one): the same sparse object, read synchronously at `document_start`. The first page on an origin without it paints with the defaults until `storage.sync` answers a moment later.

**`storage.local`** (per machine): `visits` → `{ <threadId>: { at, unseen: [comment fullnames], count? } }`. `at` is when the thread was loaded, `unseen` holds new comments you didn't reach, and `count` is the thread's comment count then, used for *+N new*. Visits expire after 30 days. Only a full thread URL counts as a visit, not a single comment's permalink page. Settings › Data clears the whole key.

## Conventions

- 4-space indent, LF, final newline (`.editorconfig`); YAML 2 spaces.
- Single quotes, semicolons, always braces, `const` by default. Strict TypeScript (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`): use `dataset['key']`.
- No `console.*` (oxlint `no-console` is an error). Scripts write with `process.stdout.write`. Helpers that don't capture anything go at module scope (`consistent-function-scoping`).
- Ember's own UI is plain light-DOM elements with `ember-` ids and classes, styled from `ember.css`. Escape anything interpolated into HTML strings (`escape` in `panel.ts`).
- The settings sample copies Reddit's post and comment markup (`SAMPLE` in `panel.ts`), so Reddit's styles and Ember's draw it like the page. It isn't a `.commentarea` or `#siteTable`, so the thread and post-list code never sees it: keep page queries scoped through those, and write colored-thread selectors as `:is(.commentarea, .ember-sample-comments)`. If a comment style comes to depend on markup the sample lacks, add it there.
- `--rail-0` to `--rail-7` are the comment bars' palette and change with *Comment bars*; anything else that wants one of those colors gets its own variable (like `--green` for stickied posts and moderators).
- Comments only where something isn't obvious (the *why*, Reddit or Firefox quirks). Match the existing tone: short, plain sentences.
- Pure logic goes in `src/lib/` with focused `vitest` specs for behavior you add or fix. Page behavior gets a check in `scripts/check.mjs`.
- Lint config: `oxlintrc.json` extends `oxlintrc.base.json` (shared with the owner's other repos; strict, all rules `deny`).

## Working locally

**Setup** (macOS and Linux; step by step in the README's *Development* section): Firefox, Node 22 or newer (`.node-version` pins CI's 22), pnpm. Any recent pnpm switches itself to the version pinned by `packageManager`. Install it with `npm install -g pnpm --allow-scripts=pnpm`: Node 25+ has no corepack, and npm 12 otherwise skips the script that installs pnpm 12's native binary, leaving a shebang-less shim that `spawn()` fails on with `ENOEXEC`. Then `pnpm install` and `pnpm dev`. If your machine installs through a private npm mirror, `.pnpmfile.cjs` strips mirror tarball URLs from `pnpm-lock.yaml` so CI resolves against public npm; keep it.

**Commands:**

```bash
pnpm build           # tsc --noEmit, then bundle into dist/
pnpm test            # vitest specs for src/lib (fast, no browser)
pnpm lint            # oxlint, build, web-ext lint --self-hosted (expect 0 errors; 2 innerHTML warnings)
pnpm check [part]    # Ember in the saved fixtures, in Chromium: behavior checks + .measure/shots/
pnpm dev             # Firefox with Ember from dist/, rebuilding and reloading on save
pnpm fixtures <html> # scrub pages saved from Firefox into test/fixtures/
```

Run `pnpm test`, `pnpm lint` and `pnpm check` before every commit; CI runs build, test and lint plus a version-match check (no fixtures there).

**Fixtures:** old.reddit sends logged-out visitors to a login page and blocks automated logins, so checks run on pages the owner saved from Firefox (*Save Page As… → Web Page, complete*) and scrubbed with `pnpm fixtures`. `check.mjs` needs `deep-thread-post.html` (it reads the thread URL from its canonical link) and `subreddit-page.html`. It serves fixtures at their real paths, stubs `browser.storage`, and injects Ember first in `<head>`. Reddit's inline `onclick` handlers survive scrubbing without their scripts, so `click_thing is not defined` errors are expected and filtered. Fixtures have no Reddit JS, which is why Ember implements collapse itself. `pnpm check dark` scans every fixture there is, in Midnight and Paper, for near-white boxes, text under 3:1 contrast and Reddit's sprite images, so theming a new kind of Reddit page starts with saving one (the owner has saved threads, archived threads, post lists, a profile, the inbox, search, submit, wiki pages and the formatting help).

**Real Firefox:** `pnpm dev` keeps its profile in `.dev-profile`, so the owner logs in to Reddit once. That login is the owner's, so don't delete the folder. The watcher rebuilds the script and stylesheet only; `src/manifest.json` and icons are copied when it starts, so changing them needs a restart. After a reload, the open tab needs a refresh. On macOS it runs `web-ext` with `HOME` pointed at an empty temp folder, because web-ext reads Firefox's `profiles.ini` under `$HOME` and macOS can block that. Linux keeps the real `HOME`: Firefox inherits it and would otherwise lose the user's fonts and GTK theme. web-ext finds Firefox in `/Applications` (macOS) or as `firefox` on `PATH` (Linux). Extra arguments go to `web-ext run`, e.g. `pnpm dev --firefox=nightly` (or `deved`, `flatpak:org.mozilla.firefox`, a path) or `--devtools`. Playwright's Firefox doesn't start on the owner's Mac ("Could not find profile folder"), so automated checks use Chromium and the owner checks Firefox by hand. Don't load `dist/` over the owner's installed copy (same add-on ID, same storage); use `pnpm dev`'s profile.

## Publishing (GitHub)

Repo: `MJuma/ember` (public). Releases are GitHub Releases with a Mozilla-signed `.xpi`. The add-on is *unlisted* on addons.mozilla.org, meaning it is signed there but not listed. Installed copies update themselves.

**To release a new version** (with the owner's approval):

1. Bump `version` in **both** `src/manifest.json` and `package.json` (plain `x.y.z`). CI fails if they differ.
2. Commit and push to `master`. A push without a version change doesn't release.
3. `release.yml` then:
   - checks the tag `v<version>` doesn't exist;
   - runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test` and `pnpm lint`;
   - signs `dist/` with `web-ext sign --channel unlisted`, using repo secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET`;
   - writes `release/updates.json` (`{ addons: { "ember@mjuma": { updates: [{ version, update_link, update_hash: "sha256:…" }] } } }`);
   - runs `gh release create v<version> ember.xpi updates.json --generate-notes`.

   It takes about 4–5 minutes, mostly Mozilla's signing.
4. Verify:
   ```bash
   gh run watch -R MJuma/ember "$(gh run list -R MJuma/ember --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
   curl -sL https://github.com/MJuma/ember/releases/latest/download/updates.json   # new version, hash
   ```
   The manifest's `update_url` points at `releases/latest/download/updates.json`, so Firefox picks the release up within about a day (or immediately via `about:addons` → ⚙ → *Check for Updates*).

**Things to know:**

- `gh` needs an account with write access to `MJuma/ember`. If the active `gh` account is a different one, prefix commands with `GH_TOKEN="$(gh auth token --user MJuma)"`.
- Mozilla signs each version number **once**. Never run `pnpm sign` (local signing, keys from the macOS Keychain entries `amo-jwt-issuer` / `amo-jwt-secret`) for a version you intend to release; CI's signing would then fail with a duplicate version. If a release run fails after signing, bump the version again.
- If signing fails with an authentication error, re-set the secrets from the Keychain without printing them:
  ```bash
  security find-generic-password -s amo-jwt-issuer -w | tr -d '[:space:]' | gh secret set AMO_JWT_ISSUER -R MJuma/ember
  security find-generic-password -s amo-jwt-secret -w | tr -d '[:space:]' | gh secret set AMO_JWT_SECRET -R MJuma/ember
  ```
- Release notes are generated from commits, so write commit subjects that read well in a changelog.
- `web-ext lint` must run with `--self-hosted`: without it, `update_url` is an error (it assumes an AMO listing).
- The repo's social preview image (`docs/social-preview.png`) can only be set by hand in GitHub → Settings → General → Social preview.

## README media

`docs/` was rendered with the brag-slim skill from sources in the git-ignored `brag-output/work/` on the machine that made them:

- `demo.mjs` writes a made-up thread and front page using old.reddit's real markup and stylesheets, with invented users and comments. Keep old reddit's `<html>` start tag (with `xml:lang`): away from old.reddit.com, Ember runs only where it finds that.
- `serve.mjs` serves them at real paths with Ember's built `dist/` injected. Settings come from `?ember=<json>`; without it the sidebar is off, so the video and theme stills keep the thread in frame.
- `stage.html` / `stage.js` animate a browser window around Ember's real script and stylesheet, frame by frame.
- `render.mjs` captures stills or all 600 frames in Chromium.
- `shots.mjs` takes the README stills: `posts.png`, `cards.png` and `settings.png` with the sidebar, and the four themes for `themes.png`. They go into `docs/` scaled to 1600 px wide.
- `music.py` writes the soundtrack.

The GIF is the video's frames at 15 fps and 960 px wide; the social preview is a cropped reveal frame. If the UI changes visibly, regenerate them the same way (or ask the owner) so the README stays accurate. Keep the media free of personal data, real Reddit content and the repo URL.
