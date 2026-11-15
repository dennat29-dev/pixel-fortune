/* ============================================================
   PIXEL FORTUNE — core state, persistence, audio and economy
   ============================================================ */

let state = null;
let ui = null;
let audioCtx = null;
let musicTimer = null;
let musicGainNode = null;
let musicStep = 0;
let musicNextTime = 0;
let musicNoiseBuffer = null;
let musicTrack = "arcade";
let lastCashShown = null;
let saveFailureNotified = false;

function makeGameStates() {
  return {
    coin: { choice: "HEADS", phase: "idle", result: null, lastFace: "HEADS" },
    dice: { choice: "EVEN", values: [2, 5], phase: "idle", result: null },
    blackjack: {
      phase: "idle", deck: [], player: [], dealer: [], result: null,
      bet: 0, reveal: false, playerNatural: false, dealerNatural: false, status: ""
    },
    roulette: {
      phase: "idle", betType: "red", number: 7, rotation: 0,
      winning: null, result: null, lastBetText: "RED"
    },
    holdem: {
      phase: "idle", deck: [], player: [], dealer: [], community: [],
      result: null, folded: false, reveal: false
    },
    plinko: { phase: "idle", result: null, lastBucket: null },
    slots: { phase: "idle", reels: ["cherry", "bell", "seven"], result: null, winning: [] },
    horses: {
      phase: "idle", pick: 0, result: null, winner: null,
      finalProgress: null, currentProgress: null
    }
  };
}

function makeUI() {
  return {
    view: "lobby",
    game: null,
    busy: false,
    sleeping: false,
    games: makeGameStates(),
    actionLockUntil: 0,
    showingPrestige: false
  };
}

/* ------------------------------------------------------------
   Derived values
   ------------------------------------------------------------ */
function maxEnergy(s = state) {
  if (!s) return BASE_ENERGY;
  const level = s.upgradeLevels?.energy || 0;
  const starBonus = Math.min(10, s.prestige?.stars || 0) * 4;
  return BASE_ENERGY + level * 4 + starBonus;
}

function payoutBonus(s = state) {
  if (!s) return 1;
  const level = s.upgradeLevels?.payout || 0;
  const stars = Math.min(10, s.prestige?.stars || 0);
  return 1 + level * 0.05 + stars * 0.04;
}

function payoutBonusPercent(s = state) {
  return Math.round((payoutBonus(s) - 1) * 100);
}

function luckBonus(s = state) {
  if (!s) return 0;
  return (s.upgradeLevels?.luck || 0) * 0.015;
}

function debtModifier(s = state) {
  if (!s) return 1;
  return 1 - (s.upgradeLevels?.debt || 0) * 0.12;
}

function totalDebt(s = state) {
  return (s?.debts || []).reduce((sum, note) => sum + note.amount, 0);
}

function nextDebt(s = state) {
  if (!s || !s.debts?.length) return null;
  return s.debts.slice().sort((a, b) => a.dueDay - b.dueDay)[0];
}

function dueDebts(s = state) {
  return (s?.debts || []).filter(note => note.dueDay <= s.day).sort((a, b) => a.dueDay - b.dueDay);
}

function isDueToday() {
  return dueDebts().length > 0;
}

function hustleRange(day = state.day) {
  const min = 6 + Math.floor(day * 0.8);
  const max = min + 7 + Math.floor(day * 0.35);
  return { min, max };
}

function getGame(id) {
  return GAME_BY_ID[id] || null;
}

/* ------------------------------------------------------------
   State lifecycle
   ------------------------------------------------------------ */
function statsDefaults() {
  return {
    played: 0, wins: 0, losses: 0, biggestWin: 0, totalWon: 0,
    debtPaid: 0, daysSurvived: 1, bestCash: START_CASH, prestiges: 0
  };
}

function makeState(options = {}) {
  const stars = Math.max(0, Math.floor(Number(options.stars) || 0));
  const runs = Math.max(0, Math.floor(Number(options.runs) || 0));
  const stats = { ...statsDefaults(), ...(options.stats || {}) };
  const s = {
    version: SAVE_VERSION,
    cash: START_CASH + Math.min(stars, 20) * 50,
    day: 1,
    energy: BASE_ENERGY,
    upgradeLevels: { energy: 0, debt: 0, payout: 0, luck: 0 },
    bets: { ...DEFAULT_BETS },
    debts: [],
    sideHustleDay: 0,
    prestige: {
      stars,
      runs,
      bestCash: Math.max(stats.bestCash || 0, START_CASH + Math.min(stars, 20) * 50)
    },
    prestigeUnlocked: false,
    offerExpired: false,
    prestigeWin: 0,
    russian: { remaining: 6, earned: 0, pulled: 0 },
    stats,
    sound: options.sound !== false,
    music: options.music !== false,
    gameOver: false,
    gameOverReason: "",
    log: [],
    startedAt: Date.now()
  };
  s.energy = maxEnergy(s);
  if (!options.silent) {
    addLogTo(s, `Day 1. The floor is open. Cash: ${fmt(s.cash)}.`, "gold");
  }
  if (!options.noDebt) issueDebtFor(s, s.day, !!options.silent);
  return s;
}

function issueDebtFor(s, day, silent = false) {
  const base = 22 + day * 4 + randInt(0, 28);
  const amount = Math.max(10, Math.round((base * debtModifier(s)) / 5) * 5);
  const note = {
    id: `bill-${day}-${Date.now()}-${randInt(100, 999)}`,
    amount,
    issuedDay: day,
    dueDay: day + DEBT_TERM_DAYS
  };
  s.debts.push(note);
  s.debts.sort((a, b) => a.dueDay - b.dueDay);
  if (!silent) {
    addLogTo(s, `New debt bill: ${fmt(amount)} due Day ${note.dueDay}.`, "debt");
  }
  return note;
}

function addLogTo(s, text, type = "") {
  if (!s) return;
  if (!Array.isArray(s.log)) s.log = [];
  s.log.unshift({ day: s.day, text, type });
  if (s.log.length > 24) s.log.length = 24;
}

