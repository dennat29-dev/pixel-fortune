/* ============================================================
   GAMBLER'S FORTUNE — UI rendering, navigation and economy flows
   ============================================================ */

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */
function signedMoney(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US")}`;
}

function dueLabel(note) {
  const days = note.dueDay - state.day;
  if (days < 0) return "OVERDUE";
  if (days === 0) return "DUE TODAY";
  return `DUE IN ${days} DAY${days === 1 ? "" : "S"}`;
}

function injectStaticIcons() {
  $$("[data-icon]").forEach(el => {
    el.innerHTML = sprite(el.dataset.icon);
  });
}

function renderHUD() {
  if (!state) return;

  const cashEl = $("#cashValue");
  if (cashEl) {
    cashEl.textContent = fmt(state.cash);
    if (lastCashShown !== null && lastCashShown !== state.cash) {
      const stat = cashEl.closest(".stat");
      if (stat) {
        stat.classList.remove("cash-pop");
        void stat.offsetWidth;
        stat.classList.add("cash-pop");
      }
    }
  }
  lastCashShown = state.cash;

  const energyEl = $("#energyValue");
  if (energyEl) energyEl.textContent = `${state.energy} / ${maxEnergy()}`;

  const energyFill = $("#energyFill");
  if (energyFill) energyFill.style.width = `${clamp((state.energy / maxEnergy()) * 100, 0, 100)}%`;

  const dayEl = $("#dayValue");
  if (dayEl) dayEl.textContent = String(state.day);

  const debtEl = $("#debtValue");
  if (debtEl) debtEl.textContent = fmt(totalDebt());

  const debtStat = $("#debtStat");
  if (debtStat) debtStat.classList.toggle("urgent", dueDebts().length > 0);

  const musicBtn = $("#musicBtn");
  if (musicBtn) {
    musicBtn.classList.toggle("muted", !state.music);
    musicBtn.setAttribute("aria-pressed", String(!!state.music));
    musicBtn.title = state.music ? "Music on — click to mute" : "Music off — click to play";
  }

  const soundBtn = $("#soundBtn");
  if (soundBtn) {
    soundBtn.textContent = state.sound ? "♪" : "×";
    soundBtn.classList.toggle("muted", !state.sound);
    soundBtn.setAttribute("aria-pressed", String(!!state.sound));
    soundBtn.title = state.sound ? "Sound effects on — click to mute" : "Sound effects off — click to unmute";
  }

  const backroomBtn = $("#backroomBtn");
  if (backroomBtn) backroomBtn.classList.toggle("unlocked", !!state.prestigeUnlocked);

  const backroomSub = $("#backroomSub");
  if (backroomSub) {
    backroomSub.textContent = state.prestigeUnlocked
      ? "Russian roulette — open"
      : state.offerExpired
        ? "Offer expired this run"
        : `Unlock at ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY}`;
  }

  const backroomState = $("#backroomState");
  if (backroomState) backroomState.textContent = state.prestigeUnlocked ? "▸" : state.offerExpired ? "✕" : "🔒";

  const prestigeMini = $("#prestigeMini");
  if (prestigeMini) {
    const stars = state.prestige.stars || 0;
    const blurb = state.prestigeUnlocked
      ? "The back room is open. Stars wait inside."
      : state.offerExpired
        ? "This run's back-room offer expired. Prestige stars carry to the next run."
        : `Reach ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY} to open the back room.`;
    prestigeMini.innerHTML = `<b>PRESTIGE ★ ${stars}</b>${blurb}`;
  }

  const vaultSub = $("#vaultSub");
  if (vaultSub && profile) vaultSub.textContent = `${tokensLabel(profile.tokens)} • ${unlockedCount()}/${totalVaultItems()} owned`;
  const trophiesSub = $("#trophiesSub");
  if (trophiesSub && profile) {
    const a = achievementStats();
    trophiesSub.textContent = `${a.unlocked}/${a.total} • ${tierFor(totalStars()).name}`;
  }

  renderProfileChip();
}

function renderProfileChip() {
  const chip = $("#profileChip");
  if (!chip || !profile) return;
  const prog = levelProgress();
  const tier = tierFor(totalStars());
  const next = nextTierFor(totalStars());
  chip.innerHTML = `
    <span class="pc-avatar">${avatarSVG(profile.equipped?.skin)}</span>
    <span class="pc-copy">
      <span class="pc-top"><b>LV ${prog.level}</b><span class="pc-tier" style="color:${tier.color}">${tier.name}</span></span>
      <span class="pc-bar"><i style="width:${Math.round(prog.pct * 100)}%"></i></span>
      <span class="pc-bottom"><span class="pc-tokens">${tokensLabel(profile.tokens)}</span><span class="pc-stars">★ ${totalStars()}</span></span>
    </span>`;
  chip.title = next
    ? `${tier.name} • ${prog.into}/${prog.span} XP to LV ${prog.level + 1} • ${next.stars - totalStars()}★ to ${next.name}`
    : `${tier.name} • top tier reached`;
  chip.setAttribute("aria-label", `Profile level ${prog.level}, ${profile.tokens} tokens`);
}

function renderNav() {
  const nav = $("#cabinetNav");
  if (!nav) return;
  nav.innerHTML = GAMES.map(g => {
    const active = ui.view === "game" && ui.game === g.id;
    return `<button class="cabinet-btn ${active ? "active" : ""}" data-action="open-game" data-game="${g.id}" title="${g.name}">
      <span class="cab-icon">${sprite(g.sprite)}</span>
      <span class="cab-info">
        <span class="cab-name">${g.name}</span>
        <span class="cab-meta">${fmt(g.minBet)} MIN • ${g.energy}⚡</span>
      </span>
      <span class="cab-arrow">▸</span>
    </button>`;
  }).join("");
}

function renderTicker() {
  const track = $("#tickerTrack");
  if (!track) return;
  const next = nextDebt();
  const played = state.stats.played || 0;
  const rate = played ? Math.round((state.stats.wins / played) * 100) : 0;
  const bits = [
    `DAY <b>${state.day}</b> ON THE FLOOR`,
    `CASH <b>${fmt(state.cash)}</b> IN HAND`,
    next ? `NEXT BILL <b>${fmt(next.amount)}</b> DUE DAY <b>${next.dueDay}</b>` : "NO OUTSTANDING BILLS",
    `ENERGY <b>${state.energy}/${maxEnergy()}</b>`,
    `WIN RATE <b>${rate}%</b>`,
    `PRESTIGE STARS <b>${state.prestige.stars || 0}</b>`
  ];
  const house = [
    "THE HOUSE ALWAYS COLLECTS.",
    "LUCK IS A BUDGET LINE ITEM.",
    "NO REFUNDS AFTER MIDNIGHT.",
    "THE DICE REMEMBER NOTHING.",
    "GRAVITY IS THE DEALER.",
    "NEVER BET THE RENT."
  ];
  bits.push(house[rand(house.length)]);
  track.innerHTML = bits.map(b => `<span>${b}</span>`).join(" &nbsp;◆&nbsp; ") + " &nbsp;◆&nbsp; ";
}

