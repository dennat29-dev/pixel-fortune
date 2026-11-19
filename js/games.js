/* ============================================================
   GAMBLER'S FORTUNE — cabinet screens and game logic
   ============================================================ */

/* ------------------------------------------------------------
   Shared helpers
   ------------------------------------------------------------ */
function requirePlayable(gameId) {
  const game = getGame(gameId);
  if (!game || ui.busy || ui.sleeping || state.gameOver || state.prestigeWin > 0) return false;
  if (state.energy < game.energy) {
    toast(`Not enough energy (${game.energy} needed). Sleep or work the floor.`, "bad");
    sfx("error");
    return false;
  }
  if (state.cash < getBet(gameId)) {
    toast(`Not enough cash for a ${fmt(getBet(gameId))} wager. Lower the bet.`, "bad");
    sfx("error");
    return false;
  }
  return true;
}

function gameHeadHTML(game) {
  return `<header class="game-head">
    <span class="game-head-icon">${sprite(game.sprite)}</span>
    <div class="game-head-copy">
      <h1>${game.name}</h1>
      <p>${game.blurb}</p>
    </div>
    <div class="game-tags">
      <span class="tag-chip">MIN <b>${fmt(game.minBet)}</b></span>
      <span class="tag-chip energy">ENERGY <b>${game.energy}</b></span>
      <span class="tag-chip hot">PAY <b>${game.pay}</b></span>
    </div>
  </header>`;
}

function gameHint(gameId) {
  switch (gameId) {
    case "coin": return `Win chance <b>47.5%</b> plus luck. A win returns <b>2.00x</b> your stake.`;
    case "dice": return `Even or odd on two dice. Win chance <b>48.5%</b> plus luck. Pays <b>1.92x</b>.`;
    case "blackjack": return `Blackjack pays <b>2.50x</b>. Dealer hits soft 17. Double, or split matching cards up to <b>4 hands</b>.`;
    case "roulette": return `Even-money bets pay <b>2x</b>. Dozens and columns pay <b>3x</b>. A single number pays <b>36x</b>. Zero and double-zero are green.`;
    case "holdem": return `Best five-card hand wins the pot. The house takes a <b>5% rake</b> on winning payouts.`;
    case "plinko": return `Twelve rows, thirteen slots. Edges pay <b>50x</b>; the middle can return less than your stake.`;
    case "slots": return `Any pair pays. Triple sevens pay <b>77x</b>. Three reels, one lever, no mercy.`;
    case "horses": return `Pick a runner. Odds are fixed; the field is weighted. A winning ticket returns odds × stake.`;
    default: return "";
  }
}

function renderGameScreen(gameId) {
  const game = getGame(gameId);
  if (!game) return renderLobby();
  return `<div class="screen game-screen" ${typeof designAttrs === "function" ? designAttrs() : ""}>
    ${gameHeadHTML(game)}
    <section class="game-panel">${renderGameBody(gameId)}</section>
    ${renderResultStrip(gameId)}
    ${renderBetConsole(gameId)}
    <p class="hint-line">${gameHint(gameId)}</p>
  </div>`;
}

function renderGameBody(gameId) {
  switch (gameId) {
    case "coin": return renderCoinBody();
    case "dice": return renderDiceBody();
    case "blackjack": return renderBlackjackBody();
    case "roulette": return renderRouletteBody();
    case "holdem": return renderHoldemBody();
    case "plinko": return renderPlinkoBody();
    case "slots": return renderSlotsBody();
    case "horses": return renderHorsesBody();
    default: return `<p class="hint-line">Cabinet out of order.</p>`;
  }
}

function playCurrentGame() {
  if (!ui.game) return;
  if (ui.busy || ui.sleeping || state.gameOver) return;
  switch (ui.game) {
    case "coin": return playCoin();
    case "dice": return playDice();
    case "blackjack": return bjDeal();
    case "roulette": return playRoulette();
    case "holdem": return holdemDeal();
    case "plinko": return playPlinko();
    case "slots": return playSlots();
    case "horses": return playHorses();
    default: return undefined;
  }
}

/* ------------------------------------------------------------
   Cards
   ------------------------------------------------------------ */
function newDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return shuffle(deck);
}

function cardHTML(card, hidden = false) {
  if (hidden) return `<div class="playing-card back"></div>`;
  if (!card) return `<div class="playing-card empty">—</div>`;
  const red = SUIT_COLORS[card.suit] === "red" ? " red" : "";
  return `<div class="playing-card${red}">
    <span class="rank">${rankLabel(card.rank)}</span>
    <span class="big-suit">${card.suit}</span>
    <span class="suit">${card.suit}</span>
  </div>`;
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  cards.forEach(card => {
    if (!card) return;
    if (card.rank === 14) {
      aces += 1;
      total += 11;
    } else if (card.rank > 10) {
      total += 10;
    } else {
      total += card.rank;
    }
  });
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    soft = aces > 0;
  }
  return { total, soft };
}

/* ------------------------------------------------------------
   Coin flip
   ------------------------------------------------------------ */
function coinFaceLetter(face) {
  return face === "HEADS" ? "H" : "T";
}

function renderCoinBody() {
  const game = ui.games.coin;
  const locked = ui.busy || state.gameOver;
  const face = game.phase === "idle" ? game.lastFace : game.lastFace;
  return `<div class="coin-table">
    <div class="coin-stage">
      <div class="pixel-coin ${game.phase === "flipping" ? "is-flipping" : ""}">${coinFaceLetter(face)}</div>
    </div>
    <div class="coin-faces"><b>H</b><span>HEADS OR TAILS</span><b>T</b></div>
    <div class="coin-choice-row">
      ${["HEADS", "TAILS"].map(choice => `<button class="choice-btn ${game.choice === choice ? "selected" : ""}" data-action="coin-choice" data-choice="${choice}" ${locked ? "disabled" : ""}>
        ${choice}<small>PAYS 2.00x</small>
      </button>`).join("")}
    </div>
    <p class="hint-line">Last landed: <b>${game.lastFace}</b>. The coin does not care about your rent.</p>
  </div>`;
}

