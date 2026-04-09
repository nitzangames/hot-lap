import { CAR_W } from './constants.js';

/**
 * Accumulates skid marks as the car turns.
 * Each mark is a short line segment at the rear tire positions.
 * Darkness increases with steering intensity.
 */
export class SkidMarks {
  constructor() {
    this.marks = []; // { x1, y1, x2, y2, alpha }
    this.maxMarks = 2000;
    this._prevLeft = null;
    this._prevRight = null;
  }

  /**
   * Record skid marks for this tick.
   * @param {number} x - car world X
   * @param {number} y - car world Y
   * @param {number} angle - car angle
   * @param {number} steering - -1 to +1 steering input
   * @param {number} speed - car speed px/s
   */
  update(x, y, angle, steering, speed) {
    const intensity = Math.abs(steering);
    if (intensity < 0.15 || speed < 50) {
      this._prevLeft = null;
      this._prevRight = null;
      return;
    }

    // Rear tire positions (offset behind car center)
    const rearOffset = CAR_W * 0.9; // distance behind center to rear axle
    const tireSpread = CAR_W * 0.35; // half distance between rear tires

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Rear center (behind the car)
    const rx = x - sinA * (-rearOffset); // forward is (sin, -cos), so rear is opposite
    const ry = y - (-cosA) * (-rearOffset);
    // Actually: forward = (sin(a), -cos(a)), rear = (-sin(a), cos(a))
    const rearX = x - sinA * rearOffset;
    const rearY = y + cosA * rearOffset;

    // Perpendicular for tire spread
    const perpX = cosA * tireSpread;
    const perpY = sinA * tireSpread;

    const leftX = rearX - perpX;
    const leftY = rearY - perpY;
    const rightX = rearX + perpX;
    const rightY = rearY + perpY;

    const alpha = Math.min(0.7, intensity * 0.8);

    if (this._prevLeft) {
      this.marks.push({
        x1: this._prevLeft.x, y1: this._prevLeft.y,
        x2: leftX, y2: leftY,
        alpha,
      });
      this.marks.push({
        x1: this._prevRight.x, y1: this._prevRight.y,
        x2: rightX, y2: rightY,
        alpha,
      });
    }

    this._prevLeft = { x: leftX, y: leftY };
    this._prevRight = { x: rightX, y: rightY };

    // Trim old marks
    while (this.marks.length > this.maxMarks) {
      this.marks.shift();
    }
  }

  /** Reset all marks (on retry/new track). */
  clear() {
    this.marks = [];
    this._prevLeft = null;
    this._prevRight = null;
  }

  /**
   * Draw all skid marks.
   * Called in world-space (inside camera transform).
   */
  draw(ctx) {
    if (this.marks.length === 0) return;

    ctx.lineCap = 'round';
    ctx.lineWidth = 4;

    for (const m of this.marks) {
      ctx.strokeStyle = `rgba(20,20,20,${m.alpha})`;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
    }
  }
}
