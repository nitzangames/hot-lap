import { GAME_W, GAME_H, TILE, FIXED_DT, GHOST_ALPHA } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies, buildCurbArcs, buildBrakeMarkers } from './track.js';
import { Camera } from './camera.js';
import {
  drawTrack, drawCar, drawHUD,
  drawTitleScreen, drawCountdown, drawFinishScreen, drawCrashScreen,
  drawSteeringWheel, drawMinimap, drawCarSelect,
} from './renderer.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { Ghost } from './ghost.js';
import { GameState } from './game.js';
import { World, Vec2 } from '../physics2d/index.js';
import { SkidMarks } from './skidmarks.js';
import { ScreenShake, drawGrass, drawTrackNoise, drawSpeedLines, triggerCrashFlash, drawCrashFlash } from './effects.js';
import { drawStyledCar, loadCarConfig, saveCarConfig, hueToColors } from './car-styles.js';

// ── Canvas setup ──────────────────────────────────────────────────────────────
// Logical pixels only — no DPR multiplication. CSS handles responsive sizing
// via object-fit: contain. This keeps the GPU backing store small (2 MP) and
// avoids per-touch compositor stalls on iOS Safari.

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = GAME_W;
canvas.height = GAME_H;

// ── Direction angles for car spawn ────────────────────────────────────────────

const dirAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ── Seed encoding (number <-> alpha string) ──────────────────────────────────

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 chars (no I, O to avoid confusion)

function seedToAlpha(num) {
  num = Math.abs(num) >>> 0; // ensure positive 32-bit
  let s = '';
  do {
    s = ALPHA[num % ALPHA.length] + s;
    num = Math.floor(num / ALPHA.length);
  } while (num > 0);
  return s;
}

function alphaToSeed(str) {
  let num = 0;
  for (const ch of str.toUpperCase()) {
    const idx = ALPHA.indexOf(ch);
    if (idx < 0) continue;
    num = num * ALPHA.length + idx;
  }
  return num;
}

// ── Track initialization ──────────────────────────────────────────────────────

let world, track, centerLine, walls, wallBodies, curbs, brakeMarkers;
const screenShake = new ScreenShake();
let car, ghost, gameState, skidmarks;
let currentSeed = Date.now();
let currentSeedAlpha = seedToAlpha(currentSeed);
let trackStartAngle = 0;

function initTrack(seed) {
  currentSeed = seed;
  currentSeedAlpha = seedToAlpha(seed);

  // Create a fresh physics world
  world = new World({ gravity: new Vec2(0, 0) });

  // Generate track data
  track = generateTrack(seed);
  centerLine = buildTrackPath(track);
  walls = buildWallPaths(centerLine);
  wallBodies = createWallBodies(world, walls);
  curbs = buildCurbArcs(track);
  brakeMarkers = buildBrakeMarkers(track);

  // Ghost system for this seed (TEMP: clear old ghost data)
  try { localStorage.removeItem(`racing-2d:ghost:${seed}`); } catch(_) {}
  ghost = new Ghost(seed);

  // Game state
  gameState = new GameState();

  // Spawn car
  spawnCar();

  // Set up collision handling
  world.onCollision = (a, b, contact) => {
    const aIsWall = a.userData && a.userData.type === 'wall';
    const bIsWall = b.userData && b.userData.type === 'wall';
    const aIsCar  = a.userData && a.userData.type === 'car';
    const bIsCar  = b.userData && b.userData.type === 'car';

    if ((aIsCar && bIsWall) || (bIsCar && aIsWall)) {
      const wasCrashed = car.crashed;
      car.onWallCollision(contact);
      if (car.crashed && !wasCrashed) {
        screenShake.trigger(40);
        triggerCrashFlash();
      } else if (!car.crashed) {
        screenShake.trigger(15);
      }
    }
  };
}

// ── Car spawn ─────────────────────────────────────────────────────────────────

function spawnCar() {
  // Remove old car body from world if it exists
  if (car && car.body) {
    world.removeBody(car.body);
  }

  car = new Car(world);
  const gridTile = track.tiles[0]; // grid (P1) tile
  const startAngle = dirAngles[gridTile.dir];
  // P1 position: top-left of the grid tile (offset from center)
  const fwd = { x: Math.sin(startAngle), y: -Math.cos(startAngle) };
  const perp = { x: fwd.y, y: -fwd.x }; // left perpendicular
  const tileCx = (gridTile.gx + 0.5) * TILE;
  const tileCy = (gridTile.gy + 0.5) * TILE;
  const startX = tileCx + perp.x * TILE * 0.2 + fwd.x * TILE * 0.25;
  const startY = tileCy + perp.y * TILE * 0.2 + fwd.y * TILE * 0.25;
  car.spawn(startX, startY, startAngle);
  trackStartAngle = startAngle;
  hasLeftStart = false;
  skidmarks = new SkidMarks();
}

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new Input(canvas);

