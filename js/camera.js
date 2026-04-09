import { GAME_W, GAME_H } from './constants.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
  }

  follow(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
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
