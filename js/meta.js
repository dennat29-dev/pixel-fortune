/* ============================================================
   GAMBLER'S FORTUNE — THE LEDGER
   Permanent meta progression: profile, XP and levels, vault
   tokens, unlockable themes/skins/dice/cards, perks, prestige
   tiers, achievements, per-run contracts and random events.
   ============================================================ */

const PROFILE_KEY = "pixelFortune_profile_v1";
const PROFILE_VERSION = 1;

let profile = null;
let appliedThemeVars = [];

/* ------------------------------------------------------------
   XP and levels
   ------------------------------------------------------------ */
function levelCost(level) { return 70 + (level - 1) * 45; }

function levelStartXp(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += levelCost(i);
  return total;
}

function levelFromXp(xp) {
  let level = 1;
  while (level < 99 && xp >= levelStartXp(level + 1)) level += 1;
  return level;
}

function levelProgress() {
  const p = profile || defaultProfile();
  const level = p.level || 1;
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  const into = Math.max(0, p.xp - start);
  const span = Math.max(1, next - start);
  return { level, into, span, pct: clamp(into / span, 0, 1), remaining: Math.max(0, span - into) };
}

function xpMultiplier() {
  let mult = 1;
  if (!profile) return mult;
  mult += tierIndex(totalStars()) * 0.04;
  mult += (profile.perks?.scholar || 0) * 0.15;
  mult += (profile.achievements ? Object.keys(profile.achievements).length : 0) * 0.005;
  return mult;
}

function xpMultiplierPercent() {
  return Math.round((xpMultiplier() - 1) * 100);
}

/* ------------------------------------------------------------
   Profile lifecycle
   ------------------------------------------------------------ */
function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    xp: 0,
    level: 1,
    tokens: 0,
    stars: 0,
    runs: 0,
    seenIntro: false,
    achievements: {},
    unlocks: { themes: ["neon"], skins: ["dealer"], dice: ["classic"], cards: ["classic"] },
    equipped: { theme: "neon", skin: "dealer", dice: "classic", cards: "classic" },
    perks: {},
    starSpent: 0,
    starUpgrades: {},
    luck: 0,
    ascensions: 0,
    houseBroken: false,
    lifetime: defaultLifetime()
  };
}

function defaultLifetime() {
  return {
    gamesPlayed: 0, wins: 0, losses: 0, biggestWin: 0, totalWon: 0,
    billsPaid: 0, ledgersCleared: 0, prestiges: 0, starsEarned: 0,
    bestDay: 1, bestCash: START_CASH, contractsDone: 0, achievementsDone: 0,
    currentStreak: 0, maxStreak: 0, cabinets: {}
  };
}

function loadProfile() {
  let raw = null;
  try { raw = localStorage.getItem(PROFILE_KEY); } catch (err) { raw = null; }

  let p = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === PROFILE_VERSION) p = parsed;
    } catch (err) { p = null; }
  }
  if (!p) p = defaultProfile();

  // Merge defensively so older or partial profiles keep working.
  const base = defaultProfile();
  const merged = { ...base, ...p };
  merged.unlocks = { ...base.unlocks, ...(p.unlocks || {}) };
  merged.equipped = { ...base.equipped, ...(p.equipped || {}) };
  merged.perks = { ...base.perks, ...(p.perks || {}) };
  merged.starUpgrades = { ...base.starUpgrades, ...(p.starUpgrades || {}) };
  merged.starSpent = Math.max(0, Math.floor(Number(p.starSpent) || 0));
  merged.luck = clamp(Number(p.luck) || 0, 0, ASCEND_LUCK_MAX);
  merged.ascensions = Math.max(0, Math.floor(Number(p.ascensions) || 0));
  merged.houseBroken = !!p.houseBroken || merged.luck >= ASCEND_LUCK_MAX;
  merged.lifetime = { ...base.lifetime, ...(p.lifetime || {}) };
  merged.achievements = (p.achievements && typeof p.achievements === "object") ? p.achievements : {};
  ["themes", "skins", "dice", "cards"].forEach(kind => {
    if (!Array.isArray(merged.unlocks[kind])) merged.unlocks[kind] = base.unlocks[kind].slice();
  });
  merged.xp = Math.max(0, Math.floor(Number(merged.xp) || 0));
  merged.level = levelFromXp(merged.xp);
  merged.tokens = Math.max(0, Math.floor(Number(merged.tokens) || 0));
  merged.stars = Math.max(0, Math.floor(Number(merged.stars) || 0));
  merged.runs = Math.max(0, Math.floor(Number(merged.runs) || 0));

  // Seed stars from an existing run save the first time a profile appears.
  if (!raw) {
    try {
      const runRaw = localStorage.getItem(SAVE_KEY);
      if (runRaw) {
        const run = JSON.parse(runRaw);
        const legacyStars = Math.max(0, Math.floor(Number(run?.prestige?.stars) || 0));
        if (legacyStars > merged.stars) merged.stars = legacyStars;
        merged.runs = Math.max(merged.runs, Math.floor(Number(run?.prestige?.runs) || 0));
      }
    } catch (err) { /* ignore */ }
  }
  return merged;
}

function saveProfile() {
  if (!profile) return;
  try {
    profile.level = levelFromXp(profile.xp);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn("Gambler's Fortune could not save your profile:", err);
  }
}

function totalStars() {
  if (profile && Number.isFinite(Number(profile.stars))) return Math.max(0, Math.floor(profile.stars));
  return Math.max(0, Math.floor(state?.prestige?.stars || 0));
}

function syncStars() {
  if (!profile || !state) return;
  const stars = Math.max(totalStars(), Math.floor(state.prestige?.stars || 0));
  profile.stars = stars;
  if (state.prestige) state.prestige.stars = stars;
}

/* ------------------------------------------------------------
   XP and tokens
   ------------------------------------------------------------ */
function grantTokens(amount, reason = "") {
  if (!profile) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!n) return;
  profile.tokens += n;
  saveProfile();
  if (reason) toast(`+${n} ◆ token${n === 1 ? "" : "s"} — ${reason}`, "purple");
}

function addXP(amount, reason = "") {
  if (!profile) return;
  const gain = Math.max(0, Math.round((Number(amount) || 0) * xpMultiplier()));
  if (!gain) return;
  const before = profile.level || 1;
  profile.xp += gain;
  const after = levelFromXp(profile.xp);
  profile.level = after;

  if (after > before) {
    let tokens = 0;
    for (let l = before + 1; l <= after; l++) tokens += 1 + Math.floor(l / 5);
    tokens += (profile.perks?.tokenFinder || 0) * (after - before);
    grantTokens(tokens, `level ${after}`);
    sfx("upgrade");
    toast(`LEVEL ${after} — ${tokens} token${tokens === 1 ? "" : "s"} earned`, "gold");
  } else if (reason) {
    toast(`+${gain} XP — ${reason}`, "info");
  }
  saveProfile();
}

function tokensLabel(n) {
  return `${Math.max(0, Math.floor(Number(n) || 0))} ◆`;
}

/* ------------------------------------------------------------
   Prestige tiers (permanent badges)
   ------------------------------------------------------------ */
const PRESTIGE_TIERS = [
  { id: "nobody", name: "NOBODY", stars: 0, color: "#8e96bd", blurb: "The ledger has your name. That is all it has." },
  { id: "bronze", name: "BRONZE", stars: 1, color: "#c98a4a", blurb: "You walked out once. The sharks remember faces." },
  { id: "silver", name: "SILVER", stars: 4, color: "#c9d2e8", blurb: "A regular. The back room smells like your cologne now." },
  { id: "gold", name: "GOLD", stars: 9, color: "#ffcf4a", blurb: "The man with the revolver asks *you* for advice." },
  { id: "platinum", name: "PLATINUM", stars: 18, color: "#8fe8ff", blurb: "They named a cocktail after you. It is mostly regret." },
  { id: "legend", name: "LEGEND", stars: 35, color: "#ff83d1", blurb: "The Ledger lists you as an asset, not a debtor." }
];

function tierIndex(stars) {
  let idx = 0;
  PRESTIGE_TIERS.forEach((tier, i) => { if (stars >= tier.stars) idx = i; });
  return idx;
}
function tierFor(stars) { return PRESTIGE_TIERS[tierIndex(stars)]; }
function nextTierFor(stars) {
  return PRESTIGE_TIERS.find(tier => tier.stars > stars) || null;
}

