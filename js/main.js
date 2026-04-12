import { GAME_W, GAME_H, TILE, FIXED_DT, GHOST_ALPHA, TRACK_SEEDS } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies, buildCurbArcs, buildBrakeMarkers } from './track.js';
import { Camera } from './camera.js';
import {
  drawTrack, drawCar, drawHUD,
  drawTitleScreen, drawCountdown, drawFinishScreen, drawCrashScreen,
  drawSteeringWheel, drawMinimap, drawCarSelect, drawTrackSelect,
  drawPauseButton, drawPauseMenu,
} from './renderer.js';
import {
  initAudio, playCountdownBeep, playGoBeep, playCrash, playLapFinish, playClick,
  hapticTap, hapticThump,
  getSfxEnabled, getHapticsEnabled, setSfxEnabled, setHapticsEnabled,
} from './audio.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { Ghost } from './ghost.js';
import { TopGhost } from './top-ghost.js';
import { GameState } from './game.js';
import { World, Vec2 } from '../physics2d/index.js';
import { SkidMarks } from './skidmarks.js';
import { ScreenShake, drawGrass, drawTrackNoise, triggerCrashFlash, drawCrashFlash, TireSmoke, SparkBurst } from './effects.js';
import { drawStyledCar, loadCarConfig, saveCarConfig, hueToColors } from './car-styles.js';
import * as leaderboard from './leaderboard.js';

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
const tireSmoke = new TireSmoke();
const sparkBurst = new SparkBurst();
let car, ghost, gameState, skidmarks;
let topGhost = null; // TopGhost instance for the current track, or null
let currentTrackIndex = 0;
let currentSeed = TRACK_SEEDS[currentTrackIndex];
let currentSeedAlpha = seedToAlpha(currentSeed);
let trackStartAngle = 0;

// Track select cache — built lazily on first entry to 'trackselect' state
let cachedTrackPaths = null; // [{ track, centerLine, startAngle }, ...]
let cachedBestTimes = null;  // [number|null, ...] — parallel to TRACK_SEEDS

function ensureTrackCache() {
  if (cachedTrackPaths === null) {
    cachedTrackPaths = TRACK_SEEDS.map(seed => {
      const t = generateTrack(seed);
      const cl = buildTrackPath(t);
      const gridTile = t.tiles[0];
      const sa = dirAngles[gridTile.dir];
      return { track: t, centerLine: cl, startAngle: sa };
    });
  }
  refreshBestTimes();

  // Fire-and-forget async fetch for leaderboard preview ranks and top metadata.
  // Both caches start null (tiles render without rank line); these resolve
  // within ~500ms and the next render frame picks them up.
  if (leaderboard.hasSdk()) {
    leaderboard.fetchPreviewRanks(cachedBestTimes).catch(() => {});
    leaderboard.fetchTopMetadata().catch(() => {});
  }
}

