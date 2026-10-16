const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

const HEALTH_LABELS = {
  data: "Stream data filter (home, browse)",
  cards: "Stream cards on the page (home, browse)",
  chat: "Chat panel (channel pages)",
  hd: "1080p unlock (channel pages)",
};

// To add a toggle: add a row here and a default in KHD.DEFAULTS. The key is the storage key.
const SETTINGS = [
  { title: "Player", rows: [["hd", "Unlock 1080p", "Reloads open Kick tabs"]] },
  { title: "Hide", rows: [
    ["ads", "Ads", "Banner and in-feed ad slots"],
    ["gambling", "Gambling", "Casino categories and sponsor keywords"],
    ["mature", "Mature content", "18+ streams and listed categories"],
    ["gamification", "Gamification", "KICKs, gifts, leaderboards, points, drops"],
    ["carousel", "Home carousel", "Autoplaying featured stream"],
    ["recommendations", "Recommended sidebar", "Channel suggestions on the left"],
  ] },
  { title: "Notifications", rows: [["notifyLive", "Live alerts", "Notify when a followed channel goes live"]] },
];

// To add a list: add a row here. group: "mine" (your own rules) or "builtin" (shipped defaults).
const FILTERS = [
  ["mine", "languages", "Languages", "Only show these languages. None selected shows all."],
  ["mine", "blockedCategories", "Hidden categories", "Type a category name and press Enter."],
  ["mine", "blockedChannels", "Hidden channels", "Type a channel name and press Enter."],
  ["builtin", "gamblingCategories", "Gambling categories", "Used while “Gambling” is on."],
  ["builtin", "gamblingKeywords", "Gambling keywords", "Matched in titles and channel names."],
  ["builtin", "matureCategories", "Mature categories", "Used while “Mature content” is on."],
];

// ---- Views: three tabs plus drill-down pages that reuse the back button. ----
const TABS = ["follows", "filters", "settings"];
const TITLES = { follows: "Kick Pure", filters: "Filters", settings: "Settings", health: "Self-check" };
function show(view) {
  const isTab = TABS.includes(view);
  for (const id of [...TABS, "health"]) $(id).hidden = id !== view;
  for (const t of document.querySelectorAll("[role=tab]")) {
    t.setAttribute("aria-selected", String(isTab && t.dataset.view === view));
    t.tabIndex = t.dataset.view === view ? 0 : -1;
  }
  document.body.dataset.view = view;
  $("back").hidden = isTab;
  $("title").textContent = TITLES[view];
  $("liveCount").hidden = view !== "follows";
  document.querySelector("main").scrollTop = 0;
}
const tabs = [...document.querySelectorAll("[role=tab]")];
tabs.forEach((t, i) => {
  t.addEventListener("click", () => show(t.dataset.view));
  t.addEventListener("keydown", (e) => {
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = tabs[(n + tabs.length) % tabs.length];
    show(next.dataset.view);
    next.focus();
  });
});
$("back").addEventListener("click", () => show("settings"));
$("openHealth").addEventListener("click", () => show("health"));
$("warn").addEventListener("click", () => show("health"));

// ---- Settings: every control's id is a settings key; changes save immediately. ----
const store = browser.storage.local;
const bind = (input, key, s) => {
  const prop = input.type === "checkbox" ? "checked" : "value";
  input[prop] = s[key];
  input.addEventListener("change", () => store.set({ [key]: input[prop] }));
};

function buildSettings(s) {
  for (const g of SETTINGS) {
    const group = el("div", { className: "group" });
    for (const [key, name, hint] of g.rows) {
      const label = el("label", { className: "item" }, el("span", { className: "t" }, el("b", { textContent: name }), el("small", { textContent: hint })));
      const input = el("input", { type: "checkbox", className: "switch", id: key });
      label.append(input);
      group.append(label);
      bind(input, key, s);
    }
    $("settingsGroups").append(el("h2", { textContent: g.title }), group);
  }
}

const LANGUAGES = { en: "English", de: "German", es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", tr: "Turkish", ru: "Russian", ar: "Arabic", pl: "Polish", nl: "Dutch", ja: "Japanese", ko: "Korean" };

// Each list is stored as a comma-separated string (KHD.DEFAULTS); the editor works on an array of items.
function buildFilters(s) {
  for (const [grp, key, name, hint] of FILTERS) {
    let items = KHD.splitList(s[key]);
    const save = () => store.set({ [key]: items.join(", ") });
    const count = el("span", { className: "count" });
    const body = el("div", { className: "chips" });
    const draw = () => {
      count.textContent = items.length ? String(items.length) : key === "languages" ? "all" : "none";
      body.replaceChildren();
      if (key === "languages") {
        for (const [code, label] of Object.entries(LANGUAGES)) {
          const on = items.includes(code);
          const b = el("button", { type: "button", className: "chip pick", textContent: label });
          b.setAttribute("aria-pressed", String(on));
          b.addEventListener("click", () => { items = on ? items.filter((i) => i !== code) : [...items, code]; save(); draw(); b.focus(); });
          body.append(b);
        }
        return;
      }
      for (const item of items) {
        const x = el("button", { type: "button", className: "chip", textContent: item + " ×", ariaLabel: `Remove ${item}` });
        x.addEventListener("click", () => { items = items.filter((i) => i !== item); save(); draw(); input.focus(); });
        body.append(x);
      }
    };
    const input = el("input", { type: "text", className: "chipinput", placeholder: "Add and press Enter", ariaLabel: `Add to ${name}`, autocomplete: "off" });
    const add = () => {
      const fresh = KHD.splitList(input.value).filter((i) => !items.includes(i));
      input.value = "";
      if (fresh.length) { items = [...items, ...fresh]; save(); draw(); }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
      else if (e.key === "Backspace" && !input.value && items.length) { items.pop(); save(); draw(); }
    });
    input.addEventListener("blur", add);

    const head = el("button", { className: "item", type: "button" }, el("span", { className: "t" }, el("b", { textContent: name })), count, el("span", { className: "chev", textContent: "›", ariaHidden: "true" }));
    const editor = el("div", { className: "editor", id: `ed-${key}`, hidden: true }, el("small", { textContent: hint }), body);
    if (key !== "languages") editor.append(input);
    head.setAttribute("aria-expanded", "false");
    head.setAttribute("aria-controls", editor.id);
    head.addEventListener("click", () => {
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", String(open));
      editor.hidden = !open;
      if (open && key !== "languages") input.focus();
    });
    draw();
    $(grp === "mine" ? "filtersMine" : "filtersBuiltin").append(head, editor);
  }
}