/* ------------------------------------------------------------
   THE ASCENSION — sacrifice prestige for permanent Luck.
   Reach the top tier, then trade every star and Star Market
   favor for Luck that sharpens every cabinet, forever.
   ------------------------------------------------------------ */
const ASCEND_MIN_STARS = PRESTIGE_TIERS[PRESTIGE_TIERS.length - 1].stars; // LEGEND
const ASCEND_LUCK_BASE = 0.06;   // luck gained on the first ascension
const ASCEND_LUCK_STEP = 0.01;   // extra luck per prior ascension
const ASCEND_LUCK_MAX = 0.40;    // luck cap — the house breaks here
const ASCEND_OVER_BONUS = 0.005; // bonus luck per 10 stars climbed past LEGEND
const ASCEND_OVER_STEP = 10;

function ascensionLuck() {
  return clamp(Number(profile?.luck) || 0, 0, ASCEND_LUCK_MAX);
}

function ascensionCount() {
  return Math.max(0, Math.floor(Number(profile?.ascensions) || 0));
}

function houseBroken() {
  return !!(profile && profile.houseBroken);
}

function ascensionReady() {
  return !!profile && !houseBroken() && totalStars() >= ASCEND_MIN_STARS;
}

function ascensionOverStars() {
  return Math.max(0, totalStars() - ASCEND_MIN_STARS);
}

function ascensionLuckGain() {
  if (!profile || houseBroken()) return 0;
  const over = ascensionOverStars();
  const raw = ASCEND_LUCK_BASE
    + ascensionCount() * ASCEND_LUCK_STEP
    + Math.floor(over / ASCEND_OVER_STEP) * ASCEND_OVER_BONUS;
  const remaining = Math.max(0, ASCEND_LUCK_MAX - ascensionLuck());
  return Math.min(raw, remaining);
}

function ascensionProgress() {
  return clamp(ascensionLuck() / ASCEND_LUCK_MAX, 0, 1);
}

/* Perform the ritual. Returns a summary for the UI, or null if blocked. */
function ascend() {
  if (!profile || !state) return null;
  if (houseBroken()) { toast("The house is already broken.", "info"); return null; }
  if (totalStars() < ASCEND_MIN_STARS) {
    toast(`Reach ★ ${ASCEND_MIN_STARS} (LEGEND) to ascend.`, "bad");
    sfx("error");
    return null;
  }
  const sacrificed = totalStars();
  const gain = ascensionLuckGain();
  const before = ascensionLuck();
  profile.luck = clamp(before + gain, 0, ASCEND_LUCK_MAX);
  profile.ascensions = ascensionCount() + 1;
  profile.stars = 0;
  profile.starSpent = 0;
  profile.starUpgrades = {};
  if (state.prestige) state.prestige.stars = 0;

  const tokens = 5 + profile.ascensions * 3;
  const xp = 120 + profile.ascensions * 40;
  grantTokens(tokens, "ascension");
  addXP(xp, "ascension");

  const broke = profile.luck >= ASCEND_LUCK_MAX - 1e-9;
  if (broke) profile.houseBroken = true;
  addLog(`Ascended. Permanent luck now ${Math.round(profile.luck * 100)}%.`, "gold");
  saveProfile();
  checkAchievements({ type: "ascend", ascensions: profile.ascensions, houseBroken: profile.houseBroken });

  return {
    sacrificed, gain, before, after: profile.luck, tokens, xp,
    ascensions: profile.ascensions, broke
  };
}

/* One-time bundle the first time you reach each tier. */
const TIER_REWARDS = {
  bronze:   { tokens: 5,  xp: 60 },
  silver:   { tokens: 10, xp: 120 },
  gold:     { tokens: 18, xp: 220 },
  platinum: { tokens: 30, xp: 380 },
  legend:   { tokens: 55, xp: 700 }
};

/* Grant every tier reward crossed between two star totals. Returns the list. */
function grantTierRewards(prevStars, newStars) {
  const ups = [];
  const from = tierIndex(prevStars);
  const to = tierIndex(newStars);
  for (let i = from + 1; i <= to; i++) {
    const tier = PRESTIGE_TIERS[i];
    const reward = TIER_REWARDS[tier.id];
    if (!reward) continue;
    grantTokens(reward.tokens, `tier: ${tier.name}`);
    addXP(reward.xp, `tier: ${tier.name}`);
    ups.push({ id: tier.id, name: tier.name, color: tier.color, tokens: reward.tokens, xp: reward.xp });
    addLog(`Reached the ${tier.name} tier. The house tips its hat.`, "gold");
    toast(`TIER UP — ${tier.name} (+${reward.tokens} ◆)`, "purple");
  }
  return ups;
}

/* ------------------------------------------------------------
   Vault catalogue: themes, skins, dice, cards, perks
   ------------------------------------------------------------ */
const THEMES = [
  { id: "neon", name: "NEON NOIR", desc: "The original floor. Cold blue, hot gold.", cost: 0, colors: null },
  {
    id: "sunset", name: "SUNSET STRIP", desc: "Orange sky, pink neon, cheap perfume.", cost: 5,
    colors: {
      "--bg": "#1a0e14", "--bg-2": "#241019", "--panel": "#2b1520", "--panel-2": "#351a28",
      "--panel-3": "#432134", "--line": "#5c2f44", "--line-bright": "#8a4a66", "--text": "#ffeadf",
      "--muted": "#c9969f", "--muted-2": "#9b6b74", "--gold": "#ffb24a", "--gold-hot": "#ffd98a",
      "--gold-deep": "#b3601a", "--cyan": "#ff9c4a", "--purple": "#ff6fa5", "--green": "#7cf5b0"
    }
  },
  {
    id: "mint", name: "MINT JULEP", desc: "Fresh money. Cold drinks. Clean cons.", cost: 5,
    colors: {
      "--bg": "#04120f", "--bg-2": "#061a16", "--panel": "#0b2620", "--panel-2": "#0f3129",
      "--panel-3": "#154034", "--line": "#1f5a4a", "--line-bright": "#2f8a72", "--text": "#e8fff5",
      "--muted": "#86c2b0", "--muted-2": "#5f8f80", "--gold": "#ffd76a", "--gold-hot": "#fff0b0",
      "--gold-deep": "#a97a1e", "--cyan": "#5de8ff", "--purple": "#6ff0c0", "--green": "#5cf58f"
    }
  },
  {
    id: "royal", name: "ROYAL SUITE", desc: "Velvet ropes and purple velvet.", cost: 7,
    colors: {
      "--bg": "#0b0620", "--bg-2": "#130a2c", "--panel": "#1a1038", "--panel-2": "#221647",
      "--panel-3": "#2d1e5c", "--line": "#3d2a78", "--line-bright": "#6244b0", "--text": "#f3ecff",
      "--muted": "#a996d8", "--muted-2": "#7c6aa8", "--gold": "#ffcf4a", "--gold-hot": "#ffe88a",
      "--gold-deep": "#b36b17", "--cyan": "#8fd6ff", "--purple": "#c08cff", "--green": "#7cf5b0"
    }
  },
  {
    id: "noir", name: "NOIR", desc: "Black and white. Like your ledger.", cost: 7,
    colors: {
      "--bg": "#0a0a0a", "--bg-2": "#111111", "--panel": "#1a1a1a", "--panel-2": "#222222",
      "--panel-3": "#2b2b2b", "--line": "#3a3a3a", "--line-bright": "#5e5e5e", "--text": "#f0f0f0",
      "--muted": "#9a9a9a", "--muted-2": "#6e6e6e", "--gold": "#e8e8e8", "--gold-hot": "#ffffff",
      "--gold-deep": "#8a8a8a", "--cyan": "#cfcfcf", "--purple": "#b0b0b0", "--green": "#d8d8d8"
    }
  },
  {
    id: "vapor", name: "VAPORWAVE", desc: "Mall arcade, 1989, forever.", cost: 9,
    colors: {
      "--bg": "#140b2e", "--bg-2": "#1d0f3f", "--panel": "#241452", "--panel-2": "#2e1a63",
      "--panel-3": "#3b2179", "--line": "#522d9c", "--line-bright": "#7d4fd0", "--text": "#f6e9ff",
      "--muted": "#b79ce0", "--muted-2": "#8a6fb0", "--gold": "#ffcf4a", "--gold-hot": "#ffe88a",
      "--gold-deep": "#b36b17", "--cyan": "#5de8ff", "--purple": "#ff83d1", "--green": "#7cf5b0"
    }
  },
  {
    id: "blood", name: "BLOOD MONEY", desc: "Earned in the back room. Requires ★ 5.", cost: 0,
    req: { stars: 5 },
    colors: {
      "--bg": "#12060a", "--bg-2": "#1a080e", "--panel": "#250c14", "--panel-2": "#2f101a",
      "--panel-3": "#3d1522", "--line": "#5e1f2f", "--line-bright": "#8f2f47", "--text": "#ffe9ec",
      "--muted": "#c98f9c", "--muted-2": "#9a6672", "--gold": "#ffcf4a", "--gold-hot": "#ffe88a",
      "--gold-deep": "#b36b17", "--cyan": "#ff9c4a", "--purple": "#ff6f9c", "--green": "#7cf5b0"
    }
  },
  {
    id: "aurora", name: "AURORA", desc: "Cold light over a colder city.", cost: 10,
    colors: {
      "--bg": "#04101a", "--bg-2": "#061722", "--panel": "#0a2433", "--panel-2": "#0e2f42",
      "--panel-3": "#133c53", "--line": "#1d5470", "--line-bright": "#2c7fa5", "--text": "#e6faff",
      "--muted": "#8ec2d6", "--muted-2": "#6390a5", "--gold": "#ffcf4a", "--gold-hot": "#ffe88a",
      "--gold-deep": "#b36b17", "--cyan": "#5de8ff", "--purple": "#9d8cff", "--green": "#6cf5b8"
    }
  },
  {
    id: "void", name: "THE VOID", desc: "Nothing left to bet. Requires ★ 30.", cost: 0,
    req: { stars: 30 },
    colors: {
      "--bg": "#000000", "--bg-2": "#05050a", "--panel": "#0a0a12", "--panel-2": "#101018",
      "--panel-3": "#17171f", "--line": "#2a2a38", "--line-bright": "#4a4a60", "--text": "#f7f3e6",
      "--muted": "#8a8a9c", "--muted-2": "#5c5c6c", "--gold": "#ffcf4a", "--gold-hot": "#ffe88a",
      "--gold-deep": "#b36b17", "--cyan": "#ffcf4a", "--purple": "#ffcf4a", "--green": "#5cf58f"
    }
  }
];

