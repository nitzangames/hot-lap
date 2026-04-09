import { GAME_W, GAME_H, TILE, FIXED_DT, GHOST_ALPHA } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies } from './track.js';
import { Camera } from './camera.js';
import {
  drawTrack, drawCar, drawHUD,
  drawTitleScreen, drawCountdown, drawFinishScreen, drawCrashScreen,
} from './renderer.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { Ghost } from './ghost.js';
import { GameState } from './game.js';
import { World, Vec2 } from '../physics2d/index.js';

// ── DPR-aware canvas setup ────────────────────────────────────────────────────

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
  canvas.width  = GAME_W * dpr;
  canvas.height = GAME_H * dpr;

  const viewAspect = window.innerWidth / window.innerHeight;
  const gameAspect = GAME_W / GAME_H;

  let cssW, cssH;
  if (viewAspect < gameAspect) {
    cssW = window.innerWidth;
    cssH = window.innerWidth / gameAspect;
  } else {
    cssH = window.innerHeight;
    cssW = window.innerHeight * gameAspect;
  }

  canvas.style.width  = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Direction angles for car spawn ────────────────────────────────────────────

const dirAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ── Track initialization ──────────────────────────────────────────────────────

let world, track, centerLine, walls, wallBodies;
let car, ghost, gameState;
let currentSeed = Date.now();

function initTrack(seed) {
  currentSeed = seed;

  // Create a fresh physics world
  world = new World({ gravity: new Vec2(0, 0) });

  // Generate track data
  track = generateTrack(seed);
  centerLine = buildTrackPath(track);
  walls = buildWallPaths(centerLine);
  wallBodies = createWallBodies(world, walls);

  // Ghost system for this seed
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
      car.onWallCollision(contact);
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
  const startTile = track.tiles[1]; // tile index 1 is 'start'
  const startAngle = dirAngles[startTile.dir];
  const startX = (startTile.gx + 0.5) * TILE;
  const startY = (startTile.gy + 0.5) * TILE;
  car.spawn(startX, startY, startAngle);
}

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new Input(canvas);

// ── Camera ────────────────────────────────────────────────────────────────────

const camera = new Camera();

// ── Finish line detection ─────────────────────────────────────────────────────

function checkFinishLine() {
  const finishTile = track.tiles[track.tiles.length - 1];
  const fx = (finishTile.gx + 0.5) * TILE;
  const fy = (finishTile.gy + 0.5) * TILE;
  const dx = car.physX - fx;
  const dy = car.physY - fy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < TILE * 0.4;
}

// ── Tap / click handling ──────────────────────────────────────────────────────

let lastTapTime = 0;
const DOUBLE_TAP_MS = 400;

function handleTap() {
  const now = performance.now();
  const isDoubleTap = (now - lastTapTime) < DOUBLE_TAP_MS;
  lastTapTime = now;

  if (gameState.state === 'title') {
    gameState.startCountdown();
  } else if (gameState.state === 'finished' || gameState.state === 'crashed') {
    if (isDoubleTap) {
      // New track with new seed
      initTrack(Date.now());
      gameState.startCountdown();
    } else {
      // Retry same track
      ghost.resetRecording();
      spawnCar();
      gameState.startCountdown();
    }
  }
}

// Use pointerup for unified mouse/touch, but also handle touch for tap detection
canvas.addEventListener('pointerup', (e) => {
  // Only treat short taps (no significant drag) as taps
  handleTap();
});

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

  // Fixed timestep accumulator
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    fixedUpdate();
    accumulator -= FIXED_DT;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render();
}

// ── Fixed update (per physics tick) ───────────────────────────────────────────

function fixedUpdate() {
  const state = gameState.state;

  if (state === 'countdown') {
    gameState.tickCountdown();
  } else if (state === 'racing') {
    // Car physics
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();

    // Record ghost
    ghost.record(car.physX, car.physY, car.physAngle);

    // Advance ghost playback
    ghost.advancePlayback();

    // Tick race time
    gameState.tickRace();

    // Check crash
    if (car.crashed) {
      gameState.crash();
      return;
    }

    // Check finish line
    if (checkFinishLine()) {
      const previousBest = ghost.bestTime;
      gameState.finish(previousBest);
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

  // Clear with grass background
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // World-space drawing
  camera.apply(ctx);

  // Track
  drawTrack(ctx, track, walls, centerLine);

  // Ghost car (draw behind player)
  if (state === 'racing' || state === 'countdown') {
    const ghostFrame = ghost.getGhostFrame();
    if (ghostFrame) {
      drawCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, '#3366cc', '#4477dd', GHOST_ALPHA);
    }
  }

  // Player car
  drawCar(ctx, car.x, car.y, car.angle, '#e63030', '#222', 1);

  camera.restore(ctx);

  // HUD (screen-space) — show during racing
  if (state === 'racing') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, car.speed * 3.6 * 0.5);
  }

  // Overlays
  if (state === 'title') {
    drawTitleScreen(ctx);
  } else if (state === 'countdown') {
    drawCountdown(ctx, gameState.countdownNumber);
  } else if (state === 'finished') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, 0);
    drawFinishScreen(
      ctx,
      gameState.raceTime / 1000,
      gameState.finishDelta !== null ? gameState.finishDelta / 1000 : null,
      gameState.isNewRecord
    );
  } else if (state === 'crashed') {
    drawCrashScreen(ctx);
  }
}

requestAnimationFrame(gameLoop);