function renderRightRail() {
  const debtPanel = $("#debtPanel");
  const hustlePanel = $("#hustlePanel");
  const sleepPanel = $("#sleepPanel");
  const logPanel = $("#logPanel");
  const challengePanel = $("#challengePanel");
  if (!debtPanel || !hustlePanel || !sleepPanel || !logPanel) return;

  const debts = state.debts.slice().sort((a, b) => a.dueDay - b.dueDay);
  const total = totalDebt();
  const due = dueDebts();
  const urgent = due.length > 0;
  const next = nextDebt();

  debtPanel.innerHTML = `<div class="panel debt-panel ${urgent ? "urgent" : ""}">
    <div class="panel-head"><b>SHARK LEDGER</b><span class="tag">${debts.length} BILL${debts.length === 1 ? "" : "S"}</span></div>
    <div class="debt-total-row"><strong>${fmt(total)}</strong><span>${next ? `next due Day ${next.dueDay}` : "all clear"}</span></div>
    <p class="debt-warning">${urgent
      ? `A bill is due <b>today</b>. Pay it before you sleep, or the run ends.`
      : next
        ? `Next bill lands Day <b>${next.dueDay}</b>. Sleep only if you can cover it.`
        : `No sharks at the door. Yet.`}</p>
    <div class="debt-list">
      ${debts.length ? debts.map(note => `<div class="debt-note ${note.dueDay <= state.day ? "due" : ""}">
        <div class="debt-note-info">
          <b>${fmt(note.amount)}</b>
          <small>${dueLabel(note)} • DAY ${note.dueDay}</small>
        </div>
        <button class="mini-btn" data-action="pay-debt" data-id="${note.id}" ${state.cash < note.amount || ui.busy ? "disabled" : ""}>PAY</button>
      </div>`).join("") : `<div class="debt-note"><div class="debt-note-info"><b>$0</b><small>LEDGER EMPTY</small></div></div>`}
    </div>
    <button class="mini-btn gold full-btn" data-action="pay-all-debts" ${!debts.length || state.cash < total || ui.busy ? "disabled" : ""}>PAY ALL — ${fmt(total)}</button>
    <div class="debt-foot">Bills arrive each morning and come due after <b>${DEBT_TERM_DAYS} days</b>. Pay a bill before you sleep past its due day, or the run ends.</div>
  </div>`;

  const range = hustleRange();
  const used = state.sideHustleDay === state.day;
  const hustleReady = !used && state.energy >= 1 && !ui.busy && !ui.sleeping && !state.gameOver;
  hustlePanel.innerHTML = `<div class="panel hustle-panel">
    <div class="panel-head"><b>SIDE HUSTLE</b><span class="tag">1 / DAY</span></div>
    <p>Scrub the floor, bus tables, dodge the pit boss. Costs 1 energy.</p>
    <div class="hustle-pay"><span>PAYS</span><b>${fmt(range.min)}–${fmt(range.max)}</b></div>
    <button class="btn btn-green btn-block btn-sm" data-action="hustle" ${hustleReady ? "" : "disabled"}>${used ? "DONE FOR TODAY" : "WORK THE FLOOR"}</button>
    <div class="sleep-hint">${used ? "The pit boss is watching. Come back tomorrow." : state.energy < 1 ? "No energy left. Sleep first." : "One honest shift per day."}</div>
  </div>`;

  const full = state.energy >= maxEnergy();
  sleepPanel.innerHTML = `<div class="panel sleep-panel">
    <div class="panel-head"><b>END THE DAY</b><span class="tag">DAY ${state.day}</span></div>
    <p>Sleep restores all energy. A new debt bill arrives with the morning.</p>
    <button class="btn btn-cyan sleep-btn ${full ? "" : "sleep-ready"}" data-action="sleep" ${ui.busy || ui.sleeping || state.gameOver ? "disabled" : ""}>SLEEP UNTIL TOMORROW</button>
    <div class="sleep-hint">${full ? "Energy is full — sleeping is optional." : "You are running on fumes."}</div>
  </div>`;

  const logs = (state.log || []).slice(0, 13);
  logPanel.innerHTML = `<div class="panel log-panel">
    <div class="panel-head"><b>FLOOR LOG</b><span class="tag">D${state.day}</span></div>
    <div class="log-list">
      ${logs.length ? logs.map(entry => `<div class="log-entry ${entry.type || ""}">
        <span class="day-tag">D${entry.day}</span><span>${entry.text}</span>
      </div>`).join("") : `<div class="log-entry"><span class="day-tag">—</span><span>Nothing on the floor yet.</span></div>`}
    </div>
  </div>`;

  if (challengePanel) {
    const chs = Array.isArray(state.challenges) ? state.challenges : [];
    const effects = (typeof activeEffects === "function") ? activeEffects() : [];
    const doneCount = chs.filter(c => c.done).length;
    const mods = (typeof runModifiers === "function") ? runModifiers() : [];
    const modStrip = mods.length ? `<div class="panel modifier-panel">
      <div class="panel-head"><b>HOUSE RULES</b><span class="tag">${mods.length} THIS RUN</span></div>
      <div class="modifier-list">
        ${mods.map(m => `<div class="modifier ${m.tone || ""}">
          <span class="modifier-icon">${sprite(m.icon)}</span>
          <div class="modifier-copy">
            <div class="modifier-name">${m.name}</div>
            <div class="modifier-desc">${m.desc}</div>
          </div>
        </div>`).join("")}
      </div>
    </div>` : "";
    challengePanel.innerHTML = modStrip + `<div class="panel challenge-panel">
      <div class="panel-head"><b>RUN CONTRACTS</b><span class="tag">${doneCount}/${chs.length}</span></div>
      <div class="challenge-list">
        ${chs.length ? chs.map(ch => {
          const contract = (typeof contractById === "function") ? contractById(ch.id) : null;
          if (!contract) return "";
          const prog = ch.done ? null : challengeProgress(ch);
          return `<div class="challenge ${ch.done ? "done" : ""}">
            <span class="challenge-icon">${sprite(contract.icon)}</span>
            <div class="challenge-copy">
              <div class="challenge-name">${contract.name}</div>
              <div class="challenge-desc">${contract.desc}</div>
              ${prog ? `<div class="challenge-bar"><i style="width:${clamp((prog.have / prog.need) * 100, 0, 100)}%"></i></div><div class="challenge-prog">${prog.text}</div>` : `<div class="challenge-prog">COMPLETE — reward paid</div>`}
            </div>
            <span class="challenge-reward">${ch.done ? "✓" : `+${contract.reward.tokens}◆`}</span>
          </div>`;
        }).join("") : `<div class="challenge-empty">No contracts this run. Start a new run to draw three.</div>`}
      </div>
      ${effects.length ? `<div class="effect-strip">${effects.map(e => `<span class="effect-chip" title="${e.name}">${sprite(e.icon)}<span>${e.name}</span></span>`).join("")}</div>` : ""}
    </div>`;
  }

  renderTithePanel();
}

function renderTithePanel() {
  const panel = $("#tithePanel");
  if (!panel) return;
  if (state.titheWin) {
    panel.innerHTML = `<div class="panel tithe-panel won">
      <div class="panel-head"><b>THE SHARK'S TITHE</b><span class="tag">PAID</span></div>
      <p>You paid the tithe on Day ${state.day}. The ledger is clean.</p>
    </div>`;
    return;
  }
  const dayOk = state.day >= TITHE_DAY;
  const cashOk = state.cash >= TITHE_AMOUNT;
  const ready = (typeof titheReady === "function") ? titheReady() : (dayOk && cashOk);
  panel.innerHTML = `<div class="panel tithe-panel ${ready ? "ready" : ""}">
    <div class="panel-head"><b>THE SHARK'S TITHE</b><span class="tag">DAY ${TITHE_DAY}</span></div>
    <p>Reach <b>${fmt(TITHE_AMOUNT)}</b> by Day <b>${TITHE_DAY}</b>, then pay it to walk away clean — a win, not a bust.</p>
    <div class="tithe-reqs">
      <span class="tithe-req ${cashOk ? "met" : ""}">CASH ${fmt(state.cash)} / ${fmt(TITHE_AMOUNT)}</span>
      <span class="tithe-req ${dayOk ? "met" : ""}">DAY ${state.day} / ${TITHE_DAY}</span>
    </div>
    <button class="btn btn-gold btn-block btn-sm" data-action="pay-tithe" ${ready && !ui.busy ? "" : "disabled"}>PAY THE TITHE — ${fmt(TITHE_AMOUNT)}</button>
    <div class="sleep-hint">Reward: ★ ${TITHE_REWARD.stars} • ${TITHE_REWARD.tokens} ◆ • ${TITHE_REWARD.xp} XP. Ends the run in a win.</div>
  </div>`;
}

function payTithe() {
  if (ui.busy || ui.sleeping || state.gameOver || state.titheWin) return;
  if (typeof titheReady !== "function" || !titheReady()) {
    toast(`Reach ${fmt(TITHE_AMOUNT)} by Day ${TITHE_DAY} to pay the tithe.`, "bad");
    sfx("error");
    return;
  }
  state.cash -= TITHE_AMOUNT;
  state.titheWin = 1;
  if (typeof metaOnTithe === "function") metaOnTithe();
  addLog(`Paid the Shark's Tithe — ${fmt(TITHE_AMOUNT)}. Walked away clean.`, "win");
  saveState();
  renderAll();
  showTitheWin();
}

function showTitheWin() {
  const layer = $("#gameoverLayer");
  if (!layer) return;
  ui.busy = false;
  ui.sleeping = false;
  stopMusic();
  const tier = tierFor(totalStars());
  const next = nextTierFor(totalStars());
  layer.hidden = false;
  layer.innerHTML = `<div class="prestige-win-card tithe-win-card">
    <div class="big-star">⚖</div>
    <div class="gameover-kicker">THE LEDGER IS CLEAN // DAY ${state.day}</div>
    <h1>YOU PAID THE TITHE</h1>
    <p>You handed the Shark <b>${fmt(TITHE_AMOUNT)}</b> and walked out the front door. No revolver, no chase — just quiet, and a clean record.</p>
    <div class="tithe-rewards">
      <div class="tithe-reward"><span>STARS</span><b>★ ${TITHE_REWARD.stars}</b></div>
      <div class="tithe-reward"><span>TOKENS</span><b>${TITHE_REWARD.tokens} ◆</b></div>
      <div class="tithe-reward"><span>XP</span><b>${TITHE_REWARD.xp}</b></div>
    </div>
    <div class="prestige-earned">PERMANENT STARS <b>★ ${totalStars()}</b></div>
    <div class="gameover-meta">
      <span>TIER <b style="color:${tier.color}">${tier.name}</b></span>
      <span>TOKENS <b>${tokensLabel(profile.tokens)}</b></span>
      ${next ? `<span>NEXT TIER <b>${next.name} (${next.stars - totalStars()}★)</b></span>` : `<span>TOP TIER</span>`}
    </div>
    <button class="btn btn-gold btn-lg" data-action="restart-run">START NEXT RUN</button>
  </div>`;
  sfx("prestige");
}

function renderAll() {
  renderHUD();
  renderNav();
  renderTicker();
  renderRightRail();
  renderStage();
}