const SKINS = [
  { id: "dealer", name: "THE DEALER", desc: "Default coat, default conscience.", cost: 0, colors: { h: "#2b2f4a", s: "#f1bf86", c: "#232a4a", a: "#ffcf4a", e: "#0a0a12" } },
  { id: "highroller", name: "HIGH ROLLER", desc: "Tailored, unbothered, over-leveraged.", cost: 4, colors: { h: "#1a1a1a", s: "#e8b98a", c: "#3a2a10", a: "#ffcf4a", e: "#0a0a12" } },
  { id: "neon", name: "NEON RUNNER", desc: "Cyber dye job, chrome attitude.", cost: 5, colors: { h: "#5de8ff", s: "#f1bf86", c: "#101830", a: "#ff5576", e: "#04121a" } },
  { id: "phantom", name: "PHANTOM", desc: "Nobody has seen this face twice.", cost: 6, colors: { h: "#b16cff", s: "#cfc6e8", c: "#1a1530", a: "#5de8ff", e: "#120a20" } },
  { id: "shark", name: "THE SHARK", desc: "You are the one collecting now.", cost: 6, colors: { h: "#545c7b", s: "#b9c0d6", c: "#11152a", a: "#ff5576", e: "#05070d" } },
  { id: "gold", name: "GOLDEN HOUR", desc: "Dripping, gilded, insufferable.", cost: 8, colors: { h: "#b36b17", s: "#ffe88a", c: "#64370c", a: "#fff3a1", e: "#2a1806" } },
  { id: "vapor", name: "VAPOR DREAM", desc: "Pink hair, analog heart.", cost: 9, colors: { h: "#ff83d1", s: "#f1bf86", c: "#2a1b4a", a: "#5de8ff", e: "#160a24" } },
  { id: "legend", name: "THE LEGEND", desc: "The Ledger is afraid of you. Requires ★ 20.", cost: 0, req: { stars: 20 }, colors: { h: "#ffcf4a", s: "#fff3a1", c: "#000000", a: "#ff5576", e: "#1a0a00" } }
];

const DICE_DESIGNS = [
  { id: "classic", name: "CLASSIC BONE", desc: "Worn ivory, honest pips.", cost: 0 },
  { id: "ivory", name: "CASINO IVORY", desc: "Warm cream, deep ink pips.", cost: 3 },
  { id: "obsidian", name: "OBSIDIAN", desc: "Black stone, gold pips.", cost: 5 },
  { id: "ruby", name: "RUBY CUT", desc: "Blood-red resin.", cost: 6 },
  { id: "neon", name: "NEON GRID", desc: "Glowing edges, cyan pips.", cost: 7 },
  { id: "gold", name: "SOLID GOLD", desc: "Heavy. Suspicious. Yours.", cost: 9 }
];

const CARD_DESIGNS = [
  { id: "classic", name: "CLASSIC DECK", desc: "Paper, ink, fate.", cost: 0 },
  { id: "royal", name: "ROYAL DECK", desc: "Gold foil on dark stock.", cost: 4 },
  { id: "retro", name: "RETRO DECK", desc: "Faded arcade print.", cost: 5 },
  { id: "neon", name: "NEON DECK", desc: "Glowing borders, glow-in-the-dark suits.", cost: 6 },
  { id: "obsidian", name: "OBSIDIAN DECK", desc: "Black cardstock, gold suits.", cost: 8 }
];

const PERKS = {
  headStart: { name: "HEAD START", icon: "cash", max: 3, costs: [3, 5, 8], desc: "Begin every run with extra cash.", effect: l => `+${fmt(l * 100)} starting cash` },
  warmBed: { name: "WARM BED", icon: "bolt", max: 3, costs: [3, 6, 10], desc: "Permanent max energy.", effect: l => `+${l * 3} max energy` },
  silverTongue: { name: "SILVER TONGUE", icon: "shark", max: 3, costs: [3, 5, 9], desc: "Talk the sharks down.", effect: l => `-${l * 8}% new debt` },
  luckyCharm: { name: "LUCKY CHARM", icon: "clover", max: 3, costs: [4, 7, 11], desc: "A permanent nudge on coin, dice and roulette.", effect: l => `+${(l * 1.2).toFixed(1)}% win odds` },
  goldPlate: { name: "GOLD PLATING", icon: "coin", max: 3, costs: [4, 8, 13], desc: "Bigger payouts, forever.", effect: l => `+${l * 3}% payouts` },
  scholar: { name: "SCHOLAR", icon: "star", max: 3, costs: [3, 6, 10], desc: "Learn faster from every loss.", effect: l => `+${l * 15}% XP` },
  tokenFinder: { name: "TOKEN FINDER", icon: "diamond", max: 2, costs: [6, 12], desc: "Every level up drops extra tokens.", effect: l => `+${l} token${l === 1 ? "" : "s"} per level` }
};

const VAULT_KINDS = { theme: THEMES, skin: SKINS, dice: DICE_DESIGNS, cards: CARD_DESIGNS };

/* ------------------------------------------------------------
   THE STAR MARKET — spend prestige stars on permanent favors.
   Stars are spent from a balance; lifetime stars (tiers/power)
   never go down when you buy something.
   ------------------------------------------------------------ */
