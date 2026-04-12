import { GAME_W, GAME_H } from './constants.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this._initialized = false;
  }

  /**
   * Snap the camera on the next follow() call. Call this after respawn or
   * starting a new track so the camera doesn't animate in from a stale angle.
   */
  reset() {
    this._initialized = false;
  }

  follow(x, y, angle) {
    this.x = x;
    this.y = y;

    // First frame — snap (no previous angle to lerp from)
    if (!this._initialized) {
      this.angle = angle;
      this._initialized = true;
      return;
    }

    // Smooth follow — move 15% of the remaining difference each frame.
    // Smooths both small physics jitters (which cause visible judder if
    // snapped directly) and large wall-bounce angle jumps (~20°).
    let diff = angle - this.angle;
    // Normalize to [-PI, PI] so we lerp the short way around
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.angle += diff * 0.15;
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
