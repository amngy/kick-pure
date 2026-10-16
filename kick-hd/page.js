// Runs in Kick's page world at document_start. Two jobs:
// 1. 1080p: Kick's player calls ivsPlayer.setAutoMaxQuality(<=720p) for logged-out viewers, which the IVS
//    player forwards to its worker as {funcName: "setAutoMaxQuality"}. Dropping it lets auto ABR pick 1080p.
// 2. Data filter: removes blocked streams/categories from Kick's API responses before Kick renders them,
//    so filtering survives UI redesigns.
// Settings arrive from clean.js (extension world) as a JSON string event; health goes back the same way.
(() => {
  let settings = null;
  let rules = null;
  const waiters = [];
  const health = { capDropped: 0, streamsSeen: 0 };

  document.addEventListener("khd:settings", (e) => {
    settings = JSON.parse(e.detail);
    rules = KHD.compile(settings);
    waiters.splice(0).forEach((resolve) => resolve());
  });
  document.dispatchEvent(new CustomEvent("khd:hello"));

  const report = () => document.dispatchEvent(new CustomEvent("khd:health", { detail: JSON.stringify(health) }));
  // Never hold Kick's requests hostage: without settings after 1.5s, pass responses through untouched.
  const ready = () => settings ? Promise.resolve()
    : Promise.race([new Promise((r) => waiters.push(r)), new Promise((r) => setTimeout(r, 1500))]);

  // shortcut: relies on IVS's internal worker message shape; the self-check flags it if Kick changes it.
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    if (msg && msg.funcName === "setAutoMaxQuality" && (!settings || settings.hd)) {
      health.capDropped++;
      report();
      return;
    }
    return post.call(this, msg, ...rest);
  };

  const API = /^https:\/\/(web\.)?kick\.com\/(api|stream)\//;
  const fetch0 = window.fetch;
  window.fetch = async function (input, init) {
    const res = await fetch0.call(this, input, init);
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), location.href).href; } catch { return res; }
    if (!API.test(url) || !(res.headers.get("content-type") || "").includes("json")) return res;
    await ready();
    if (!rules) return res;
    try {
      const counts = { seen: 0, removed: 0 };
      const data = KHD.filterData(await res.clone().json(), rules, counts);
      if (counts.seen) { health.streamsSeen += counts.seen; report(); }
      if (!counts.removed) return res;
      const out = new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: res.headers });
      Object.defineProperty(out, "url", { value: res.url });
      return out;
    } catch {
      return res;
    }
  };
})();
