/* ============================================================
   GAMBLER'S FORTUNE — canvas games (roulette, plinko, horse racing)
   ============================================================ */

function prepCanvas(canvas, width, height) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/* ------------------------------------------------------------
   ROULETTE
   ------------------------------------------------------------ */
const ROULETTE_SIZE = 520;

function drawRouletteWheel(canvas, rotation = 0, winner = null, ballAngle = -Math.PI / 2) {
  if (!canvas) return;
  const ctx = prepCanvas(canvas, ROULETTE_SIZE, ROULETTE_SIZE);
  const size = ROULETTE_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.455;
  const step = (Math.PI * 2) / 38;

  ctx.clearRect(0, 0, size, size);

  // warm glow behind the wheel
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.15);
  glow.addColorStop(0, "rgba(255, 207, 74, 0.11)");
  glow.addColorStop(1, "rgba(255, 207, 74, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
  ctx.fill();

  // outer wooden/metal rim
  ctx.fillStyle = "#0b0d17";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3b3152";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = "#a0712b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 15, 0, Math.PI * 2);
  ctx.stroke();

  // pockets
  for (let i = 0; i < 38; i++) {
    const value = WHEEL_ORDER[i];
    const start = -Math.PI / 2 + rotation + i * step;
    const end = start + step;
    const color = pocketColor(value);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    if (color === "red") ctx.fillStyle = i === winner ? "#e92d57" : "#9e1834";
    else if (color === "black") ctx.fillStyle = i === winner ? "#33384b" : "#131622";
    else ctx.fillStyle = i === winner ? "#23d17d" : "#117345";
    ctx.fill();
    ctx.strokeStyle = "#080a12";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (i === winner) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 2, start, end);
      ctx.closePath();
      ctx.strokeStyle = "#fff3a1";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // number label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + step / 2);
    ctx.fillStyle = color === "green" ? "#eafff1" : "#fff6df";
    ctx.font = `bold ${value >= 10 || value === 37 ? 13 : 15}px "VT323", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pocketLabel(value), r * 0.84, 0);
    ctx.restore();
  }

  // inner rings and hub
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0c16";
  ctx.fill();
  ctx.strokeStyle = "#493c2b";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "#171b2d";
  ctx.fill();
  ctx.strokeStyle = "#68552e";
  ctx.lineWidth = 2;
  ctx.stroke();

  // spokes
  for (let i = 0; i < 8; i++) {
    const a = rotation + (i * Math.PI * 2) / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
    ctx.lineTo(cx + Math.cos(a) * r * 0.54, cy + Math.sin(a) * r * 0.54);
    ctx.strokeStyle = "#4a422d";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 25, 0, Math.PI * 2);
  ctx.fillStyle = "#ffcf4a";
  ctx.fill();
  ctx.strokeStyle = "#4d2f0c";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#4d2f0c";
  ctx.font = 'bold 18px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", cx, cy + 1);

  // ball
  const bx = cx + Math.cos(ballAngle) * r * 0.89;
  const by = cy + Math.sin(ballAngle) * r * 0.89;
  ctx.beginPath();
  ctx.arc(bx + 2, by + 3, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#fff6dd";
  ctx.fill();
  ctx.strokeStyle = "#8b6a2a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx - 2, by - 2, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function initRouletteCanvas() {
  const canvas = document.getElementById("rouletteCanvas");
  if (!canvas) return;
  const game = ui.games.roulette;
  const winner = game.phase === "done" ? game.winning : null;
  drawRouletteWheel(canvas, game.rotation || 0, winner);
}

function animateRoulette(winnerIndex) {
  return new Promise(resolve => {
    const canvas = document.getElementById("rouletteCanvas");
    if (!canvas) return resolve();
    const game = ui.games.roulette;
    const start = game.rotation || 0;
    const step = (Math.PI * 2) / 38;
    const align = -((winnerIndex + 0.5) * step);
    const currentMod = ((start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const alignMod = ((align % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let delta = alignMod - currentMod;
    if (delta < 0) delta += Math.PI * 2;
    const target = start + delta + Math.PI * 2 * 6;
    const duration = REDUCED_MOTION ? 350 : 3700;
    const started = performance.now();
    let lastTick = 0;
    let lastSoundTick = 0;

    function frame(now) {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const rotation = start + (target - start) * eased;
      const ballAngle = -Math.PI / 2 + Math.sin(t * Math.PI * 7) * 0.018;
      drawRouletteWheel(canvas, rotation, null, ballAngle);
      if (now - lastSoundTick > 115 && t < 0.82) {
        lastSoundTick = now;
        if (now - lastTick > 180) {
          lastTick = now;
          sfx("tick", 0.4);
        }
      }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        game.rotation = target % (Math.PI * 2);
        drawRouletteWheel(canvas, game.rotation, winnerIndex, -Math.PI / 2);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/* ------------------------------------------------------------
   PLINKO
   ------------------------------------------------------------ */
const PLINKO_W = 900;
const PLINKO_H = 630;
const PLINKO_BUCKET_Y = 545;
const PLINKO_BUCKET_H = 64;
const PLINKO_MARGIN = 34;
const PLINKO_SLOT_W = (PLINKO_W - PLINKO_MARGIN * 2) / 13;

function plinkoBucketColor(mult) {
  if (mult >= 50) return ["#ffcf4a", "#5b3a09"];
  if (mult >= 10) return ["#b16cff", "#2e1550"];
  if (mult >= 3) return ["#5de8ff", "#0c4452"];
  if (mult >= 1.5) return ["#5cf58f", "#0e4f30"];
  if (mult >= 1) return ["#297c53", "#0a2c1c"];
  if (mult >= 0.8) return ["#514531", "#231d12"];
  return ["#7b3245", "#2d0d16"];
}

function drawPlinkoBoard(canvas, ball = null, activeBucket = null, trail = []) {
  if (!canvas) return;
  const ctx = prepCanvas(canvas, PLINKO_W, PLINKO_H);

  const bg = ctx.createLinearGradient(0, 0, 0, PLINKO_H);
  bg.addColorStop(0, "#11152b");
  bg.addColorStop(0.6, "#090c18");
  bg.addColorStop(1, "#070911");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, PLINKO_W, PLINKO_H);

  // dotted backdrop
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  for (let y = 20; y < PLINKO_H; y += 28) {
    for (let x = 18; x < PLINKO_W; x += 28) ctx.fillRect(x, y, 1.5, 1.5);
  }

  // header
  ctx.fillStyle = "#ffcf4a";
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.textAlign = "left";
  ctx.fillText("PLINKO // DROP ZONE", 22, 28);
  ctx.fillStyle = "#5de8ff";
  ctx.font = '16px "VT323", monospace';
  ctx.textAlign = "right";
  ctx.fillText("12 ROWS • 13 SLOTS", PLINKO_W - 22, 28);

  const center = PLINKO_W / 2;
  const pegTop = 64;
  const pegBottom = PLINKO_BUCKET_Y - 48;
  const rowGap = (pegBottom - pegTop) / 11;

  // pegs
  for (let row = 0; row < PLINKO_ROWS; row++) {
    const count = row + 3;
    const startX = center - ((count - 1) / 2) * PLINKO_SLOT_W;
    const y = pegTop + row * rowGap;
    for (let i = 0; i < count; i++) {
      const x = startX + i * PLINKO_SLOT_W;
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = "#535c91";
      ctx.fill();
      ctx.strokeStyle = "#090b16";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }
  }

  // buckets
  for (let i = 0; i < 13; i++) {
    const mult = PLINKO_MULTS[i];
    const x = PLINKO_MARGIN + i * PLINKO_SLOT_W;
    const [fill, edge] = plinkoBucketColor(mult);
    const active = activeBucket === i;
    const inset = 2.5;
    ctx.fillStyle = active ? fill : edge;
    ctx.fillRect(x + inset, PLINKO_BUCKET_Y, PLINKO_SLOT_W - inset * 2, PLINKO_BUCKET_H);
    ctx.strokeStyle = active ? "#fff3a1" : fill;
    ctx.lineWidth = active ? 4 : 2;
    ctx.strokeRect(x + inset, PLINKO_BUCKET_Y, PLINKO_SLOT_W - inset * 2, PLINKO_BUCKET_H);

    // top lip
    ctx.fillStyle = fill;
    ctx.fillRect(x + 5, PLINKO_BUCKET_Y - 5, PLINKO_SLOT_W - 10, 7);

    if (active) {
      ctx.save();
      ctx.shadowColor = fill;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = "#fff3a1";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 3, PLINKO_BUCKET_Y - 3, PLINKO_SLOT_W - 6, PLINKO_BUCKET_H + 6);
      ctx.restore();
    }

    ctx.fillStyle = active ? "#0b0d17" : "#f7f1df";
    ctx.font = `bold ${mult >= 10 ? 20 : 19}px "VT323", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${mult}x`, x + PLINKO_SLOT_W / 2, PLINKO_BUCKET_Y + PLINKO_BUCKET_H / 2 + 1);
  }

  // trail
  trail.forEach((p, idx) => {
    const alpha = Math.max(0, idx / trail.length) * 0.34;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 + idx * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(93,232,255,${alpha})`;
    ctx.fill();
  });

  // ball
  if (ball) {
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y + 4, 11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "#5de8ff";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = "#5de8ff";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ball.x - 2.5, ball.y - 3, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#f5ffff";
    ctx.fill();
  }

  ctx.textBaseline = "alphabetic";
  return { center, pegTop, rowGap, bucketY: PLINKO_BUCKET_Y };
}