function afterStageRender() {
  if (ui.view !== "game") return;
  if (ui.game === "roulette" && typeof initRouletteCanvas === "function") initRouletteCanvas();
  if (ui.game === "plinko" && typeof initPlinkoCanvas === "function") initPlinkoCanvas();
  if (ui.game === "horses" && typeof initHorseCanvas === "function") initHorseCanvas();
}

function renderStage() {
  const stage = $("#stage");
  if (!stage) return;
  let html = "";
  if (ui.view === "shop") html = renderShop();
  else if (ui.view === "vault") html = renderVault();
  else if (ui.view === "trophies") html = renderTrophies();
  else if (ui.view === "backroom") html = renderBackroom();
  else if (ui.view === "game" && ui.game) html = renderGameScreen(ui.game);
  else html = renderLobby();
  stage.innerHTML = html;
  afterStageRender();
}

function navigate(view, gameId = null) {
  if (ui.busy || ui.sleeping) return;
  closeModal();
  ui.view = view;
  ui.game = view === "game" ? (gameId || ui.game) : null;
  if (view === "game" && !ui.game) ui.view = "lobby";
  syncMusic();
  renderNav();
  renderStage();
  renderHUD();
  const stage = $("#stage");
  if (stage) stage.scrollTop = 0;
  sfx("click", 0.5);
}

function quickPlay() {
  if (ui.busy || ui.sleeping || state.gameOver) return;
  const playable = GAMES.filter(g => state.energy >= g.energy && state.cash >= g.minBet);
  if (!playable.length) {
    toast(state.energy < 1 ? "No energy. Sleep or work the floor." : "Not enough cash for any cabinet. Work the floor.", "bad");
    sfx("error");
    return;
  }
  const game = playable[rand(playable.length)];
  navigate("game", game.id);
  toast(`Quick play: ${game.name}`, "info");
}

/* ------------------------------------------------------------
   Lobby
   ------------------------------------------------------------ */