function refreshBestTimes() {
  cachedBestTimes = TRACK_SEEDS.map(seed => {
    try {
      const raw = localStorage.getItem(`racing-2d:ghost:${seed}`);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.time != null) return data.time;
      }
    } catch (_) {}
    return null;
  });
}

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

  // Ghost system for this seed — persists across sessions
  ghost = new Ghost(seed);

  // Top ghost is loaded asynchronously on tile tap; reset here so a stale
  // instance from a previous track isn't reused before the fetch resolves.
  topGhost = null;

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
      // Distinguish a fresh contact from a repeat during bounce separation.
      // Only spawn sparks / trigger flash / play audio on fresh hits.
      const isFreshHit = !car.crashed && car._bounceTimer === 0 && !car._wallHitThisTick;
      const wasCrashed = car.crashed;
      const preSpeed = car.speed;
      car.onWallCollision(contact);
      if (!isFreshHit) return;

      // Spark burst at the contact point, oriented along the wall normal
      const cp = contact.contactPoints && contact.contactPoints[0];
      if (cp) {
        sparkBurst.burst(cp.x, cp.y, contact.normal.x, contact.normal.y, preSpeed);
      }

      if (car.crashed && !wasCrashed) {
        screenShake.trigger(40);
        triggerCrashFlash();
        playCrash();
        hapticThump();
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
  tireSmoke.clear();
  sparkBurst.clear();
  camera.reset();
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
let trackSelectHitAreas = null;
let finishHitAreas = null;
let crashHitAreas = null;
let pauseButtonBox = null;
let pauseMenuHitAreas = null;
let isDraggingSlider = false;

// ── Ghost toggles (persisted) ────────────────────────────────────────────────
const GHOST_TOGGLES_KEY = 'hotlap:ghost-toggles';
const ghostToggles = { your: true, top: true };
(function loadGhostToggles() {
  try {
    const raw = localStorage.getItem(GHOST_TOGGLES_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.your === 'boolean') ghostToggles.your = o.your;
      if (typeof o.top === 'boolean') ghostToggles.top = o.top;
    }
  } catch (_) {}
})();
function saveGhostToggles() {
  try { localStorage.setItem(GHOST_TOGGLES_KEY, JSON.stringify(ghostToggles)); } catch (_) {}
}

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

  // Pause button — works during racing/finishing
  if ((gameState.state === 'racing' || gameState.state === 'finishing') && pauseButtonBox) {
    if (hitTest(x, y, pauseButtonBox)) {
      playClick();
      hapticTap();
      gameState.pause();
      return;
    }
  }

  // Pause menu interactions
  if (gameState.state === 'paused' && pauseMenuHitAreas) {
    if (hitTest(x, y, pauseMenuHitAreas.sfxToggle)) {
      setSfxEnabled(!getSfxEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.hapticsToggle)) {
      setHapticsEnabled(!getHapticsEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.yourGhostToggle)) {
      ghostToggles.your = !ghostToggles.your;
      saveGhostToggles();
      playClick();
      hapticTap();
      return;
    }
    if (!pauseMenuHitAreas.topGhostDisabled && hitTest(x, y, pauseMenuHitAreas.topGhostToggle)) {
      ghostToggles.top = !ghostToggles.top;
      saveGhostToggles();
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.resumeBtn)) {
      playClick();
      hapticTap();
      gameState.resume();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.retryBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
      spawnCar();
      gameState.startCountdown();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.menuBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
      return;
    }
    return;
  }

  // Track select
  if (gameState.state === 'trackselect') {
    handleTrackSelectClick(clientX, clientY);
    return;
  }

  if (gameState.state === 'title' && titleHitAreas) {
    if (hitTest(x, y, titleHitAreas.carBox)) {
      playClick();
      hapticTap();
      gameState.state = 'carselect';
    }
  } else if (gameState.state === 'finished' && finishHitAreas) {
    if (hitTest(x, y, finishHitAreas.retryBox)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
      spawnCar();
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      playClick();
      hapticTap();
      currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      const nextIdx = currentTrackIndex;
      leaderboard.fetchTopGhost(nextIdx).then(frames => {
        if (frames && currentTrackIndex === nextIdx) {
          topGhost = new TopGhost(frames);
        }
      }).catch(() => {});
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.menuBox)) {
      playClick();
      hapticTap();
      ensureTrackCache();
      gameState.state = 'trackselect';
    }
  } else if (gameState.state === 'crashed' && crashHitAreas) {
    if (hitTest(x, y, crashHitAreas.retryBox)) {
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
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
    playClick();
    hapticTap();
    ensureTrackCache();
    gameState.state = 'trackselect';
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

function handleTrackSelectClick(clientX, clientY) {
  if (!trackSelectHitAreas) return;
  const { x, y } = clientToGame(clientX, clientY);

  // Back button
  if (hitTest(x, y, trackSelectHitAreas.backBox)) {
    playClick();
    hapticTap();
    gameState.state = 'carselect';
    return;
  }

  // Tile grid
  for (const box of trackSelectHitAreas.tileBoxes) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      playClick();
      hapticTap();
      currentTrackIndex = box.index;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      // Lazy top-ghost fetch — resolves during the 3s countdown, usually.
      const tappedIdx = box.index;
      leaderboard.fetchTopGhost(tappedIdx).then(frames => {
        // Only apply if we're still on the same track (the player may have
        // gone back to track select and picked another one).
        if (frames && currentTrackIndex === tappedIdx) {
          topGhost = new TopGhost(frames);
        }
      }).catch(() => {});
      gameState.startCountdown();
      return;
    }
  }
}