// ── Camera ────────────────────────────────────────────────────────────────────

const camera = new Camera();

// ── Finish line detection (circuit: cross start tile again after leaving it) ──

let hasLeftStart = false;

function checkFinishLine() {
  const startTile = track.tiles[1]; // start/finish line tile (after grid)
  const sx = (startTile.gx + 0.5) * TILE;
  const sy = (startTile.gy + 0.5) * TILE;
  const dx = car.physX - sx;
  const dy = car.physY - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (!hasLeftStart) {
    // Must leave the start tile area first
    if (dist > TILE * 1.5) {
      hasLeftStart = true;
    }
    return false;
  }

  return dist < TILE * 0.4;
}

// ── Car customization ────────────────────────────────────────────────────────

let carConfig = loadCarConfig();
let carSelectHitAreas = null;
let titleHitAreas = null;
let finishHitAreas = null;
let crashHitAreas = null;
let isDraggingSlider = false;

// ── Click handling ───────────────────────────────────────────────────────────

function clientToGame(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (GAME_W / rect.width),
    y: (clientY - rect.top) * (GAME_H / rect.height),
  };
}

function hitTest(gx, gy, box) {
  return box && gx >= box.x && gx <= box.x + box.w && gy >= box.y && gy <= box.y + box.h;
}

function handleClick(clientX, clientY) {
  const { x, y } = clientToGame(clientX, clientY);

  if (gameState.state === 'title' && titleHitAreas) {
    if (hitTest(x, y, titleHitAreas.raceBox)) {
      gameState.startCountdown();
    } else if (hitTest(x, y, titleHitAreas.carBox)) {
      gameState.state = 'carselect';
    }
  } else if (gameState.state === 'finished' && finishHitAreas) {
    if (hitTest(x, y, finishHitAreas.retryBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      initTrack(Date.now());
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.menuBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
    }
  } else if (gameState.state === 'crashed' && crashHitAreas) {
    if (hitTest(x, y, crashHitAreas.retryBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.startCountdown();
    } else if (hitTest(x, y, crashHitAreas.menuBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
    }
  }
}

function handleCarSelectClick(clientX, clientY) {
  if (!carSelectHitAreas) return;
  const { x, y } = clientToGame(clientX, clientY);

  // Check style boxes
  for (const box of carSelectHitAreas.styleBoxes) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      carConfig.styleIndex = box.index;
      saveCarConfig(carConfig.styleIndex, carConfig.hue);
      return;
    }
  }

  // Check slider
  const sl = carSelectHitAreas.sliderBox;
  if (x >= sl.x && x <= sl.x + sl.w && y >= sl.y && y <= sl.y + sl.h) {
    carConfig.hue = Math.round(((x - sl.x) / sl.w) * 360) % 360;
    saveCarConfig(carConfig.styleIndex, carConfig.hue);
    isDraggingSlider = true;
    return;
  }

  // Check GO button
  const go = carSelectHitAreas.goBox;
  if (x >= go.x && x <= go.x + go.w && y >= go.y && y <= go.y + go.h) {
    gameState.startCountdown();
    return;
  }
}

function handleCarSelectDrag(clientX, clientY) {
  if (!isDraggingSlider || !carSelectHitAreas) return;
  const { x } = clientToGame(clientX, clientY);
  const sl = carSelectHitAreas.sliderBox;
  const t = Math.max(0, Math.min(1, (x - sl.x) / sl.w));
  carConfig.hue = Math.round(t * 360) % 360;
  saveCarConfig(carConfig.styleIndex, carConfig.hue);
}

function handleCarSelectRelease() {
  isDraggingSlider = false;
}

// Track pointer down position to distinguish taps from drags
let pointerDownX = 0;
let pointerDownY = 0;
const TAP_THRESHOLD = 15; // max pixels moved to count as a tap

canvas.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
  if (gameState.state === 'carselect') {
    handleCarSelectClick(e.clientX, e.clientY);
  }
}, { passive: true });

canvas.addEventListener('pointermove', (e) => {
  if (gameState.state === 'carselect') {
    handleCarSelectDrag(e.clientX, e.clientY);
  }
}, { passive: true });

canvas.addEventListener('pointerup', (e) => {
  if (gameState.state === 'carselect') {
    handleCarSelectRelease();
    return;
  }
  const dx = e.clientX - pointerDownX;
  const dy = e.clientY - pointerDownY;
  if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
    handleClick(e.clientX, e.clientY);
  }
}, { passive: true });

// ── Initialize first track ────────────────────────────────────────────────────

initTrack(currentSeed);

// ── Game loop ─────────────────────────────────────────────────────────────────

let lastTime = performance.now();
let accumulator = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Cap dt to avoid spiral of death
  if (dt > 1 / 30) dt = 1 / 30;

  // Process raw pointer input once per frame
  input.update();

  // Fixed timestep accumulator
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    fixedUpdate();
    accumulator -= FIXED_DT;
  }

  render();
}