function setCoinChoice(choice) {
  if (ui.busy) return;
  ui.games.coin.choice = choice === "TAILS" ? "TAILS" : "HEADS";
  sfx("click", 0.5);
  renderStage();
}

async function playCoin() {
  if (!requirePlayable("coin")) return;
  const gameDef = getGame("coin");
  const game = ui.games.coin;
  const bet = getBet("coin");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "flipping";
  game.result = null;

  const won = cannotLose() || chance(clamp(0.475 + luckBonus(), 0, 0.9));
  const face = won ? game.choice : (game.choice === "HEADS" ? "TAILS" : "HEADS");
  game.lastFace = face;

  renderAll();
  const coin = $(".pixel-coin");
  if (coin) coin.classList.add("is-flipping");
  sfx("spin");

  await wait(REDUCED_MOTION ? 300 : 1450);

  ui.busy = false;
  game.phase = "done";
  const payout = won ? bet * 2 * payoutBonusFor("coin") : 0;
  settleGame("coin", {
    bet,
    payout,
    type: won ? "win" : "loss",
    title: won ? `CALLED IT — ${face}` : `IT LANDED ${face}`,
    sub: won ? `${game.choice} was the call. The coin agreed.` : `You called ${game.choice}. The coin chose violence.`
  });
}

/* ------------------------------------------------------------
   Even / odd dice
   ------------------------------------------------------------ */
const DIE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9]
};

function dieHTML(value, rolling = false) {
  const on = DIE_PIPS[value] || [];
  const pips = Array.from({ length: 9 }, (_, i) => `<span class="pip ${on.includes(i + 1) ? "on" : ""}"></span>`).join("");
  return `<div class="die ${rolling ? "rolling" : ""}">${pips}</div>`;
}

function renderDiceBody() {
  const game = ui.games.dice;
  const locked = ui.busy || state.gameOver;
  const total = game.values[0] + game.values[1];
  return `<div class="dice-table">
    <div class="dice-pair">
      ${dieHTML(game.values[0], game.phase === "rolling")}
      ${dieHTML(game.values[1], game.phase === "rolling")}
      <div class="dice-total">TOTAL<b>${total}</b></div>
    </div>
    <div class="dice-choices">
      <button class="dice-choice ${game.choice === "EVEN" ? "selected" : ""}" data-action="dice-choice" data-choice="EVEN" ${locked ? "disabled" : ""}>EVEN<small>SUM IS EVEN</small></button>
      <button class="dice-choice ${game.choice === "ODD" ? "selected" : ""}" data-action="dice-choice" data-choice="ODD" ${locked ? "disabled" : ""}>ODD<small>SUM IS ODD</small></button>
    </div>
    <div class="dice-payline">WIN CHANCE <b>48.5%</b> + LUCK • PAYS <b>1.92x</b></div>
  </div>`;
}

function setDiceChoice(choice) {
  if (ui.busy) return;
  ui.games.dice.choice = choice === "ODD" ? "ODD" : "EVEN";
  sfx("click", 0.5);
  renderStage();
}

function randomDiceValues(targetParity) {
  const pairs = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      if ((a + b) % 2 === targetParity) pairs.push([a, b]);
    }
  }
  return pairs[rand(pairs.length)] || [1, 1];
}

async function playDice() {
  if (!requirePlayable("dice")) return;
  const gameDef = getGame("dice");
  const game = ui.games.dice;
  const bet = getBet("dice");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "rolling";
  game.result = null;
  game.values = [randInt(1, 6), randInt(1, 6)];
  renderAll();
  sfx("spin");

  const dieEls = $$(".die");
  const scramble = setInterval(() => {
    dieEls.forEach(el => { el.innerHTML = dieHTML(randInt(1, 6), true).replace(/^<div[^>]*>|<\/div>$/g, ""); });
  }, 75);

  await wait(REDUCED_MOTION ? 220 : 900);
  clearInterval(scramble);

  const won = cannotLose() || chance(clamp(0.485 + luckBonus(), 0, 0.9));
  const parity = won ? (game.choice === "EVEN" ? 0 : 1) : (game.choice === "EVEN" ? 1 : 0);
  game.values = randomDiceValues(parity);
  game.phase = "done";
  ui.busy = false;

  const total = game.values[0] + game.values[1];
  const payout = won ? bet * 1.92 * payoutBonusFor("dice") : 0;
  settleGame("dice", {
    bet,
    payout,
    type: won ? "win" : "loss",
    title: won ? `${game.choice} — ${game.values[0]} + ${game.values[1]} = ${total}` : `${total} IS ${parity === 0 ? "EVEN" : "ODD"}`,
    sub: won ? `The bones landed ${parity === 0 ? "even" : "odd"}.` : `You needed ${game.choice.toLowerCase()}. The bones disagreed.`
  });
}
/* ------------------------------------------------------------
   Blackjack
   ------------------------------------------------------------ */
function makeBjHand(cards, bet) {
  return { cards: cards.slice(), bet, done: false, doubled: false, blackjack: false, busted: false, result: null };
}