function plinkoPathPoints(rights) {
  const points = [];
  const center = PLINKO_W / 2;
  const startY = 66;
  const endY = PLINKO_BUCKET_Y - 22;
  let x = center;
  points.push({ x, y: startY });
  for (let i = 0; i < rights.length; i++) {
    x += rights[i] ? PLINKO_SLOT_W / 2 : -PLINKO_SLOT_W / 2;
    const y = startY + ((i + 1) / rights.length) * (endY - startY);
    points.push({ x, y });
  }
  return points;
}

function initPlinkoCanvas() {
  const canvas = document.getElementById("plinkoCanvas");
  if (!canvas) return;
  const game = ui.games.plinko;
  if (game.phase === "done" && game.lastBucket != null) {
    const ballX = PLINKO_MARGIN + game.lastBucket * PLINKO_SLOT_W + PLINKO_SLOT_W / 2;
    drawPlinkoBoard(canvas, { x: ballX, y: PLINKO_BUCKET_Y - 16 }, game.lastBucket, []);
  } else {
    drawPlinkoBoard(canvas, { x: PLINKO_W / 2, y: 66 }, null, []);
  }
}

function runPlinkoDrop(rights, targetBucket) {
  return new Promise(resolve => {
    const canvas = document.getElementById("plinkoCanvas");
    if (!canvas) return resolve();
    const points = plinkoPathPoints(rights);
    const duration = REDUCED_MOTION ? 400 : 2700;
    const started = performance.now();
    const trail = [];
    let lastRow = 0;

    function frame(now) {
      const t = clamp((now - started) / duration, 0, 1);
      const easy = t * t * (3 - 2 * t);
      const global = easy * PLINKO_ROWS;
      const index = Math.min(PLINKO_ROWS - 1, Math.floor(global));
      const local = Math.min(1, global - index);
      const p0 = points[index];
      const p1 = points[index + 1];
      const x = p0.x + (p1.x - p0.x) * local;
      const baseY = p0.y + (p1.y - p0.y) * local;
      const bounce = -Math.abs(Math.sin(local * Math.PI)) * 9;
      const ball = { x, y: baseY + bounce };
      trail.push({ x, y: ball.y });
      if (trail.length > 28) trail.shift();
      drawPlinkoBoard(canvas, ball, null, trail);

      const currentRow = Math.floor(global);
      if (currentRow > lastRow) {
        lastRow = currentRow;
        if (currentRow % 2 === 0) sfx("tick", 0.25);
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        drawPlinkoBoard(
          canvas,
          { x: PLINKO_MARGIN + targetBucket * PLINKO_SLOT_W + PLINKO_SLOT_W / 2, y: PLINKO_BUCKET_Y - 16 },
          targetBucket,
          trail
        );
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/* ------------------------------------------------------------
   HORSE RACING
   ------------------------------------------------------------ */
const RACE_W = 920;
const RACE_H = 430;

function drawHorseSprite(ctx, x, y, color, frame = 0, scale = 1) {
  const s = scale;
  const legA = Math.sin(frame) * 3;
  const legB = Math.sin(frame + Math.PI) * 3;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);

  // outline
  ctx.fillStyle = "#05060b";
  ctx.fillRect(0, 9, 30, 13);
  ctx.fillRect(23, 2, 16, 9);
  ctx.fillRect(30, 8, 10, 8);
  ctx.fillRect(2, 20, 5, 12);
  ctx.fillRect(10, 20, 5, 12);
  ctx.fillRect(19, 20, 5, 12);
  ctx.fillRect(25, 20, 5, 12);
  ctx.fillRect(34, 8, 7, 4);
  ctx.fillRect(35, 1, 4, 5);
  ctx.fillRect(24, -2, 5, 5);

  // body
  ctx.fillStyle = color;
  ctx.fillRect(3, 10, 26, 10);
  ctx.fillRect(24, 4, 13, 7);
  ctx.fillRect(31, 9, 8, 5);
  ctx.fillRect(36, 2, 2, 4);

  // mane
  ctx.fillStyle = "#22160d";
  ctx.fillRect(24, 1, 3, 6);
  ctx.fillRect(27, 3, 2, 5);
  ctx.fillRect(29, 6, 2, 4);

  // eye and saddle
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(33, 5, 2, 2);
  ctx.fillStyle = "#05060b";
  ctx.fillRect(34, 5, 1, 1);
  ctx.fillStyle = "#ffcf4a";
  ctx.fillRect(10, 8, 9, 4);
  ctx.fillStyle = "#7a3f19";
  ctx.fillRect(11, 12, 7, 2);

  // legs
  ctx.fillStyle = color;
  ctx.fillRect(3 + legA, 21, 3, 10);
  ctx.fillRect(11 + legB, 21, 3, 10);
  ctx.fillRect(19 + legB, 21, 3, 10);
  ctx.fillRect(25 + legA, 21, 3, 10);
  ctx.fillStyle = "#05060b";
  ctx.fillRect(2 + legA, 29, 5, 3);
  ctx.fillRect(10 + legB, 29, 5, 3);
  ctx.fillRect(18 + legB, 29, 5, 3);
  ctx.fillRect(24 + legA, 29, 5, 3);

  // tail
  ctx.fillStyle = "#22160d";
  ctx.fillRect(-2, 8, 5, 3);
  ctx.fillRect(-4, 10, 5, 4);
  ctx.restore();
}

function drawHorseRace(canvas, progress = null, winnerIndex = null, finished = false, focusIndex = -1) {
  if (!canvas) return;
  const ctx = prepCanvas(canvas, RACE_W, RACE_H);
  const laneH = 66;
  const trackTop = 56;
  const startX = 145;
  const finishX = 824;

  const bg = ctx.createLinearGradient(0, 0, 0, RACE_H);
  bg.addColorStop(0, "#151a31");
  bg.addColorStop(0.25, "#0c2019");
  bg.addColorStop(1, "#07110d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, RACE_W, RACE_H);

  // stadium lights
  const glow = ctx.createRadialGradient(RACE_W / 2, 0, 20, RACE_W / 2, 0, RACE_W * 0.7);
  glow.addColorStop(0, "rgba(255,207,74,0.16)");
  glow.addColorStop(1, "rgba(255,207,74,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, RACE_W, RACE_H * 0.7);

  ctx.fillStyle = "#ffcf4a";
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = "left";
  ctx.fillText("PIXEL DOWNS // RACE 8", 16, 22);
  ctx.fillStyle = "#8e96bd";
  ctx.font = '16px "VT323", monospace';
  ctx.textAlign = "right";
  ctx.fillText(finished ? "PHOTO FINISH" : "POST TIME", RACE_W - 16, 22);

  // infield stripe
  ctx.fillStyle = "rgba(255,207,74,0.06)";
  ctx.fillRect(0, trackTop - 7, RACE_W, 5);

  for (let i = 0; i < HORSES.length; i++) {
    const y = trackTop + i * laneH;
    ctx.fillStyle = i % 2 === 0 ? "#0c1d16" : "#091811";
    ctx.fillRect(0, y, RACE_W, laneH - 3);
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.fillRect(0, y + laneH - 4, RACE_W, 1);

    if (i === focusIndex) {
      ctx.fillStyle = "rgba(255,207,74,0.05)";
      ctx.fillRect(0, y, RACE_W, laneH - 3);
    }

    // lane number
    ctx.fillStyle = HORSES[i].color;
    ctx.fillRect(14, y + 18, 20, 20);
    ctx.fillStyle = "#071009";
    ctx.font = 'bold 12px "VT323", monospace';
    ctx.textAlign = "center";
    ctx.fillText(HORSES[i].num, 24, y + 34);

    // horse name
    ctx.fillStyle = i === focusIndex ? "#fff3a1" : "#9da6c9";
    ctx.font = 'bold 17px "VT323", monospace';
    ctx.textAlign = "left";
    ctx.fillText(HORSES[i].name, 43, y + 33);
  }

  // starting gate posts / finish line
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let y = trackTop; y < trackTop + laneH * 5; y += 12) {
    ctx.fillRect(startX - 8, y, 2, 6);
  }
  for (let y = trackTop; y < trackTop + laneH * 5; y += 10) {
    ctx.fillStyle = Math.floor((y - trackTop) / 10) % 2 === 0 ? "#f4eedf" : "#171a28";
    ctx.fillRect(finishX, y, 9, 10);
  }
  ctx.strokeStyle = "#ffcf4a";
  ctx.lineWidth = 2;
  for (let y = trackTop + 32; y < trackTop + laneH * 5; y += laneH) {
    ctx.beginPath();
    ctx.moveTo(finishX - 4, y);
    ctx.lineTo(finishX - 4, y + laneH - 4);
    ctx.stroke();
  }

  // progress
  for (let i = 0; i < HORSES.length; i++) {
    const y = trackTop + i * laneH + 28;
    const p = progress ? progress[i] : 0;
    const eased = progress ? p : 0;
    const x = startX + (finishX - startX) * clamp(eased, 0, 1.04);
    const bob = Math.sin(performance.now() / 105 + i) * (p > 0 && p < 0.99 ? 1.8 : 0);
    if (i === winnerIndex && finished) {
      ctx.save();
      ctx.shadowColor = HORSES[i].color;
      ctx.shadowBlur = 14;
      drawHorseSprite(ctx, x, y + bob, HORSES[i].color, performance.now() / 100, 1.6);
      ctx.restore();
    } else {
      drawHorseSprite(ctx, x, y + bob, HORSES[i].color, performance.now() / 100, 1.6);
    }
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font = '11px "VT323", monospace';
  ctx.fillText("START", startX - 32, RACE_H - 7);
  ctx.fillText("FINISH", finishX - 22, RACE_H - 7);
}

function initHorseCanvas() {
  const canvas = document.getElementById("raceCanvas");
  if (!canvas) return;
  const game = ui.games.horses;
  if (game.phase === "done" && game.finalProgress) {
    drawHorseRace(canvas, game.finalProgress, game.winner, true, game.pick);
  } else if (game.phase === "racing" && game.currentProgress) {
    drawHorseRace(canvas, game.currentProgress, null, false, game.pick);
  } else {
    drawHorseRace(canvas, HORSES.map(() => 0), null, false, game.pick);
  }
}

function runHorseRace(winnerIndex, durations) {
  return new Promise(resolve => {
    const canvas = document.getElementById("raceCanvas");
    if (!canvas) return resolve();
    const game = ui.games.horses;
    const started = performance.now();
    const winnerDuration = durations[winnerIndex];
    let lastHoof = 0;
    const progress = HORSES.map(() => 0);

    function frame(now) {
      const elapsed = now - started;
      for (let i = 0; i < HORSES.length; i++) {
        const raw = clamp(elapsed / durations[i], 0, 1);
        const eased = 1 - Math.pow(1 - raw, 2.15);
        const wobble = raw < 0.94 ? Math.sin(elapsed / 95 + i * 2.1) * 0.004 : 0;
        progress[i] = clamp(eased + wobble, 0, 1);
      }
      game.currentProgress = progress.slice();
      drawHorseRace(canvas, progress, null, false, game.pick);
      if (now - lastHoof > 190) {
        lastHoof = now;
        sfx("hoof", 0.28);
      }
      if (elapsed < winnerDuration) {
        requestAnimationFrame(frame);
      } else {
        // Let the stragglers move a touch further in the final frozen frame.
        for (let i = 0; i < HORSES.length; i++) {
          if (elapsed < durations[i]) {
            const raw = clamp(elapsed / durations[i], 0, 1);
            progress[i] = clamp(1 - Math.pow(1 - raw, 2.15), 0, 1);
          }
        }
        game.finalProgress = progress.slice();
        drawHorseRace(canvas, progress, winnerIndex, true, game.pick);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}
