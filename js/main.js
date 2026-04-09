import { GAME_W, GAME_H, TILE, FIXED_DT } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies } from './track.js';
import { Camera } from './camera.js';
import { drawTrack, drawCar, drawHUD } from './renderer.js';
import { Car } from './car.js';
import { Input } from './input.js';
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

// ── Physics world ─────────────────────────────────────────────────────────────

const world = new World({ gravity: new Vec2(0, 0) });

// ── Track generation ──────────────────────────────────────────────────────────

const seed = 42;
const track = generateTrack(seed);
const centerLine = buildTrackPath(track);
const walls = buildWallPaths(centerLine);
createWallBodies(world, walls);

// ── Car spawn ─────────────────────────────────────────────────────────────────

const dirAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const startTile = track.tiles[1]; // tile index 1 is 'start'
const startAngle = dirAngles[startTile.dir];
const startX = (startTile.gx + 0.5) * TILE;
const startY = (startTile.gy + 0.5) * TILE;

const car = new Car(world);
car.spawn(startX, startY, startAngle);

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new Input(canvas);

// ── Camera ────────────────────────────────────────────────────────────────────

const camera = new Camera();

// ── Collision handling ────────────────────────────────────────────────────────

world.onCollision = (a, b, contact) => {
  const aIsWall = a.userData && a.userData.type === 'wall';
  const bIsWall = b.userData && b.userData.type === 'wall';
  const aIsCar  = a.userData && a.userData.type === 'car';
  const bIsCar  = b.userData && b.userData.type === 'car';

  if ((aIsCar && bIsWall) || (bIsCar && aIsWall)) {
    car.onWallCollision(contact);
  }
};

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
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();
    accumulator -= FIXED_DT;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Camera follows car (interpolated render position)
  camera.follow(car.x, car.y, car.angle);

  // Clear with grass background
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // World-space drawing
  camera.apply(ctx);
  drawTrack(ctx, track, walls, centerLine);
  drawCar(ctx, car.x, car.y, car.angle, '#e63030', '#222', 1);
  camera.restore(ctx);

  // HUD (screen-space)
  // Convert px/s to fake km/h: speed * 3.6 * 0.5
  drawHUD(ctx, 0, null, car.speed * 3.6 * 0.5);
}

requestAnimationFrame(gameLoop);