function renderBlackjackBody() {
  const game = ui.games.blackjack;
  const reveal = game.reveal || game.phase === "done";
  const dealerCards = game.dealer.length
    ? game.dealer.map((card, i) => cardHTML(card, !reveal && i === 1)).join("")
    : "";
  const dealerVisible = game.dealer.length ? handValue(reveal ? game.dealer : [game.dealer[0]]).total : 0;
  const dealerScore = game.dealer.length ? (reveal ? String(handValue(game.dealer).total) : `${dealerVisible} + ?`) : "—";

  const hands = game.hands || [];
  const handBlocks = hands.map((hand, i) => {
    const value = handValue(hand.cards);
    const active = game.phase === "player" && i === game.activeHand;
    const resultTag = hand.result
      ? `<span class="hand-result ${hand.result.type}">${hand.result.type === "win" ? "WIN" : hand.result.type === "push" ? "PUSH" : "LOSS"}</span>`
      : "";
    const badge = hand.blackjack ? `<span class="hand-name-badge">BLACKJACK</span>` : "";
    const label = hands.length > 1 ? `HAND ${i + 1}` : "YOU";
    return `<div class="hand-block ${active ? "active-hand" : ""} ${hand.done && game.phase === "player" ? "hand-done" : ""}">
      <div class="hand-label">${label} ${badge}<span class="score">${value.total || "—"}</span>${resultTag}</div>
      <div class="hand-cards">${hand.cards.map(card => cardHTML(card)).join("")}</div>
    </div>`;
  }).join("");

  const activeHand = hands[game.activeHand];
  const canDouble = game.phase === "player" && activeHand && activeHand.cards.length === 2 && !activeHand.doubled && state.cash >= activeHand.bet;
  const canSplit = game.phase === "player" && activeHand && activeHand.cards.length === 2
    && activeHand.cards[0].rank === activeHand.cards[1].rank
    && hands.length < 4 && state.cash >= activeHand.bet;
  const actions = game.phase === "player" ? `<div class="card-actions">
    <button class="btn btn-green" data-action="bj-hit">HIT</button>
    <button class="btn btn-gold" data-action="bj-stand">STAND</button>
    <button class="btn btn-dark" data-action="bj-double" ${canDouble ? "" : "disabled"}>DOUBLE</button>
    <button class="btn btn-cyan" data-action="bj-split" ${canSplit ? "" : "disabled"}>SPLIT</button>
  </div>` : "";

  return `<div class="felt blackjack-table">
    <div class="felt-label">BLACKJACK PAYS 3:2 // DEALER HITS SOFT 17</div>
    <div class="hand-block">
      <div class="hand-label">DEALER <span class="score">${dealerScore}</span></div>
      <div class="hand-cards">${dealerCards}</div>
    </div>
    <div class="bj-status">${game.status || "Place your bet and deal."}</div>
    ${handBlocks}
    ${actions}
    <div class="bj-rule">BLACKJACK 2.5x • WIN 2x • PUSH RETURNS STAKE • SPLIT UP TO 4 HANDS</div>
  </div>`;
}

function bjDeal() {
  if (!requirePlayable("blackjack")) return;
  const game = ui.games.blackjack;
  if (game.phase === "player" || game.phase === "dealer") return;

  const def = getGame("blackjack");
  const bet = getBet("blackjack");
  takeWager(bet, def);

  game.phase = "player";
  game.deck = newDeck();
  game.hands = [makeBjHand([game.deck.pop(), game.deck.pop()], bet)];
  game.dealer = [game.deck.pop(), game.deck.pop()];
  game.activeHand = 0;
  game.result = null;
  game.reveal = false;
  game.status = "Your move. Hit or stand.";
  const playerNatural = handValue(game.hands[0].cards).total === 21;
  game.hands[0].blackjack = playerNatural;
  game.dealerNatural = handValue(game.dealer).total === 21;
  sfx("deal");
  saveState();
  renderAll();

  if (playerNatural || game.dealerNatural) {
    ui.busy = true;
    const token = ++game.settleToken;
    game.naturalTimer = setTimeout(() => {
      if (game.settleToken !== token) return;
      ui.busy = false;
      bjSettleHands();
    }, REDUCED_MOTION ? 120 : 650);
  }
}

/* Draw for a hand. When the house is broken the player can never bust —
   the drawn card is swapped for a safe one instead. */
function bjDrawCard(game, hand) {
  hand.cards.push(game.deck.pop());
  if (cannotLose() && handValue(hand.cards).total > 21) {
    const bust = hand.cards.pop();
    const safeIdx = game.deck.findIndex(c => handValue([...hand.cards, c]).total <= 21);
    if (safeIdx >= 0) {
      const [safe] = game.deck.splice(safeIdx, 1);
      hand.cards.push(safe);
      game.deck.push(bust);
    } else {
      hand.cards.push(bust);
    }
  }
}

function bjHit() {
  const game = ui.games.blackjack;
  if (ui.busy || game.phase !== "player") return;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.done) return;
  bjDrawCard(game, hand);
  sfx("deal");
  const value = handValue(hand.cards);
  if (value.total > 21) {
    hand.busted = true;
    hand.done = true;
    game.status = `Hand ${game.activeHand + 1} busts on ${value.total}.`;
    renderAll();
    bjAdvance();
    return;
  }
  if (value.total === 21) {
    hand.done = true;
    game.status = `Hand ${game.activeHand + 1} stands on 21.`;
    renderAll();
    bjAdvance();
    return;
  }
  game.status = `Hand ${game.activeHand + 1} shows ${value.total}. Hit or stand.`;
  renderStage();
}

function bjStand() {
  const game = ui.games.blackjack;
  if (ui.busy || game.phase !== "player") return;
  const hand = game.hands[game.activeHand];
  if (!hand) return;
  hand.done = true;
  sfx("deal");
  renderAll();
  bjAdvance();
}

function bjDouble() {
  const game = ui.games.blackjack;
  if (ui.busy || game.phase !== "player") return;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.cards.length !== 2 || hand.doubled) return;
  if (state.cash < hand.bet) {
    toast("Not enough cash to double.", "bad");
    sfx("error");
    return;
  }
  state.cash -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  bjDrawCard(game, hand);
  sfx("deal");
  const value = handValue(hand.cards);
  if (value.total > 21) hand.busted = true;
  hand.done = true;
  game.status = `Hand ${game.activeHand + 1} doubled to ${fmt(hand.bet)}${hand.busted ? ` — bust on ${value.total}` : ` showing ${value.total}`}.`;
  renderAll();
  bjAdvance();
}