store.get(KHD.DEFAULTS).then((s) => { buildSettings(s); buildFilters(s); });

// ---- Follows ----
// Accepts "name", "kick.com/name" or a full URL; Kick slugs are letters, digits, "_" and "-".
function toSlug(input) {
  const m = String(input).trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:kick\.com\/)?([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1].toLowerCase() : null;
}

async function setFollow(slug, on) {
  const { follows = [] } = await store.get("follows");
  const next = on ? [...new Set([...follows, slug])] : follows.filter((f) => f !== slug);
  await store.set({ follows: next });
}

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString());

function channelRow(slug, s) {
  const name = s?.name || slug;
  const a = el("a", { href: `https://kick.com/${slug}`, textContent: name });
  a.addEventListener("click", (e) => { e.preventDefault(); browser.tabs.create({ url: a.href }); window.close(); });
  const sub = el("span", { textContent: s?.live ? `${s.category}${s.title ? " · " + s.title : ""}` : s?.error ? "Couldn't check" : s ? "Offline" : "Checking…" });
  if (s?.live) sub.title = s.title || "";
  const ava = el("div", { className: "ava" });
  if (s?.pic) ava.append(el("img", { src: s.pic, alt: "" }));
  else ava.textContent = name[0].toUpperCase();
  const x = el("button", { className: "x", textContent: "×", ariaLabel: `Unfollow ${name}`, title: "Unfollow" });
  x.addEventListener("click", () => setFollow(slug, false));
  const row = el("li", { className: `ch ${s?.live ? "live" : "off"}` }, ava, el("div", { className: "i" }, a, sub));
  if (s?.live) row.append(el("span", { className: "viewers", textContent: compact(s.viewers), title: `${s.viewers.toLocaleString()} watching` }));
  row.append(x);
  return row;
}

async function renderFollows() {
  const { follows = [], followStatus = {} } = await store.get(["follows", "followStatus"]);
  const list = $("followList");
  list.replaceChildren();
  const live = (f) => (followStatus[f]?.live ? followStatus[f].viewers + 1 : 0);
  const sorted = [...follows].sort((a, b) => live(b) - live(a));
  if (!sorted.length) {
    list.append(el("li", { className: "empty" }, el("b", { textContent: "No channels yet" }), "Follow a channel to see when it's live. No Kick account needed."));
  }
  for (const slug of sorted) list.append(channelRow(slug, followStatus[slug]));
  const n = sorted.filter((f) => live(f)).length;
  $("liveCount").textContent = follows.length ? `${n} live` : "";

  // "Follow <channel>" shortcut when the active tab is a Kick channel.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const m = tab?.url?.match(/^https:\/\/kick\.com\/([A-Za-z0-9_-]+)\/?$/);
  const slug = m && !["browse", "following", "search", "category", "events", "drops"].includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  const btn = $("followCurrent");
  btn.hidden = !slug || follows.includes(slug);
  if (slug) {
    btn.textContent = `★ Follow ${slug}`;
    btn.onclick = () => setFollow(slug, true);
  }
}

$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const slug = toSlug($("addSlug").value);
  if (!slug) { $("addSlug").setCustomValidity("Enter a Kick channel name or link"); $("addSlug").reportValidity(); return; }
  $("addSlug").value = "";
  setFollow(slug, true);
});
$("addSlug").addEventListener("input", () => $("addSlug").setCustomValidity(""));

// ---- Self-check ----
async function renderHealth() {
  const { health = {} } = await store.get("health");
  const broken = Object.keys(health).filter((k) => health[k].fails >= 2);
  const warn = $("warn");
  warn.hidden = !broken.length;
  warn.replaceChildren(`Kick changed something. Not working: ${broken.map((k) => HEALTH_LABELS[k] || k).join(", ")}.`, el("span", { textContent: "›", ariaHidden: "true" }));
  $("healthSummary").textContent = broken.length ? `${broken.length} not working` : Object.keys(health).length ? "All working" : "Not checked yet";
  const list = $("healthList");
  list.replaceChildren();
  for (const [key, label] of Object.entries(HEALTH_LABELS)) {
    const h = health[key];
    const state = !h ? "" : h.fails >= 2 ? "bad" : "ok";
    list.append(el("div", { className: "item" },
      el("span", { className: `dotstate ${state}`, ariaHidden: "true" }),
      el("span", { className: "t" }, el("b", { textContent: label }), el("small", { textContent: !h ? "Not checked yet" : `${h.fails >= 2 ? "Not working" : "Working"} · ${new Date(h.at).toLocaleTimeString()}` }))));
  }
}

show("follows");
renderFollows();
renderHealth();
browser.runtime.sendMessage({ type: "poll" }).catch(() => {});
browser.storage.onChanged.addListener((c) => {
  if (c.follows || c.followStatus) renderFollows();
  if (c.health) renderHealth();
});