function addLog(text, type = "") {
  addLogTo(state, text, type);
}

function saveState() {
  if (!state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    if (!saveFailureNotified) {
      saveFailureNotified = true;
      console.warn("Pixel Fortune could not save progress:", err);
    }
  }
}

function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return makeState();
  }
  if (!raw) return makeState();
  try {
    const p = JSON.parse(raw);
    if (!p || p.version !== SAVE_VERSION) return makeState();

    const stars = Math.max(0, Math.floor(Number(p.prestige?.stars) || 0));
    const runs = Math.max(0, Math.floor(Number(p.prestige?.runs) || 0));
    const stats = { ...statsDefaults(), ...(p.stats || {}) };
    const s = makeState({ stars, runs, stats, sound: p.sound !== false, music: p.music !== false, silent: true, noDebt: true });

    const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    s.day = Math.max(1, Math.floor(num(p.day, 1)));
    s.cash = Math.max(0, Math.floor(num(p.cash, s.cash)));
    s.energy = clamp(Math.floor(num(p.energy, s.energy)), 0, maxEnergy(s));
    s.sideHustleDay = Math.max(0, Math.floor(num(p.sideHustleDay, 0)));
    s.prestigeUnlocked = !!p.prestigeUnlocked;
    s.offerExpired = !!p.offerExpired;
    s.prestigeWin = Math.max(0, Math.floor(num(p.prestigeWin, 0)));
    s.gameOver = !!p.gameOver;
    s.gameOverReason = typeof p.gameOverReason === "string" ? p.gameOverReason : "";
    s.sound = p.sound !== false;
    s.music = p.music !== false;
    s.startedAt = num(p.startedAt, Date.now());

    if (p.upgradeLevels && typeof p.upgradeLevels === "object") {
      Object.keys(s.upgradeLevels).forEach(key => {
        const max = UPGRADE_TYPES[key]?.max || 0;
        s.upgradeLevels[key] = clamp(Math.floor(num(p.upgradeLevels[key], 0)), 0, max);
      });
    }

    if (p.prestige && typeof p.prestige === "object") {
      s.prestige.stars = stars;
      s.prestige.runs = runs;
      s.prestige.bestCash = Math.max(0, num(p.prestige.bestCash, s.prestige.bestCash));
    }

    s.stats = {
      ...stats,
      played: Math.max(0, Math.floor(num(stats.played, 0))),
      wins: Math.max(0, Math.floor(num(stats.wins, 0))),
      losses: Math.max(0, Math.floor(num(stats.losses, 0))),
      biggestWin: Math.max(0, num(stats.biggestWin, 0)),
      totalWon: Math.max(0, num(stats.totalWon, 0)),
      debtPaid: Math.max(0, num(stats.debtPaid, 0)),
      daysSurvived: Math.max(1, Math.floor(num(stats.daysSurvived, 1))),
      bestCash: Math.max(0, num(stats.bestCash, s.cash)),
      prestiges: Math.max(0, Math.floor(num(stats.prestiges, 0)))
    };

    if (Array.isArray(p.debts)) {
      s.debts = p.debts
        .filter(n => n && Number.isFinite(Number(n.amount)) && Number.isFinite(Number(n.dueDay)))
        .map((n, i) => ({
          id: typeof n.id === "string" ? n.id : `bill-restored-${i}`,
          amount: Math.max(1, Math.floor(Number(n.amount))),
          issuedDay: Math.max(1, Math.floor(num(n.issuedDay, s.day))),
          dueDay: Math.max(1, Math.floor(Number(n.dueDay)))
        }))
        .sort((a, b) => a.dueDay - b.dueDay);
    }
    if (!s.debts.length && !s.gameOver && !s.prestigeWin) issueDebtFor(s, s.day, true);

    if (p.russian && typeof p.russian === "object") {
      s.russian.remaining = clamp(Math.floor(num(p.russian.remaining, 6)), 1, 6);
      s.russian.earned = clamp(Math.floor(num(p.russian.earned, 0)), 0, 5);
      s.russian.pulled = clamp(Math.floor(num(p.russian.pulled, 0)), 0, 5);
    }

    if (p.bets && typeof p.bets === "object") {
      GAMES.forEach(game => {
        const rawBet = Number(p.bets[game.id]);
        if (Number.isFinite(rawBet)) {
          s.bets[game.id] = Math.max(game.minBet, Math.floor(rawBet));
        }
      });
    }

    if (Array.isArray(p.log)) {
      s.log = p.log
        .filter(entry => entry && typeof entry.text === "string")
        .slice(0, 24)
        .map(entry => ({
          day: Math.max(1, Math.floor(num(entry.day, 1))),
          text: entry.text.slice(0, 240),
          type: typeof entry.type === "string" ? entry.type : ""
        }));
    } else {
      s.log = [];
    }

    return s;
  } catch (err) {
    console.warn("Pixel Fortune save was corrupted. Starting a new run.", err);
    return makeState();
  }
}

function resetUI() {
  ui = makeUI();
}

/* ------------------------------------------------------------
   Audio: tiny synthesized arcade sound effects
   ------------------------------------------------------------ */
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------
   Background music: original synthesized loops, one per place.
   The lobby is breezy bossa nova, each cabinet has its own short
   theme, and the back room turns slow, industrial and tense.
   Everything is generated live, so no audio files are needed.
   ------------------------------------------------------------ */
const MUSIC_TEMPO = 124;
const MUSIC_STEP_TIME = 60 / MUSIC_TEMPO / 4;
const MUSIC_LOOP_STEPS = 64;
const MUSIC_CHORDS = [
  { bass: 45, notes: [69, 72, 76] }, // A minor
  { bass: 41, notes: [65, 69, 72] }, // F major
  { bass: 48, notes: [60, 64, 67] }, // C major
  { bass: 43, notes: [67, 71, 74] }  // G major
];
const MUSIC_LEAD = [
  76, 72, 69, 72, 76, 79, 76, 72,
  77, 72, 69, 72, 77, 81, 79, 77,
  76, 72, 67, 72, 76, 79, 76, 72,
  74, 71, 67, 71, 74, 79, 77, 74
];
const MUSIC_BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 0];

