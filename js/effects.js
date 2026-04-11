import { GAME_W, GAME_H, TILE, CAR_W, MAX_SPEED } from './constants.js';

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

// ── Tire smoke particles ─────────────────────────────────────────────────────

/**
 * Soft smoke puffs from the rear tires when the car is at low speed
 * (wheel spin). Spawns from race start and after collisions.
 *
 * Pre-allocated pool, single shared sprite drawn via drawImage for fast
 * mobile rendering.
 */
export class TireSmoke {
  constructor() {
    this.maxParticles = 120;
    this.particles = new Array(this.maxParticles);
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0 };
    }
    this.writeIdx = 0;
    this._sprite = makeSmokeSprite(64);
  }

  clear() {
    for (let i = 0; i < this.maxParticles; i++) this.particles[i].life = 0;
  }

  /**
   * Spawn + advance smoke for this tick.
   * @param {number} carX physics X
   * @param {number} carY physics Y
   * @param {number} carAngle physics angle
   * @param {number} speed current speed (px/s)
   * @param {number} dt fixed timestep
   */
  update(carX, carY, carAngle, speed, dt) {
    // Wheel spin intensity: max at 0 speed, fades to 0 by 30% of MAX_SPEED
    const spinThreshold = MAX_SPEED * 0.3;
    const spinIntensity = speed < spinThreshold ? 1 - speed / spinThreshold : 0;

    if (spinIntensity > 0) {
      const cosA = Math.cos(carAngle);
      const sinA = Math.sin(carAngle);
      const rearOffset = CAR_W * 0.9;
      const tireSpread = CAR_W * 0.35;

      // Forward direction = (sin, -cos), so rear = (-sin, cos)
      const rearX = carX - sinA * rearOffset;
      const rearY = carY + cosA * rearOffset;
      const perpX = cosA * tireSpread;
      const perpY = sinA * tireSpread;

      const leftX = rearX - perpX;
      const leftY = rearY - perpY;
      const rightX = rearX + perpX;
      const rightY = rearY + perpY;

      // Spawn 1-2 particles per tire per tick depending on intensity
      const spawnCount = Math.random() < spinIntensity * 1.5 ? 2 : 1;
      for (let i = 0; i < spawnCount; i++) {
        this._spawn(leftX, leftY, sinA, -cosA, spinIntensity);
        this._spawn(rightX, rightY, sinA, -cosA, spinIntensity);
      }
    }

    // Advance existing particles
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9; // air drag
      p.vy *= 0.9;
      p.life -= dt;
      p.size += dt * 80; // grow as it dissipates
    }
  }

  _spawn(x, y, fwdX, fwdY, intensity) {
    const p = this.particles[this.writeIdx];
    this.writeIdx = (this.writeIdx + 1) % this.maxParticles;
    // Velocity opposite to car forward + random spread
    const back = 60 + Math.random() * 80;
    const spread = 50;
    p.x = x + (Math.random() - 0.5) * 8;
    p.y = y + (Math.random() - 0.5) * 8;
    p.vx = -fwdX * back + (Math.random() - 0.5) * spread;
    p.vy = -fwdY * back + (Math.random() - 0.5) * spread;
    p.life = 0.45 + Math.random() * 0.35;
    p.maxLife = p.life;
    p.size = 14 + Math.random() * 8;
  }

  /** Draw all live particles. Called in world space (inside camera transform). */
  draw(ctx) {
    const sprite = this._sprite;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t * 0.55;
      const size = p.size * 2;
      ctx.drawImage(sprite, p.x - p.size, p.y - p.size, size, size);
    }
    ctx.globalAlpha = 1;
  }
}

function makeSmokeSprite(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(240,240,240,1)');
  grad.addColorStop(0.4, 'rgba(220,220,220,0.6)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
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
