/* ============================================================
   GAMBLER'S FORTUNE — data, sprites and small utilities
   ============================================================ */

const SAVE_KEY = "pixelFortune_save_v1";
const SAVE_VERSION = 1;
const BASE_ENERGY = 20;
const DEBT_TERM_DAYS = 5;
const PRESTIGE_GOAL = 2000;
const PRESTIGE_DAY = 10;
const START_CASH = 300;
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const GAMES = [
  {
    id: "coin", name: "Coin Flip", tag: "HEADS / TAILS", category: "CHANCE",
    blurb: "Call it in the air. Simple, brutal, beautiful.",
    sprite: "coin", minBet: 5, energy: 1, accent: "#ffcf4a",
    odds: "47.5% WIN", pay: "2.00x", status: "The oldest gamble in the arcade."
  },
  {
    id: "dice", name: "Even / Odd Dice", tag: "EVEN / ODD", category: "CHANCE",
    blurb: "Two bones. One parity. Pick a side.",
    sprite: "dice", minBet: 5, energy: 1, accent: "#5de8ff",
    odds: "48.5% WIN", pay: "1.92x", status: "The dice remember nothing."
  },
  {
    id: "blackjack", name: "Blackjack", tag: "HIT / STAND", category: "TABLE",
    blurb: "Beat the dealer to 21 without going bust.",
    sprite: "cards", minBet: 10, energy: 2, accent: "#ff5576",
    odds: "DEALER HITS SOFT 17", pay: "2.00x / 2.50x", status: "Closest to 21 takes it."
  },
  {
    id: "roulette", name: "Roulette", tag: "AMERICAN WHEEL", category: "TABLE",
    blurb: "Thirty-eight pockets. One little ball.",
    sprite: "roulette", minBet: 10, energy: 2, accent: "#b16cff",
    odds: "94.7% RTP", pay: "2x / 18x / 36x", status: "Red, black, green, or one brave number."
  },
  {
    id: "holdem", name: "Texas Hold'em", tag: "HEADS-UP POKER", category: "TABLE",
    blurb: "Two cards down. Five cards up. One winner.",
    sprite: "poker", minBet: 20, energy: 4, accent: "#5cf58f",
    odds: "5% HOUSE RAKE", pay: "1.90x", status: "Best five-card hand takes the pot."
  },
  {
    id: "plinko", name: "Plinko", tag: "DROP THE BALL", category: "ARCADE",
    blurb: "Gravity is the dealer. Find a lucky slot.",
    sprite: "plinko", minBet: 10, energy: 2, accent: "#5de8ff",
    odds: "95.6% RTP", pay: "UP TO 50x", status: "The edges pay. The center is a trap."
  },
  {
    id: "slots", name: "Lucky 7s", tag: "THREE REELS", category: "ARCADE",
    blurb: "Match three. Chase the golden sevens.",
    sprite: "slots", minBet: 5, energy: 2, accent: "#ff9c4a",
    odds: "96.2% RTP", pay: "UP TO 77x", status: "Any pair pays. Triple sevens change everything."
  },
  {
    id: "horses", name: "Horse Racing", tag: "PICK A PONY", category: "ARCADE",
    blurb: "Five runners. Real odds. No refunds.",
    sprite: "horse", minBet: 15, energy: 3, accent: "#ff5576",
    odds: "WEIGHTED FIELD", pay: "UP TO 11.7x", status: "Pick a lane and hold your ticket."
  }
];

const GAME_BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));

const DEFAULT_BETS = GAMES.reduce((acc, game) => {
  acc[game.id] = game.minBet;
  return acc;
}, {});

const UPGRADE_TYPES = {
  energy: {
    name: "POWER CELL", icon: "bolt", max: 3,
    costs: [150, 500, 1200],
    desc: "+4 max energy every day.",
    effect: level => `+${level * 4} max energy`,
    color: "#5cf58f"
  },
  debt: {
    name: "DEBT SHREDDER", icon: "shark", max: 3,
    costs: [120, 450, 1100],
    desc: "Shrinks every new debt bill.",
    effect: level => `-${level * 12}% new debt`,
    color: "#ff9c4a"
  },
  payout: {
    name: "GOLD GLOVES", icon: "coin", max: 4,
    costs: [200, 650, 1600, 3200],
    desc: "Sticky fingers. Bigger payouts.",
    effect: level => `+${level * 5}% winnings`,
    color: "#ffcf4a"
  },
  luck: {
    name: "RABBIT'S FOOT", icon: "clover", max: 3,
    costs: [250, 800, 2000],
    desc: "A nudge for coin, dice and roulette.",
    effect: level => `+${(level * 1.5).toFixed(1)}% win odds`,
    color: "#b16cff"
  }
};