/* Each cabinet gets its own short original loop. */
const GAME_TRACKS = {
  coin: {
    tempo: 132, bars: 4,
    chords: [
      { bass: 48, notes: [60, 64, 67] },
      { bass: 43, notes: [59, 62, 67] },
      { bass: 45, notes: [57, 60, 64] },
      { bass: 41, notes: [53, 57, 60] }
    ],
    melody: [
      [[0, 76, 3, .12], [4, 79, 3, .12], [6, 76, 2, .11], [8, 72, 3, .12], [10, 74, 2, .11], [12, 76, 3, .12]],
      [[0, 74, 3, .12], [4, 79, 3, .12], [6, 74, 2, .11], [8, 71, 3, .12], [10, 74, 2, .11], [12, 79, 3, .12]],
      [[0, 72, 3, .12], [4, 76, 3, .12], [6, 81, 2, .11], [8, 79, 3, .12], [10, 76, 2, .11], [12, 72, 3, .12]],
      [[0, 77, 3, .12], [4, 81, 3, .12], [6, 79, 2, .11], [8, 76, 3, .12], [10, 72, 2, .11], [12, 74, 3, .12]]
    ],
    bass: [[0, 0, 2, .12], [4, 0, 2, .11], [6, 12, 2, .09], [8, 0, 2, .12], [12, 7, 2, .10], [14, 12, 2, .09]],
    comp: { style: "chip", pattern: [[4, 1, .018], [12, 1, .018]] },
    arp: { style: "chip", steps: [2, 6, 10, 14], notes: [0, 1, 2, 1], octave: 12, volume: .02 },
    drums: { kick: [0, 8], kickVol: .45, snare: [4, 12], snareVol: .028, hat: [2, 6, 10, 14], hatVol: .009 },
    lead: "chip"
  },
  dice: {
    tempo: 126, bars: 4,
    chords: [
      { bass: 45, notes: [57, 60, 64] },
      { bass: 40, notes: [52, 56, 59] },
      { bass: 41, notes: [53, 57, 60] },
      { bass: 40, notes: [52, 56, 59] }
    ],
    melody: [
      [[0, 69, 2, .10], [3, 72, 2, .09], [6, 76, 2, .10], [10, 72, 2, .09], [12, 71, 2, .09], [14, 69, 2, .09]],
      [[0, 68, 2, .10], [3, 71, 2, .09], [6, 76, 2, .10], [10, 74, 2, .09], [12, 71, 2, .09], [14, 68, 2, .09]],
      [[0, 65, 2, .10], [3, 69, 2, .09], [6, 72, 2, .10], [10, 69, 2, .09], [12, 67, 2, .09], [14, 65, 2, .09]],
      [[0, 64, 2, .10], [3, 68, 2, .09], [6, 71, 2, .10], [10, 74, 2, .09], [12, 71, 2, .09], [14, 76, 2, .10]]
    ],
    bass: [[0, 0, 2, .11], [4, 7, 2, .08], [8, 0, 2, .11], [12, 7, 2, .08]],
    comp: { style: "piano", pattern: [[2, 1, .016], [6, 1, .016], [10, 1, .016], [14, 1, .016]] },
    drums: { kick: [0, 8], kickVol: .4, rim: [2, 6, 10, 14], rimVol: .02 },
    lead: "pluck"
  },
  blackjack: {
    tempo: 94, bars: 4,
    chords: [
      { bass: 36, notes: [48, 51, 55, 58] },
      { bass: 41, notes: [53, 56, 60, 63] },
      { bass: 34, notes: [46, 50, 53, 56] },
      { bass: 39, notes: [51, 55, 58, 62] }
    ],
    melody: [
      [[0, 72, 5, .09], [6, 75, 4, .08], [12, 70, 5, .08]],
      [[0, 68, 5, .09], [6, 72, 4, .08], [12, 75, 4, .08]],
      [[0, 70, 5, .09], [6, 74, 4, .08], [12, 77, 4, .08]],
      [[0, 67, 5, .09], [6, 70, 4, .08], [12, 74, 5, .08]]
    ],
    bass: [[0, 0, 3, .10], [4, 7, 2, .08], [8, 12, 3, .09], [12, 7, 2, .07]],
    comp: { style: "piano", pattern: [[0, 3, .018], [6, 2, .016], [10, 2, .015]] },
    drums: { kick: [0, 8], kickVol: .3, snare: [4, 12], snareVol: .02, snareCut: 1300, hat: [2, 6, 10, 14], hatVol: .005 },
    lead: "piano"
  },
  roulette: {
    tempo: 126, beats: 3, stepsPerBar: 12, bars: 8,
    chords: [
      { bass: 38, notes: [50, 53, 57] },
      { bass: 43, notes: [55, 58, 62] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 38, notes: [50, 53, 57] },
      { bass: 46, notes: [58, 62, 65] },
      { bass: 43, notes: [55, 58, 62] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 38, notes: [50, 53, 57] }
    ],
    melody: [
      [[0, 74, 3, .11], [4, 77, 3, .10], [8, 81, 3, .11]],
      [[0, 79, 3, .11], [4, 82, 3, .10], [8, 86, 3, .11]],
      [[0, 73, 3, .11], [4, 76, 3, .10], [8, 81, 3, .11]],
      [[0, 74, 3, .11], [4, 77, 3, .10], [8, 81, 3, .11]],
      [[0, 82, 3, .11], [4, 77, 3, .10], [8, 74, 3, .11]],
      [[0, 79, 3, .11], [4, 74, 3, .10], [8, 70, 3, .11]],
      [[0, 73, 3, .11], [4, 76, 3, .10], [8, 81, 3, .11]],
      [[0, 74, 3, .11], [4, 77, 3, .10], [8, 81, 3, .11]]
    ],
    bass: [[0, 0, 4, .10], [4, 7, 2, .07], [8, 7, 2, .07]],
    comp: { style: "piano", pattern: [[4, 2, .016], [8, 2, .018]] },
    arp: { style: "bell", steps: [2, 6, 10], notes: [0, 1, 2, 1], octave: 12, volume: .01, dur: 1.5 },
    drums: { kick: [0], kickVol: .35, snare: [4, 8], snareVol: .016, snareCut: 1600, hat: [2, 6, 10], hatVol: .006 },
    lead: "bell"
  },
  holdem: {
    tempo: 88, bars: 4,
    chords: [
      { bass: 38, notes: [50, 53, 57, 60] },
      { bass: 43, notes: [55, 58, 62, 65] },
      { bass: 45, notes: [57, 61, 64, 67] },
      { bass: 38, notes: [50, 53, 57, 60] }
    ],
    melody: [
      [[0, 74, 6, .09], [10, 72, 5, .08]],
      [[0, 70, 6, .09], [10, 67, 5, .08]],
      [[0, 73, 6, .09], [10, 69, 5, .08]],
      [[0, 74, 6, .09], [10, 77, 5, .08]]
    ],
    bass: [[0, 0, 4, .10], [6, 7, 2, .08], [8, 12, 4, .09], [14, 7, 2, .07]],
    comp: { style: "piano", pattern: [[0, 4, .015], [6, 2, .014], [10, 3, .014]] },
    drone: { volume: .03 },
    drums: { kick: [0, 8], kickVol: .25, snare: [4, 12], snareVol: .015, snareCut: 1200, hat: [2, 6, 10, 14], hatVol: .004 },
    lead: "piano"
  },
  plinko: {
    tempo: 128, bars: 4,
    chords: [
      { bass: 48, notes: [60, 64, 67] },
      { bass: 45, notes: [57, 60, 64] },
      { bass: 41, notes: [53, 57, 60] },
      { bass: 43, notes: [55, 59, 62] }
    ],
    melody: [
      [[0, 72, 2, .08], [4, 76, 2, .08], [8, 79, 2, .08], [12, 76, 2, .07]],
      [[0, 69, 2, .08], [4, 72, 2, .08], [8, 76, 2, .08], [12, 72, 2, .07]],
      [[0, 65, 2, .08], [4, 69, 2, .08], [8, 72, 2, .08], [12, 69, 2, .07]],
      [[0, 67, 2, .08], [4, 71, 2, .08], [8, 74, 2, .08], [12, 79, 2, .08]]
    ],
    bass: [[0, 0, 2, .09], [4, 0, 2, .08], [6, 12, 2, .07], [8, 0, 2, .09], [12, 7, 2, .08], [14, 12, 2, .07]],
    comp: { style: "chip", pattern: [[4, 1, .012], [12, 1, .012]] },
    arp: { style: "bell", steps: [0, 2, 4, 6, 8, 10, 12, 14], notes: [0, 1, 2, 3, 2, 1, 2, 1], octave: 12, volume: .012, dur: 1.2 },
    drums: { kick: [0, 8], kickVol: .4, snare: [4, 12], snareVol: .025, hat: [2, 6, 10, 14], hatVol: .008 },
    lead: "pluck"
  },
  slots: {
    tempo: 140, bars: 8,
    chords: [
      { bass: 40, notes: [52, 56, 59] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 47, notes: [59, 63, 66] },
      { bass: 40, notes: [52, 56, 59] },
      { bass: 49, notes: [61, 64, 68] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 47, notes: [59, 63, 66] },
      { bass: 40, notes: [52, 56, 59] }
    ],
    melody: [
      [[0, 76, 2, .10], [4, 80, 2, .09], [8, 83, 2, .10], [12, 80, 2, .09]],
      [[0, 81, 2, .10], [4, 85, 2, .09], [8, 88, 2, .10], [12, 85, 2, .09]],
      [[0, 83, 2, .10], [4, 87, 2, .09], [8, 90, 2, .10], [12, 87, 2, .09]],
      [[0, 88, 2, .10], [4, 83, 2, .09], [8, 80, 2, .10], [12, 76, 2, .09]],
      [[0, 85, 2, .10], [4, 80, 2, .09], [8, 76, 2, .10], [12, 80, 2, .09]],
      [[0, 81, 2, .10], [4, 76, 2, .09], [8, 73, 2, .10], [12, 76, 2, .09]],
      [[0, 83, 2, .10], [4, 78, 2, .09], [8, 75, 2, .10], [12, 78, 2, .09]],
      [[0, 88, 2, .10], [4, 83, 2, .09], [8, 80, 2, .10], [12, 76, 2, .09]]
    ],
    bass: [[0, 0, 2, .10], [2, 0, 1, .06], [4, 0, 2, .09], [6, 7, 2, .07], [8, 0, 2, .10], [10, 0, 1, .06], [12, 7, 2, .08], [14, 12, 2, .07]],
    comp: { style: "chip", pattern: [[4, 1, .015], [12, 1, .015]] },
    arp: { style: "bell", steps: [2, 6, 10, 14], notes: [0, 1, 2, 1], octave: 12, volume: .012 },
    drums: { kick: [0, 4, 8, 12], kickVol: .35, snare: [4, 12], snareVol: .026, hat: [2, 6, 10, 14], hatVol: .008 },
    lead: "bell"
  },
  horses: {
    tempo: 150, bars: 8,
    chords: [
      { bass: 45, notes: [57, 61, 64] },
      { bass: 50, notes: [62, 66, 69] },
      { bass: 52, notes: [64, 68, 71] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 45, notes: [57, 61, 64] },
      { bass: 50, notes: [62, 66, 69] },
      { bass: 52, notes: [64, 68, 71] },
      { bass: 45, notes: [57, 61, 64] }
    ],
    melody: [
      [[0, 69, 2, .10], [4, 73, 2, .09], [8, 76, 2, .10], [12, 81, 2, .10]],
      [[0, 74, 2, .10], [4, 78, 2, .09], [8, 81, 2, .10], [12, 78, 2, .09]],
      [[0, 76, 2, .10], [4, 80, 2, .09], [8, 83, 2, .10], [12, 80, 2, .09]],
      [[0, 81, 2, .10], [4, 76, 2, .09], [8, 73, 2, .10], [12, 69, 2, .09]],
      [[0, 69, 2, .10], [4, 76, 2, .09], [8, 81, 2, .10], [12, 85, 2, .10]],
      [[0, 74, 2, .10], [4, 81, 2, .09], [8, 86, 2, .10], [12, 81, 2, .09]],
      [[0, 76, 2, .10], [4, 83, 2, .09], [8, 88, 2, .10], [12, 83, 2, .09]],
      [[0, 81, 2, .10], [4, 76, 2, .09], [8, 73, 2, .10], [12, 69, 2, .09]]
    ],
    bass: [[0, 0, 2, .11], [2, 0, 1, .08], [4, 7, 2, .10], [6, 0, 1, .08], [8, 0, 2, .11], [10, 0, 1, .08], [12, 7, 2, .10], [14, 12, 2, .09]],
    comp: { style: "pluck", pattern: [[0, 2, .018], [8, 2, .018]] },
    drums: { kick: [0, 4, 8, 12], kickVol: .4, snare: [4, 12], snareVol: .03, hat: [2, 6, 10, 14], hatVol: .01, rim: [6, 14], rimVol: .014 },
    lead: "pluck"
  }
};

