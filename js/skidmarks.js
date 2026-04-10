import { CAR_W } from './constants.js';

/**
 * Accumulates skid marks as the car turns.
 * Each mark is a short line segment at the rear tire positions.
 * Darkness increases with steering intensity.
 *
 * Uses a pre-allocated ring buffer (no GC) and batched path drawing
 * (4 alpha buckets, single stroke per bucket) for mobile performance.
 */
export class SkidMarks {
  constructor() {
    this.maxMarks = 2000;
    this.marks = new Array(this.maxMarks);
    for (let i = 0; i < this.maxMarks; i++) {
      this.marks[i] = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0 };
    }
    this.writeIdx = 0;
    this.count = 0;
    this._prevLeft = null;
    this._prevRight = null;
  }

  _pushMark(x1, y1, x2, y2, alpha) {
    const m = this.marks[this.writeIdx];
    m.x1 = x1; m.y1 = y1; m.x2 = x2; m.y2 = y2; m.alpha = alpha;
    this.writeIdx = (this.writeIdx + 1) % this.maxMarks;
    if (this.count < this.maxMarks) this.count++;
  }

  /**
   * Record skid marks for this tick.
   */
  update(x, y, angle, steering, speed) {
    const intensity = Math.abs(steering);
    if (intensity < 0.15 || speed < 50) {
      this._prevLeft = null;
      this._prevRight = null;
      return;
    }

    const rearOffset = CAR_W * 0.9;
    const tireSpread = CAR_W * 0.35;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const rearX = x - sinA * rearOffset;
    const rearY = y + cosA * rearOffset;

    const perpX = cosA * tireSpread;
    const perpY = sinA * tireSpread;

    const leftX = rearX - perpX;
    const leftY = rearY - perpY;
    const rightX = rearX + perpX;
    const rightY = rearY + perpY;

    const alpha = Math.min(0.7, intensity * 0.8);

    if (this._prevLeft) {
      this._pushMark(this._prevLeft.x, this._prevLeft.y, leftX, leftY, alpha);
      this._pushMark(this._prevRight.x, this._prevRight.y, rightX, rightY, alpha);
    }

    if (!this._prevLeft) {
      this._prevLeft = { x: 0, y: 0 };
      this._prevRight = { x: 0, y: 0 };
    }
    this._prevLeft.x = leftX;
    this._prevLeft.y = leftY;
    this._prevRight.x = rightX;
    this._prevRight.y = rightY;
  }

  /** Reset all marks (on retry/new track). */
  clear() {
    this.writeIdx = 0;
    this.count = 0;
    this._prevLeft = null;
    this._prevRight = null;
  }

  /**
   * Draw all skid marks. Batched into 4 alpha buckets, single stroke per bucket.
   * Called in world-space (inside camera transform).
   */
  draw(ctx) {
    if (this.count === 0) return;

    ctx.lineCap = 'round';
    ctx.lineWidth = 4;

    // 4 alpha buckets: [0, 0.175), [0.175, 0.35), [0.35, 0.525), [0.525, 0.7]
    // Single beginPath+stroke per bucket = 4 draw calls total instead of N.
    const bucketAlphas = ['rgba(20,20,20,0.13)', 'rgba(20,20,20,0.26)', 'rgba(20,20,20,0.39)', 'rgba(20,20,20,0.55)'];
    const marks = this.marks;
    const n = this.count;

    for (let bucket = 0; bucket < 4; bucket++) {
      const minA = bucket * 0.175;
      const maxA = bucket === 3 ? 1 : (bucket + 1) * 0.175;
      let began = false;
      for (let i = 0; i < n; i++) {
        const m = marks[i];
        if (m.alpha < minA || m.alpha >= maxA) continue;
        if (!began) {
          ctx.strokeStyle = bucketAlphas[bucket];
          ctx.beginPath();
          began = true;
        }
        ctx.moveTo(m.x1, m.y1);
        ctx.lineTo(m.x2, m.y2);
      }
      if (began) ctx.stroke();
    }
  }
}