const STAR_MARKET = [
  { id: "extraChamber", name: "SEVENTH CHAMBER", icon: "revolver", cost: 6,
    desc: "The revolver holds seven chambers instead of six — better odds at the back-room table." },
  { id: "coldCash", name: "COLD HARD CASH", icon: "cash", cost: 4,
    desc: "Begin every run with an extra $400." },
  { id: "bigLungs", name: "BIG LUNGS", icon: "bolt", cost: 5,
    desc: "Permanent +8 max energy, every run." },
  { id: "goldenTouch", name: "GOLDEN TOUCH", icon: "coin", cost: 7,
    desc: "Permanent +5% payouts." },
  { id: "fourLeaf", name: "FOUR-LEAF", icon: "clover", cost: 6,
    desc: "Permanent +3% win odds on coin, dice and roulette." },
  { id: "debtForgiven", name: "FIRST ONE FREE", icon: "shark", cost: 5,
    desc: "The first bill of every run is wiped from the ledger." },
  { id: "doubleShift", name: "DOUBLE SHIFT", icon: "coin", cost: 5,
    desc: "The side hustle pays double and can be worked twice a day." },
  { id: "secondChance", name: "SECOND CHANCE", icon: "star", cost: 12,
    desc: "Once per run, survive going broke — you wake up with $300 and a story." }
];

function starMarketItem(id) { return STAR_MARKET.find(i => i.id === id) || null; }

function hasStarUpgrade(id) {
  return !!(profile && profile.starUpgrades && profile.starUpgrades[id]);
}

function starBalance() {
  return Math.max(0, totalStars() - (profile?.starSpent || 0));
}

function buyStarUpgrade(id) {
  const item = starMarketItem(id);
  if (!profile || !item) return false;
  if (hasStarUpgrade(id)) { toast("You already own that favor.", "info"); return false; }
  if (starBalance() < item.cost) {
    toast(`Need ★ ${item.cost} — you have ★ ${starBalance()}.`, "bad");
    sfx("error");
    return false;
  }
  profile.starSpent = (profile.starSpent || 0) + item.cost;
  profile.starUpgrades = profile.starUpgrades || {};
  profile.starUpgrades[id] = true;
  saveProfile();
  addLog(`Bought a star favor: ${item.name}.`, "gold");
  sfx("prestige");
  toast(`STAR FAVOR — ${item.name}`, "purple");
  renderAll();
  return true;
}

function russianChambers() {
  return 6 + (hasStarUpgrade("extraChamber") ? 1 : 0);
}

function vaultList(kind) {
  if (kind === "theme") return THEMES;
  if (kind === "skin") return SKINS;
  if (kind === "dice") return DICE_DESIGNS;
  if (kind === "cards") return CARD_DESIGNS;
  return [];
}

function vaultById(kind, id) {
  return vaultList(kind).find(item => item.id === id) || null;
}

function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }
function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }
function diceById(id) { return DICE_DESIGNS.find(d => d.id === id) || DICE_DESIGNS[0]; }
function cardsById(id) { return CARD_DESIGNS.find(c => c.id === id) || CARD_DESIGNS[0]; }

function unlockKey(kind) {
  return kind === "theme" ? "themes" : kind === "skin" ? "skins" : kind === "dice" ? "dice" : "cards";
}

function isUnlocked(kind, id) {
  if (!profile) return false;
  const item = vaultById(kind, id);
  if (!item) return false;
  if (item.cost === 0 && !item.req) return true;
  return (profile.unlocks[unlockKey(kind)] || []).includes(id);
}

function reqMet(item) {
  if (!item.req) return true;
  if (item.req.stars && totalStars() < item.req.stars) return false;
  if (item.req.level && (profile?.level || 1) < item.req.level) return false;
  return true;
}

function reqText(item) {
  if (!item.req) return "";
  const bits = [];
  if (item.req.stars) bits.push(`★ ${item.req.stars}`);
  if (item.req.level) bits.push(`LV ${item.req.level}`);
  return bits.length ? `REQUIRES ${bits.join(" • ")}` : "";
}

function buyUnlock(kind, id) {
  if (!profile || ui.busy) return;
  const item = vaultById(kind, id);
  if (!item) return;
  if (isUnlocked(kind, id)) { equipItem(kind, id); return; }
  if (!reqMet(item)) { toast(reqText(item), "bad"); sfx("error"); return; }
  if (profile.tokens < item.cost) { toast(`Need ${item.cost} ◆ tokens for ${item.name}.`, "bad"); sfx("error"); return; }
  profile.tokens -= item.cost;
  profile.unlocks[unlockKey(kind)].push(id);
  saveProfile();
  sfx("upgrade");
  toast(`Unlocked ${item.name}`, "purple");
  addLog(`Vault unlock: ${item.name} (${item.cost} ◆).`, "gold");
  equipItem(kind, id, true);
  checkAchievements({ type: "unlock", kind, id });
  saveState();
  renderAll();
}

function equipItem(kind, id, silent = false) {
  if (!profile) return;
  if (!isUnlocked(kind, id)) return;
  profile.equipped[kind] = id;
  saveProfile();
  if (kind === "theme") applyTheme();
  if (!silent) {
    sfx("click", 0.6);
    toast(`Equipped ${vaultById(kind, id).name}`, "info");
  }
  checkAchievements({ type: "equip", kind, id });
  renderAll();
}

function buyPerk(key) {
  if (!profile || ui.busy) return;
  const perk = PERKS[key];
  if (!perk) return;
  const level = profile.perks[key] || 0;
  if (level >= perk.max) { toast(`${perk.name} is maxed.`, "bad"); return; }
  const cost = perk.costs[level];
  if (profile.tokens < cost) { toast(`Need ${cost} ◆ tokens for ${perk.name}.`, "bad"); sfx("error"); return; }
  profile.tokens -= cost;
  profile.perks[key] = level + 1;
  saveProfile();
  if (key === "warmBed" && state) state.energy = maxEnergy();
  sfx("upgrade");
  toast(`${perk.name} → LV ${level + 1}`, "gold");
  saveState();
  renderAll();
}

function unlockedCount() {
  if (!profile) return 0;
  return ["themes", "skins", "dice", "cards"].reduce((sum, k) => sum + (profile.unlocks[k] || []).length, 0);
}

function totalVaultItems() {
  return THEMES.length + SKINS.length + DICE_DESIGNS.length + CARD_DESIGNS.length;
}

/* ------------------------------------------------------------
   Theme + avatar rendering
   ------------------------------------------------------------ */
function applyTheme() {
  const root = document.documentElement;
  appliedThemeVars.forEach(v => root.style.removeProperty(v));
  appliedThemeVars = [];
  const theme = themeById(profile?.equipped?.theme || "neon");
  if (!theme || !theme.colors) return;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
    appliedThemeVars.push(key);
  });
}

const AVATAR_ROWS = [
  "................",
  "....hhhhhhhh....",
  "...hhhhhhhhhh...",
  "...hhhhhhhhhh...",
  "...ssssssssss...",
  "...ssssssssss...",
  "...sesssssses...",
  "...ssssssssss...",
  "....ssssssss....",
  ".....ssssss.....",
  "...cccccccccc...",
  "..cccccaaccccc..",
  "..cccccaaccccc..",
  "..cccccaaccccc..",
  "..cccccccccccc..",
  "................"
];