/* The lobby track: an original breezy bossa-nova loop for piano and brushes. */
const LOBBY_TEMPO = 116;
const LOBBY_STEP_TIME = 60 / LOBBY_TEMPO / 4;
const LOBBY_LOOP_STEPS = 128;
const LOBBY_CHORDS = [
  { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { bass: 38, notes: [50, 53, 57, 60] }, // Dm7
  { bass: 43, notes: [55, 58, 62, 65] }, // Gm7
  { bass: 36, notes: [48, 52, 55, 58] }, // C7
  { bass: 45, notes: [57, 60, 64, 67] }, // Am7
  { bass: 38, notes: [50, 54, 57, 60] }, // D7
  { bass: 43, notes: [55, 58, 62, 65] }, // Gm7
  { bass: 36, notes: [48, 52, 55, 58] }  // C7
];
const LOBBY_MELODY = [
  [[0, 69], [3, 72], [6, 76], [10, 74], [12, 72]],
  [[0, 69], [4, 65], [6, 69], [10, 72], [14, 69]],
  [[0, 70], [3, 74], [6, 77], [10, 74], [12, 70]],
  [[0, 67], [4, 70], [6, 76], [10, 74], [14, 70]],
  [[0, 69], [3, 72], [6, 76], [10, 79], [12, 76]],
  [[0, 78], [4, 76], [6, 74], [10, 69], [14, 74]],
  [[0, 70], [3, 74], [6, 79], [10, 77], [12, 74]],
  [[0, 76], [4, 72], [6, 70], [10, 67], [14, 72]]
];
const LOBBY_COMP = [0, 6, 8, 14];

/* The back room track: slow, sparse, industrial and deliberately uncomfortable. */
const BACKROOM_TEMPO = 68;
const BACKROOM_STEP_TIME = 60 / BACKROOM_TEMPO / 4;
const BACKROOM_LOOP_STEPS = 64;
const BACKROOM_CHORDS = [
  { bass: 38, notes: [50, 53, 57] }, // D minor
  { bass: 39, notes: [51, 55, 58] }, // E-flat major
  { bass: 38, notes: [50, 53, 57] }, // D minor
  { bass: 34, notes: [46, 50, 53] }  // B-flat major
];
const BACKROOM_MOTIF = [
  [62, 65],
  [63, 67],
  [62, 65],
  [58, 62]
];
const musicFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

function musicEnabled() {
  return !!state && state.sound !== false && state.music !== false && !document.hidden;
}

function desiredMusicTrack() {
  if (!ui) return "lobby";
  if (ui.view === "backroom") return "backroom";
  if (ui.view === "game") {
    return ui.game && GAME_TRACKS[ui.game] ? `game:${ui.game}` : "arcade";
  }
  return "lobby";
}

function gameTrackConfig() {
  if (typeof musicTrack !== "string" || !musicTrack.startsWith("game:")) return null;
  return GAME_TRACKS[musicTrack.slice(5)] || null;
}

function musicStepDuration() {
  const cfg = gameTrackConfig();
  if (cfg) return 60 / cfg.tempo / 4;
  if (musicTrack === "backroom") return BACKROOM_STEP_TIME;
  if (musicTrack === "lobby") return LOBBY_STEP_TIME;
  return MUSIC_STEP_TIME;
}

function musicLoopLength() {
  const cfg = gameTrackConfig();
  if (cfg) return cfg.bars * (cfg.stepsPerBar || 16);
  if (musicTrack === "backroom") return BACKROOM_LOOP_STEPS;
  if (musicTrack === "lobby") return LOBBY_LOOP_STEPS;
  return MUSIC_LOOP_STEPS;
}

function musicTargetVolume() {
  const cfg = gameTrackConfig();
  if (cfg) return 0.1;
  if (musicTrack === "backroom") return 0.095;
  if (musicTrack === "lobby") return 0.105;
  return 0.11;
}

function syncMusic() {
  if (!musicEnabled()) {
    stopMusic();
    return;
  }
  const want = desiredMusicTrack();
  if (!musicTimer) {
    startMusic();
    return;
  }
  if (musicTrack !== want) switchMusicTrack(want);
}

function switchMusicTrack(track) {
  musicTrack = track;
  musicStep = 0;
  if (!audioCtx || !musicGainNode) return;
  const now = audioCtx.currentTime;
  const gain = musicGainNode.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.max(0.0001, gain.value), now);
  gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  gain.exponentialRampToValueAtTime(musicTargetVolume(), now + 0.85);
  musicNextTime = now + 0.22;
}