// Track pointer down position and the game state at pointerdown time,
// so a finger that goes down during racing and lifts after the race has
// finished isn't interpreted as a tap on the finish-screen buttons.
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownState = null;
const TAP_THRESHOLD = 15; // max pixels moved to count as a tap

canvas.addEventListener('pointerdown', (e) => {
  initAudio(); // browsers require user gesture to start AudioContext
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
  pointerDownState = gameState.state;
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
    pointerDownState = null;
    return;
  }
  // If the state changed between pointerdown and pointerup (e.g. the race
  // finished while the player's finger was still down from steering), drop
  // the event — it was never meant as a tap on the new screen's UI.
  if (pointerDownState !== null && pointerDownState !== gameState.state) {
    pointerDownState = null;
    return;
  }
  pointerDownState = null;
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

  if (state === 'paused') {
    return; // Freeze physics while paused
  }

  if (state === 'countdown') {
    const before = gameState.countdownNumber;
    gameState.tickCountdown();
    const after = gameState.countdownNumber;
    if (before !== after) {
      if (after > 0) {
        playCountdownBeep();
      } else {
        playGoBeep();
      }
    }
  } else if (state === 'racing') {
    // Car physics
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();

    // Skid marks
    skidmarks.update(car.physX, car.physY, car.physAngle, input.steering, car.speed);

    // Tire smoke (wheel spin at low speed)
    tireSmoke.update(car.physX, car.physY, car.physAngle, car.speed, FIXED_DT);

    // Spark particles (wall collisions)
    sparkBurst.update(FIXED_DT);

    // Record ghost
    ghost.record(car.physX, car.physY, car.physAngle);

    // Advance ghost playback
    ghost.advancePlayback();
    if (topGhost) topGhost.advancePlayback();

    // Tick race time
    gameState.tickRace();

    // Check finish line FIRST — crossing the line counts even if you crashed on it
    if (checkFinishLine()) {
      finishPreviousBest = ghost.bestTime;
      gameState.state = 'finishing';
      finishDelayTimer = 0;
      playLapFinish();
      hapticThump();
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
    tireSmoke.update(car.physX, car.physY, car.physAngle, car.speed, FIXED_DT);
    sparkBurst.update(FIXED_DT);

    // Keep recording ghost
    ghost.record(car.physX, car.physY, car.physAngle);
    ghost.advancePlayback();
    if (topGhost) topGhost.advancePlayback();

    finishDelayTimer += FIXED_DT;
    if (finishDelayTimer >= FINISH_DELAY) {
      gameState.finish(finishPreviousBest);
      const isNew = ghost.saveIfBest(gameState.raceTime);
      gameState.isNewRecord = isNew;

      // Leaderboard: submit if this is a new PB, and fetch the finish panel.
      // Both are fire-and-forget — the finish screen renders immediately
      // and the panel populates async.
      leaderboard.clearFinishPanel();
      console.log("finish: isNew=", isNew, "signedIn=", leaderboard.isSignedIn(), "hasSdk=", leaderboard.hasSdk(), "time=", gameState.raceTime);
      document.title = "finish: new=" + isNew + " signedIn=" + leaderboard.isSignedIn() + " sdk=" + leaderboard.hasSdk();
      if (isNew) {
        leaderboard.submitIfBest(
          currentTrackIndex,
          gameState.raceTime,
          ghost.recording, // the just-completed run's raw frames
          { styleIndex: carConfig.styleIndex, hue: carConfig.hue }
        ).catch((e) => { console.error("submitIfBest catch:", e); });
      }
      leaderboard.fetchFinishPanel(currentTrackIndex).catch(() => {});
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
  drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers, currentTrackIndex);

  // Track surface noise
  drawTrackNoise(ctx, centerLine);

  // Skid marks (on track surface, before cars)
  skidmarks.draw(ctx);

  // Ghost cars (draw behind player). Own ghost uses the player's chosen style,
  // top ghost uses the WR holder's style from leaderboard metadata.
  if (state === 'racing' || state === 'countdown' || state === 'finishing' || state === 'paused') {
    if (ghostToggles.your) {
      const ghostFrame = ghost.getGhostFrame();
      if (ghostFrame) {
        drawStyledCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, carConfig.styleIndex, carConfig.hue + 180, GHOST_ALPHA);
      }
    }
    if (ghostToggles.top && topGhost) {
      const tgFrame = topGhost.getFrame();
      if (tgFrame) {
        // Pull WR holder's car style/hue from cached metadata
        const tm = leaderboard.getCachedTopMetadata();
        const meta = (tm && tm[currentTrackIndex] && tm[currentTrackIndex].metadata) || {};
        const style = typeof meta.styleIndex === 'number' ? meta.styleIndex : carConfig.styleIndex;
        const hue = typeof meta.hue === 'number' ? meta.hue : (carConfig.hue + 60);
        drawStyledCar(ctx, tgFrame.x, tgFrame.y, tgFrame.angle, style, hue, GHOST_ALPHA);
      }
    }
  }

  // Player car
  drawStyledCar(ctx, car.x, car.y, car.angle, carConfig.styleIndex, carConfig.hue, 1);

  // Tire smoke (above cars, world space)
  tireSmoke.draw(ctx);

  // Collision sparks (above everything, world space)
  sparkBurst.draw(ctx);

  camera.restore(ctx);

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

  // HUD timer — show during racing, finishing, and paused
  if (state === 'racing' || state === 'finishing' || state === 'paused') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, car.speed * 0.26, currentSeedAlpha);

    // Pause button — top right
    pauseButtonBox = drawPauseButton(ctx);

    // Steering wheel (only while dragging, never while paused)
    // For touch/pen: offset above the finger so it doesn't block the wheel
    // For mouse: render right where the cursor is
    if (input.dragging && state !== 'paused') {
      const yOffset = input.pointerType === 'mouse' ? 0 : -220;
      drawSteeringWheel(ctx, input.dragScreenX, input.dragScreenY + yOffset, input.steering, car.speed * 0.26);
    }
  }

  // Overlays
  if (state === 'title') {
    titleHitAreas = drawTitleScreen(ctx, 1/60, carConfig.styleIndex, carConfig.hue);
  } else if (state === 'carselect') {
    carSelectHitAreas = drawCarSelect(ctx, carConfig.styleIndex, carConfig.hue);
  } else if (state === 'trackselect') {
    trackSelectHitAreas = drawTrackSelect(ctx, cachedTrackPaths, currentTrackIndex, cachedBestTimes, leaderboard.getCachedPreviewRanks());
  } else if (state === 'countdown') {
    drawCountdown(ctx, gameState.countdownNumber);
  } else if (state === 'racing' && gameState.raceTime < 500) {
    drawCountdown(ctx, 0);
  } else if (state === 'finished') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, 0, currentSeedAlpha);
    const panelData = leaderboard.getCachedFinishPanel();
    const previewRanks = leaderboard.getCachedPreviewRanks();
    const sdkPresent = leaderboard.hasSdk();
    finishHitAreas = drawFinishScreen(
      ctx,
      gameState.raceTime / 1000,
      gameState.finishDelta !== null ? gameState.finishDelta / 1000 : null,
      gameState.isNewRecord,
      {
        panelData,
        // Only show "loading" if the SDK is actually there and a fetch is in flight.
        // Without SDK (localhost dev, or iframe without injection), flip straight to error.
        panelLoading: sdkPresent && panelData === null,
        panelError: !sdkPresent,
        signedIn: leaderboard.isSignedIn(),
        myPreviewRank: previewRanks ? previewRanks[currentTrackIndex] : null,
        currentTrackIndex,
      }
    );
  } else if (state === 'crashed') {
    crashHitAreas = drawCrashScreen(ctx);
  } else if (state === 'paused') {
    // Determine top ghost state for the current track
    let topGhostState = 'none';
    if (topGhost && topGhost.hasFrames()) {
      topGhostState = 'ready';
    } else {
      const tm = leaderboard.getCachedTopMetadata();
      const entry = tm ? tm[currentTrackIndex] : null;
      if (entry && entry.hasAttachment) {
        topGhostState = 'loading'; // metadata says there's a top, but we haven't loaded it yet
      }
    }
    pauseMenuHitAreas = drawPauseMenu(ctx, getSfxEnabled(), getHapticsEnabled(), ghostToggles, topGhostState);
  }
}

requestAnimationFrame(gameLoop);