function avatarSVG(skinId, className = "") {
  const skin = skinById(skinId || profile?.equipped?.skin || "dealer");
  const colors = skin.colors;
  let rects = "";
  AVATAR_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]];
      if (color) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  });
  return `<svg class="px-icon avatar-svg ${className}" viewBox="0 0 16 16" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function designAttrs() {
  const dice = profile?.equipped?.dice || "classic";
  const cards = profile?.equipped?.cards || "classic";
  return `data-dice="${dice}" data-cards="${cards}"`;
}

/* ------------------------------------------------------------
   Run contracts (per-run objectives)
   ------------------------------------------------------------ */
function runWinCount(s, gameId) {
  return s.runStats?.cabinetsWon?.[gameId] || 0;
}

const CONTRACTS = [
  {
    id: "profit_2500", name: "HIGH ROLLER", icon: "cash", reward: { tokens: 4, xp: 60 },
    desc: "Hold $2,500 cash on or after Day 10.",
    check: s => s.day >= 10 && s.cash >= 2500,
    progress: s => ({ have: Math.min(s.cash, 2500), need: 2500, text: `${fmt(Math.min(s.cash, 2500))} / $2,500 (day ${s.day}/10)` })
  },
  {
    id: "survive_12", name: "SURVIVOR", icon: "calendar", reward: { tokens: 3, xp: 45 },
    desc: "Reach Day 12 without busting.",
    check: s => s.day >= 12,
    progress: s => ({ have: Math.min(s.day, 12), need: 12, text: `day ${s.day} / 12` })
  },
  {
    id: "win_10", name: "WORKING STIFF", icon: "coin", reward: { tokens: 3, xp: 40 },
    desc: "Win 10 games this run.",
    check: s => (s.runStats?.wins || 0) >= 10,
    progress: s => ({ have: Math.min(s.runStats?.wins || 0, 10), need: 10, text: `${s.runStats?.wins || 0} / 10 wins` })
  },
  {
    id: "streak_4", name: "HEATER", icon: "star", reward: { tokens: 4, xp: 55 },
    desc: "Win 4 games in a row this run.",
    check: s => (s.runStats?.bestStreak || 0) >= 4,
    progress: s => ({ have: Math.min(s.runStats?.bestStreak || 0, 4), need: 4, text: `best streak ${s.runStats?.bestStreak || 0} / 4` })
  },
  {
    id: "debt_4", name: "DEBT SLAYER", icon: "shark", reward: { tokens: 3, xp: 45 },
    desc: "Pay off 4 bills this run.",
    check: s => (s.runStats?.billsPaid || 0) >= 4,
    progress: s => ({ have: Math.min(s.runStats?.billsPaid || 0, 4), need: 4, text: `${s.runStats?.billsPaid || 0} / 4 bills` })
  },
  {
    id: "slot_6", name: "REEL ADDICT", icon: "seven", reward: { tokens: 3, xp: 40 },
    desc: "Play Lucky 7s 6 times this run.",
    check: s => (s.runStats?.plays?.slots || 0) >= 6,
    progress: s => ({ have: Math.min(s.runStats?.plays?.slots || 0, 6), need: 6, text: `${s.runStats?.plays?.slots || 0} / 6 spins` })
  },
  {
    id: "tables_3", name: "TABLE CAPTAIN", icon: "cards", reward: { tokens: 5, xp: 70 },
    desc: "Win at blackjack, Hold'em and roulette this run.",
    check: s => ["blackjack", "holdem", "roulette"].every(g => runWinCount(s, g) > 0),
    progress: s => ({ have: ["blackjack", "holdem", "roulette"].filter(g => runWinCount(s, g) > 0).length, need: 3, text: `${["blackjack", "holdem", "roulette"].filter(g => runWinCount(s, g) > 0).length} / 3 tables won` })
  },
  {
    id: "big_win_400", name: "SCORE", icon: "diamond", reward: { tokens: 4, xp: 55 },
    desc: "Win $400 or more in a single game.",
    check: s => (s.runStats?.biggestWin || 0) >= 400,
    progress: s => ({ have: Math.min(s.runStats?.biggestWin || 0, 400), need: 400, text: `${fmt(Math.min(s.runStats?.biggestWin || 0, 400))} / $400` })
  },
  {
    id: "hoard_1500", name: "HOARDER", icon: "bottle", reward: { tokens: 3, xp: 45 },
    desc: "Hold $1,500 cash at once this run.",
    check: s => (s.runStats?.bestCash || 0) >= 1500,
    progress: s => ({ have: Math.min(s.runStats?.bestCash || 0, 1500), need: 1500, text: `${fmt(Math.min(s.runStats?.bestCash || 0, 1500))} / $1,500` })
  },
  {
    id: "edge_10", name: "EDGE LORD", icon: "plinko", reward: { tokens: 4, xp: 55 },
    desc: "Land a 10x or better Plinko slot.",
    check: s => (s.runStats?.plinkoBest || 0) >= 10,
    progress: s => ({ have: Math.min(s.runStats?.plinkoBest || 0, 10), need: 10, text: `best ${(s.runStats?.plinkoBest || 0)}x / 10x` })
  },
  {
    id: "triple_threat", name: "TRIPLE THREAT", icon: "roulette", reward: { tokens: 5, xp: 65 },
    desc: "Win at 3 different cabinets in one day.",
    check: s => Object.values(s.runStats?.dayWins || {}).some(set => set.length >= 3),
    progress: s => {
      const best = Object.values(s.runStats?.dayWins || {}).reduce((m, set) => Math.max(m, set.length), 0);
      return { have: Math.min(best, 3), need: 3, text: `best day ${best} / 3 cabinets` };
    }
  },
  {
    id: "clean_3", name: "KEEP IT CLEAN", icon: "clover", reward: { tokens: 4, xp: 55 },
    desc: "Clear your entire ledger 3 times this run.",
    check: s => (s.runStats?.ledgersCleared || 0) >= 3,
    progress: s => ({ have: Math.min(s.runStats?.ledgersCleared || 0, 3), need: 3, text: `${s.runStats?.ledgersCleared || 0} / 3 cleared` })
  }
];

function defaultRunStats() {
  return {
    wins: 0, losses: 0, streak: 0, bestStreak: 0, billsPaid: 0, ledgersCleared: 0,
    biggestWin: 0, bestCash: START_CASH, plinkoBest: 0, plays: {}, cabinetsWon: {}, dayWins: {}
  };
}

function rollRunChallenges() {
  const pool = shuffle(CONTRACTS.slice());
  return pool.slice(0, 3).map(c => ({ id: c.id, done: false }));
}

function contractById(id) { return CONTRACTS.find(c => c.id === id) || null; }

function challengeProgress(ch) {
  const contract = contractById(ch.id);
  if (!contract || !state) return null;
  try { return contract.progress(state); } catch (err) { return null; }
}

function updateChallenges(ev) {
  if (!state || !Array.isArray(state.challenges)) return;
  state.challenges.forEach(ch => {
    if (ch.done) return;
    const contract = contractById(ch.id);
    if (!contract) return;
    let met = false;
    try { met = !!contract.check(state, profile, ev); } catch (err) { met = false; }
    if (!met) return;
    ch.done = true;
    if (profile) {
      profile.lifetime.contractsDone = (profile.lifetime.contractsDone || 0) + 1;
      grantTokens(contract.reward.tokens, `contract: ${contract.name}`);
      addXP(contract.reward.xp, contract.name);
      saveProfile();
    }
    addLog(`Contract complete: ${contract.name}.`, "gold");
    sfx("prestige");
    toast(`CONTRACT COMPLETE — ${contract.name}`, "gold");
    checkAchievements({ type: "contract", id: ch.id });
  });
}

/* ------------------------------------------------------------
   Run modifiers ("house rules") drawn fresh every run
   ------------------------------------------------------------ */
const MODIFIERS = [
  { id: "hot_floor", name: "HOT FLOOR", icon: "clover", tone: "good", desc: "Every cabinet pays a little better, and the odds lean your way.", payout: 0.12, luck: 0.02 },
  { id: "golden_age", name: "GOLDEN AGE", icon: "coin", tone: "good", desc: "The house is generous tonight — but it bills you for it.", payout: 0.09, debt: 0.15 },
  { id: "overtime", name: "OVERTIME", icon: "bolt", tone: "good", desc: "You came in rested. More energy every day.", energy: 8, payout: -0.04 },
  { id: "silver_spoon", name: "SILVER SPOON", icon: "cash", tone: "mixed", desc: "A cushion of cash, but you tire faster.", startCash: 500, energy: -5 },
  { id: "cold_house", name: "COLD HOUSE", icon: "moon", tone: "mixed", desc: "Tighter payouts, but the sharks are lazy.", payout: -0.07, debt: -0.35 },
  { id: "shark_pressure", name: "SHARK PRESSURE", icon: "shark", tone: "mixed", desc: "Heavier bills, but the side hustle pays double.", debt: 0.45, hustle: 1.0 },
  { id: "lucky_run", name: "LUCKY RUN", icon: "clover", tone: "mixed", desc: "The dice love you; the payouts do not.", luck: 0.03, payout: -0.05 },
  { id: "double_or_nothing", name: "DOUBLE OR NOTHING", icon: "star", tone: "risky", desc: "Twice the debt. Twice the payout. Sleep well.", debt: 1.0, payout: 1.0 },
  { id: "thin_margins", name: "THIN MARGINS", icon: "gear", tone: "mixed", desc: "Weaker payouts, more cash to start.", payout: -0.06, startCash: 350 },
  { id: "iron_will", name: "IRON WILL", icon: "bolt", tone: "mixed", desc: "Endless stamina, softer payouts.", energy: 6, payout: -0.06 },
  { id: "grinder", name: "GRINDER", icon: "gear", tone: "mixed", desc: "The hustle pays more; the tables pay less.", hustle: 0.6, payout: -0.03 }
];

function modifierById(id) { return MODIFIERS.find(m => m.id === id) || null; }

function runModifiers(s = state) {
  if (!s || !Array.isArray(s.modifiers)) return [];
  return s.modifiers.map(modifierById).filter(Boolean);
}

function runModTotal(field, s = state) {
  return runModifiers(s).reduce((sum, m) => sum + (Number(m[field]) || 0), 0);
}

function rollRunModifiers() {
  const count = chance(0.5) ? 2 : 1;
  const pool = shuffle(MODIFIERS.slice());
  return pool.slice(0, count).map(m => m.id);
}

function modifierSummary() {
  return runModifiers().map(m => `${m.name}: ${m.desc}`).join(" ");
}

/* ------------------------------------------------------------
   The Shark's Tithe — a long-run win condition
   ------------------------------------------------------------ */
const TITHE_REWARD = { stars: 3, tokens: 8, xp: 160 };

function titheReady(s = state) {
  return !!s && !s.gameOver && !s.titheWin && s.day >= TITHE_DAY && s.cash >= TITHE_AMOUNT;
}

function metaOnTithe() {
  if (!profile || !state) return;
  const prevStars = totalStars();
  state.prestige.stars = Math.max(0, state.prestige.stars || 0) + TITHE_REWARD.stars;
  profile.stars = Math.max(profile.stars || 0, state.prestige.stars);
  state.stats.prestiges = (state.stats.prestiges || 0) + 1;
  profile.lifetime.prestiges += 1;
  profile.lifetime.starsEarned += TITHE_REWARD.stars;
  addXP(TITHE_REWARD.xp, "the tithe");
  grantTokens(TITHE_REWARD.tokens, "the tithe");
  checkAchievements({ type: "tithe" });
  updateChallenges({ type: "tithe" });
  const tierUps = grantTierRewards(prevStars, totalStars());
  state.prestige.lastPayout = { earned: TITHE_REWARD.stars, prevStars, newStars: totalStars(), tokenPayout: TITHE_REWARD.tokens, xpPayout: TITHE_REWARD.xp, tierUps };
  saveProfile();
}

/* ------------------------------------------------------------
   Random morning events
   ------------------------------------------------------------ */
const EVENTS = [
  {
    id: "windfall", name: "DRUNK TOURIST", icon: "cash", weight: 12,
    text: "A tourist mistakes you for a waiter and tips you.",
    apply: s => { const pay = randInt(60, 130); s.cash += pay; return `+${fmt(pay)} cash.`; }
  },
  {
    id: "vending", name: "VENDING MACHINE", icon: "bolt", weight: 10,
    text: "The machine gives you a free energy drink. It tastes like batteries.",
    apply: s => { s.energy = Math.min(maxEnergy(s), s.energy + 5); return "+5 energy."; }
  },
  {
    id: "hot_table", name: "HOT TABLE", icon: "star", weight: 10,
    text: "One cabinet is paying out all day. The pit boss is furious.",
    apply: s => {
      const game = GAMES[rand(GAMES.length)];
      addEffect(s, { id: "hot", name: `${game.name} is HOT`, icon: "star", untilDay: s.day + 1, hotGame: { gameId: game.id, pct: 0.5 } });
      return `${game.name} pays +50% until Day ${s.day + 1}.`;
    }
  },
  {
    id: "lucky_streak", name: "LUCKY STREAK", icon: "clover", weight: 9,
    text: "The air tastes like luck. Do not question it.",
    apply: s => { addEffect(s, { id: "lucky", name: "Lucky Streak", icon: "clover", untilDay: s.day + 3, payoutPct: 0.08, luckPct: 0.02 }); return "+8% payouts and +2% win odds for 3 days."; }
  },
  {
    id: "cold_snap", name: "COLD SNAP", icon: "moon", weight: 7,
    text: "Nobody is winning today. The floor is freezing.",
    apply: s => { addEffect(s, { id: "cold", name: "Cold Snap", icon: "moon", untilDay: s.day + 2, payoutPct: -0.06 }); return "-6% payouts for 2 days."; }
  },
  {
    id: "stimulus", name: "STIMULUS", icon: "diamond", weight: 6,
    text: "The house drops a token in your glass as an apology.",
    apply: s => { if (profile) { profile.tokens += 1; saveProfile(); } return "+1 ◆ token."; }
  },
  {
    id: "shark_audit", name: "SHARK AUDIT", icon: "shark", weight: 8,
    text: "The sharks found an old receipt. You owe again.",
    apply: s => { const note = issueDebtFor(s, s.day, true); return `Extra bill: ${fmt(note.amount)} due Day ${note.dueDay}.`; }
  },
  {
    id: "charity", name: "DEBT RELIEF", icon: "clover", weight: 6,
    text: "A mysterious benefactor shaves your ledger.",
    apply: s => {
      if (!s.debts.length) return "No bills to forgive. Lucky you.";
      let saved = 0;
      s.debts.forEach(note => { const cut = Math.max(5, Math.round(note.amount * 0.15 / 5) * 5); note.amount = Math.max(5, note.amount - cut); saved += cut; });
      return `Ledger reduced by ${fmt(saved)}.`;
    }
  },
  {
    id: "pickpocket", name: "PICKPOCKET", icon: "skull", weight: 7,
    text: "Someone brushes past you. Your pocket is lighter.",
    apply: s => { const loss = Math.min(s.cash, randInt(25, 70)); s.cash -= loss; return `-${fmt(loss)} cash.`; }
  },
  {
    id: "grind", name: "BUSY SHIFT", icon: "gear", weight: 7,
    text: "The floor is packed. The hustle pays double today.",
    apply: s => { addEffect(s, { id: "grind", name: "Double Hustle", icon: "gear", untilDay: s.day + 1, hustleMult: 2 }); return "Side hustle pays double today."; }
  },
  {
    id: "inspector", name: "INSPECTOR", icon: "calendar", weight: 5,
    text: "A city inspector scares the sharks into a discount.",
    apply: s => { addEffect(s, { id: "inspector", name: "Inspection", icon: "calendar", untilDay: s.day + 2, debtMult: 0.75 }); return "New bills are 25% smaller for 2 days."; }
  },
  {
    id: "blackout", name: "BLACKOUT", icon: "moon", weight: 5,
    text: "The grid flickers. You wake up less rested than you hoped.",
    apply: s => { s.energy = Math.max(1, Math.round(maxEnergy(s) * 0.6)); return "Energy restored to 60% today."; }
  }
];

function defaultEffects() { return []; }

function addEffect(s, effect) {
  if (!Array.isArray(s.effects)) s.effects = [];
  s.effects = s.effects.filter(e => e.id !== effect.id);
  s.effects.push(effect);
}

function pruneEffects(s = state) {
  if (!s || !Array.isArray(s.effects)) return;
  s.effects = s.effects.filter(e => (e.untilDay || 0) > s.day);
}

function activeEffects(s = state) {
  if (!s || !Array.isArray(s.effects)) return [];
  return s.effects.filter(e => (e.untilDay || 0) > s.day);
}

function effectPayoutPct(gameId, s = state) {
  let pct = 0;
  activeEffects(s).forEach(e => {
    if (e.hotGame) { if (e.hotGame.gameId === gameId) pct += e.hotGame.pct; }
    else if (e.payoutPct) pct += e.payoutPct;
  });
  return pct;
}

function effectLuckPct(s = state) {
  let pct = 0;
  activeEffects(s).forEach(e => { if (e.luckPct) pct += e.luckPct; });
  return pct;
}

function effectDebtMult(s = state) {
  let mult = 1;
  activeEffects(s).forEach(e => { if (e.debtMult) mult *= e.debtMult; });
  return mult;
}

function effectHustleMult(s = state) {
  let mult = 1;
  activeEffects(s).forEach(e => { if (e.hustleMult) mult *= e.hustleMult; });
  if (typeof runModTotal === "function") mult *= (1 + runModTotal("hustle", s));
  return mult;
}

function rollMorningEvent(s) {
  if (!s || s.gameOver || s.prestigeWin > 0) return null;
  if (!chance(0.62)) return null;
  const event = pickWeighted(EVENTS, e => e.weight);
  return event;
}

function applyMorningEvent(event, s) {
  if (!event) return null;
  let detail = "";
  try { detail = event.apply(s) || ""; } catch (err) { detail = ""; }
  addLog(`Morning event — ${event.name}: ${detail}`, event.id === "pickpocket" || event.id === "cold_snap" ? "loss" : "gold");
  return detail;
}

/* ------------------------------------------------------------
   Achievements
   ------------------------------------------------------------ */
function mult(ev) { return ev && ev.bet > 0 ? (ev.payout || 0) / ev.bet : 0; }

const ACHIEVEMENTS = [
  { id: "first_blood", name: "FIRST BLOOD", desc: "Play your first game.", icon: "coin", reward: { tokens: 1, xp: 15 }, check: (s, p) => p.lifetime.gamesPlayed >= 1 },
  { id: "first_win", name: "BEGINNER'S LUCK", desc: "Win a game.", icon: "cash", reward: { tokens: 1, xp: 15 }, check: (s, p) => p.lifetime.wins >= 1 },
  { id: "first_loss", name: "WELCOME TO THE FLOOR", desc: "Lose a game. It happens.", icon: "skull", reward: { tokens: 1, xp: 10 }, check: (s, p) => p.lifetime.losses >= 1 },
  { id: "all_cabinets", name: "FULL TOUR", desc: "Play all eight cabinets.", icon: "gear", reward: { tokens: 2, xp: 30 }, check: (s, p) => GAMES.every(g => (p.lifetime.cabinets[g.id] || 0) > 0) },
  { id: "high_roller", name: "HIGH ROLLER", desc: "Win $500 in a single game.", icon: "diamond", reward: { tokens: 2, xp: 35 }, check: (s, p) => p.lifetime.biggestWin >= 500 },
  { id: "whale", name: "WHALE", desc: "Win $2,000 in a single game.", icon: "diamond", reward: { tokens: 3, xp: 60 }, check: (s, p) => p.lifetime.biggestWin >= 2000 },
  { id: "jackpot", name: "JACKPOT", desc: "Hit a 50x payout or better.", icon: "seven", reward: { tokens: 3, xp: 50 }, check: (s, p, ev) => ev.type === "settle" && ev.result === "win" && mult(ev) >= 50 },
  { id: "lucky_sevens", name: "LUCKY SEVENS", desc: "Hit triple sevens on the slots.", icon: "seven", reward: { tokens: 3, xp: 45 }, check: (s, p, ev) => ev.type === "settle" && ev.gameId === "slots" && /TRIPLE SEVEN/.test(ev.title || "") },
  { id: "plinko_edge", name: "EDGE OF GLORY", desc: "Land the 50x Plinko slot.", icon: "plinko", reward: { tokens: 3, xp: 45 }, check: (s, p, ev) => ev.type === "settle" && ev.gameId === "plinko" && mult(ev) >= 45 },
  { id: "roulette_single", name: "ONE IN THIRTY-EIGHT", desc: "Win a single-number roulette bet.", icon: "roulette", reward: { tokens: 3, xp: 50 }, check: (s, p, ev) => ev.type === "settle" && ev.gameId === "roulette" && ev.result === "win" && mult(ev) >= 36 },
  { id: "blackjack_natural", name: "NATURAL", desc: "Get a natural blackjack.", icon: "cards", reward: { tokens: 2, xp: 30 }, check: (s, p, ev) => ev.type === "settle" && ev.gameId === "blackjack" && /BLACKJACK/.test(ev.title || "") },
  { id: "royal_flush", name: "ROYAL FLUSH", desc: "Make a royal flush in Hold'em.", icon: "poker", reward: { tokens: 5, xp: 90 }, check: (s, p, ev) => ev.type === "settle" && /ROYAL FLUSH/.test(ev.sub || "") },
  { id: "straight_flush", name: "STRAIGHT FLUSH", desc: "Make a straight flush.", icon: "poker", reward: { tokens: 4, xp: 65 }, check: (s, p, ev) => ev.type === "settle" && /STRAIGHT FLUSH/.test(ev.sub || "") },
  { id: "streak_3", name: "ON A ROLL", desc: "Win three games in a row.", icon: "star", reward: { tokens: 2, xp: 30 }, check: (s, p) => p.lifetime.maxStreak >= 3 },
  { id: "streak_5", name: "HEATER", desc: "Win five games in a row.", icon: "star", reward: { tokens: 3, xp: 50 }, check: (s, p) => p.lifetime.maxStreak >= 5 },
  { id: "streak_10", name: "UNSTOPPABLE", desc: "Win ten games in a row.", icon: "star", reward: { tokens: 5, xp: 90 }, check: (s, p) => p.lifetime.maxStreak >= 10 },
  { id: "day_5", name: "SETTLED IN", desc: "Reach Day 5.", icon: "calendar", reward: { tokens: 1, xp: 20 }, check: (s, p) => p.lifetime.bestDay >= 5 },
  { id: "day_10", name: "TENURE", desc: "Reach Day 10.", icon: "calendar", reward: { tokens: 2, xp: 40 }, check: (s, p) => p.lifetime.bestDay >= 10 },
  { id: "day_20", name: "INSTITUTION", desc: "Reach Day 20.", icon: "calendar", reward: { tokens: 4, xp: 75 }, check: (s, p) => p.lifetime.bestDay >= 20 },
  { id: "debt_slayer", name: "DEBT SLAYER", desc: "Pay 10 bills across all runs.", icon: "shark", reward: { tokens: 2, xp: 35 }, check: (s, p) => p.lifetime.billsPaid >= 10 },
  { id: "clean_ledger", name: "SPOTLESS", desc: "Clear your whole ledger 5 times.", icon: "clover", reward: { tokens: 3, xp: 45 }, check: (s, p) => p.lifetime.ledgersCleared >= 5 },
  { id: "nerve", name: "NERVE", desc: "Cash out with 3 or more seals.", icon: "revolver", reward: { tokens: 3, xp: 50 }, check: (s, p, ev) => ev.type === "prestige" && ev.earned >= 3 },
  { id: "five_seals", name: "FIVE CHAMBERS", desc: "Pull five safe chambers in one visit.", icon: "revolver", reward: { tokens: 5, xp: 80 }, check: (s, p, ev) => ev.type === "russian" && ev.earned >= 5 },
  { id: "prestige_1", name: "WALKED OUT", desc: "Cash out prestige for the first time.", icon: "star", reward: { tokens: 3, xp: 60 }, check: (s, p) => p.lifetime.prestiges >= 1 },
  { id: "prestige_10", name: "REGULAR", desc: "Cash out prestige ten times.", icon: "star", reward: { tokens: 6, xp: 110 }, check: (s, p) => p.lifetime.prestiges >= 10 },
  { id: "freedom", name: "FREEDOM", desc: "Pay the Shark's Tithe and walk away clean.", icon: "star", reward: { tokens: 4, xp: 60 }, check: (s, p, ev) => ev.type === "tithe" },
  { id: "stars_25", name: "COLLECTOR", desc: "Hold 25 permanent stars.", icon: "star", reward: { tokens: 4, xp: 70 }, check: (s, p) => totalStars() >= 25 },
  { id: "stars_50", name: "STAR BARON", desc: "Hold 50 permanent stars.", icon: "star", reward: { tokens: 7, xp: 140 }, check: (s, p) => totalStars() >= 50 },
  { id: "level_10", name: "VETERAN", desc: "Reach profile level 10.", icon: "bolt", reward: { tokens: 3, xp: 0 }, check: (s, p) => (p.level || 1) >= 10 },
  { id: "level_25", name: "OLD HAND", desc: "Reach profile level 25.", icon: "bolt", reward: { tokens: 6, xp: 0 }, check: (s, p) => (p.level || 1) >= 25 },
  { id: "collector_5", name: "COLLECTOR", desc: "Unlock 5 vault items.", icon: "diamond", reward: { tokens: 3, xp: 40 }, check: () => unlockedCount() >= 5 },
  { id: "themed", name: "REDECORATED", desc: "Equip a non-default theme.", icon: "gear", reward: { tokens: 2, xp: 25 }, check: (s, p, ev) => ev.type === "equip" && ev.kind === "theme" && ev.id !== "neon" },
  { id: "contract_1", name: "DEAL MAKER", desc: "Complete a run contract.", icon: "cards", reward: { tokens: 2, xp: 30 }, check: (s, p) => p.lifetime.contractsDone >= 1 },
  { id: "contract_15", name: "CONTRACTOR", desc: "Complete 15 run contracts.", icon: "cards", reward: { tokens: 5, xp: 80 }, check: (s, p) => p.lifetime.contractsDone >= 15 },
  { id: "marathon", name: "MARATHON", desc: "Play 250 games across all runs.", icon: "coin", reward: { tokens: 4, xp: 60 }, check: (s, p) => p.lifetime.gamesPlayed >= 250 },
  { id: "ascend_1", name: "ASCENDED", desc: "Ascend for the first time.", icon: "star", reward: { tokens: 6, xp: 100 }, check: (s, p) => (p.ascensions || 0) >= 1 },
  { id: "ascend_5", name: "BEYOND LUCK", desc: "Ascend five times.", icon: "clover", reward: { tokens: 12, xp: 200 }, check: (s, p) => (p.ascensions || 0) >= 5 },
  { id: "house_broken", name: "THE HOUSE BREAKS", desc: "Max out permanent luck and win everything.", icon: "seven", reward: { tokens: 25, xp: 400 }, check: (s, p) => !!p.houseBroken }
];

function achievementStats() {
  const unlocked = profile ? Object.keys(profile.achievements).length : 0;
  return { unlocked, total: ACHIEVEMENTS.length };
}

function checkAchievements(ev = {}) {
  if (!profile) return [];
  const unlocked = [];
  ACHIEVEMENTS.forEach(a => {
    if (profile.achievements[a.id]) return;
    let met = false;
    try { met = !!a.check(state, profile, ev); } catch (err) { met = false; }
    if (!met) return;
    profile.achievements[a.id] = Date.now();
    profile.lifetime.achievementsDone = (profile.lifetime.achievementsDone || 0) + 1;
    unlocked.push(a);
  });
  if (!unlocked.length) return [];
  unlocked.forEach(a => {
    if (a.reward.tokens) profile.tokens += a.reward.tokens;
    if (a.reward.xp) {
      const before = profile.level || 1;
      profile.xp += Math.round(a.reward.xp * xpMultiplier());
      const after = levelFromXp(profile.xp);
      profile.level = after;
      if (after > before) {
        let tokens = 0;
        for (let l = before + 1; l <= after; l++) tokens += 1 + Math.floor(l / 5);
        tokens += (profile.perks?.tokenFinder || 0) * (after - before);
        profile.tokens += tokens;
        toast(`LEVEL ${after} — ${tokens} token${tokens === 1 ? "" : "s"} earned`, "gold");
      }
    }
    toast(`🏆 ${a.name} — +${a.reward.tokens} ◆`, "gold");
  });
  saveProfile();
  sfx("prestige");
  return unlocked;
}

/* ------------------------------------------------------------
   Hooks called from the rest of the game
   ------------------------------------------------------------ */
function recordRunStart() {
  if (!profile) return;
  profile.runs = (profile.runs || 0) + 1;
  saveProfile();
}

function metaOnSettle(gameId, info) {
  if (!profile || !state) return;
  const lt = profile.lifetime;
  const run = state.runStats || (state.runStats = defaultRunStats());

  lt.gamesPlayed += 1;
  lt.cabinets[gameId] = (lt.cabinets[gameId] || 0) + 1;
  run.plays[gameId] = (run.plays[gameId] || 0) + 1;

  const win = info.result === "win";
  const loss = info.result === "loss";
  const net = Math.max(0, Math.round(info.net || 0));

  if (win) {
    lt.wins += 1;
    run.wins += 1;
    run.streak += 1;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
    lt.currentStreak += 1;
    lt.maxStreak = Math.max(lt.maxStreak, lt.currentStreak);
    run.biggestWin = Math.max(run.biggestWin, net);
    lt.biggestWin = Math.max(lt.biggestWin, net);
    lt.totalWon += net;
    run.cabinetsWon[gameId] = (run.cabinetsWon[gameId] || 0) + 1;
    const dayKey = String(state.day);
    if (!run.dayWins[dayKey]) run.dayWins[dayKey] = [];
    if (!run.dayWins[dayKey].includes(gameId)) run.dayWins[dayKey].push(gameId);
    if (gameId === "plinko" && info.bet > 0) run.plinkoBest = Math.max(run.plinkoBest, Math.round((info.payout / info.bet)));
  } else if (loss) {
    lt.losses += 1;
    run.losses += 1;
    run.streak = 0;
    lt.currentStreak = 0;
  }
  run.bestCash = Math.max(run.bestCash, state.cash);
  lt.bestCash = Math.max(lt.bestCash, state.cash);
  lt.bestDay = Math.max(lt.bestDay, state.day);

  // XP: base by energy cost, plus win/size bonuses.
  const game = getGame(gameId);
  const base = (game?.energy || 1) * 3;
  let xp = base;
  if (win) xp += 6 + Math.min(30, Math.floor(net / 40));
  if (info.big) xp += 20;
  addXP(xp);

  const ev = {
    type: "settle", gameId, result: info.result, net, bet: info.bet || 0,
    payout: info.payout || 0, title: info.title || "", sub: info.sub || "", big: !!info.big
  };
  checkAchievements(ev);
  updateChallenges(ev);
  saveProfile();
}

function metaOnPayDebt(amount, clearedAll) {
  if (!profile || !state) return;
  const run = state.runStats || (state.runStats = defaultRunStats());
  run.billsPaid += 1;
  profile.lifetime.billsPaid += 1;
  if (clearedAll) {
    run.ledgersCleared += 1;
    profile.lifetime.ledgersCleared += 1;
  }
  addXP(4 + Math.floor(amount / 40));
  checkAchievements({ type: "payDebt", amount, clearedAll });
  updateChallenges({ type: "payDebt", amount });
  saveProfile();
}

function metaOnSleep() {
  if (!profile || !state) return null;
  profile.lifetime.bestDay = Math.max(profile.lifetime.bestDay, state.day);
  addXP(10);
  checkAchievements({ type: "sleep", day: state.day });
  updateChallenges({ type: "sleep", day: state.day });
  saveProfile();
  return null;
}

function metaOnRussian(earned) {
  if (!profile) return;
  checkAchievements({ type: "russian", earned });
  updateChallenges({ type: "russian", earned });
  saveProfile();
}

function metaOnPrestige(earned) {
  if (!profile || !state) return null;
  const prevStars = totalStars();
  state.prestige.stars = Math.max(0, state.prestige.stars || 0) + earned;
  profile.stars = Math.max(profile.stars || 0, state.prestige.stars);
  const newStars = totalStars();
  const tierIdx = tierIndex(newStars);
  state.stats.prestiges = (state.stats.prestiges || 0) + 1;
  profile.lifetime.prestiges += 1;
  profile.lifetime.starsEarned += earned;
  const tokenPayout = earned * 2 + tierIdx * 2;
  const xpPayout = 40 + earned * 16 + tierIdx * 20;
  addXP(xpPayout, "prestige");
  grantTokens(tokenPayout, "prestige cash-out");
  checkAchievements({ type: "prestige", earned, stars: profile.stars });
  updateChallenges({ type: "prestige", earned });
  const tierUps = grantTierRewards(prevStars, newStars);
  state.prestige.lastPayout = { earned, prevStars, newStars, tokenPayout, xpPayout, tierUps };
  saveProfile();
  return state.prestige.lastPayout;
}

function metaOnHustle(pay) {
  if (!profile) return;
  addXP(3);
  checkAchievements({ type: "hustle", pay });
  saveProfile();
}

/* ------------------------------------------------------------
   Vault screen helpers used by ui.js
   ------------------------------------------------------------ */
function vaultKindLabel(kind) {
  return kind === "theme" ? "CASINO THEMES" : kind === "skin" ? "CHARACTER SKINS" : kind === "dice" ? "DICE DESIGNS" : "CARD DESIGNS";
}

function achievementList() {
  return ACHIEVEMENTS;
}

function tierLadder() {
  return PRESTIGE_TIERS;
}

function lifetimeStats() {
  return profile?.lifetime || defaultLifetime();
}
