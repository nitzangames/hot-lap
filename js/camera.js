import { GAME_W, GAME_H } from './constants.js';

// Per-frame lerp factor toward the target angle. Higher = snappier camera,
// lower = more "cinematic" lag but smoother recovery after sudden angle jumps
// (e.g. glancing wall bounces that reflect the car's orientation).
const ANGLE_LERP = 0.12;

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this._firstFollow = true;
  }

  /**
   * Snap the camera on the next follow() call. Call this after respawn or
   * starting a new track so the camera doesn't animate in from a stale angle.
   */
  reset() {
    this._firstFollow = true;
  }

  follow(x, y, angle) {
    this.x = x;
    this.y = y;

    if (this._firstFollow) {
      this.angle = angle;
      this._firstFollow = false;
      return;
    }

    // Shortest-path delta, wrapped to [-π, π]
    let delta = angle - this.angle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;

    this.angle += delta * ANGLE_LERP;
  }

  apply(ctx) {
    ctx.save();
    // Translate to screen center, rotate so car points up, then shift by world position
    ctx.translate(GAME_W / 2, GAME_H / 2);
    ctx.rotate(-this.angle);
    ctx.translate(-this.x, -this.y);
  }

  restore(ctx) {
    ctx.restore();
  }
}