function bjSplit() {
  const game = ui.games.blackjack;
  if (ui.busy || game.phase !== "player") return;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.cards.length !== 2) return;
  if (hand.cards[0].rank !== hand.cards[1].rank) return;
  if (game.hands.length >= 4) { toast("Four hands maximum.", "bad"); sfx("error"); return; }
  if (state.cash < hand.bet) { toast("Not enough cash to split.", "bad"); sfx("error"); return; }
  state.cash -= hand.bet;
  const moved = hand.cards.pop();
  const newHand = makeBjHand([moved], hand.bet);
  hand.cards.push(game.deck.pop());
  newHand.cards.push(game.deck.pop());
  game.hands.splice(game.activeHand + 1, 0, newHand);
  sfx("deal");
  if (hand.cards[0].rank === 14) {
    hand.done = true;
    newHand.done = true;
    game.status = "Split aces. One card each.";
    renderAll();
    bjAdvance();
    return;
  }
  game.status = "Split. Playing the first hand.";
  renderAll();
}

function bjAdvance() {
  const game = ui.games.blackjack;
  if (game.phase !== "player") return;
  const next = game.hands.findIndex(h => !h.done);
  if (next === -1) {
    bjDealerPlay();
    return;
  }
  game.activeHand = next;
  const value = handValue(game.hands[next].cards);
  game.status = `Hand ${next + 1} shows ${value.total}. Hit or stand.`;
  renderStage();
}

async function bjDealerPlay() {
  const game = ui.games.blackjack;
  if (game.phase === "done") return;
  game.phase = "dealer";
  game.reveal = true;
  game.status = "Dealer draws...";
  sfx("deal");
  renderAll();
  ui.busy = true;
  await wait(REDUCED_MOTION ? 100 : 550);
  while (true) {
    const value = handValue(game.dealer);
    const mustHit = value.total < 17 || (value.total === 17 && value.soft);
    if (!mustHit) break;
    game.dealer.push(game.deck.pop());
    game.status = `Dealer draws... showing ${handValue(game.dealer).total}.`;
    sfx("deal");
    renderAll();
    await wait(REDUCED_MOTION ? 100 : 560);
    if (game.dealer.length > 10) break;
  }
  ui.busy = false;
  bjSettleHands();
}

function bjSettleHands() {
  const game = ui.games.blackjack;
  if (game.phase === "done") return;
  const dealer = handValue(game.dealer).total;
  const dealerBust = dealer > 21;
  let totalBet = 0;
  let totalPayout = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let naturalWin = false;

  const invincible = cannotLose();
  game.hands.forEach(hand => {
    const value = handValue(hand.cards);
    totalBet += hand.bet;
    let type = "loss";
    let payout = 0;
    if (invincible) {
      // The house is broken: every hand is paid, busts included.
      type = "win";
      payout = hand.bet * (hand.blackjack && !game.dealerNatural ? 2.5 : 2) * payoutBonusFor("blackjack");
      if (hand.blackjack && !game.dealerNatural) naturalWin = true;
    } else if (hand.busted || value.total > 21) {
      type = "loss";
    } else if (hand.blackjack) {
      if (game.dealerNatural) { type = "push"; payout = hand.bet; }
      else { type = "win"; payout = hand.bet * 2.5 * payoutBonusFor("blackjack"); naturalWin = true; }
    } else if (game.dealerNatural) {
      type = "loss";
    } else if (dealerBust || value.total > dealer) {
      type = "win";
      payout = hand.bet * 2 * payoutBonusFor("blackjack");
    } else if (value.total < dealer) {
      type = "loss";
    } else {
      type = "push";
      payout = hand.bet;
    }
    hand.result = { type, payout };
    if (type === "win") wins += 1;
    else if (type === "push") pushes += 1;
    else losses += 1;
    totalPayout += payout;
  });

  game.phase = "done";
  game.reveal = true;
  const net = totalPayout - totalBet;
  const type = net > 0 ? "win" : net < 0 ? "loss" : "push";

  let title;
  if (naturalWin) title = "BLACKJACK!";
  else if (type === "win") title = wins > 1 ? `${wins} HANDS WIN` : "YOU WIN";
  else if (type === "push") title = "PUSH";
  else title = losses > 1 ? "BOTH HANDS LOSE" : "YOU LOSE";

  const parts = [];
  if (wins) parts.push(`${wins} win${wins === 1 ? "" : "s"}`);
  if (pushes) parts.push(`${pushes} push${pushes === 1 ? "" : "es"}`);
  if (losses) parts.push(`${losses} loss${losses === 1 ? "" : "es"}`);
  const sub = `Dealer ${dealerBust ? `busts on ${dealer}` : `stands on ${dealer}`} — ${parts.join(", ")}.`;

  game.status = sub;
  settleGame("blackjack", { bet: totalBet, payout: totalPayout, type, title, sub });
}

/* ------------------------------------------------------------
   Texas Hold'em
   ------------------------------------------------------------ */
function evaluateFive(cards) {
  const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
  const suits = cards.map(card => card.suit);
  const flush = suits.every(suit => suit === suits[0]);
  const counts = new Map();
  ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1));
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) straightHigh = 5;
  }

  if (flush && straightHigh) {
    return { score: [8, straightHigh], name: straightHigh === 14 ? "ROYAL FLUSH" : "STRAIGHT FLUSH" };
  }
  if (groups[0].count === 4) {
    return { score: [7, groups[0].rank, groups[1].rank], name: "FOUR OF A KIND" };
  }
  if (groups[0].count === 3 && groups[1] && groups[1].count === 2) {
    return { score: [6, groups[0].rank, groups[1].rank], name: "FULL HOUSE" };
  }
  if (flush) return { score: [5, ...ranks], name: "FLUSH" };
  if (straightHigh) return { score: [4, straightHigh], name: "STRAIGHT" };
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank);
    return { score: [3, groups[0].rank, ...kickers], name: "THREE OF A KIND" };
  }
  if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
    const pairs = groups.filter(g => g.count === 2).map(g => g.rank).sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1);
    return { score: [2, pairs[0], pairs[1], kicker ? kicker.rank : 0], name: "TWO PAIR" };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return { score: [1, groups[0].rank, ...kickers], name: "PAIR" };
  }
  return { score: [0, ...ranks], name: "HIGH CARD" };
}

