// Background: self-check results -> toolbar badge, local follows (polling + live notifications),
// and reloading Kick tabs when the 1080p option changes.
const KICK_TABS = ["https://kick.com/*", "https://*.kick.com/*"];
const POLL_MINUTES = 2;

// ---- Toolbar badge: "!" when a self-check keeps failing, otherwise the number of live follows. ----
async function updateBadge() {
  const { health = {}, followStatus = {} } = await browser.storage.local.get(["health", "followStatus"]);
  const broken = Object.values(health).some((h) => h.fails >= 2);
  const live = Object.values(followStatus).filter((s) => s.live).length;
  browser.action.setBadgeText({ text: broken ? "!" : live ? String(live) : "" });
  browser.action.setBadgeBackgroundColor({ color: broken ? "#f5a623" : "#2bd47d" });
}

// One failure can be a slow page; two in a row means Kick changed something.
async function recordHealth(results) {
  const { health = {} } = await browser.storage.local.get("health");
  for (const [key, ok] of Object.entries(results)) {
    health[key] = { ok, fails: ok ? 0 : (health[key]?.fails || 0) + 1, at: Date.now() };
  }
  await browser.storage.local.set({ health });
  updateBadge();
}

// ---- Local follows ----
async function fetchChannel(slug) {
  const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const l = j.livestream;
  return {
    name: j.user?.username || slug,
    pic: j.user?.profile_pic || "",
    live: !!(l && l.is_live !== false),
    title: l?.session_title || "",
    viewers: l?.viewer_count || 0,
    category: l?.categories?.[0]?.name || "",
    checked: Date.now(),
  };
}

let polling = null;
function poll() {
  // Popup and alarm may ask at the same time; share one run.
  polling ||= (async () => {
    const { follows = [], followStatus = {}, notifyLive = KHD.DEFAULTS.notifyLive } =
      await browser.storage.local.get(["follows", "followStatus", "notifyLive"]);
    const next = {};
    for (const slug of follows) {
      try {
        next[slug] = await fetchChannel(slug);
      } catch {
        next[slug] = { ...(followStatus[slug] || { name: slug, live: false }), error: true };
      }
      const s = next[slug];
      if (notifyLive && s.live && followStatus[slug] && !followStatus[slug].live) {
        browser.notifications.create(`live:${slug}`, {
          type: "basic",
          iconUrl: "icon-96.png",
          title: `${s.name} is live`,
          message: [s.category, s.title].filter(Boolean).join(" · "),
        });
      }
    }
    await browser.storage.local.set({ followStatus: next });
    updateBadge();
  })().finally(() => { polling = null; });
  return polling;
}

browser.notifications.onClicked.addListener((id) => {
  if (id.startsWith("live:")) browser.tabs.create({ url: `https://kick.com/${id.slice(5)}` });
});

// ---- Wiring ----
const init = () => {
  browser.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
  poll();
};
browser.runtime.onStartup.addListener(init);
browser.runtime.onInstalled.addListener(init);
browser.alarms.onAlarm.addListener((a) => a.name === "poll" && poll());

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "health") return recordHealth(msg.results);
  if (msg?.type === "poll") return poll();
});

browser.storage.onChanged.addListener(async (changes) => {
  if (changes.follows) poll();
  if (changes.hd) {
    // The player patch only reads the setting when Kick's player starts.
    for (const tab of await browser.tabs.query({ url: KICK_TABS })) browser.tabs.reload(tab.id);
  }
});