function renderLobby() {
  const next = nextDebt();
  const due = dueDebts();
  const stats = state.stats;
  const played = stats.played || 0;
  const rate = played ? Math.round((stats.wins / played) * 100) : 0;
  const dueText = due.length ? "TODAY" : next ? `${Math.max(0, next.dueDay - state.day)} DAY${next.dueDay - state.day === 1 ? "" : "S"}` : "NONE";
  const prog = levelProgress();
  const tier = tierFor(totalStars());
  const nextTier = nextTierFor(totalStars());
  const achievements = achievementStats();

  return `<div class="screen">
    <section class="hero-panel">
      <span class="eyebrow">GAMBLER'S FORTUNE // FLOOR 08 // OPEN ALL NIGHT</span>
      <h1 class="hero-title">EIGHT CABINETS.<br>ONE BAD NIGHT.</h1>
      <p class="hero-copy">You have <b>${fmt(state.cash)}</b> and <b>${state.energy}/${maxEnergy()}</b> energy. The sharks want their money by <b>Day ${next ? next.dueDay : "—"}</b>. Play smart, sleep cheap, and don't go broke.</p>
      <div class="hero-actions">
        <button class="btn btn-gold btn-lg" data-action="quick-play">QUICK PLAY</button>
        <button class="btn btn-dark" data-action="go-shop">UPGRADE DEN</button>
        <button class="btn btn-cyan" data-action="go-vault">THE VAULT</button>
        <button class="btn btn-purple" data-action="go-backroom">BACK ROOM</button>
      </div>
      <div class="hero-chips">
        <span class="hero-chip">NEXT BILL <b>${next ? fmt(next.amount) : "$0"}</b></span>
        <span class="hero-chip ${due.length ? "warn" : ""}">DUE IN <b>${dueText}</b></span>
        <span class="hero-chip">WIN RATE <b>${rate}%</b></span>
        <span class="hero-chip">TOKENS <b>${tokensLabel(profile.tokens)}</b></span>
        <span class="hero-chip">STARS <b>${state.prestige.stars || 0}</b></span>
      </div>
    </section>

    <div class="lobby-stat-grid">
      <div class="lobby-stat gold"><span class="k">BEST CASH</span><span class="v">${fmt(stats.bestCash)}</span></div>
      <div class="lobby-stat green"><span class="k">BIGGEST WIN</span><span class="v">${fmt(stats.biggestWin)}</span></div>
      <div class="lobby-stat blue"><span class="k">GAMES PLAYED</span><span class="v">${stats.played}</span></div>
      <div class="lobby-stat red"><span class="k">TOTAL DEBT</span><span class="v">${fmt(totalDebt())}</span></div>
    </div>

    <div class="section-head"><h2>THE FLOOR</h2><span>${GAMES.length} cabinets • pick a vice</span></div>
    <div class="cabinet-grid">
      ${GAMES.map(g => `<button class="game-tile" style="--tile-accent:${g.accent}" data-action="open-game" data-game="${g.id}">
        <span class="game-tile-icon">${sprite(g.sprite)}</span>
        <span class="game-tile-body">
          <span class="game-tile-name">${g.name}</span>
          <span class="game-tile-meta">MIN <b>${fmt(g.minBet)}</b> • <b>${g.odds}</b></span>
          <span class="game-tile-badge">${g.tag} • ${g.energy}⚡</span>
        </span>
      </button>`).join("")}
    </div>

    <div class="survival-strip">
      <div class="survival-item ${due.length ? "hot" : ""}"><b>SHARK WATCH</b>${due.length ? `${due.length} bill${due.length === 1 ? "" : "s"} due today. Pay up or the run ends.` : next ? `Next bill is due Day ${next.dueDay} (${fmt(next.amount)}).` : "No bills. Something is wrong."}</div>
      <div class="survival-item"><b>ENERGY</b>${state.energy}/${maxEnergy()} left. Every play burns energy. Sleep to reset, but a new bill arrives.</div>
      <div class="survival-item"><b>PRESTIGE</b>${state.prestigeUnlocked ? "The back room is open. Cash out Russian roulette to keep permanent stars." : state.offerExpired ? "This run's back-room offer expired. Pay the Shark's Tithe on Day 20 to end the run in a win." : `Reach ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY}.`}</div>
    </div>

    <div class="lore-panel">
      <div class="lore-copy">
        <span class="eyebrow">THE LEDGER // YOUR PERMANENT RECORD</span>
        <p>Nobody starts at Gambler's Fortune. You <b>arrive</b> — broke, curious, and holding a marker you cannot read. The sharks up front take your cash. The man in the back takes your nerve. But every loss teaches the house something about you, and that knowledge is the only thing that <b>carries over</b>.</p>
        <p>Bank tokens, climb the vault, and the floor starts bending your way — a warmer bed, a luckier charm, a gilded payout. Walk out of the back room enough times and they stop calling you a debtor. They start calling you <b>${tier.name.toLowerCase()}</b>.</p>
      </div>
      <div class="lore-meta">
        <div class="lore-meta-row"><span>PROFILE LEVEL</span><b>LV ${prog.level}</b></div>
        <div class="lore-xp"><i style="width:${Math.round(prog.pct * 100)}%"></i></div>
        <div class="lore-meta-row"><span>XP TO NEXT</span><b>${prog.remaining}</b></div>
        <div class="lore-meta-row"><span>TOKENS</span><b>${tokensLabel(profile.tokens)}</b></div>
        <div class="lore-meta-row"><span>PRESTIGE TIER</span><b style="color:${tier.color}">${tier.name}</b></div>
        <div class="lore-meta-row"><span>STARS / NEXT</span><b>★ ${totalStars()}${nextTier ? ` / ${nextTier.stars}` : ""}</b></div>
        <div class="lore-meta-row"><span>ACHIEVEMENTS</span><b>${achievements.unlocked}/${achievements.total}</b></div>
        <div class="lore-actions">
          <button class="btn btn-cyan btn-sm" data-action="go-vault">OPEN VAULT</button>
          <button class="btn btn-dark btn-sm" data-action="go-trophies">TROPHIES</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   Shop
   ------------------------------------------------------------ */
function renderShop() {
  const cards = Object.entries(UPGRADE_TYPES).map(([key, up]) => {
    const level = state.upgradeLevels[key] || 0;
    const maxed = level >= up.max;
    const cost = maxed ? null : up.costs[level];
    const affordable = cost !== null && state.cash >= cost && !ui.busy;
    const current = level > 0 ? up.effect(level) : "No bonus yet";
    const next = maxed ? "MAXED OUT" : up.effect(level + 1);
    return `<div class="upgrade-card ${maxed ? "maxed" : ""}">
      <span class="upgrade-icon">${sprite(up.icon)}</span>
      <div class="upgrade-copy">
        <div class="upgrade-name">${up.name} <span class="muted">LV ${level}/${up.max}</span></div>
        <div class="upgrade-desc">${up.desc}</div>
        <div class="upgrade-effect">NOW: ${current}<br>NEXT: ${next}</div>
        <div class="level-pips">${Array.from({ length: up.max }, (_, i) => `<span class="level-pip ${i < level ? "on" : ""}"></span>`).join("")}</div>
        <div class="upgrade-buy-row">
          <div class="upgrade-price">${maxed ? "MAX" : fmt(cost)}<small>${maxed ? "nothing left to buy" : "next level"}</small></div>
          <button class="btn btn-gold upgrade-buy" data-action="buy-upgrade" data-upgrade="${key}" ${maxed || !affordable ? "disabled" : ""}>${maxed ? "MAX" : "BUY"}</button>
        </div>
      </div>
    </div>`;
  }).join("");

  return `<div class="screen narrow">
    <div class="shop-head">
      <div>
        <span class="eyebrow">UPGRADE DEN // BACK ALLEY</span>
        <h1 class="hero-title" style="font-size:clamp(16px,2vw,26px)">BEND THE ODDS</h1>
      </div>
      <div class="shop-balance">BANKROLL<b>${fmt(state.cash)}</b></div>
    </div>
    <div class="shop-grid">${cards}</div>
    <div class="shop-note"><b>PRESTIGE:</b> Reach ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY} to open the back room. Each permanent star adds +4 max energy and +4% payouts on future runs.</div>
    <div class="shop-actions">
      <button class="btn btn-dark" data-action="go-lobby">← BACK TO FLOOR</button>
      <span>Upgrades last for this run only. Stars are forever.</span>
    </div>
  </div>`;
}

function buyUpgrade(key) {
  const up = UPGRADE_TYPES[key];
  if (!up || ui.busy || state.gameOver) return;
  const level = state.upgradeLevels[key] || 0;
  if (level >= up.max) { toast("That upgrade is maxed.", "bad"); return; }
  const cost = up.costs[level];
  if (state.cash < cost) { toast(`Need ${fmt(cost)} for ${up.name}.`, "bad"); sfx("error"); return; }
  state.cash -= cost;
  state.upgradeLevels[key] = level + 1;
  if (key === "energy") state.energy = Math.min(maxEnergy(), state.energy + 4);
  addLog(`Upgraded ${up.name} to level ${level + 1} for ${fmt(cost)}.`, "gold");
  sfx("upgrade");
  floatCash(-cost);
  toast(`${up.name} → LV ${level + 1}`, "gold");
  saveState();
  renderAll();
}

/* ------------------------------------------------------------
   The Vault — permanent unlocks bought with tokens
   ------------------------------------------------------------ */
function vaultCard(kind, item) {
  const owned = isUnlocked(kind, item.id);
  const equipped = profile.equipped?.[kind] === item.id;
  const reqOk = reqMet(item);
  const affordable = profile.tokens >= item.cost;
  let preview;
  if (kind === "theme") {
    const c = item.colors || { "--bg": "#14172b", "--panel": "#222746", "--gold": "#ffcf4a", "--purple": "#b16cff", "--cyan": "#5de8ff" };
    preview = `<span class="vault-swatch">${["--bg", "--panel", "--gold", "--purple", "--cyan"].map(k => `<i style="background:${c[k]}"></i>`).join("")}</span>`;
  } else if (kind === "skin") {
    preview = `<span class="vault-avatar">${avatarSVG(item.id)}</span>`;
  } else if (kind === "dice") {
    preview = `<span class="vault-die" data-dice="${item.id}"><i></i><i></i><i></i><i></i><i></i></span>`;
  } else {
    preview = `<span class="vault-card-preview" data-cards="${item.id}"><i>A</i></span>`;
  }

  let action;
  if (owned && equipped) action = `<span class="vault-state on">EQUIPPED</span>`;
  else if (owned) action = `<button class="btn btn-green btn-sm" data-action="equip-item" data-kind="${kind}" data-id="${item.id}">EQUIP</button>`;
  else if (!reqOk) action = `<span class="vault-state locked">${reqText(item)}</span>`;
  else action = `<button class="btn btn-gold btn-sm" data-action="buy-unlock" data-kind="${kind}" data-id="${item.id}" ${affordable ? "" : "disabled"}>${item.cost} ◆</button>`;

  return `<div class="vault-card ${owned ? "owned" : ""} ${equipped ? "equipped" : ""}">
    <div class="vault-preview">${preview}</div>
    <div class="vault-name">${item.name}</div>
    <div class="vault-desc">${item.desc}</div>
    <div class="vault-action">${action}</div>
  </div>`;
}

function perkCard(key, perk) {
  const level = perkLevel(key);
  const maxed = level >= perk.max;
  const cost = maxed ? null : perk.costs[level];
  const affordable = cost !== null && profile.tokens >= cost;
  return `<div class="vault-card perk ${maxed ? "owned" : ""}">
    <div class="vault-preview"><span class="perk-icon">${sprite(perk.icon)}</span></div>
    <div class="vault-name">${perk.name} <span class="muted">LV ${level}/${perk.max}</span></div>
    <div class="vault-desc">${perk.desc}</div>
    <div class="upgrade-effect">NOW: ${level > 0 ? perk.effect(level) : "No bonus yet"}<br>NEXT: ${maxed ? "MAXED OUT" : perk.effect(level + 1)}</div>
    <div class="level-pips">${Array.from({ length: perk.max }, (_, i) => `<span class="level-pip ${i < level ? "on" : ""}"></span>`).join("")}</div>
    <div class="vault-action">${maxed
      ? `<span class="vault-state on">MAXED</span>`
      : `<button class="btn btn-gold btn-sm" data-action="buy-perk" data-perk="${key}" ${affordable ? "" : "disabled"}>${cost} ◆</button>`}</div>
  </div>`;
}

function renderVault() {
  if (!profile) return `<div class="screen narrow"><p>Profile unavailable.</p></div>`;
  const prog = levelProgress();
  const tier = tierFor(totalStars());
  const sections = [
    { kind: "theme", label: "CASINO THEMES", blurb: "Change the whole room." },
    { kind: "skin", label: "CHARACTER SKINS", blurb: "Who the sharks see." },
    { kind: "dice", label: "DICE DESIGNS", blurb: "Same odds, better bones." },
    { kind: "cards", label: "CARD DESIGNS", blurb: "Style on the felt." }
  ].map(({ kind, label, blurb }) => {
    const items = vaultList(kind);
    const owned = items.filter(i => isUnlocked(kind, i.id)).length;
    return `<section class="vault-section">
      <div class="section-head"><h2>${label}</h2><span>${owned}/${items.length} owned • ${blurb}</span></div>
      <div class="vault-grid">${items.map(i => vaultCard(kind, i)).join("")}</div>
    </section>`;
  }).join("");

  return `<div class="screen narrow vault-screen">
    <div class="vault-head">
      <div>
        <span class="eyebrow">THE VAULT // PERMANENT COLLECTION</span>
        <h1 class="hero-title" style="font-size:clamp(16px,2vw,26px)">SPEND WHAT YOU KEEP</h1>
      </div>
      <div class="vault-balance">
        <span>TOKENS</span><b>${tokensLabel(profile.tokens)}</b>
        <span class="vault-sub">LV ${prog.level} • ${prog.into}/${prog.span} XP • ★ ${totalStars()}</span>
      </div>
    </div>
    <p class="vault-note">Tokens are permanent. Earn them by leveling up, completing run contracts, cashing out prestige stars, and unlocking achievements. Everything here carries between runs.</p>
    ${sections}
    <section class="vault-section">
      <div class="section-head"><h2>PERMANENT PERKS</h2><span>Bend the rules forever</span></div>
      <div class="vault-grid perks">${Object.entries(PERKS).map(([key, perk]) => perkCard(key, perk)).join("")}</div>
    </section>
    <div class="shop-actions">
      <button class="btn btn-dark" data-action="go-lobby">← BACK TO FLOOR</button>
      <button class="btn btn-purple" data-action="go-trophies">TROPHIES</button>
      <span>Prestige tier: <b style="color:${tier.color}">${tier.name}</b></span>
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   Trophies — achievements and the prestige ladder
   ------------------------------------------------------------ */