function compareScores(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function bestHand(cards) {
  if (!cards || cards.length < 5) {
    return { score: [0], name: "HIGH CARD" };
  }
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(result.score, best.score) > 0) best = result;
          }
        }
      }
    }
  }
  return best;
}

function renderHoldemBody() {
  const game = ui.games.holdem;
  const reveal = game.reveal || game.phase === "done";
  const dealerCards = game.dealer.length
    ? game.dealer.map(card => cardHTML(card, !reveal)).join("")
    : "";
  const playerCards = game.player.map(card => cardHTML(card)).join("");
  const community = Array.from({ length: 5 }, (_, i) => cardHTML(game.community[i] || null)).join("");
  const playerHand = game.player.length + game.community.length >= 5 ? bestHand([...game.player, ...game.community]) : null;
  const dealerHand = reveal && game.dealer.length + game.community.length >= 5 ? bestHand([...game.dealer, ...game.community]) : null;
  const playerBadge = playerHand ? `<span class="hand-name-badge">${playerHand.name}</span>` : "";
  const dealerBadge = dealerHand ? `<span class="hand-name-badge">${dealerHand.name}</span>` : "";
  const actions = game.phase === "decision" ? `<div class="card-actions">
    <button class="btn btn-green" data-action="holdem-showdown">CALL / SHOWDOWN</button>
    <button class="btn btn-dark" data-action="holdem-fold">FOLD</button>
  </div>` : "";
  const pot = game.bet ? fmt(game.bet * 2) : fmt(0);
  const status = game.phase === "decision"
    ? "Call the bet to see all five community cards, or fold and keep your dignity."
    : game.phase === "reveal"
      ? "Dealing the board..."
      : game.phase === "done"
        ? (game.result ? game.result.sub : "Hand complete.")
        : "Set a wager and deal. Best five-card hand takes the pot.";

  return `<div class="felt holdem-table">
    <div class="felt-label">HEADS-UP HOLD'EM // 5% HOUSE RAKE</div>
    <div class="hand-block">
      <div class="hand-label">DEALER ${dealerBadge}</div>
      <div class="hand-cards">${dealerCards}</div>
    </div>
    <div class="community-row">
      <span class="pot-badge">POT<br>${pot}</span>
      ${community}
      <span class="pot-badge">RAKE<br>5%</span>
    </div>
    <div class="hand-block">
      <div class="hand-label">YOU ${playerBadge}</div>
      <div class="hand-cards">${playerCards}</div>
    </div>
    <div class="bj-status">${status}</div>
    ${actions}
  </div>`;
}

function holdemDeal() {
  if (!requirePlayable("holdem")) return;
  const game = ui.games.holdem;
  if (game.phase === "decision" || game.phase === "reveal") return;

  const def = getGame("holdem");
  const bet = getBet("holdem");
  takeWager(bet, def);

  game.phase = "decision";
  game.deck = newDeck();
  game.player = [game.deck.pop(), game.deck.pop()];
  game.dealer = [game.deck.pop(), game.deck.pop()];
  game.community = [];
  game.result = null;
  game.folded = false;
  game.reveal = false;
  game.bet = bet;
  sfx("deal");
  saveState();
  renderAll();
}

function holdemFold() {
  const game = ui.games.holdem;
  if (ui.busy || game.phase !== "decision") return;
  game.folded = true;
  game.reveal = false;
  game.phase = "done";
  const invincible = cannotLose();
  settleGame("holdem", {
    bet: game.bet || getBet("holdem"),
    payout: invincible ? (game.bet || getBet("holdem")) : 0,
    type: invincible ? "push" : "loss",
    title: invincible ? "THE HOUSE REFUSES" : "FOLDED",
    sub: invincible ? "You mucked the hand. The broken house slid your stake back." : "You mucked the hand. The pot stays on the table."
  });
}

async function holdemShowdown() {
  const game = ui.games.holdem;
  if (ui.busy || game.phase !== "decision") return;
  ui.busy = true;
  game.phase = "reveal";
  game.reveal = true;
  game.result = null;
  renderAll();
  sfx("deal");
  await wait(REDUCED_MOTION ? 120 : 600);

  game.community.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
  sfx("deal");
  renderAll();
  await wait(REDUCED_MOTION ? 120 : 650);

  game.community.push(game.deck.pop());
  sfx("deal");
  renderAll();
  await wait(REDUCED_MOTION ? 120 : 650);

  game.community.push(game.deck.pop());
  sfx("deal");
  renderAll();
  await wait(REDUCED_MOTION ? 120 : 650);

  const player = bestHand([...game.player, ...game.community]);
  const dealer = bestHand([...game.dealer, ...game.community]);
  const bet = game.bet || getBet("holdem");
  const compare = compareScores(player.score, dealer.score);
  ui.busy = false;

  if (compare > 0) {
    settleGame("holdem", {
      bet,
      payout: bet * 1.9 * payoutBonusFor("holdem"),
      type: "win",
      title: "POT GOES TO YOU",
      sub: `Your ${player.name} beats the dealer's ${dealer.name}.`
    });
  } else if (compare < 0) {
    settleGame("holdem", {
      bet,
      payout: 0,
      type: "loss",
      title: "DEALER TAKES THE POT",
      sub: `Dealer's ${dealer.name} beats your ${player.name}.`
    });
  } else {
    settleGame("holdem", {
      bet,
      payout: bet,
      type: "push",
      title: "SPLIT POT",
      sub: `Both hold ${player.name}. Stake returned.`
    });
  }
}
/* ------------------------------------------------------------
   Roulette
   ------------------------------------------------------------ */
const ROULETTE_OUTSIDE = [
  { id: "red", label: "RED", pay: 2 },
  { id: "black", label: "BLACK", pay: 2 },
  { id: "even", label: "EVEN", pay: 2 },
  { id: "odd", label: "ODD", pay: 2 },
  { id: "low", label: "1–18", pay: 2 },
  { id: "high", label: "19–36", pay: 2 }
];

