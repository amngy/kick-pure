// Run from the repo root: node --test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../kick-hd/rules.js"), "utf8") + ";this.KHD = KHD;", ctx);
const { KHD } = ctx;
const rules = (over = {}) => KHD.compile({ ...KHD.DEFAULTS, ...over });

// Shapes copied from real Kick responses (web.kick.com/api/v1/livestreams, kick.com/api/v1/categories/top).
const stream = (o) => ({ id: "x", title: "chill stream", channel: { slug: "someone", username: "Someone" },
  category: { name: "Chess" }, is_mature: false, language: "en", ...o });

test("gambling: category, sponsor keyword in title, keyword in channel name", () => {
  const r = rules();
  assert.ok(KHD.isBlocked(r, { category: "Slots & Casino" }));
  assert.ok(KHD.isBlocked(r, { title: "Quarter Finals - !stake" }));
  assert.ok(KHD.isBlocked(r, { channel: "stake_pulse", title: "CS2" }));
  assert.ok(!KHD.isBlocked(r, { title: "a big mistake was made" }), "stake inside a word must not match");
  assert.ok(!KHD.isBlocked(rules({ gambling: false }), { category: "Slots & Casino" }));
});

test("mature flag, language allow-list, blocked channels", () => {
  assert.ok(KHD.isBlocked(rules(), { title: "x", mature: true }));
  assert.ok(!KHD.isBlocked(rules({ mature: false }), { title: "x", mature: true }));
  const r = rules({ languages: "en, de" });
  assert.ok(!KHD.isBlocked(r, { language: "en" }));
  assert.ok(!KHD.isBlocked(r, { language: "German" }));
  assert.ok(KHD.isBlocked(r, { language: "ar" }));
  assert.ok(KHD.isBlocked(rules({ blockedChannels: "Someone" }), { channel: "someone" }));
});

test("filterData drops blocked streams and categories anywhere in a response", () => {
  const data = {
    data: { livestreams: [stream(), stream({ title: "!roobet giveaway" }), stream({ is_mature: true })], pagination: {} },
    top: [{ name: "Slots & Casino", slug: "slots", viewers: 1, is_mature: false }, { name: "Chess", slug: "chess", viewers: 1 }],
  };
  const counts = { seen: 0, removed: 0 };
  const out = KHD.filterData(data, rules(), counts);
  assert.strictEqual(out.data.livestreams.length, 1);
  assert.deepStrictEqual(out.top.map((c) => c.name), ["Chess"]);
  assert.deepStrictEqual(counts, { seen: 3, removed: 3 });
});
