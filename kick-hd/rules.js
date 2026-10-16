// Shared settings and filter rules. Loaded in the page world (page.js), the content script
// (clean.js), the background and the popup, so it only touches plain JS.
var KHD = (() => {
  const DEFAULTS = {
    hd: true,
    ads: true,
    gambling: true,
    mature: true,
    gamification: true,
    carousel: true,
    recommendations: false,
    notifyLive: true,
    languages: "",
    gamblingCategories: "Slots & Casino, Poker, Crypto & Trading",
    gamblingKeywords: "stake, roobet, gamdom, rainbet, shuffle, bc.game, duelbits, stake.us, casino, slots, gamba, gambling, roulette, blackjack",
    matureCategories: "Pools, Hot Tubs & Bikinis, ASMR",
    blockedCategories: "",
    blockedChannels: "",
  };

  // Older Kick endpoints send language names instead of codes.
  const LANG_NAMES = { english: "en", german: "de", spanish: "es", french: "fr", portuguese: "pt", italian: "it",
    turkish: "tr", russian: "ru", arabic: "ar", polish: "pl", dutch: "nl", japanese: "ja", korean: "ko" };

  const splitList = (s) => String(s || "").split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function compile(s) {
    const cats = new Set(splitList(s.blockedCategories));
    if (s.gambling) splitList(s.gamblingCategories).forEach((c) => cats.add(c));
    if (s.mature) splitList(s.matureCategories).forEach((c) => cats.add(c));
    return {
      cats,
      // Underscore counts as a word boundary so "Stake_Pulse" matches "stake".
      keywords: s.gambling ? splitList(s.gamblingKeywords).map((k) => new RegExp(`(?<![a-z0-9])${escape(k)}(?![a-z0-9])`)) : [],
      channels: new Set(splitList(s.blockedChannels)),
      languages: new Set(splitList(s.languages)),
      mature: !!s.mature,
    };
  }

  // stream: { channel, name, category, title, mature, language } — any field may be missing.
  function isBlocked(r, st) {
    const text = `${st.title || ""}\n${st.name || ""}\n${st.channel || ""}`.toLowerCase();
    const lang = String(st.language || "").toLowerCase();
    return (
      (!!st.channel && r.channels.has(st.channel.toLowerCase())) ||
      (!!st.category && r.cats.has(st.category.toLowerCase())) ||
      r.keywords.some((re) => re.test(text)) ||
      (r.mature && st.mature === true) ||
      (r.languages.size > 0 && !!lang && !r.languages.has(LANG_NAMES[lang] || lang))
    );
  }

  // Recognizes a livestream object from any Kick API shape seen so far.
  function streamInfo(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const ch = o.channel && typeof o.channel === "object" ? o.channel : null;
    const title = o.title ?? o.session_title;
    if (!ch || typeof title !== "string") return null;
    const cat = o.category || (Array.isArray(o.categories) && o.categories[0]) || null;
    return { channel: ch.slug, name: ch.username || ch.user?.username, category: cat?.name, title, mature: o.is_mature, language: o.language };
  }

  // Category tiles: { name, slug, viewers, is_mature } without a channel.
  const isCategory = (o) => o && typeof o === "object" && !o.channel && typeof o.name === "string" && "slug" in o && "viewers" in o;

  // Removes blocked streams/categories from every array in a parsed API response (in place).
  // counts.seen = stream objects recognized, counts.removed = items dropped.
  function filterData(node, r, counts) {
    if (Array.isArray(node)) {
      return node.filter((item) => {
        const st = streamInfo(item);
        if (st) counts.seen++;
        const drop = st ? isBlocked(r, st)
          : isCategory(item) && (r.cats.has(item.name.toLowerCase()) || (r.mature && item.is_mature === true));
        if (drop) counts.removed++;
        return !drop;
      }).map((item) => filterData(item, r, counts));
    }
    if (node && typeof node === "object") for (const k of Object.keys(node)) node[k] = filterData(node[k], r, counts);
    return node;
  }

  return { DEFAULTS, splitList, compile, isBlocked, filterData };
})();