const ROULETTE_DOZENS = [
  { id: "dozen1", label: "1–12", min: 1, max: 12 },
  { id: "dozen2", label: "13–24", min: 13, max: 24 },
  { id: "dozen3", label: "25–36", min: 25, max: 36 }
];

const ROULETTE_COLUMNS = [
  { id: "col1", label: "COL 1", mod: 1 },
  { id: "col2", label: "COL 2", mod: 2 },
  { id: "col3", label: "COL 3", mod: 0 }
];

function rouletteDozen(game) { return ROULETTE_DOZENS.find(d => d.id === game.betType) || null; }
function rouletteColumn(game) { return ROULETTE_COLUMNS.find(c => c.id === game.betType) || null; }

function rouletteBetLabel(game) {
  if (game.betType === "number") return `NUMBER ${pocketLabel(game.number)}`;
  const dozen = rouletteDozen(game);
  if (dozen) return `DOZEN ${dozen.label}`;
  const column = rouletteColumn(game);
  if (column) return column.label;
  const found = ROULETTE_OUTSIDE.find(bet => bet.id === game.betType);
  return found ? found.label : "RED";
}

function rouletteMultiplier(game) {
  if (game.betType === "number") return 36;
  if (rouletteDozen(game) || rouletteColumn(game)) return 3;
  return 2;
}

function rouletteFavorable(game) {
  if (game.betType === "number") return [game.number];
  if (game.betType === "red") return WHEEL_ORDER.filter(p => pocketColor(p) === "red");
  if (game.betType === "black") return WHEEL_ORDER.filter(p => pocketColor(p) === "black");
  if (game.betType === "even") return WHEEL_ORDER.filter(p => p !== 0 && p !== 37 && p % 2 === 0);
  if (game.betType === "odd") return WHEEL_ORDER.filter(p => p !== 0 && p !== 37 && p % 2 === 1);
  if (game.betType === "low") return WHEEL_ORDER.filter(p => p >= 1 && p <= 18);
  if (game.betType === "high") return WHEEL_ORDER.filter(p => p >= 19 && p <= 36);
  const dozen = rouletteDozen(game);
  if (dozen) return WHEEL_ORDER.filter(p => p >= dozen.min && p <= dozen.max);
  const column = rouletteColumn(game);
  if (column) return WHEEL_ORDER.filter(p => p >= 1 && p <= 36 && p % 3 === column.mod);
  return [];
}

function rouletteWins(game, pocket) {
  if (game.betType === "number") return pocket === game.number;
  const color = pocketColor(pocket);
  if (game.betType === "red") return color === "red";
  if (game.betType === "black") return color === "black";
  if (game.betType === "even") return pocket !== 0 && pocket !== 37 && pocket % 2 === 0;
  if (game.betType === "odd") return pocket !== 0 && pocket !== 37 && pocket % 2 === 1;
  if (game.betType === "low") return pocket >= 1 && pocket <= 18;
  if (game.betType === "high") return pocket >= 19 && pocket <= 36;
  const dozen = rouletteDozen(game);
  if (dozen) return pocket >= dozen.min && pocket <= dozen.max;
  const column = rouletteColumn(game);
  if (column) return pocket >= 1 && pocket <= 36 && pocket % 3 === column.mod;
  return false;
}

function renderRouletteBody() {
  const game = ui.games.roulette;
  const locked = ui.busy || state.gameOver;
  const shownPocket = game.phase === "done" && game.winning != null ? WHEEL_ORDER[game.winning] : null;
  const shownColor = shownPocket == null ? "" : pocketColor(shownPocket);
  const numberCells = [];
  for (let n = 1; n <= 36; n++) {
    const color = pocketColor(n);
    const selected = game.betType === "number" && game.number === n;
    numberCells.push(`<button class="roulette-number ${color}-num ${selected ? "selected" : ""}" data-action="roulette-bet" data-bet="number" data-number="${n}" ${locked ? "disabled" : ""}>${n}</button>`);
  }
  [0, 37].forEach(pocket => {
    const selected = game.betType === "number" && game.number === pocket;
    numberCells.push(`<button class="roulette-number green-num ${selected ? "selected" : ""}" data-action="roulette-bet" data-bet="number" data-number="${pocket}" ${locked ? "disabled" : ""}>${pocketLabel(pocket)}</button>`);
  });

  return `<div class="roulette-layout">
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <canvas id="rouletteCanvas" class="roulette-canvas" width="520" height="520"></canvas>
    </div>
    <div class="roulette-board">
      <div class="roulette-outside">
        ${ROULETTE_OUTSIDE.map(bet => {
          const extra = bet.id === "red" ? " red-bet" : bet.id === "black" ? " black-bet" : "";
          return `<button class="outside-btn${extra} ${game.betType === bet.id ? "selected" : ""}" data-action="roulette-bet" data-bet="${bet.id}" ${locked ? "disabled" : ""}>${bet.label}</button>`;
        }).join("")}
      </div>
      <div class="roulette-numbers">${numberCells.join("")}</div>
      <div class="roulette-outside roulette-dozens">
        ${ROULETTE_DOZENS.map(d => `<button class="outside-btn dozen-btn ${game.betType === d.id ? "selected" : ""}" data-action="roulette-bet" data-bet="${d.id}" ${locked ? "disabled" : ""}>${d.label}</button>`).join("")}
      </div>
      <div class="roulette-outside roulette-columns">
        ${ROULETTE_COLUMNS.map(c => `<button class="outside-btn column-btn ${game.betType === c.id ? "selected" : ""}" data-action="roulette-bet" data-bet="${c.id}" ${locked ? "disabled" : ""}>${c.label}</button>`).join("")}
      </div>
      <div class="bet-readout">
        <span>BET <b>${rouletteBetLabel(game)}</b></span>
        <span>PAYS <b>${rouletteMultiplier(game)}x</b></span>
        <div class="roulette-result-number ${shownColor ? shownColor + "-num" : ""}">${shownPocket == null ? "—" : pocketLabel(shownPocket)}</div>
      </div>
      <p class="hint-line">${game.phase === "spinning" ? "The wheel is spinning..." : "Pick a bet on the table. The wheel handles the rest."}</p>
    </div>
  </div>`;
}