// ── Fixed update (per physics tick) ───────────────────────────────────────────

let finishDelayTimer = 0;
const FINISH_DELAY = 0.5; // seconds before showing finish screen
let finishPreviousBest = null;

function fixedUpdate() {
  const state = gameState.state;

  if (state === 'countdown') {
    gameState.tickCountdown();
  } else if (state === 'racing') {
    // Car physics
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();

    // Skid marks
    skidmarks.update(car.physX, car.physY, car.physAngle, input.steering, car.speed);

    // Record ghost
    ghost.record(car.physX, car.physY, car.physAngle);

    // Advance ghost playback
    ghost.advancePlayback();

    // Tick race time
    gameState.tickRace();

    // Check finish line FIRST — crossing the line counts even if you crashed on it
    if (checkFinishLine()) {
      finishPreviousBest = ghost.bestTime;
      gameState.state = 'finishing';
      finishDelayTimer = 0;
      return;
    }

    // Check crash
    if (car.crashed) {
      gameState.crash();
      return;
    }
  } else if (state === 'finishing') {
    // Car keeps driving during delay
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();
    skidmarks.update(car.physX, car.physY, car.physAngle, input.steering, car.speed);

    // Keep recording ghost
    ghost.record(car.physX, car.physY, car.physAngle);
    ghost.advancePlayback();

    finishDelayTimer += FIXED_DT;
    if (finishDelayTimer >= FINISH_DELAY) {
      gameState.finish(finishPreviousBest);
      const isNew = ghost.saveIfBest(gameState.raceTime);
      gameState.isNewRecord = isNew;
    }
  }
  // title, finished, crashed: no physics
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const state = gameState.state;

  // Camera follows car (interpolated render position)
  camera.follow(car.x, car.y, car.angle);

  // Update screen shake
  screenShake.update(1 / 60);

  // Clear canvas
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Apply camera + screen shake
  camera.apply(ctx);
  ctx.translate(screenShake.offsetX, screenShake.offsetY);

  // Textured grass background (world-space)
  drawGrass(ctx, camera.x, camera.y, camera.angle);

  // Track
  drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers);

  // Track surface noise
  drawTrackNoise(ctx, centerLine);

  // Skid marks (on track surface, before cars)
  skidmarks.draw(ctx);

  // Ghost car (draw behind player)
  if (state === 'racing' || state === 'countdown' || state === 'finishing') {
    const ghostFrame = ghost.getGhostFrame();
    if (ghostFrame) {
      drawStyledCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, carConfig.styleIndex, carConfig.hue + 180, GHOST_ALPHA);
    }
  }

  // Player car
  drawStyledCar(ctx, car.x, car.y, car.angle, carConfig.styleIndex, carConfig.hue, 1);

  camera.restore(ctx);

  // Speed lines (screen-space, only during racing)
  if (state === 'racing' || state === 'finishing') {
    drawSpeedLines(ctx, car.speed, 1350);
  }

  // Crash flash (screen-space)
  drawCrashFlash(ctx, 1 / 60);

  // Minimap and speed — always show
  drawMinimap(ctx, track, centerLine, car.physX, car.physY, car.speed * 0.26, trackStartAngle);

  // Seed — always visible (top left)
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '20px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('seed: ' + currentSeedAlpha + '  tiles: ' + track.tiles.length, 16, 16);
  ctx.restore();

  // HUD timer — show during racing and finishing
  if (state === 'racing' || state === 'finishing') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, car.speed * 0.26, currentSeedAlpha);

    // Steering wheel (only while dragging)
    if (input.dragging) {
      drawSteeringWheel(ctx, input.dragScreenX, input.dragScreenY, input.steering, car.speed * 0.26);
    }
  }

  // Overlays
  if (state === 'title') {
    const { bodyColor } = hueToColors(carConfig.hue);
    titleHitAreas = drawTitleScreen(ctx, currentSeedAlpha, bodyColor, 1/60);
  } else if (state === 'carselect') {
    carSelectHitAreas = drawCarSelect(ctx, carConfig.styleIndex, carConfig.hue);
  } else if (state === 'countdown') {
    drawCountdown(ctx, gameState.countdownNumber);
  } else if (state === 'racing' && gameState.raceTime < 500) {
    drawCountdown(ctx, 0);
  } else if (state === 'finished') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, 0, currentSeedAlpha);
    finishHitAreas = drawFinishScreen(
      ctx,
      gameState.raceTime / 1000,
      gameState.finishDelta !== null ? gameState.finishDelta / 1000 : null,
      gameState.isNewRecord
    );
  } else if (state === 'crashed') {
    crashHitAreas = drawCrashScreen(ctx);
  }
}

requestAnimationFrame(gameLoop);
