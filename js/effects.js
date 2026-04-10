import { GAME_W, GAME_H, TILE } from './constants.js';

// ── Screen shake ─────────────────────────────────────────────────────────────

export class ScreenShake {
  constructor() {
    this.intensity = 0;
    this.decay = 8; // how fast shake fades per second
    this.offsetX = 0;
    this.offsetY = 0;
  }

  trigger(amount) {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(dt) {
    if (this.intensity > 0.5) {
      this.offsetX = (Math.random() - 0.5) * this.intensity;
      this.offsetY = (Math.random() - 0.5) * this.intensity;
      this.intensity *= Math.max(0, 1 - this.decay * dt);
    } else {
      this.intensity = 0;
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }
}

// ── Grass texture (pre-rendered to offscreen canvas) ─────────────────────────

let grassCanvas = null;
const GRASS_PATCH_SIZE = 512;

function ensureGrassCanvas() {
  if (grassCanvas) return grassCanvas;
  grassCanvas = document.createElement('canvas');
  grassCanvas.width = GRASS_PATCH_SIZE;
  grassCanvas.height = GRASS_PATCH_SIZE;
  const gctx = grassCanvas.getContext('2d');

  // Base green
  gctx.fillStyle = '#4a7a2e';
  gctx.fillRect(0, 0, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE);

  // Scattered darker patches
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * GRASS_PATCH_SIZE;
    const y = Math.random() * GRASS_PATCH_SIZE;
    const r = 2 + Math.random() * 6;
    gctx.fillStyle = `rgba(${30 + Math.random() * 20}, ${60 + Math.random() * 30}, ${15 + Math.random() * 15}, ${0.15 + Math.random() * 0.15})`;
    gctx.beginPath();
    gctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    gctx.fill();
  }

  // Lighter grass blades
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * GRASS_PATCH_SIZE;
    const y = Math.random() * GRASS_PATCH_SIZE;
    gctx.strokeStyle = `rgba(${70 + Math.random() * 30}, ${120 + Math.random() * 40}, ${40 + Math.random() * 20}, ${0.15 + Math.random() * 0.1})`;
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(x, y);
    gctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5);
    gctx.stroke();
  }

  return grassCanvas;
}

/**
 * Draw textured grass background. Call in world-space (after camera apply).
 * Tiles the grass texture across the visible area.
 */
export function drawGrass(ctx, camX, camY, camAngle) {
  const grass = ensureGrassCanvas();
  const pat = ctx.createPattern(grass, 'repeat');
  ctx.fillStyle = pat;
  // Fill a large area around the camera
  const size = Math.max(GAME_W, GAME_H) * 2;
  ctx.fillRect(camX - size, camY - size, size * 2, size * 2);
}

// ── Track surface noise (drawn on top of asphalt) ────────────────────────────

/**
 * Draw subtle noise/speckle on the track surface.
 * Uses the centerLine to know where the track is.
 */
export function drawTrackNoise(ctx, centerLine) {
  if (!centerLine || centerLine.length < 2) return;

  ctx.save();
  // Use the track path as a clip region
  ctx.beginPath();
  ctx.moveTo(centerLine[0].x, centerLine[0].y);
  for (let i = 1; i < centerLine.length; i++) {
    ctx.lineTo(centerLine[i].x, centerLine[i].y);
  }
  ctx.closePath();
  ctx.lineWidth = TILE;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'round';

  // Instead of clipping, just draw subtle speckles along the center line
  // Seeded positions for consistency
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < centerLine.length - 1; i++) {
    const p0 = centerLine[i];
    const p1 = centerLine[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;

    for (let j = 0; j < 8; j++) {
      const t = Math.random();
      const spread = (Math.random() - 0.5) * TILE * 0.9;
      const px = p0.x + dx * t + nx * spread;
      const py = p0.y + dy * t + ny * spread;
      const shade = Math.random() > 0.5 ? '#555' : '#222';
      ctx.fillStyle = shade;
      ctx.fillRect(px, py, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
  }
  ctx.restore();
}

// ── Speed lines ──────────────────────────────────────────────────────────────

/**
 * Draw speed lines radiating from behind the car.
 * Called in screen-space (after camera restore).
 */
export function drawSpeedLines(ctx, speed, maxSpeed) {
  const intensity = Math.max(0, (speed - maxSpeed * 0.5) / (maxSpeed * 0.5));
  if (intensity <= 0) return;

  ctx.save();
  ctx.globalAlpha = intensity * 0.25;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const cx = GAME_W / 2;
  const cy = GAME_H / 2;
  const lineCount = Math.floor(intensity * 12) + 4;

  for (let i = 0; i < lineCount; i++) {
    // Lines along the edges of the screen, streaming backward
    const side = Math.random() > 0.5 ? 1 : -1;
    const xSpread = GAME_W * 0.3 + Math.random() * GAME_W * 0.2;
    const x = cx + side * xSpread;
    const yStart = Math.random() * GAME_H * 0.4;
    const lineLen = 40 + Math.random() * 80 * intensity;

    ctx.beginPath();
    ctx.moveTo(x, yStart);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, yStart + lineLen);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Crash flash ──────────────────────────────────────────────────────────────

let crashFlashAlpha = 0;

export function triggerCrashFlash() {
  crashFlashAlpha = 0.6;
}

export function drawCrashFlash(ctx, dt) {
  if (crashFlashAlpha <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(255, 50, 0, ${crashFlashAlpha})`;
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.restore();
  crashFlashAlpha -= dt * 3;
  if (crashFlashAlpha < 0) crashFlashAlpha = 0;
}