function startMusic() {
  if (!musicEnabled()) return;
  if (musicTimer) {
    syncMusic();
    return;
  }
  const ctx = ensureAudio();
  if (!ctx) return;

  if (!musicGainNode) {
    musicGainNode = ctx.createGain();
    musicGainNode.gain.value = 0.0001;
    musicGainNode.connect(ctx.destination);
  }
  musicTrack = desiredMusicTrack();
  const now = ctx.currentTime;
  musicGainNode.gain.cancelScheduledValues(now);
  musicGainNode.gain.setValueAtTime(Math.max(0.0001, musicGainNode.gain.value), now);
  musicGainNode.gain.exponentialRampToValueAtTime(musicTargetVolume(), now + 0.9);

  musicStep = 0;
  musicNextTime = now + 0.06;
  musicTimer = setInterval(scheduleMusic, 25);
  scheduleMusic();
}

function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGainNode && audioCtx) {
    const now = audioCtx.currentTime;
    musicGainNode.gain.cancelScheduledValues(now);
    musicGainNode.gain.setValueAtTime(Math.max(0.0001, musicGainNode.gain.value), now);
    musicGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  }
}

function scheduleMusic() {
  const ctx = audioCtx;
  if (!ctx || !musicTimer) return;
  if (!musicEnabled()) {
    stopMusic();
    return;
  }
  if (ctx.state !== "running") {
    musicNextTime = ctx.currentTime + 0.05;
    return;
  }

  while (musicNextTime < ctx.currentTime + 0.12) {
    playMusicStep(musicStep, musicNextTime, ctx);
    musicStep = (musicStep + 1) % musicLoopLength();
    musicNextTime += musicStepDuration();
  }
}