function setRouletteBet(type, number) {
  if (ui.busy) return;
  const game = ui.games.roulette;
  if (game.phase === "spinning") return;
  game.betType = type;
  if (type === "number") game.number = clamp(Math.floor(Number(number) || 0), 0, 37);
  game.lastBetText = rouletteBetLabel(game);
  sfx("click", 0.5);
  renderStage();
}

async function playRoulette() {
  if (!requirePlayable("roulette")) return;
  const gameDef = getGame("roulette");
  const game = ui.games.roulette;
  const bet = getBet("roulette");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "spinning";
  game.winning = null;
  game.result = null;
  game.lastBetText = rouletteBetLabel(game);

  let index = null;
  const mult = rouletteMultiplier(game);
  // Scale the luck nudge so long-shot numbers get the same expected boost
  // as even-money bets instead of turning 36x bets into a guaranteed edge.
  const luckChance = clamp(luckBonus() * 2 / mult, 0, 1);
  if (cannotLose() || chance(luckChance)) {
    const favorable = rouletteFavorable(game);
    if (favorable.length) {
      const pocket = favorable[rand(favorable.length)];
      const found = WHEEL_ORDER.indexOf(pocket);
      if (found >= 0) index = found;
    }
  }
  if (index == null) index = rand(WHEEL_ORDER.length);

  renderAll();
  sfx("spin");
  await animateRoulette(index);

  const pocket = WHEEL_ORDER[index];
  const won = rouletteWins(game, pocket);
  game.winning = index;
  game.phase = "done";
  ui.busy = false;

  settleGame("roulette", {
    bet,
    payout: won ? bet * mult * payoutBonusFor("roulette") : 0,
    type: won ? "win" : "loss",
    title: `THE BALL LANDS ON ${pocketLabel(pocket)}`,
    sub: `${rouletteBetLabel(game)} ${won ? `pays ${mult}x.` : "loses to the wheel."}`
  });
}

/* ------------------------------------------------------------
   Plinko
   ------------------------------------------------------------ */
function renderPlinkoBody() {
  const game = ui.games.plinko;
  const mult = game.phase === "done" && game.lastBucket != null ? PLINKO_MULTS[game.lastBucket] : null;
  const statusClass = mult != null && mult < 1 ? " loss" : "";
  const status = game.phase === "dropping"
    ? "Ball in the air. Gravity is deciding your rent."
    : mult != null
      ? `Landed in the <b>${fmtMult(mult)}</b> slot.`
      : "Press play to drop the ball.";
  const unique = Array.from(new Set(PLINKO_MULTS)).sort((a, b) => b - a);
  return `<div class="plinko-layout">
    <canvas id="plinkoCanvas" class="plinko-canvas" width="900" height="630"></canvas>
    <div class="plinko-legend">
      ${unique.map(m => `<span class="mult-chip"><b>${fmtMult(m)}</b> SLOT</span>`).join("")}
    </div>
    <div class="plinko-status${statusClass}">${status}</div>
  </div>`;
}

async function playPlinko() {
  if (!requirePlayable("plinko")) return;
  const gameDef = getGame("plinko");
  const game = ui.games.plinko;
  const bet = getBet("plinko");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "dropping";
  game.result = null;
  game.lastBucket = null;

  let bucket;
  if (cannotLose()) {
    const winBuckets = PLINKO_MULTS.map((m, i) => (m > 1 ? i : -1)).filter(i => i >= 0);
    bucket = winBuckets[rand(winBuckets.length)];
  } else {
    const roll = Array.from({ length: PLINKO_ROWS }, () => chance(0.5));
    bucket = roll.reduce((sum, right) => sum + (right ? 1 : 0), 0);
  }
  const rights = shuffle(Array.from({ length: PLINKO_ROWS }, (_, i) => i < bucket));

  renderAll();
  sfx("spin");
  await runPlinkoDrop(rights, bucket);

  const mult = PLINKO_MULTS[bucket];
  const payout = bet * mult * payoutBonusFor("plinko");
  game.lastBucket = bucket;
  game.phase = "done";
  ui.busy = false;

  settleGame("plinko", {
    bet,
    payout,
    type: payout > bet ? "win" : payout === bet ? "push" : "loss",
    title: `${fmtMult(mult)} SLOT`,
    sub: mult >= 10 ? "The edges paid. Somebody check on the house." : mult >= 1 ? "A respectable drop." : "The middle takes its cut."
  });
}

/* ------------------------------------------------------------
   Lucky 7s slots
   ------------------------------------------------------------ */
const SLOT_WEIGHTS = { cherry: 20, bell: 14, star: 12, diamond: 8, seven: 4, skull: 16, clover: 26 };
const SLOT_PAIR_MULT = { cherry: 1.7, bell: 2.2, star: 2.5, diamond: 3.5, seven: 7, skull: 1.6, clover: 1.4 };

function slotSymbol(id) {
  return SLOT_SYMBOLS.find(s => s.id === id) || SLOT_SYMBOLS[0];
}

function pickSlotSymbol() {
  const total = SLOT_SYMBOLS.reduce((sum, s) => sum + (SLOT_WEIGHTS[s.id] || 1), 0);
  let roll = Math.random() * total;
  for (const symbol of SLOT_SYMBOLS) {
    roll -= SLOT_WEIGHTS[symbol.id] || 1;
    if (roll <= 0) return symbol.id;
  }
  return SLOT_SYMBOLS[0].id;
}

