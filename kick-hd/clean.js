// Extension-world content script: hides UI clutter (CSS), filters cards the data filter missed,
// relays settings to page.js, and runs the self-check that warns when Kick's site changes.
// shortcut: selectors come from Kick's DOM as of 2026-10; the self-check flags the ones it can verify.
const CSS = {
  ads: `[id^="home-masthead"], [id^="channel-masthead"], [id*="in-feed-ad"],
        [id^="google_ads_iframe"], [id^="div-gpt-ad"] { display: none !important; }`,
  gamification: `
    [data-testid="get-kicks"], [data-testid="kicks-top-nav"], [data-testid="kicks-balance"],
    [data-testid="gift-shop-button"], [data-testid="gift-shop-panel"], [data-testid="gift-sub-button"],
    [data-testid="channel-points-button"], [data-testid="channel-points-loading-button"],
    [data-testid="channel-points-error-button"], [data-testid="drops-panel-button"], [data-testid="navbar-drops"],
    [data-testid="sidebar-drops"], [data-testid="sidebar-events"], [data-testid="navbar-account-events"],
    [data-testid="identity-badge-sub_gifter"],
    #channel-chatroom div:has(> div > button[aria-label="Expand leaderboard"]),
    #channel-chatroom div:has(> div > button[aria-label="Expand leaderboard"]) + div:not(:has([data-testid]))
    { display: none !important; }`,
  carousel: `[data-testid="carousel"] { display: none !important; }`,
  recommendations: `section:has(> a[data-testid^="sidebar-recommended-channel-"]) { display: none !important; }`,
};

const CARDS = [
  '[data-testid="livestream-results-card"]',
  '[data-testid="media-card"]',
  'a[data-testid^="sidebar-recommended-channel-"]',
  '[data-testid="category-card-root"]',
].join(",");

let settings = { ...KHD.DEFAULTS };
let rules = KHD.compile(settings);
let loaded = false;
const style = document.createElement("style");

const sendToPage = () => document.dispatchEvent(new CustomEvent("khd:settings", { detail: JSON.stringify(settings) }));
document.addEventListener("khd:hello", () => loaded && sendToPage());

function apply() {
  rules = KHD.compile(settings);
  style.textContent = Object.keys(CSS).filter((k) => settings[k]).map((k) => CSS[k]).join("\n");
  sendToPage();
  schedule();
}

function shouldHide(card) {
  // Leaf texts, not innerText: innerText of an already-hidden card loses its line breaks.
  const lines = [...card.querySelectorAll("*")].filter((e) => !e.children.length)
    .map((e) => e.textContent.trim().toLowerCase()).filter(Boolean);
  const channel = (card.querySelector("a[href]") || card).getAttribute("href")?.split("/")[1];
  const tile = card.querySelector('[data-testid^="category-"]')?.dataset.testid.replace(/^category-/, "").toLowerCase();
  // The category shows up as its own text line (card link text, or a span in sidebar entries).
  return KHD.isBlocked(rules, { channel, title: lines.join("\n") }) || [tile, ...lines].some((l) => rules.cats.has(l));
}

function filterCards() {
  for (const card of document.querySelectorAll(CARDS)) {
    const hide = shouldHide(card);
    if (hide !== (card.dataset.khdHidden === "1")) {
      card.dataset.khdHidden = hide ? "1" : "0";
      card.style.display = hide ? "none" : "";
    }
  }
  // A hidden carousel keeps playing otherwise.
  if (settings.carousel) document.querySelectorAll('[data-testid="carousel"] video').forEach((v) => v.pause());
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; filterCards(); });
}

// ---- Self-check: 20s after each navigation, verify the hooks this page type should have. ----
let pageHealth = { capDropped: 0, streamsSeen: 0 };
document.addEventListener("khd:health", (e) => { pageHealth = JSON.parse(e.detail); });

const RESERVED = new Set(["browse", "following", "search", "category", "categories", "events", "drops", "settings", "subscriptions", "video", "clips"]);
function pageType() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (!parts.length) return "home";
  if (parts[0] === "browse" || parts[0] === "category") return "listing";
  if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return "channel";
  return "other";
}

function runChecks(type) {
  const results = {};
  if (type === "home" || type === "listing") {
    results.cards = document.querySelectorAll(CARDS).length > 0;
    // Per page load, not per navigation: Kick may serve a revisited list from its cache.
    results.data = pageHealth.streamsSeen > 0;
  }
  if (type === "channel" && document.querySelector("video")) {
    results.chat = !!document.querySelector("#channel-chatroom");
    const video = document.querySelector("video");
    // Only judge the 1080p hook when a stream is actually playing.
    if (settings.hd && !video.paused && video.readyState >= 3) results.hd = pageHealth.capDropped > 0 || video.videoHeight >= 1080;
  }
  if (Object.keys(results).length) browser.runtime.sendMessage({ type: "health", results }).catch(() => {});
}

let lastPath = null;
let checkTimer = null;
setInterval(() => {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  clearTimeout(checkTimer);
  const type = pageType();
  checkTimer = setTimeout(() => runChecks(type), 20000);
}, 1000);

// ---- Startup ----
browser.storage.local.get(KHD.DEFAULTS).then((s) => {
  settings = s;
  loaded = true;
  (document.head || document.documentElement).appendChild(style);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  apply();
});

browser.storage.onChanged.addListener((changes) => {
  let touched = false;
  for (const [k, { newValue }] of Object.entries(changes)) {
    if (k in KHD.DEFAULTS) { settings[k] = newValue; touched = true; }
  }
  if (touched) apply();
});