function playMusicStep(step, when, ctx) {
  if (!musicGainNode) return;
  const cfg = gameTrackConfig();
  if (cfg) {
    playGameStep(step, when, ctx, cfg);
    return;
  }
  if (musicTrack === "backroom") {
    playBackroomStep(step, when, ctx);
    return;
  }
  if (musicTrack === "lobby") {
    playLobbyStep(step, when, ctx);
    return;
  }
  const chord = MUSIC_CHORDS[Math.floor(step / 16) % 4];
  const inBar = step % 16;

  // Bouncy bass on eighth notes.
  if (inBar % 2 === 0) {
    const octave = MUSIC_BASS_PATTERN[inBar / 2];
    musicTone(ctx, chord.bass + 12 + octave, when, MUSIC_STEP_TIME * 1.7, "square", 0.12);
  }

  // The main hook.
  if (inBar % 2 === 0) {
    const lead = MUSIC_LEAD[Math.floor(step / 2) % MUSIC_LEAD.length];
    musicTone(ctx, lead, when, MUSIC_STEP_TIME * 1.8, "square", 0.15);
  }

  // Sparkling arpeggio underneath.
  musicTone(ctx, chord.notes[inBar % 3] + 12, when, MUSIC_STEP_TIME * 0.72, "triangle", 0.045);

  // Kick, snare and hi-hat.
  if (inBar === 0 || inBar === 8) musicKick(ctx, when);
  if (inBar === 4 || inBar === 12) musicNoise(ctx, when, 0.11, 0.07, 1800);
  if (inBar % 2 === 0) musicNoise(ctx, when, 0.035, 0.018, 6200);
}

function playLobbyStep(step, when, ctx) {
  const chord = LOBBY_CHORDS[Math.floor(step / 16) % 8];
  const inBar = step % 16;

  // A high, faint chord tone and room hum keep the loop feeling slightly unreal.
  if (inBar === 0) {
    musicShimmer(ctx, chord.notes[3] + 12, when, LOBBY_STEP_TIME * 15, 0.016);
    musicRumble(ctx, when, LOBBY_STEP_TIME * 15, 0.006);
  }

  // Soft upright bass: root on the downbeats, fifth on the syncopations.
  if (inBar === 0 || inBar === 8) musicBass(ctx, chord.bass + 12, when, LOBBY_STEP_TIME * 2.7, 0.105);
  if (inBar === 6 || inBar === 14) musicBass(ctx, chord.bass + 7, when, LOBBY_STEP_TIME * 1.9, 0.085);

  // Bossa-nova piano comping.
  if (LOBBY_COMP.includes(inBar)) {
    musicPianoChord(ctx, chord.notes, when, LOBBY_STEP_TIME * 3.4, 0.03);
  }

  // The solo piano line.
  const hit = LOBBY_MELODY[Math.floor(step / 16) % 8].find(([at]) => at === inBar);
  if (hit) {
    const duration = hit[0] === 0 ? LOBBY_STEP_TIME * 7 : LOBBY_STEP_TIME * 4;
    musicPiano(ctx, hit[1], when, duration, 0.12);
  }

  // Brushed bossa percussion.
  if (inBar === 0 || inBar === 8) musicKick(ctx, when, 0.55);
  if (inBar === 4 || inBar === 12) musicNoise(ctx, when, 0.09, 0.04, 1800);
  if (inBar % 2 === 0) musicNoise(ctx, when, 0.03, 0.011, 7200);
}

function playBackroomStep(step, when, ctx) {
  const chord = BACKROOM_CHORDS[Math.floor(step / 16) % 4];
  const inBar = step % 16;

  // A low, breathing drone underneath the whole bar.
  if (inBar === 0) {
    musicDrone(ctx, chord.bass, when, BACKROOM_STEP_TIME * 15.5, 0.2);
    musicRumble(ctx, when, BACKROOM_STEP_TIME * 15.5, 0.024);
  }

  // Sparse quarter-note bass, soft enough to feel like it is behind a wall.
  if (inBar % 4 === 0) {
    const octave = inBar === 8 ? 12 : 0;
    musicBass(ctx, chord.bass + 12 + octave, when, BACKROOM_STEP_TIME * 1.9, 0.14);
  }

  // Two distant notes per bar. Never quite a melody.
  if (inBar === 6 || inBar === 14) {
    const phrase = BACKROOM_MOTIF[Math.floor(step / 16) % 4];
    musicTone(ctx, phrase[inBar === 6 ? 0 : 1], when, BACKROOM_STEP_TIME * 4.2, "triangle", 0.055);
  }

  // Industrial pulse and metal.
  if (inBar === 0 || inBar === 8) musicThud(ctx, when);
  if (inBar === 10) musicClank(ctx, when);
  if (inBar === 4 || inBar === 12) musicNoise(ctx, when, 0.05, 0.018, 4200);
}