function renderSlotsBody() {
  const game = ui.games.slots;
  const done = game.phase === "done";
  const reels = game.reels.map((id, i) => {
    const glowing = done && game.winning.includes(i) ? " win-glow" : "";
    return `<div class="reel-window${glowing}"><span class="reel-symbol">${sprite(id)}</span></div>`;
  }).join("");
  return `<div class="slot-cabinet">
    <div class="slot-reels">${reels}</div>
    <div class="slot-paytable">
      ${SLOT_SYMBOLS.map(symbol => `<span class="pay-chip"><span class="mini-sym">${sprite(symbol.id)}</span>×3 <b>${symbol.triple}x</b></span>`).join("")}
      <span class="pay-chip">ANY PAIR <b>PAYS</b></span>
    </div>
    <div class="slot-lever-note">TRIPLE 7s PAYS <b>77x</b> • PAIRS PAY 1.4x–7x • ENERGY 2</div>
  </div>`;
}

async function playSlots() {
  if (!requirePlayable("slots")) return;
  const gameDef = getGame("slots");
  const game = ui.games.slots;
  const bet = getBet("slots");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "spinning";
  game.result = null;
  game.winning = [];
  game.reels = cannotLose()
    ? (() => { const s = pickSlotSymbol(); return [s, s, s]; })()
    : [pickSlotSymbol(), pickSlotSymbol(), pickSlotSymbol()];

  renderAll();
  const reelEls = $$(".reel-window");
  reelEls.forEach(el => el.classList.add("spinning"));
  const scramble = setInterval(() => {
    reelEls.forEach(el => {
      if (el.dataset.landed === "1") return;
      el.innerHTML = `<span class="reel-symbol">${sprite(pickSlotSymbol())}</span>`;
    });
  }, 70);
  sfx("slot");

  for (let i = 0; i < 3; i++) {
    await wait(REDUCED_MOTION ? 90 : 420);
    const el = reelEls[i];
    if (!el) continue;
    el.dataset.landed = "1";
    el.classList.remove("spinning");
    el.classList.add("landed");
    el.innerHTML = `<span class="reel-symbol">${sprite(game.reels[i])}</span>`;
    sfx("tick", 0.6);
  }
  clearInterval(scramble);
  await wait(REDUCED_MOTION ? 80 : 260);

  const [a, b, c] = game.reels;
  let mult = 0;
  let title = "NO MATCH";
  let sub = "Three reels, zero mercy.";
  const winning = [];
  if (a === b && b === c) {
    const symbol = slotSymbol(a);
    mult = symbol.triple;
    title = `TRIPLE ${symbol.name}`;
    sub = "Three of a kind. The cabinet screams.";
    winning.push(0, 1, 2);
  } else {
    if (a === b) winning.push(0, 1);
    else if (a === c) winning.push(0, 2);
    else if (b === c) winning.push(1, 2);
    if (winning.length === 2) {
      const symbol = slotSymbol(a === b || a === c ? a : b);
      mult = SLOT_PAIR_MULT[symbol.id] || 1.5;
      title = `PAIR OF ${symbol.name}S`;
      sub = "A pair pays. Keep the reels warm.";
    }
  }

  game.winning = winning;
  game.phase = "done";
  ui.busy = false;

  settleGame("slots", {
    bet,
    payout: mult > 0 ? bet * mult * payoutBonusFor("slots") : 0,
    type: mult > 0 ? "win" : "loss",
    title,
    sub
  });
}

/* ------------------------------------------------------------
   Horse racing
   ------------------------------------------------------------ */
function renderHorsesBody() {
  const game = ui.games.horses;
  const locked = ui.busy || state.gameOver;
  const status = game.phase === "racing"
    ? "They're running. Hold your ticket."
    : game.phase === "done" && game.winner != null
      ? `Winner: <b>${HORSES[game.winner].name}</b>. ${game.pick === game.winner ? "Your ticket cashed." : "Your ticket is confetti."}`
      : "Pick a runner. Weighted field, fixed odds.";

  return `<div class="horse-layout">
    <canvas id="raceCanvas" class="race-canvas" width="920" height="430"></canvas>
    <div class="horse-picks">
      ${HORSES.map((horse, i) => `<button class="horse-pick ${game.pick === i ? "selected" : ""}" data-action="horses-pick" data-index="${i}" ${locked ? "disabled" : ""}>
        <span class="mini-horse">${sprite("horse")}</span>
        <b>${horse.name}</b>
        <span>#${horse.num} • <em>${horse.odds.toFixed(1)}x</em></span>
        <span class="lane-color" style="--lane:${horse.color}"></span>
      </button>`).join("")}
    </div>
    <div class="race-status">${status}</div>
  </div>`;
}

function setHorsePick(index) {
  if (ui.busy) return;
  const game = ui.games.horses;
  game.pick = clamp(Math.floor(Number(index) || 0), 0, HORSES.length - 1);
  sfx("click", 0.5);
  renderStage();
}

async function playHorses() {
  if (!requirePlayable("horses")) return;
  const gameDef = getGame("horses");
  const game = ui.games.horses;
  const bet = getBet("horses");

  ui.busy = true;
  takeWager(bet, gameDef);
  game.phase = "racing";
  game.result = null;
  game.winner = null;
  game.finalProgress = null;

  const winnerIndex = cannotLose() ? clamp(game.pick, 0, HORSES.length - 1) : HORSES.indexOf(pickWeighted(HORSES, horse => horse.chance));
  const winner = HORSES[winnerIndex] || HORSES[0];
  const winnerDuration = 3600 + randInt(0, 480);
  const durations = HORSES.map((horse, i) => i === winnerIndex ? winnerDuration : winnerDuration + randInt(50, 520));
  game.currentProgress = HORSES.map(() => 0);

  renderAll();
  sfx("hoof");
  await runHorseRace(winnerIndex, durations);

  game.phase = "done";
  game.winner = winnerIndex;
  ui.busy = false;

  const won = game.pick === winnerIndex;
  const picked = HORSES[game.pick] || HORSES[0];
  settleGame("horses", {
    bet,
    payout: won ? bet * picked.odds * payoutBonusFor("horses") : 0,
    type: won ? "win" : "loss",
    title: won ? `${picked.name} WINS` : `${winner.name} WINS`,
    sub: won
      ? `Ticket #${picked.num} cashed at ${picked.odds.toFixed(1)}x.`
      : `Your #${picked.num} ${picked.name} never found the line.`
  });
}