function renderTrophies() {
  if (!profile) return `<div class="screen narrow"><p>Profile unavailable.</p></div>`;
  const lt = lifetimeStats();
  const tier = tierFor(totalStars());
  const next = nextTierFor(totalStars());
  const stats = achievementStats();

  const ladder = tierLadder().map(t => {
    const reached = totalStars() >= t.stars;
    const current = t.id === tier.id;
    return `<div class="tier-rung ${reached ? "reached" : ""} ${current ? "current" : ""}" style="--tier:${t.color}">
      <span class="tier-badge">${reached ? "★" : "☆"}</span>
      <div class="tier-copy"><b>${t.name}</b><small>${t.stars}★ — ${t.blurb}</small></div>
    </div>`;
  }).join("");

  const ach = achievementList().map(a => {
    const got = !!profile.achievements[a.id];
    return `<div class="ach-card ${got ? "got" : ""}">
      <span class="ach-icon">${sprite(a.icon)}</span>
      <div class="ach-copy">
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        <div class="ach-reward">${got ? "UNLOCKED" : `+${a.reward.tokens} ◆ • +${a.reward.xp} XP`}</div>
      </div>
    </div>`;
  }).join("");

  return `<div class="screen narrow trophies-screen">
    <div class="vault-head">
      <div>
        <span class="eyebrow">TROPHY ROOM // PERMANENT RECORD</span>
        <h1 class="hero-title" style="font-size:clamp(16px,2vw,26px)">THE LEDGER REMEMBERS</h1>
      </div>
      <div class="vault-balance">
        <span>ACHIEVEMENTS</span><b>${stats.unlocked} / ${stats.total}</b>
        <span class="vault-sub">★ ${totalStars()} • ${tier.name}${next ? ` • ${next.stars - totalStars()}★ to ${next.name}` : ""}</span>
      </div>
    </div>
    <div class="trophy-summary">
      <div class="trophy-stat"><span>RUNS</span><b>${profile.runs || 0}</b></div>
      <div class="trophy-stat"><span>GAMES</span><b>${lt.gamesPlayed}</b></div>
      <div class="trophy-stat"><span>WINS</span><b>${lt.wins}</b></div>
      <div class="trophy-stat"><span>BIGGEST WIN</span><b>${fmt(lt.biggestWin)}</b></div>
      <div class="trophy-stat"><span>BEST DAY</span><b>${lt.bestDay}</b></div>
      <div class="trophy-stat"><span>PRESTIGES</span><b>${lt.prestiges}</b></div>
      <div class="trophy-stat"><span>BEST STREAK</span><b>${lt.maxStreak}</b></div>
      <div class="trophy-stat"><span>CONTRACTS</span><b>${lt.contractsDone}</b></div>
    </div>
    <section class="vault-section">
      <div class="section-head"><h2>PRESTIGE LADDER</h2><span>Stars are forever</span></div>
      <div class="tier-ladder">${ladder}</div>
    </section>
    <section class="vault-section">
      <div class="section-head"><h2>ACHIEVEMENTS</h2><span>${stats.unlocked} / ${stats.total} unlocked</span></div>
      <div class="ach-grid">${ach}</div>
    </section>
    <div class="shop-actions">
      <button class="btn btn-dark" data-action="go-lobby">← BACK TO FLOOR</button>
      <button class="btn btn-cyan" data-action="go-vault">THE VAULT</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   Back room / Russian roulette
   ------------------------------------------------------------ */
function renderBackroom() {
  const unlocked = state.prestigeUnlocked;
  const hero = `<div class="backroom-hero">
    <span class="eyebrow">STAFF ONLY // NO CAMERAS // NO WITNESSES</span>
    <h1>THE BACK ROOM</h1>
    <p>They only open this door for high rollers. Inside: one revolver, six chambers, one bullet, and a permanent kind of luck.</p>
  </div>`;

  if (!unlocked) {
    const cashMet = state.cash >= PRESTIGE_GOAL;
    const dayMet = state.day <= PRESTIGE_DAY;
    return `<div class="screen backroom-screen">
      ${hero}
      <div class="locked-box">
        <span class="lock-icon">${sprite("lock")}</span>
        <h2>THE DOOR IS LOCKED</h2>
        <p>Reach <b class="gold">${fmt(PRESTIGE_GOAL)}</b> in cash by the end of <b class="cyan">Day ${PRESTIGE_DAY}</b>. Bring the money to the man with the revolver.</p>
        <div class="req-list">
          <span class="req ${cashMet ? "met" : "failed"}">CASH ${fmt(state.cash)} / ${fmt(PRESTIGE_GOAL)}</span>
          <span class="req ${dayMet ? "met" : "failed"}">DAY ${state.day} / ${PRESTIGE_DAY}</span>
        </div>
        ${state.offerExpired ? `<div class="expired">OFFER EXPIRED — THE DOOR IS SHUT FOR THIS RUN.</div>` : ""}
        <div class="actions-row">
          <button class="btn btn-gold" data-action="go-lobby">BACK TO THE FLOOR</button>
          <button class="btn btn-dark" data-action="go-shop">UPGRADE DEN</button>
        </div>
      </div>
    </div>`;
  }

  const r = state.russian;
  const chancePct = r.remaining > 0 ? Math.round(100 / r.remaining) : 100;
  const lastChamber = r.remaining <= 1;
  const chambers = Array.from({ length: 6 }, (_, i) => `<span class="chamber ${i < r.pulled ? "spent" : ""}" style="--i:${i}"></span>`).join("");
  const bars = Array.from({ length: 6 }, (_, i) => `<span class="risk-bar ${i < r.pulled ? "spent" : i < r.pulled + r.remaining ? "live" : ""}"></span>`).join("");
  const canPull = !ui.busy && !lastChamber && !state.gameOver;
  const canCash = !ui.busy && r.earned > 0 && !state.gameOver;

  return `<div class="screen backroom-screen">
    ${hero}
    <div class="backroom-content">
      <div class="gun-stage" id="gunStage">
        <div class="revolver">
          <div class="gun-barrel"></div>
          <div class="gun-frame"></div>
          <div class="gun-grip"></div>
          <div class="gun-trigger"></div>
          <div class="gun-hammer"></div>
          <div class="cylinder">${chambers}</div>
          <div class="gun-muzzle-flash"></div>
        </div>
      </div>
      <div class="backroom-panel">
        <div class="risk-title">ONE BULLET // SIX CHAMBERS</div>
        <div class="risk-big">${lastChamber ? "LOADED" : `${chancePct}% RISK`}</div>
        <div class="risk-desc">${lastChamber
          ? "One chamber left. It is the bullet. Cash out while you still have a face."
          : `Every safe pull banks a permanent prestige star. Cash out to keep them. The bullet ends the run and takes the unpreserved seals with it.`}</div>
        <div class="risk-bars">${bars}</div>
        <div class="backroom-actions">
          <button class="btn btn-red" data-action="russian-pull" ${canPull ? "" : "disabled"}>PULL THE TRIGGER</button>
          <button class="btn btn-purple" data-action="russian-cashout" ${canCash ? "" : "disabled"}>CASH OUT ${r.earned} SEAL${r.earned === 1 ? "" : "S"}</button>
          <button class="btn btn-dark" data-action="go-lobby">LEAVE THE ROOM</button>
        </div>
        <div class="seal-count"><span>SEALS THIS RUN</span><b>${r.earned}</b></div>
        <div class="seal-count"><span>PERMANENT STARS</span><b>${state.prestige.stars || 0}</b></div>
      </div>
    </div>
  </div>`;
}
/* ------------------------------------------------------------
   Betting console and result strip
   ------------------------------------------------------------ */
function getBet(gameId) {
  const game = getGame(gameId);
  if (!game) return 0;
  const raw = Number(state.bets[gameId]);
  const value = Number.isFinite(raw) ? Math.floor(raw) : game.minBet;
  return Math.max(game.minBet, value);
}

function setBet(gameId, value) {
  const game = getGame(gameId);
  if (!game || ui.busy || ui.sleeping || state.gameOver) return;
  const max = Math.max(game.minBet, state.cash);
  state.bets[gameId] = clamp(Math.round(Number(value) || game.minBet), game.minBet, max);
  saveState();
  renderStage();
  sfx("click", 0.4);
}

function adjustBet(direction) {
  if (!ui.game) return;
  const game = getGame(ui.game);
  if (!game) return;
  const step = Math.max(1, Math.round(game.minBet / 2));
  setBet(game.id, getBet(game.id) + direction * step);
}

function applyBetChip(value) {
  if (!ui.game) return;
  const game = getGame(ui.game);
  if (!game) return;
  const current = getBet(game.id);
  let next = current;
  if (value === "min") next = game.minBet;
  else if (value === "10") next = current + 10;
  else if (value === "50") next = current + 50;
  else if (value === "x2") next = current * 2;
  else if (value === "max") next = state.cash;
  setBet(game.id, next);
}

function renderBetConsole(gameId) {
  const game = getGame(gameId);
  if (!game) return "";
  const gs = ui.games[gameId];
  if (gameId === "blackjack" && gs && gs.phase === "player") return "";
  if (gameId === "holdem" && gs && gs.phase === "decision") return "";

  const bet = getBet(gameId);
  const locked = ui.busy || state.gameOver || ui.sleeping;
  const disabled = locked || state.energy < game.energy || state.cash < bet;
  const maxed = bet >= state.cash;
  const atMin = bet <= game.minBet;
  const bonus = (typeof payoutBonusPercentFor === "function") ? payoutBonusPercentFor(gameId) : payoutBonusPercent();

  return `<div class="bet-console">
    <div>
      <span class="bet-label">WAGER</span>
      <div class="bet-stepper">
        <button class="bet-step" data-action="bet-down" ${locked || atMin ? "disabled" : ""} aria-label="Lower wager">−</button>
        <div class="bet-amount">${fmt(bet)}</div>
        <button class="bet-step" data-action="bet-up" ${locked || maxed ? "disabled" : ""} aria-label="Raise wager">+</button>
      </div>
      <div class="bet-meta">MIN <b>${fmt(game.minBet)}</b> • ENERGY <b>${game.energy}</b> • CASH <b>${fmt(state.cash)}</b>${bonus > 0 ? ` <span class="bonus-pill">+${bonus}% PAY</span>` : ""}</div>
    </div>
    <div class="bet-chips">
      <button class="chip-btn" data-action="bet-chip" data-value="min" ${locked ? "disabled" : ""}>MIN</button>
      <button class="chip-btn" data-action="bet-chip" data-value="10" ${locked ? "disabled" : ""}>+10</button>
      <button class="chip-btn" data-action="bet-chip" data-value="50" ${locked ? "disabled" : ""}>+50</button>
      <button class="chip-btn" data-action="bet-chip" data-value="x2" ${locked || maxed ? "disabled" : ""}>×2</button>
      <button class="chip-btn" data-action="bet-chip" data-value="max" ${locked ? "disabled" : ""}>MAX</button>
    </div>
    <button class="btn btn-gold play-btn" data-action="play" ${disabled ? "disabled" : ""}>PLAY — ${game.energy}⚡</button>
  </div>`;
}

function renderResultStrip(gameId) {
  const game = getGame(gameId);
  if (!game) return "";
  const result = ui.games[gameId] ? ui.games[gameId].result : null;
  if (!result) {
    return `<div class="result-strip info">
      <span class="result-icon">${sprite("star")}</span>
      <div class="result-copy">
        <div class="result-title">${game.status.toUpperCase()}</div>
        <div class="result-sub">Set your wager and pull the lever.</div>
      </div>
      <div class="result-amount">—</div>
    </div>`;
  }
  const cls = result.type === "win" ? "win" : result.type === "loss" ? "loss" : "push";
  const big = result.big ? " big-win" : "";
  return `<div class="result-strip ${cls}${big}">
    <span class="result-icon">${sprite(result.type === "win" ? "cash" : result.type === "loss" ? "skull" : "clover")}</span>
    <div class="result-copy">
      <div class="result-title">${result.title}</div>
      <div class="result-sub">${result.sub || ""}</div>
    </div>
    <div class="result-amount">${signedMoney(result.amount)}</div>
  </div>`;
}

/* ------------------------------------------------------------
   Modal, sleep, game over and prestige overlays
   ------------------------------------------------------------ */
function openModal(html, className = "") {
  const layer = $("#modalLayer");
  if (!layer) return;
  layer.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true">
    <button class="modal-close" data-action="close-modal" aria-label="Close">✕</button>
    ${html}
  </div>`;
  layer.classList.add("open");
  sfx("click");
}