/* A compact sequencer shared by every cabinet theme. */
function playGameStep(step, when, ctx, cfg) {
  const stepsPerBar = cfg.stepsPerBar || 16;
  const stepTime = 60 / cfg.tempo / 4;
  const bar = Math.floor(step / stepsPerBar) % cfg.chords.length;
  const inBar = step % stepsPerBar;
  const chord = cfg.chords[bar];

  if (cfg.drone && inBar === 0) {
    musicDrone(ctx, chord.bass + 12, when, stepTime * (stepsPerBar - 0.5), cfg.drone.volume);
  }

  if (cfg.bass) {
    cfg.bass.forEach(([at, offset, dur, vol]) => {
      if (at === inBar) musicBass(ctx, chord.bass + 12 + offset, when, stepTime * dur, vol);
    });
  }

  if (cfg.comp) {
    cfg.comp.pattern.forEach(([at, dur, vol]) => {
      if (at === inBar) playGameComp(ctx, cfg.comp.style, chord.notes, when, stepTime * dur, vol);
    });
  }

  if (cfg.arp) {
    const idx = cfg.arp.steps.indexOf(inBar);
    if (idx >= 0) {
      const picks = cfg.arp.notes;
      const note = chord.notes[picks[idx % picks.length] % chord.notes.length];
      playGameLead(ctx, cfg.arp.style, note + (cfg.arp.octave || 0), when, stepTime * (cfg.arp.dur || 1), cfg.arp.volume);
    }
  }

  (cfg.melody[bar] || []).forEach(([at, midi, dur, vol]) => {
    if (at === inBar) playGameLead(ctx, cfg.lead, midi, when, stepTime * dur, vol);
  });

  if (cfg.drums) playGameDrums(ctx, cfg.drums, inBar, when);
}

function playGameComp(ctx, style, notes, when, duration, volume) {
  if (style === "piano") {
    musicPianoChord(ctx, notes, when, duration, volume);
    return;
  }
  if (style === "pluck") {
    notes.forEach((note, index) => playGameLead(ctx, "pluck", note, when + index * 0.01, duration, volume));
    return;
  }
  // Default: a thin chip stab on the root and third.
  playGameLead(ctx, "chip", notes[0], when, duration, volume);
  if (notes[1] != null) playGameLead(ctx, "chip", notes[1], when, duration, volume * 0.8);
}

function playGameLead(ctx, style, midi, when, duration, volume) {
  if (style === "piano") musicPiano(ctx, midi, when, duration, volume);
  else if (style === "bell") musicBell(ctx, midi, when, duration, volume);
  else if (style === "pluck") musicPluck(ctx, midi, when, duration, volume);
  else musicTone(ctx, midi, when, duration, "square", volume);
}

function playGameDrums(ctx, d, inBar, when) {
  if (d.kick && d.kick.includes(inBar)) musicKick(ctx, when, (d.kickVol || 0.32) / 0.32);
  if (d.snare && d.snare.includes(inBar)) musicNoise(ctx, when, 0.1, d.snareVol || 0.025, d.snareCut || 1800);
  if (d.hat && d.hat.includes(inBar)) musicNoise(ctx, when, 0.03, d.hatVol || 0.008, 7200);
  if (d.rim && d.rim.includes(inBar)) musicNoise(ctx, when, 0.05, d.rimVol || 0.014, 2600);
}

function musicDrone(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(230, when);
  filter.frequency.linearRampToValueAtTime(130, when + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(volume, when + 0.7);
  env.gain.setValueAtTime(volume, when + duration - 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  filter.connect(env).connect(musicGainNode);

  [-5, 5].forEach(detune => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(musicFreq(midi), when);
    osc.detune.setValueAtTime(detune, when);
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  });
}

function musicBass(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(musicFreq(midi), when);
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.7;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(filter).connect(env).connect(musicGainNode);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function musicPiano(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const freq = musicFreq(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  filter.connect(env).connect(musicGainNode);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, when);
  osc.connect(filter);
  osc.start(when);
  osc.stop(when + duration + 0.02);

  const overtone = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  overtone.type = "sine";
  overtone.frequency.setValueAtTime(freq * 2, when);
  overtoneGain.gain.value = 0.28;
  overtone.connect(overtoneGain).connect(filter);
  overtone.start(when);
  overtone.stop(when + duration * 0.7);
}

function musicPianoChord(ctx, notes, when, duration, volume) {
  notes.forEach((note, index) => {
    musicPiano(ctx, note, when + index * 0.012, duration, volume);
  });
}

function musicPluck(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2600, when);
  filter.frequency.exponentialRampToValueAtTime(700, when + Math.max(0.05, duration));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(musicFreq(midi), when);
  osc.connect(filter).connect(env).connect(musicGainNode);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function musicBell(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const freq = musicFreq(midi);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  env.connect(musicGainNode);
  [[1, 1], [2.01, 0.4], [3.01, 0.16]].forEach(([mult, amp]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, when);
    gain.gain.value = amp;
    osc.connect(gain).connect(env);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  });
}

function musicShimmer(ctx, midi, when, duration, volume) {
  if (!musicGainNode) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(volume, when + 0.45);
  env.gain.setValueAtTime(volume, when + duration - 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  filter.connect(env).connect(musicGainNode);

  [-4, 4].forEach(detune => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(musicFreq(midi), when);
    osc.detune.setValueAtTime(detune, when);
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  });
}

function musicRumble(ctx, when, duration, volume) {
  if (!musicGainNode) return;
  const src = ctx.createBufferSource();
  src.buffer = getMusicNoiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 160;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(volume, when + 0.8);
  env.gain.setValueAtTime(volume, when + duration - 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(filter).connect(env).connect(musicGainNode);
  src.start(when);
  src.stop(when + duration + 0.02);
}

function musicThud(ctx, when) {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(74, when);
  osc.frequency.exponentialRampToValueAtTime(28, when + 0.35);
  env.gain.setValueAtTime(0.28, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.48);
  osc.connect(env).connect(musicGainNode);
  osc.start(when);
  osc.stop(when + 0.52);
  musicNoise(ctx, when, 0.06, 0.04, 900);
}

function musicClank(ctx, when) {
  if (!musicGainNode) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1150;
  filter.Q.value = 1.1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.075, when + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
  filter.connect(env).connect(musicGainNode);
  [317, 463, 719].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    osc.detune.setValueAtTime(i % 2 ? 7 : -7, when);
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + 0.46);
  });
}