const HORSES = [
  { name: "NEON NAG", color: "#5de8ff", odds: 2.6, chance: 0.36, num: "1" },
  { name: "SIR GALLOP", color: "#ffcf4a", odds: 3.5, chance: 0.27, num: "2" },
  { name: "MIDNIGHT MULE", color: "#b16cff", odds: 5.5, chance: 0.17, num: "3" },
  { name: "PIXEL PETE", color: "#5cf58f", odds: 7.8, chance: 0.12, num: "4" },
  { name: "LUCKY HOOVES", color: "#ff5576", odds: 11.7, chance: 0.08, num: "5" }
];

const PLINKO_MULTS = [50, 10, 3, 1.5, 1, 0.5, 0.8, 0.5, 1, 1.5, 3, 10, 50];
const PLINKO_ROWS = 12;

const WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const SLOT_SYMBOLS = [
  { id: "cherry", sprite: "cherry", name: "CHERRY", triple: 7 },
  { id: "bell", sprite: "bell", name: "BELL", triple: 16 },
  { id: "star", sprite: "star", name: "STAR", triple: 10 },
  { id: "diamond", sprite: "diamond", name: "DIAMOND", triple: 30 },
  { id: "seven", sprite: "seven", name: "SEVEN", triple: 77 },
  { id: "skull", sprite: "skull", name: "SKULL", triple: 3 },
  { id: "clover", sprite: "clover", name: "CLOVER", triple: 2 }
];

const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_COLORS = { "♠": "black", "♣": "black", "♥": "red", "♦": "red" };

/* ------------------------------------------------------------
   Pixel sprite data. One character = one pixel.
   ------------------------------------------------------------ */
const PALETTE = {
  k: "#080a12", w: "#f8f2df", c: "#d8cfb8", y: "#fff3a1", g: "#ffcf4a",
  G: "#d99424", o: "#a85f13", O: "#64370c", r: "#ff5576", R: "#8b1636",
  b: "#5de8ff", B: "#1a7186", p: "#b16cff", P: "#5d2b89", e: "#5cf58f",
  E: "#13884c", s: "#b9c0d6", S: "#545c7b", d: "#252a45", D: "#11152a",
  n: "#9a5d35", N: "#4f2b18", f: "#f1bf86", m: "#ff83d1", u: "#5f85ff",
  t: "#000000", v: "#1a1530", x: "#3d456f", z: "#733d27"
};