function closeModal() {
  const layer = $("#modalLayer");
  if (!layer) return;
  layer.classList.remove("open");
  layer.innerHTML = "";
}

function showHelp() {
  openModal(`<h2>HOW TO SURVIVE</h2>
    <p>Gambler's Fortune runs on <b>virtual currency only</b>. Every game costs energy. Every morning a new debt bill lands, and every bill comes due five days later.</p>
    <div class="help-grid">
      <div class="help-item"><b>ENERGY</b>Each play burns energy. Run dry and you must sleep.</div>
      <div class="help-item"><b>DEBT</b>Bills appear each new day. Pay one before you sleep past its due day, or the run ends.</div>
      <div class="help-item"><b>SIDE HUSTLE</b>Once per day, burn 1 energy for a small payout.</div>
      <div class="help-item"><b>SLEEP</b>Restores energy and advances the day. A new bill arrives.</div>
      <div class="help-item"><b>BANKRUPT</b>Hit zero cash and the run is over. Start a new one.</div>
      <div class="help-item"><b>PRESTIGE</b>Reach ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY} to unlock the back room.</div>
      <div class="help-item"><b>THE TITHE</b>Reach ${fmt(TITHE_AMOUNT)} by Day ${TITHE_DAY} and pay it to end the run in a win.</div>
      <div class="help-item"><b>HOUSE RULES</b>Every run draws random modifiers that bend payouts, energy and debt. Read them in the right rail.</div>
      <div class="help-item"><b>THE VAULT</b>Spend permanent tokens on themes, skins, dice, cards and perks.</div>
      <div class="help-item"><b>CONTRACTS</b>Each run draws three random objectives. Finish them for tokens.</div>
      <div class="help-item"><b>TROPHIES</b>Achievements and prestige tiers live in the trophy room.</div>
      <div class="help-item"><b>SETTINGS</b>Use the ⚙ button up top for volume, save codes and reset.</div>
    </div>
    <p>Wins return your stake plus profit. Losses take the stake. The odds are sharp, but cold streaks end.</p>
    <div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">GOT IT</button></div>`);
}

function showIntro() {
  if (!profile || profile.seenIntro) return;
  profile.seenIntro = true;
  saveProfile();
  openModal(`<h2>WELCOME TO GAMBLER'S FORTUNE</h2>
    <p>A neon arcade casino with <b>virtual currency only</b>. You start with a little cash, a lot of energy, and a ledger that follows you everywhere.</p>
    <div class="help-grid">
      <div class="help-item"><b>THE FLOOR</b>Eight cabinets. Each play burns energy and pays out — or does not.</div>
      <div class="help-item"><b>THE SHARKS</b>A new bill lands every morning and comes due in five days. Pay it before you sleep past the due day, or the run ends.</div>
      <div class="help-item"><b>HOUSE RULES</b>Every run draws random modifiers that change payouts, energy and debt. No two runs play the same.</div>
      <div class="help-item"><b>THE BACK ROOM</b>Reach ${fmt(PRESTIGE_GOAL)} by Day ${PRESTIGE_DAY} to unlock Russian roulette and permanent stars.</div>
      <div class="help-item"><b>THE TITHE</b>Reach ${fmt(TITHE_AMOUNT)} by Day ${TITHE_DAY} and pay the Shark to walk away a winner.</div>
      <div class="help-item"><b>THE VAULT</b>Level up and bank tokens to unlock themes, skins, dice, cards and permanent perks.</div>
      <div class="help-item"><b>CONTRACTS</b>Every run draws three random contracts. Complete them for tokens and XP.</div>
      <div class="help-item"><b>THE LEDGER</b>Stars, tokens, achievements and every unlock carry into your next run.</div>
    </div>
    <p>Nothing here is real money. The regret is real. Good luck.</p>
    <div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">DEAL ME IN</button></div>`, "intro-modal");
}

/* ------------------------------------------------------------
   Settings — volume, save codes, reset
   ------------------------------------------------------------ */
function showSettings() {
  if (!state) return;
  const musicPct = Math.round(clamp(Number(state.musicVolume ?? 1), 0, 1) * 100);
  const sfxPct = Math.round(clamp(Number(state.sfxVolume ?? 1), 0, 1) * 100);
  openModal(`<h2>SETTINGS</h2>
    <div class="settings-block">
      <div class="settings-title">VOLUME</div>
      <div class="settings-row">
        <label for="musicVolRange">MUSIC</label>
        <input type="range" id="musicVolRange" min="0" max="100" step="1" value="${musicPct}" data-setting="music" aria-label="Music volume" />
        <span id="musicVolOut">${musicPct}%</span>
      </div>
      <div class="settings-row">
        <label for="sfxVolRange">SOUND FX</label>
        <input type="range" id="sfxVolRange" min="0" max="100" step="1" value="${sfxPct}" data-setting="sfx" aria-label="Sound effect volume" />
        <span id="sfxVolOut">${sfxPct}%</span>
      </div>
    </div>
    <div class="settings-block">
      <div class="settings-title">SAVE CODE</div>
      <p class="settings-note">Copy this code to back up your run and permanent profile, or paste one to restore. Keep it somewhere safe — it is the only backup.</p>
      <textarea id="saveCodeBox" class="save-code" spellcheck="false" autocomplete="off" placeholder="Paste a save code here to restore..."></textarea>
      <div class="settings-actions">
        <button class="btn btn-cyan btn-sm" data-action="copy-save">COPY MY CODE</button>
        <button class="btn btn-green btn-sm" data-action="import-save">RESTORE FROM CODE</button>
      </div>
      <div class="settings-status" id="saveStatus"></div>
    </div>
    <div class="settings-block danger">
      <div class="settings-title">DANGER ZONE</div>
      <p class="settings-note">Wipe your run <b>and</b> your permanent profile — levels, tokens, stars, unlocks and achievements. This cannot be undone.</p>
      <button class="btn btn-red btn-sm" data-action="reset-progress">RESET EVERYTHING</button>
    </div>
    <div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">DONE</button></div>`, "settings-modal");
}

async function copySaveCode() {
  const code = (typeof exportSaveCode === "function") ? exportSaveCode() : "";
  const box = $("#saveCodeBox");
  const status = $("#saveStatus");
  if (!code) {
    if (status) status.textContent = "Could not build a save code.";
    toast("Could not build a save code.", "bad");
    return;
  }
  if (box) box.value = code;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
      ok = true;
    }
  } catch (err) { ok = false; }
  if (!ok && box) {
    box.focus();
    box.select();
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
  }
  if (status) status.textContent = ok ? "Save code copied to clipboard." : "Copy failed — select the code and copy it manually.";
  toast(ok ? "Save code copied." : "Select the code and copy it.", ok ? "good" : "info");
}

function doImportSave() {
  const box = $("#saveCodeBox");
  const status = $("#saveStatus");
  const code = box ? box.value : "";
  if (!code || !code.trim()) {
    if (status) status.textContent = "Paste a save code first.";
    sfx("error");
    return;
  }
  const ok = (typeof importSaveCode === "function") && importSaveCode(code);
  if (!ok) {
    if (status) status.textContent = "That save code is not valid.";
    toast("Invalid save code.", "bad");
    sfx("error");
    return;
  }
  closeModal();
  if (typeof reloadGame === "function") reloadGame();
  toast("Save restored.", "gold");
}