function getMusicNoiseBuffer(ctx) {
  if (!musicNoiseBuffer) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    musicNoiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = musicNoiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return musicNoiseBuffer;
}

function musicTone(ctx, midi, when, duration, type, volume) {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(musicFreq(midi), when);
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(env).connect(musicGainNode);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function musicKick(ctx, when, scale = 1) {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(155, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.13);
  env.gain.setValueAtTime(0.32 * scale, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
  osc.connect(env).connect(musicGainNode);
  osc.start(when);
  osc.stop(when + 0.19);
}

function musicNoise(ctx, when, duration, volume, cutoff) {
  if (!musicGainNode) return;
  const src = ctx.createBufferSource();
  src.buffer = getMusicNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = cutoff;
  const env = ctx.createGain();
  env.gain.setValueAtTime(volume, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(filter).connect(env).connect(musicGainNode);
  src.start(when);
  src.stop(when + duration + 0.01);
}

function tone(freq, duration = 0.08, type = "square", volume = 0.035, endFreq = null, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noise(duration = 0.12, volume = 0.04, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1900;
  src.buffer = buffer;
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}

function sfx(name, scale = 1) {
  if (!state || state.sound === false) return;
  const v = clamp(scale, 0.1, 1.4);
  switch (name) {
    case "click":
      tone(240, 0.035, "square", 0.022 * v, 180);
      break;
    case "tick":
      tone(780, 0.025, "square", 0.014 * v, 640);
      break;
    case "coin":
      tone(900, 0.06, "square", 0.028 * v);
      tone(1350, 0.09, "square", 0.024 * v, null, 0.05);
      break;
    case "deal":
      noise(0.055, 0.028 * v);
      tone(340, 0.045, "square", 0.018 * v, 240);
      break;
    case "win":
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, "square", 0.035 * v, null, i * 0.075));
      break;
    case "jackpot":
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.16, "square", 0.04 * v, null, i * 0.095));
      noise(0.2, 0.02 * v, 0.1);
      break;
    case "lose":
      [330, 277, 220, 165].forEach((f, i) => tone(f, 0.13, "sawtooth", 0.028 * v, f * 0.86, i * 0.11));
      break;
    case "push":
      tone(420, 0.09, "triangle", 0.03 * v);
      tone(420, 0.09, "triangle", 0.022 * v, null, 0.1);
      break;
    case "spin":
      for (let i = 0; i < 7; i++) tone(310 + i * 55, 0.045, "square", 0.018 * v, null, i * 0.055);
      break;
    case "slot":
      [220, 350, 500, 720].forEach((f, i) => tone(f, 0.06, "square", 0.02 * v, null, i * 0.06));
      break;
    case "bang":
      noise(0.55, 0.16 * v);
      tone(92, 0.45, "sawtooth", 0.11 * v, 35);
      tone(48, 0.5, "sine", 0.09 * v, 28, 0.02);
      break;
    case "empty":
      tone(1300, 0.025, "square", 0.028 * v, 900);
      tone(350, 0.04, "square", 0.02 * v, 220, 0.035);
      break;
    case "revolver":
      for (let i = 0; i < 5; i++) tone(880 - i * 60, 0.022, "square", 0.018 * v, 600, i * 0.055);
      break;
    case "sleep":
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, "triangle", 0.022 * v, null, i * 0.16));
      break;
    case "upgrade":
      [440, 554, 659, 880, 1108].forEach((f, i) => tone(f, 0.12, "square", 0.032 * v, null, i * 0.07));
      break;
    case "hoof":
      tone(110, 0.035, "square", 0.012 * v, 70);
      break;
    case "prestige":
      [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.22, "square", 0.04 * v, null, i * 0.11));
      break;
    case "error":
      tone(155, 0.16, "sawtooth", 0.03 * v, 110);
      break;
    default:
      tone(320, 0.04, "square", 0.018 * v);
  }
}

function toggleSound() {
  state.sound = !state.sound;
  if (!state.sound) stopMusic();
  saveState();
  if (state.sound) {
    sfx("coin");
    startMusic();
  }
  renderHUD();
}

function toggleMusic() {
  state.music = !state.music;
  if (state.music) startMusic();
  else stopMusic();
  saveState();
  if (state.sound) sfx("click", 0.7);
  renderHUD();
}

/* ------------------------------------------------------------
   Tiny UI feedback helpers
   ------------------------------------------------------------ */
function toast(message, type = "info") {
  const layer = document.getElementById("toastLayer");
  if (!layer) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  layer.appendChild(el);
  while (layer.children.length > 3) layer.removeChild(layer.firstElementChild);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3700);
}

function floatCash(amount) {
  const value = Math.round(amount);
  if (!value) return;
  const el = document.createElement("div");
  el.className = `float-cash${value < 0 ? " loss" : ""}`;
  el.textContent = `${value > 0 ? "+" : "−"}$${Math.abs(value).toLocaleString("en-US")}`;
  el.style.left = `${clamp(window.innerWidth / 2 + randInt(-95, 95), 24, window.innerWidth - 120)}px`;
  el.style.top = `${clamp(window.innerHeight * 0.29 + randInt(-20, 20), 90, window.innerHeight - 120)}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
