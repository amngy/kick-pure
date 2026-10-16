# Kick Pure

A small, dependency-free Firefox add-on for people who just want to watch Kick: **1080p without an account**, no ads, no gambling, no mature or gamified clutter, and local follows. Works in Firefox 128+ and LibreWolf.

## What it does
- **1080p for logged-out viewers** (see below).
- **Filters** gambling, mature and blocked streams/categories/channels out of Kick's API data, with a DOM fallback for cards that slip through. Optional language allow-list.
- **Hides clutter**: ads, Kicks/gift/points/drops UI, leaderboard, carousel, recommendations (each toggleable in the popup).
- **Local follows**: kept in the browser, polled via `kick.com/api/v2/channels/{slug}`, with optional live notifications.
- **Self-check badge** that warns when a Kick site change breaks one of the hooks.

## Install
**Temporary (any Firefox/LibreWolf):** open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → pick `kick-hd/manifest.json`. It is removed on restart.

**Permanent, unsigned:** run `node scripts/build-xpi.js` to create `dist/kick-pure-<version>.xpi`. Unsigned add-ons only load in builds that allow it (Developer Edition, Nightly, ESR, LibreWolf): set `xpinstall.signatures.required` to `false` in `about:config`, then open the `.xpi` (Add-ons Manager → gear → *Install Add-on From File…*).

## Privacy
No analytics, no telemetry, no accounts, no servers of ours. Follows and settings stay in `storage.local`. The only network requests are Kick's own, plus the follow poll to `kick.com`. Filter rules are plain data (comma-separated lists); the add-on never downloads or runs remote code.

## How the 1080p unlock works
For logged-out viewers Kick's player calls `setAutoMaxQuality` with a 720p cap, which the Amazon IVS player forwards to its web worker as `{funcName: "setAutoMaxQuality"}`. `page.js` runs in the page world at `document_start` and wraps `Worker.prototype.postMessage` to drop that one message, so adaptive bitrate can pick 1080p. It relies on IVS internals; the self-check and the daily canary flag it if that changes.

## Development
```
node --test                  # unit tests for the filter rules (no install needed)
node scripts/build-xpi.js    # build the .xpi
cd canary && npm i && cd .. && node canary/canary.js   # live Kick check (needs Chrome installed)
```
A daily GitHub Action (`Kick canary`) runs the live check and opens an issue naming the broken check if Kick's API, DOM selectors or player message change.

## License
GPL-3.0-or-later, see [LICENSE](LICENSE). Not affiliated with Kick.