function resetProgress() {
  openModal(`<h2>RESET EVERYTHING?</h2>
    <p>This wipes your current run <b>and</b> your permanent profile — levels, tokens, stars, unlocks and achievements. There is no undo.</p>
    <div class="modal-actions">
      <button class="btn btn-red" data-action="confirm-reset">YES, WIPE IT ALL</button>
      <button class="btn btn-dark" data-action="show-settings">CANCEL</button>
    </div>`);
}

function confirmReset() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch (err) { /* ignore */ }
  if (typeof defaultProfile === "function") profile = defaultProfile();
  state = makeState();
  if (typeof syncStars === "function") syncStars();
  if (typeof applyTheme === "function") applyTheme();
  if (typeof recordRunStart === "function") recordRunStart();
  resetUI();
  lastCashShown = null;
  closeModal();
  const layer = $("#gameoverLayer");
  if (layer) { layer.hidden = true; layer.innerHTML = ""; }
  if (typeof saveProfile === "function") saveProfile();
  saveState();
  renderAll();
  startMusic();
  toast("Everything wiped. Fresh start.", "gold");
}

function flashScreen() {
  const el = $("#screenFlash");
  if (!el) return;
  el.classList.remove("active");
  void el.offsetWidth;
  el.classList.add("active");
}

function buildSleepOverlay() {
  const overlay = $("#sleepOverlay");
  if (!overlay) return;
  const stars = Array.from({ length: 44 }, () => {
    const left = randInt(2, 98);
    const top = randInt(2, 68);
    const dur = (randInt(18, 40) / 10).toFixed(1);
    const delay = (randInt(0, 30) / 10).toFixed(1);
    return `<i class="sleep-star" style="left:${left}%;top:${top}%;--dur:${dur}s;--d:${delay}s"></i>`;
  }).join("");
  overlay.innerHTML = `<div class="sleep-scene">
    <div class="sleep-stars">${stars}</div>
    <div class="sleep-moon"></div>
    <div class="sleep-sun"></div>
    <div class="sleep-skyline"></div>
    <div class="zzz">Z<span>Z</span><span>Z</span></div>
    <div class="sleep-card">
      <div class="sleep-title" id="sleepTitle">CLOSING TIME</div>
      <div class="sleep-sub" id="sleepSub">The neon dims. Somewhere, a shark checks his watch.</div>
      <div class="sleep-day-banner" id="sleepDay">DAY ${state.day} COMPLETE</div>
    </div>
  </div>`;
}

async function doSleep() {
  if (!state || ui.sleeping || ui.busy || state.gameOver) return;
  ui.sleeping = true;
  ui.busy = true;
  closeModal();
  buildSleepOverlay();
  const overlay = $("#sleepOverlay");
  overlay.hidden = false;
  overlay.classList.remove("morning");
  sfx("sleep");
  renderAll();

  await wait(REDUCED_MOTION ? 250 : 1900);

  state.day += 1;
  state.stats.daysSurvived = Math.max(state.stats.daysSurvived, state.day);
  state.energy = maxEnergy();
  const missed = state.debts.filter(note => note.dueDay < state.day);
  updatePrestigeExpiry();
  if (typeof pruneEffects === "function") pruneEffects(state);
  issueDebtFor(state, state.day);
  const morningEvent = (typeof rollMorningEvent === "function") ? rollMorningEvent(state) : null;
  let eventDetail = "";
  if (morningEvent && typeof applyMorningEvent === "function") eventDetail = applyMorningEvent(morningEvent, state) || "";
  if (typeof metaOnSleep === "function") metaOnSleep();
  addLog(`Day ${state.day}. Energy restored to ${maxEnergy()}. New bill issued.`, "gold");

  const title = $("#sleepTitle");
  const sub = $("#sleepSub");
  const banner = $("#sleepDay");
  if (title) title.textContent = `DAY ${state.day}`;
  if (sub) sub.textContent = morningEvent
    ? `${morningEvent.name}: ${eventDetail}`
    : "The shutters roll up. The floor smells like ozone and bad decisions.";
  if (banner) banner.textContent = morningEvent
    ? `MORNING EVENT • ${morningEvent.name.toUpperCase()}`
    : `ENERGY ${state.energy} / ${maxEnergy()} • NEW BILL ISSUED`;
  overlay.classList.add("morning");
  sfx(morningEvent ? "upgrade" : "coin");
  saveState();
  renderAll();

  await wait(REDUCED_MOTION ? 300 : 1700);

  overlay.hidden = true;
  ui.sleeping = false;
  ui.busy = false;
  renderAll();

  if (missed.length) {
    const owed = missed.reduce((sum, note) => sum + note.amount, 0);
    addLog(`Missed ${missed.length} bill(s) worth ${fmt(owed)}. The shark collected.`, "loss");
    showGameOver(`You missed ${missed.length} bill${missed.length === 1 ? "" : "s"} worth ${fmt(owed)}. The shark collected everything.`);
    return;
  }

  toast(`Day ${state.day}. New bill in the ledger.`, "info");
  if (morningEvent) toast(`${morningEvent.name} — ${eventDetail}`, "gold");
  checkPrestigeUnlock();
}

function updatePrestigeExpiry() {
  if (!state.prestigeUnlocked && !state.offerExpired && state.day > PRESTIGE_DAY) {
    state.offerExpired = true;
    addLog("The back-room offer expired. The Shark's Tithe on Day 20 is still open.", "loss");
    toast("Back room offer expired — the Tithe still stands.", "bad");
  }
}

function checkPrestigeUnlock() {
  if (!state || state.gameOver || state.prestigeWin > 0 || state.prestigeUnlocked || state.offerExpired) return;
  if (state.day > PRESTIGE_DAY || state.cash < PRESTIGE_GOAL) return;
  state.prestigeUnlocked = true;
  addLog("The back room door clicks open. Russian roulette unlocked.", "gold");
  saveState();
  sfx("prestige");
  renderAll();
  openModal(`<h2>THE BACK ROOM IS OPEN</h2>
    <p>You hit <b>${fmt(PRESTIGE_GOAL)}</b> on Day <b>${state.day}</b>. The man in the back has been watching. He has a revolver and an offer.</p>
    <p>Each safe pull earns a <b>permanent prestige star</b>. Cash out to keep them. The bullet ends the run.</p>
    <div class="modal-actions">
      <button class="btn btn-purple" data-action="go-backroom">ENTER THE BACK ROOM</button>
      <button class="btn btn-dark" data-action="close-modal">NOT YET</button>
    </div>`);
}

/* ------------------------------------------------------------
   Debt, hustle and settlement
   ------------------------------------------------------------ */
function payDebt(id) {
  if (ui.busy || ui.sleeping || state.gameOver) return;
  const note = state.debts.find(n => n.id === id);
  if (!note) return;
  if (state.cash < note.amount) {
    toast(`Need ${fmt(note.amount)} to clear that bill.`, "bad");
    sfx("error");
    return;
  }
  state.cash -= note.amount;
  state.debts = state.debts.filter(n => n.id !== id);
  state.stats.debtPaid += note.amount;
  addLog(`Paid a ${fmt(note.amount)} bill on Day ${state.day}.`, "win");
  floatCash(-note.amount);
  sfx("coin");
  toast(`Bill paid — ${fmt(note.amount)}`, "good");
  state.stats.bestCash = Math.max(state.stats.bestCash, state.cash);
  if (typeof metaOnPayDebt === "function") metaOnPayDebt(note.amount, false);
  saveState();
  renderAll();
  checkPrestigeUnlock();
}

function payAllDebts() {
  if (ui.busy || ui.sleeping || state.gameOver) return;
  const total = totalDebt();
  if (!total) { toast("The ledger is already clear.", "info"); return; }
  if (state.cash < total) { toast(`Need ${fmt(total)} to clear the ledger.`, "bad"); sfx("error"); return; }
  state.cash -= total;
  state.debts = [];
  state.stats.debtPaid += total;
  addLog(`Cleared the whole ledger for ${fmt(total)}.`, "win");
  floatCash(-total);
  sfx("coin");
  toast(`Ledger cleared — ${fmt(total)}`, "gold");
  if (typeof metaOnPayDebt === "function") metaOnPayDebt(total, true);
  saveState();
  renderAll();
  checkPrestigeUnlock();
}

function doHustle() {
  if (ui.busy || ui.sleeping || state.gameOver) return;
  if (state.sideHustleDay === state.day) { toast("You already worked today.", "bad"); return; }
  if (state.energy < 1) { toast("No energy left. Sleep first.", "bad"); sfx("error"); return; }
  const range = hustleRange();
  const hustleMult = (typeof effectHustleMult === "function") ? effectHustleMult() : 1;
  const pay = Math.max(1, Math.round(randInt(range.min, range.max) * hustleMult));
  state.energy -= 1;
  state.sideHustleDay = state.day;
  state.cash += pay;
  state.stats.bestCash = Math.max(state.stats.bestCash, state.cash);
  addLog(`Side hustle paid ${fmt(pay)}${hustleMult > 1 ? " (doubled)" : ""}.`, "win");
  sfx("coin");
  floatCash(pay);
  toast(`Side hustle — ${signedMoney(pay)}`, "good");
  if (typeof metaOnHustle === "function") metaOnHustle(pay);
  saveState();
  renderAll();
  checkPrestigeUnlock();
}

