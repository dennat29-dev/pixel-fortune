/* ============================================================
   PIXEL FORTUNE — startup, action routing, keyboard and debug API
   ============================================================ */

const ACTIONS = {
  "go-lobby": () => navigate("lobby"),
  "go-shop": () => navigate("shop"),
  "go-backroom": () => navigate("backroom"),
  "open-game": el => navigate("game", el.dataset.game),
  "toggle-sound": () => toggleSound(),
  "toggle-music": () => toggleMusic(),
  "show-help": () => showHelp(),
  "close-modal": () => closeModal(),
  "quick-play": () => quickPlay(),
  "bet-up": () => adjustBet(1),
  "bet-down": () => adjustBet(-1),
  "bet-chip": el => applyBetChip(el.dataset.value),
  "play": () => playCurrentGame(),
  "coin-choice": el => setCoinChoice(el.dataset.choice),
  "dice-choice": el => setDiceChoice(el.dataset.choice),
  "roulette-bet": el => setRouletteBet(el.dataset.bet, Number(el.dataset.number)),
  "bj-hit": () => bjHit(),
  "bj-stand": () => bjStand(),
  "bj-double": () => bjDouble(),
  "holdem-showdown": () => holdemShowdown(),
  "holdem-fold": () => holdemFold(),
  "horses-pick": el => setHorsePick(el.dataset.index),
  "buy-upgrade": el => buyUpgrade(el.dataset.upgrade),
  "pay-debt": el => payDebt(el.dataset.id),
  "pay-all-debts": () => payAllDebts(),
  "hustle": () => doHustle(),
  "sleep": () => doSleep(),
  "restart-run": () => restartRun(),
  "russian-pull": () => russianPull(),
  "russian-cashout": () => cashOutRussian()
};

function onDocumentClick(event) {
  const el = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
  if (!el) return;
  if (el.disabled) return;
  const handler = ACTIONS[el.dataset.action];
  if (!handler) return;
  event.preventDefault();
  ensureAudio();
  handler(el);
}

function onDocumentKeydown(event) {
  const modal = $("#modalLayer");
  const modalOpen = !!(modal && modal.classList.contains("open"));

  if (event.key === "Escape") {
    if (modalOpen) {
      closeModal();
      return;
    }
    if (ui.view !== "lobby" && !ui.busy) navigate("lobby");
    return;
  }

  if (modalOpen || !state || state.gameOver || ui.sleeping) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;

  if ((event.key === " " || event.key === "Enter") && ui.view === "game") {
    const onButton = event.target && event.target.closest && event.target.closest("button");
    if (onButton) return;
    event.preventDefault();
    playCurrentGame();
    return;
  }

  const number = Number(event.key);
  if (Number.isInteger(number) && number >= 1 && number <= GAMES.length) {
    navigate("game", GAMES[number - 1].id);
  }
}

function init() {
  state = loadState();
  resetUI();
  injectStaticIcons();
  lastCashShown = null;
  updatePrestigeExpiry();
  renderAll();

  if (state.prestigeWin > 0) {
    showPrestigeWin(state.prestigeWin);
  } else if (state.gameOver) {
    showGameOver(state.gameOverReason || "The run ended. The house is patient.");
  } else {
    checkPrestigeUnlock();
  }

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);

  const modalLayer = $("#modalLayer");
  if (modalLayer) {
    modalLayer.addEventListener("click", event => {
      if (event.target === modalLayer) closeModal();
    });
  }

  window.addEventListener("beforeunload", saveState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveState();
      stopMusic();
    } else {
      startMusic();
    }
  });

  // Browsers only allow audio after a user gesture.
  ["click", "keydown"].forEach(type => {
    document.addEventListener(type, startMusic, { once: true, passive: true });
  });
}

/* ------------------------------------------------------------
   Debug / testing surface
   ------------------------------------------------------------ */
function installDebugAPI() {
  window.PF = {
    save: saveState,
    reload() {
      state = loadState();
      resetUI();
      lastCashShown = null;
      renderAll();
    },
    resetSave() {
      try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
      state = makeState();
      resetUI();
      lastCashShown = null;
      renderAll();
      toast("Save wiped. Fresh run.", "gold");
    },
    addCash(amount = 1000) {
      state.cash = Math.max(0, state.cash + Math.round(Number(amount) || 0));
      state.stats.bestCash = Math.max(state.stats.bestCash, state.cash);
      saveState();
      renderAll();
      checkPrestigeUnlock();
    },
    setCash(amount = 1000) {
      state.cash = Math.max(0, Math.round(Number(amount) || 0));
      state.stats.bestCash = Math.max(state.stats.bestCash, state.cash);
      saveState();
      renderAll();
      checkPrestigeUnlock();
    },
    setEnergy(amount = 20) {
      state.energy = clamp(Math.round(Number(amount) || 0), 0, maxEnergy());
      saveState();
      renderAll();
    },
    setDay(day = 1) {
      state.day = Math.max(1, Math.round(Number(day) || 1));
      state.stats.daysSurvived = Math.max(state.stats.daysSurvived, state.day);
      saveState();
      renderAll();
    },
    addStars(amount = 1) {
      state.prestige.stars = Math.max(0, (state.prestige.stars || 0) + Math.round(Number(amount) || 0));
      state.energy = maxEnergy();
      saveState();
      renderAll();
    },
    unlockBackroom() {
      state.prestigeUnlocked = true;
      state.offerExpired = false;
      saveState();
      renderAll();
      toast("Back room unlocked (debug).", "purple");
    },
    clearDebts() {
      state.debts = [];
      saveState();
      renderAll();
      toast("Debts cleared (debug).", "gold");
    },
    levelUp(key) {
      if (!UPGRADE_TYPES[key]) return;
      state.upgradeLevels[key] = clamp((state.upgradeLevels[key] || 0) + 1, 0, UPGRADE_TYPES[key].max);
      if (key === "energy") state.energy = maxEnergy();
      saveState();
      renderAll();
    },
    bust() {
      state.cash = 0;
      showGameOver("Debug bust. The house collected.");
    },
    sleep: () => doSleep(),
    openGame: id => navigate("game", id)
  };

  Object.defineProperty(window.PF, "state", { get: () => state });
  Object.defineProperty(window.PF, "ui", { get: () => ui });
}

installDebugAPI();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