const SPRITES = {
  coin: [
    "................",
    ".....kkkkkk.....",
    "..kkooooooookk..",
    "..koyyyyyyyyok..",
    ".koyykkkkkkyyok.",
    ".koykwwwwwwkyok.",
    "koykwwkkkkwwkyok",
    "koykwwkggkwwkyok",
    "koykwwkggkwwkyok",
    "koykwwkkkkwwkyok",
    ".koykwwwwwwkyok.",
    ".koyyykkkkkyyok.",
    "..koyyyyyyyyok..",
    "..kkooooooookk..",
    ".....kkkkkk.....",
    "................"
  ],
  dice: [
    "................",
    "................",
    "...kkkkkkkkkk...",
    "..kwwwwwwwwwwk..",
    "..kwkkwwwwkkwk..",
    "..kwkkwwwwkkwk..",
    "..kwwwwkkwwwwk..",
    "..kwwwwkkwwwwk..",
    "..kwwkkwwkkwwk..",
    "..kwwkkwwkkwwk..",
    "..kwwwwwwwwwwk..",
    "..kwkkwwwwkkwk..",
    "..kwkkwwwwkkwk..",
    "..kwwwwwwwwwwk..",
    "...kkkkkkkkkk...",
    "................"
  ],
  cards: [
    "................",
    "..kkkk...kkkk...",
    ".kwwwwk.kwwwwk..",
    ".kwkkwk.kwkkwk..",
    ".kwwwrk.kwwwrk..",
    ".kwwwrk.kwwwrk..",
    ".kwwwwk.kwwwwk..",
    ".kwwwwk.kwwwwk..",
    "..kkkk...kkkk...",
    "................",
    "....kkkkkk......",
    "...krrrrrrk.....",
    "..krrwrrrrrk....",
    "..krrrrwrrrk....",
    "...krrrrrrk.....",
    "....kkkkkk......"
  ],
  roulette: [
    "................",
    "......kkkk......",
    "....kkrrrrkk....",
    "...krrwwwwrrk...",
    "..krrwkkkkwrrk..",
    "..krwkkrrkkwrk..",
    ".krrwkrrrrkwrrk.",
    ".krwkkrrrrkkwrk.",
    ".krwkkrrrrkkwrk.",
    ".krrwkrrrrkwrrk.",
    "..krwkkrrkkwrk..",
    "..krrwkkkkwrrk..",
    "...krrwwwwrrk...",
    "....kkrrrrkk....",
    "......kkkk......",
    "................"
  ],
  poker: [
    "................",
    "..kkkk...kkkk...",
    ".kwwwwk.kwwwwk..",
    ".kwkkwk.kwkkwk..",
    ".kwwwrk.kwwwrk..",
    ".kwwwrk.kwwwrk..",
    ".kwwwwk.kwwwwk..",
    ".kwwwwk.kwwwwk..",
    "..kkkk...kkkk...",
    "....kkkkkk......",
    "...krrrrrrk.....",
    "..krrwrrrrrk....",
    "..krrrrwrrrk....",
    "...krrrrrrk.....",
    "....kkkkkk......",
    "................"
  ],
  plinko: [
    "................",
    ".....kkkkkk.....",
    "....kbbbbbbk....",
    "...kbbbwbbbbk...",
    "...kbbbbbbbbk...",
    "....kbbbbbbk....",
    ".....kkkkkk.....",
    "...k..k..k..k...",
    "..kk.kk.kk.kk...",
    "...k..k..k..k...",
    "..kk.kk.kk.kk...",
    "...k..k..k..k...",
    "..kk.kk.kk.kk...",
    ".kk.kk.kk.kk.kk.",
    ".kk.kk.kk.kk.kk.",
    "................"
  ],
  horse: [
    "................",
    "..........kkk...",
    ".........knnnk..",
    "........knnfnnk.",
    ".......knnnnnnk.",
    "..kk...knnnnkk..",
    ".knnk..knnnnk...",
    ".knnnkkknnnnk...",
    "..knnnnnnnnnk...",
    "...knnnnnnnnk...",
    "....knnknnnk....",
    "....knnkknnk....",
    "...knnk.knnk....",
    "...knnk.knnk....",
    "...kkk...kkk....",
    "................"
  ],
  slots: [
    "................",
    "..kkkkkkkkkkkk..",
    "..kggggggggggk..",
    "..kgkkggkkggkk..",
    "..kggkggkggkgk..",
    "..kggkggkggkgk..",
    "..kgkkggkkggkk..",
    "..kggggggggggk..",
    "..kkkkkkkkkkkk..",
    "...kwwkwwkwwk...",
    "...kkkkkkkkkk...",
    "................",
    "................",
    "................",
    "................",
    "................"
  ],
  cash: [
    "................",
    "..kkkkkkkkkkkk..",
    ".kEEEEEEEEEEEEk.",
    ".kEkkkkkkkkkkEk.",
    ".kEkkwwwwwwkkEk.",
    ".kEkwwkkkkwwkEk.",
    ".kEkwkkwwkkwkEk.",
    ".kEkwkwwwwkwkEk.",
    ".kEkwkkwwkkwkEk.",
    ".kEkwwkkkkwwkEk.",
    ".kEkkwwwwwwkkEk.",
    ".kEkkkkkkkkkkEk.",
    ".kEEEEEEEEEEEEk.",
    "..kkkkkkkkkkkk..",
    "................",
    "................"
  ],
  bolt: [
    "................",
    ".......kkkk.....",
    "......kyyyk.....",
    ".....kyyyk......",
    "....kyyyk.......",
    "...kyyyyyyykk...",
    "...kyyyyyyyyyk..",
    "......kyyyk.....",
    ".....kyyyk......",
    "....kyyyk.......",
    "...kyyyk........",
    "...kkkk.........",
    "................",
    "................",
    "................",
    "................"
  ],
  calendar: [
    "................",
    "....kk....kk....",
    "..kkkkkkkkkkkk..",
    "..kwwwwwwwwwwk..",
    "..kwrrrrrrrrwk..",
    "..kwwwwwwwwwwk..",
    "..kwkkwkkwkkwk..",
    "..kwwwwwwwwwwk..",
    "..kwkkwkkwkkwk..",
    "..kwwwwwwwwwwk..",
    "..kwkkwkkwkkwk..",
    "..kwwwwwwwwwwk..",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
    "................"
  ],
  shark: [
    "................",
    "................",
    "..........kk....",
    ".........kSSk...",
    "........kSSSk...",
    ".......kSSSSk...",
    "......kSSSSSk...",
    ".....kSSSSSSk...",
    "....kSSSSSSSk...",
    "...kSSSSSSSSk...",
    "..kSSSSSSSSSk...",
    "..kSkkSSkkSSk...",
    "..kSk.kSk.kSk...",
    "..kk...k...kk...",
    "................",
    "................"
  ],
  gear: [
    "................",
    "......kkkk......",
    ".....kGGGGk.....",
    "...kkGGGGGGkk...",
    "..kGGkkGGkkGGk..",
    ".kGGGkGGGGkGGGk.",
    ".kGGkGGGGGGkGGk.",
    "kkGGkGGkkGGkGGkk",
    "kkGGkGGkkGGkGGkk",
    ".kGGkGGGGGGkGGk.",
    ".kGGGkGGGGkGGGk.",
    "..kGGkkGGkkGGk..",
    "...kkGGGGGGkk...",
    ".....kGGGGk.....",
    "......kkkk......",
    "................"
  ],
  revolver: [
    "................",
    "................",
    "...kkkkkkkkkkk..",
    "..kssssssssssSk.",
    "..kskkkkkkkkkkk.",
    "...kkkkkkkkkk...",
    "..kkSSSSSSkkkk..",
    ".kkSSSkkSSSkk...",
    ".kSSSk..kSSSk...",
    ".kSSSk...kSSk...",
    "..kkkk...kSSk...",
    ".........kSSk...",
    "........kSSSk...",
    "........kkkkk...",
    "................",
    "................"
  ],
  star: [
    "................",
    ".......kk.......",
    "......kggk......",
    "......kggk......",
    ".....kggggk.....",
    "kkkkkkggggkkkkkk",
    "kyyyyyyyyyyyyyyk",
    ".kyyyyyyyyyyyyk.",
    "..kyyyyyyyyyyk..",
    "...kyyyyyyyyk...",
    "....kyyyyyyk....",
    "....kyggkkyyk...",
    "...kyggk..kyyk..",
    "..kyggk....kyyk.",
    "..kkk......kkk..",
    "................"
  ],
  skull: [
    "................",
    "....kkkkkkkk....",
    "..kkwwwwwwwwkk..",
    ".kwwwwwwwwwwwwk.",
    ".kwwkkwwwwkkwwk.",
    ".kwwkkwwwwkkwwk.",
    ".kwwwwwwwwwwwwk.",
    ".kwwwwkkkkwwwwk.",
    ".kwwwwkkkkwwwwk.",
    "..kwwwwwwwwwwk..",
    "...kwwkwwkwwwk..",
    "....kkkkkkkk....",
    "................",
    "................",
    "................",
    "................"
  ],
  clover: [
    "................",
    ".....kk..kk.....",
    "....kEEkkEEk....",
    "...kEEEEEEEEk...",
    "..kEEEEEEEEEEk..",
    "..kEEEEEEEEEEk..",
    "..kEEEEEEEEEEk..",
    "...kEEEEEEEEk...",
    "....kEEEEEEk....",
    ".....kEEEEk.....",
    ".....kEEEEk.....",
    "....kEEEEEEk....",
    "....kEEEEEEk....",
    ".....kkkkkk.....",
    "................",
    "................"
  ],
  moon: [
    "................",
    "....kkkk........",
    "..kkGGGGkk......",
    ".kGGGGGGGGk.....",
    ".kGGGGGGGGGk....",
    "kGGGGGGkkkkk....",
    "kGGGGGk.........",
    "kGGGGGk.........",
    "kGGGGGk.........",
    "kGGGGGGk........",
    ".kGGGGGGGkk.....",
    ".kGGGGGGGGGk....",
    "..kkGGGGGkk.....",
    "....kkkkk.......",
    "................",
    "................"
  ],
  lock: [
    "................",
    "......kkkk......",
    ".....kSkkSk.....",
    "....kSk..kSk....",
    "....kSk..kSk....",
    "..kkkkkkkkkkkk..",
    "..kSSSSSSSSSSk..",
    "..kSSSSkkSSSSk..",
    "..kSSSk..kSSSk..",
    "..kSSSk..kSSSk..",
    "..kSSSk..kSSSk..",
    "..kSSSSkkSSSSk..",
    "..kSSSSSSSSSSk..",
    "..kkkkkkkkkkkk..",
    "................",
    "................"
  ],
  cherry: [
    "................",
    "......kk........",
    ".....krrk.......",
    "....krrrrk......",
    "...krrrrrrk.....",
    "..krrrrrrrrk....",
    "..krrrrrrrrk....",
    "..krrrrrrrrk....",
    "...krrrrrrk.....",
    "....kkrrkk......",
    "......kk........",
    "................",
    "................",
    "................",
    "................",
    "................"
  ],
  bell: [
    "................",
    ".......kk.......",
    "......kggk......",
    ".....kggggk.....",
    "....kggggggk....",
    "...kggggggggk...",
    "..kggggggggggk..",
    "..kggggggggggk..",
    ".kggggggggggggk.",
    "kkkkkkkkkkkkkkkk",
    "..kkkkkkkkkkkk..",
    ".......kk.......",
    "................",
    "................",
    "................",
    "................"
  ],
  seven: [
    "................",
    "..kkkkkkkkkkkk..",
    "..kggggggggggk..",
    "..kgkkkkkkkkgk..",
    "..kk......kggk..",
    ".........kggk...",
    "........kggk....",
    ".......kggk.....",
    "......kggk......",
    "......kggk......",
    ".....kggk.......",
    ".....kggk.......",
    "....kggk........",
    "....kkk.........",
    "................",
    "................"
  ],
  diamond: [
    "................",
    ".......kk.......",
    "......kbbk......",
    ".....kbbbbk.....",
    "....kbbbbbbk....",
    "...kbbbbbbbbk...",
    "..kbbbbbbbbbbk..",
    ".kbbbbbbbbbbbbk.",
    "..kbbbbbbbbbbk..",
    "...kbbbbbbbbk...",
    "....kbbbbbbk....",
    ".....kbbbbk.....",
    "......kbbk......",
    ".......kk.......",
    "................",
    "................"
  ],
  bottle: [
    "................",
    "......kkkk......",
    "......kEEk......",
    "......kEEk......",
    "....kkkkkkkk....",
    "....kEEEEEEk....",
    "...kEEEEEEEEk...",
    "...kEEEEEEEEk...",
    "...kEEEEEEEEk...",
    "...kEEEEEEEEk...",
    "...kEEEEEEEEk...",
    "....kEEEEEEk....",
    "....kkkkkkkk....",
    "................",
    "................",
    "................"
  ]
};

function sprite(name, className = "") {
  const rows = SPRITES[name] || SPRITES.star;
  const width = Math.max(...rows.map(r => r.length));
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PALETTE[row[x]];
      if (color) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  });
  return `<svg class="px-icon ${className}" viewBox="0 0 ${width} ${rows.length}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/* ------------------------------------------------------------
   Utility functions
   ------------------------------------------------------------ */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = n => Math.floor(Math.random() * n);
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance = p => Math.random() < p;
const fmt = n => {
  const value = Math.round(Number(n) || 0);
  return (value < 0 ? "-" : "") + "$" + Math.abs(value).toLocaleString("en-US");
};
const fmtMult = n => `${Number(n).toFixed(Number.isInteger(n) ? 0 : 1)}x`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickWeighted(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

function pocketLabel(pocket) {
  return pocket === 37 ? "00" : String(pocket);
}

function pocketColor(pocket) {
  if (pocket === 0 || pocket === 37) return "green";
  return RED_NUMBERS.has(pocket) ? "red" : "black";
}

function rankLabel(rank) {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}
