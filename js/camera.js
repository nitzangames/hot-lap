import { GAME_W, GAME_H } from './constants.js';

// Maximum camera rotation per frame (radians). Normal steering at max turn
// rate produces ~0.042 rad/frame — well under this cap, so the camera
// follows perfectly with zero lag during normal driving. A wall bounce
// that jumps 20° (0.35 rad) takes ~5 frames to catch up — fast but smooth.
const MAX_ROTATION_PER_FRAME = 0.07;

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

    // Cap rotation speed so small changes follow instantly but large jumps
    // (wall bounces) animate smoothly over several frames.
    if (delta > MAX_ROTATION_PER_FRAME) delta = MAX_ROTATION_PER_FRAME;
    else if (delta < -MAX_ROTATION_PER_FRAME) delta = -MAX_ROTATION_PER_FRAME;

    this.angle += delta;
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