function takeWager(bet, game) {
  state.cash = Math.max(0, state.cash - Math.round(bet));
  state.energy = Math.max(0, state.energy - game.energy);
  state.stats.played += 1;
  state.bets[game.id] = Math.max(game.minBet, Math.round(bet));
}

function settleGame(gameId, options = {}) {
  const game = getGame(gameId);
  const bet = Math.max(0, Math.round(Number(options.bet) || 0));
  const payout = Math.max(0, Math.round(Number(options.payout) || 0));
  const type = options.type === "win" ? "win" : options.type === "push" ? "push" : "loss";
  const net = payout - bet;

  if (payout > 0) state.cash += payout;

  if (type === "win") {
    state.stats.wins += 1;
    state.stats.totalWon += Math.max(0, net);
    state.stats.biggestWin = Math.max(state.stats.biggestWin, Math.max(0, net));
  } else if (type === "loss") {
    state.stats.losses += 1;
  }
  state.stats.bestCash = Math.max(state.stats.bestCash, state.cash);
  state.prestige.bestCash = Math.max(state.prestige.bestCash, state.cash);

  const summary = {
    type,
    title: options.title || (type === "win" ? "YOU WIN" : type === "push" ? "PUSH" : "YOU LOSE"),
    sub: options.sub || "",
    amount: net,
    big: type === "win" && (net >= bet * 5 || net >= 300)
  };

  const gs = ui.games[gameId];
  if (gs) {
    gs.result = summary;
    if (gs.phase !== undefined) gs.phase = "done";
  }

  addLog(`${summary.title} ${net !== 0 ? signedMoney(net) : ""}`, type === "win" ? "win" : type === "loss" ? "loss" : "gold");
  if (net !== 0) floatCash(net);

  if (type === "win") sfx(summary.big ? "jackpot" : "win");
  else if (type === "push") sfx("push");
  else sfx("lose");

  if (type === "win") toast(`${summary.title} — ${signedMoney(net)}`, "good");
  else if (type === "loss") toast(net < 0 ? `${summary.title} — ${signedMoney(net)}` : summary.title, "bad");
  else toast(summary.title, "gold");

  if (typeof metaOnSettle === "function") {
    metaOnSettle(gameId, {
      result: type,
      net,
      bet,
      payout,
      title: summary.title,
      sub: summary.sub,
      big: summary.big
    });
  }

  saveState();
  renderAll();

  if (state.cash <= 0 && !state.gameOver) {
    showGameOver("You ran out of cash. The floor keeps what it takes.");
    return;
  }
  checkPrestigeUnlock();
}

/* ------------------------------------------------------------
   Game over / prestige victory
   ------------------------------------------------------------ */
function showGameOver(reason = "You ran out of cash.") {
  if (!state) return;
  state.gameOver = true;
  state.gameOverReason = reason;
  stopMusic();
  saveState();
  ui.busy = false;
  ui.sleeping = false;
  const layer = $("#gameoverLayer");
  if (!layer) return;
  layer.hidden = false;
  layer.innerHTML = `<div class="gameover-card">
    <span class="gameover-icon">${sprite("skull")}</span>
    <div class="gameover-kicker">RUN TERMINATED // DAY ${state.day}</div>
    <h1>BUSTED</h1>
    <p class="gameover-reason">${reason}</p>
    <div class="gameover-stats">
      <div class="gameover-stat"><span>DAYS SURVIVED</span><b>${state.stats.daysSurvived}</b></div>
      <div class="gameover-stat"><span>BIGGEST WIN</span><b>${fmt(state.stats.biggestWin)}</b></div>
      <div class="gameover-stat"><span>DEBT PAID</span><b>${fmt(state.stats.debtPaid)}</b></div>
      <div class="gameover-stat"><span>GAMES PLAYED</span><b>${state.stats.played}</b></div>
      <div class="gameover-stat"><span>BEST CASH</span><b>${fmt(state.stats.bestCash)}</b></div>
      <div class="gameover-stat"><span>PRESTIGE STARS</span><b>★ ${state.prestige.stars || 0}</b></div>
    </div>
    <div class="prestige-earned">Permanent stars carry into the next run.</div>
    <div class="gameover-meta">
      <span>PROFILE LV <b>${levelProgress().level}</b></span>
      <span>TOKENS <b>${tokensLabel(profile.tokens)}</b></span>
      <span>TIER <b style="color:${tierFor(totalStars()).color}">${tierFor(totalStars()).name}</b></span>
    </div>
    <div class="gameover-actions">
      <button class="btn btn-gold btn-lg" data-action="restart-run">START A NEW RUN</button>
      <button class="btn btn-dark" data-action="show-help">RULES</button>
    </div>
  </div>`;
  sfx("lose");
}

function restartRun() {
  if (!state) return;
  const stars = (typeof totalStars === "function") ? totalStars() : (state.prestige.stars || 0);
  const runs = (state.prestige.runs || 0) + 1;
  const stats = { ...state.stats };
  const sound = state.sound;
  const music = state.music;
  state = makeState({ stars, runs, stats, sound, music });
  if (typeof recordRunStart === "function") recordRunStart();
  if (typeof syncStars === "function") syncStars();
  resetUI();
  const layer = $("#gameoverLayer");
  if (layer) {
    layer.hidden = true;
    layer.innerHTML = "";
  }
  closeModal();
  lastCashShown = null;
  saveState();
  renderAll();
  startMusic();
  toast("New run. Fresh cash. Same sharks.", "gold");
}

function showPrestigeWin(earned) {
  const layer = $("#gameoverLayer");
  if (!layer) return;
  ui.busy = false;
  stopMusic();
  const tier = tierFor(totalStars());
  const next = nextTierFor(totalStars());
  const startCash = START_CASH + Math.min(totalStars(), 20) * 50 + perkLevel("headStart") * 100;
  layer.hidden = false;
  layer.innerHTML = `<div class="prestige-win-card">
    <div class="big-star">★</div>
    <div class="gameover-kicker">THE HOUSE PAID OUT</div>
    <h1>YOU WALKED OUT ALIVE</h1>
    <p>You banked <b>${earned}</b> prestige star${earned === 1 ? "" : "s"}. The revolver stays on the table. You do not.</p>
    <p>Next run starts with <b>${fmt(startCash)}</b> and permanent bonuses.</p>
    <div class="prestige-earned">PERMANENT STARS <b>★ ${totalStars()}</b></div>
    <div class="gameover-meta">
      <span>TIER <b style="color:${tier.color}">${tier.name}</b></span>
      <span>TOKENS <b>${tokensLabel(profile.tokens)}</b></span>
      ${next ? `<span>NEXT TIER <b>${next.name} (${next.stars - totalStars()}★)</b></span>` : `<span>TOP TIER</span>`}
    </div>
    <button class="btn btn-purple btn-lg" data-action="restart-run">START NEXT RUN</button>
  </div>`;
  sfx("prestige");
}

async function russianPull() {
  if (!state.prestigeUnlocked || ui.busy || state.gameOver) return;
  if (state.russian.remaining <= 1) {
    toast("One chamber left. It is loaded. Cash out.", "bad");
    sfx("error");
    return;
  }
  ui.busy = true;
  const cylinder = $(".cylinder");
  if (cylinder) {
    cylinder.classList.remove("spinning");
    void cylinder.offsetWidth;
    cylinder.classList.add("spinning");
  }
  renderHUD();
  sfx("revolver");
  await wait(REDUCED_MOTION ? 300 : 1150);

  const dead = Math.random() < 1 / state.russian.remaining;
  if (dead) {
    flashScreen();
    sfx("bang");
    const stage = $(".gun-stage");
    if (stage) stage.classList.add("fire");
    addLog("The revolver fired. The run is over.", "loss");
    saveState();
    await wait(REDUCED_MOTION ? 250 : 950);
    ui.busy = false;
    showGameOver("The chamber was loaded. The house collected everything — including your unpreserved seals.");
    return;
  }

  state.russian.remaining -= 1;
  state.russian.earned += 1;
  state.russian.pulled += 1;
  if (typeof metaOnRussian === "function") metaOnRussian(state.russian.earned);
  addLog(`Click. Empty chamber. ${state.russian.earned} seal${state.russian.earned === 1 ? "" : "s"} pending.`, "gold");
  sfx("empty");
  saveState();
  ui.busy = false;
  renderAll();
  if (state.russian.remaining <= 1) toast("One chamber left. It is loaded. Cash out now.", "bad");
  else toast(`Click. ${state.russian.earned} seal${state.russian.earned === 1 ? "" : "s"} pending.`, "gold");
}

function cashOutRussian() {
  if (!state.prestigeUnlocked || ui.busy || state.gameOver) return;
  const earned = state.russian.earned;
  if (earned <= 0) {
    toast("Pull the trigger at least once before cashing out.", "bad");
    sfx("error");
    return;
  }
  if (typeof metaOnPrestige === "function") {
    metaOnPrestige(earned);
  } else {
    state.prestige.stars = (state.prestige.stars || 0) + earned;
    state.stats.prestiges = (state.stats.prestiges || 0) + 1;
  }
  state.prestigeWin = earned;
  addLog(`Cashed out ${earned} prestige star${earned === 1 ? "" : "s"}.`, "gold");
  saveState();
  showPrestigeWin(earned);
}

