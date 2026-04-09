import { GAME_W, GAME_H, TILE } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, DIR_VEC } from './track.js';
import { Camera } from './camera.js';
import { drawTrack, drawCar } from './renderer.js';

// ── DPR-aware canvas setup ────────────────────────────────────────────────────

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
  // Scale canvas backing store to DPR
  canvas.width  = GAME_W * dpr;
  canvas.height = GAME_H * dpr;

  // Fit canvas CSS size to viewport while maintaining 1080:1920 aspect ratio
  const viewAspect = window.innerWidth / window.innerHeight;
  const gameAspect = GAME_W / GAME_H;

  let cssW, cssH;
  if (viewAspect < gameAspect) {
    // Viewport is taller relative to width — fit to width
    cssW = window.innerWidth;
    cssH = window.innerWidth / gameAspect;
  } else {
    // Viewport is wider — fit to height
    cssH = window.innerHeight;
    cssW = window.innerHeight * gameAspect;
  }

  canvas.style.width  = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  // Scale all drawing operations so 1 unit = 1 game pixel (independent of DPR)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Track generation ──────────────────────────────────────────────────────────

const seed = 42;
const track = generateTrack(seed);
const centerLine = buildTrackPath(track);
const walls = buildWallPaths(centerLine);

// ── Camera and start position ─────────────────────────────────────────────────

// dirAngles: mapping from track dir constant to car angle
// car forward = (sin(θ), -cos(θ)) in world space
// DIR_N(0)→θ=0, DIR_E(1)→θ=π/2, DIR_S(2)→θ=π, DIR_W(3)→θ=-π/2
const dirAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// Tile index 1 is the 'start' tile (index 0 is 'grid')
const startTile = track.tiles[1];
const startDir = startTile.dir;
const startAngle = dirAngles[startDir];

// Car world position: center of start tile
const carX = (startTile.gx + 0.5) * TILE;
const carY = (startTile.gy + 0.5) * TILE;

const camera = new Camera();
camera.follow(carX, carY, startAngle);

// ── Render loop ───────────────────────────────────────────────────────────────

function render() {
  // Clear with grass background
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Apply camera transform
  camera.apply(ctx);

  // Draw track
  drawTrack(ctx, track, walls, centerLine);

  // Draw car at start position
  drawCar(ctx, carX, carY, startAngle, '#e63030', '#222', 1);

  // Restore camera transform
  camera.restore(ctx);

  requestAnimationFrame(render);
}

render();
