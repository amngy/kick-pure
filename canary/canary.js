// Daily check that the Kick assumptions Kick Pure relies on still hold. Prints "PASS|FAIL <check>: detail";
// exits 1 if any check failed. Selectors are read from kick-hd/clean.js so they cannot drift from the add-on.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const clean = fs.readFileSync(path.join(__dirname, "../kick-hd/clean.js"), "utf8");
const cardsSrc = clean.match(/const CARDS = \[([\s\S]*?)\]\.join/)?.[1] ?? "";
const CARDS = [...cardsSrc.matchAll(/'([^']+)'/g)].map((m) => m[1]).join(",");
const LEADERBOARD = clean.match(/aria-label="([^"]+)"/)?.[1];
if (!CARDS || !LEADERBOARD) throw new Error("canary could not read CARDS / leaderboard label from clean.js");

const results = [];
const record = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`); };
const check = async (name, fn) => { try { const d = await fn(); record(name, true, d); } catch (e) { record(name, false, String(e.message || e).split("\n")[0]); } };

(async () => {
  const browser = await chromium.launch({ channel: "chrome" }) // bundled Chromium lacks H.264, so IVS never starts playing;
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const lists = [];
  page.on("response", async (r) => {
    if (r.url().startsWith("https://web.kick.com/api/v1/livestreams")) lists.push(await r.json().catch(() => null));
  });
  await page.addInitScript(() => {
    window.__capDrops = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, ...rest) {
      if (msg && msg.funcName === "setAutoMaxQuality") window.__capDrops++;
      return post.call(this, msg, ...rest);
    };
  });

  await page.goto("https://kick.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  let streams = [];
  await check("api: livestreams shape", () => {
    const walk = (n) => Array.isArray(n) ? n.flatMap(walk) : n && typeof n === "object"
      ? [n, ...Object.values(n).flatMap(walk)] : [];
    streams = lists.flatMap(walk).filter((o) => o.channel && typeof o.title === "string");
    if (!streams.length) throw new Error(`no stream objects in ${lists.length} livestreams response(s)`);
    const bad = streams.find((s) => !s.channel.slug || !s.category?.name || typeof s.is_mature !== "boolean" || !s.language);
    if (bad) throw new Error(`missing field in ${JSON.stringify(bad).slice(0, 200)}`);
    return `${streams.length} streams`;
  });

  await check("dom: stream cards (CARDS)", async () => {
    const n = await page.locator(CARDS).count();
    if (!n) throw new Error(`no match for ${CARDS}`);
    return `${n} cards`;
  });

  const live = streams.find((s) => !s.is_mature) || streams[0];
  if (!live) { record("channel page", false, "no live stream to open"); }
  else {
    await page.goto(`https://kick.com/${live.channel.slug}`, { waitUntil: "domcontentloaded" });
    await check("dom: #channel-chatroom", async () => { await page.waitForSelector("#channel-chatroom", { timeout: 20000 }); return live.channel.slug; });
    await check("dom: leaderboard button", async () => {
      await page.waitForSelector(`#channel-chatroom button[aria-label="${LEADERBOARD}"]`, { state: "attached", timeout: 20000 });
      return LEADERBOARD;
    });
    // Logged-out autoplay is blocked, and the cap message is only sent once playback starts.
    await page.getByRole("button", { name: "Reject All" }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForSelector("video", { state: "attached", timeout: 20000 }).catch(() => {});
    await page.evaluate(() => { const v = document.querySelector("video"); if (v) { v.muted = true; return v.play().catch(() => {}); } });
    await check("player: setAutoMaxQuality sent to worker", async () => {
      await page.waitForFunction(() => window.__capDrops > 0, null, { timeout: 40000 });
      return "message seen";
    });
  }
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
