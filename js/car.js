import { Vec2, Circle, Body } from '../physics2d/index.js';
import {
  CAR_W, CAR_H, CAR_MASS, CAR_RESTITUTION, CAR_FRICTION,
  MAX_SPEED, ACCELERATION, TURN_RATE, TURN_SPEED_PENALTY,
  CRASH_ANGLE_THRESHOLD, WALL_SPEED_LOSS, FIXED_DT,
} from './constants.js';

export class Car {
  constructor(world) {
    this.world = world;
    this.body = null;
    this.speed = 0;       // current forward speed px/s
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
  }

  /**
   * Create the car's physics body and add it to the world.
   */
  spawn(x, y, angle) {
    const shape = new Circle(CAR_W * 0.5);
    this.body = new Body({
      shape,
      position: new Vec2(x, y),
      mass: CAR_MASS,
      restitution: CAR_RESTITUTION,
      friction: CAR_FRICTION,
      angle,
      userData: { type: 'car' },
    });
    this.world.addBody(this.body);
    this.speed = 0;
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
  }

  /**
   * Called each physics tick BEFORE world.step().
   * Applies steering and sets velocity in the forward direction.
   */
  update(steering) {
    if (!this.body || this.crashed) return;

    this.tickCount++;
    this._wallHitThisTick = false;

    // 1. Apply steering — directly modify body angle
    this.body.angle += steering * TURN_RATE * FIXED_DT;
    this.body._aabbDirty = true;

    // 2. Compute effective max speed (turning reduces top speed)
    const effectiveMax = MAX_SPEED * (1 - Math.abs(steering) * (1 - TURN_SPEED_PENALTY));

    // 3. Accelerate or decelerate toward effectiveMax
    if (this.speed < effectiveMax) {
      this.speed += ACCELERATION * FIXED_DT;
      if (this.speed > effectiveMax) this.speed = effectiveMax;
    } else if (this.speed > effectiveMax) {
      this.speed -= ACCELERATION * 2 * FIXED_DT;
      if (this.speed < effectiveMax) this.speed = effectiveMax;
    }

    // 4. Set velocity in forward direction
    //    Car forward = (sin(angle), -cos(angle))
    const angle = this.body.angle;
    const vx = Math.sin(angle) * this.speed;
    const vy = -Math.cos(angle) * this.speed;
    this.body.velocity.set(vx, vy);

    // 5. Zero angular velocity — we control angle directly
    this.body.angularVelocity = 0;
  }

  /**
   * Called AFTER world.step() to read back velocity (physics may have changed it via collisions).
   */
  postPhysicsUpdate() {
    if (!this.body || this.crashed) return;

    // Read speed from velocity magnitude after collision resolution
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    this.speed = Math.sqrt(vx * vx + vy * vy);
  }

  /**
   * Called from the world collision callback when the car hits a wall.
   * Uses _wallHitThisTick to prevent stacking from multiple solver iterations.
   */
  onWallCollision(contact) {
    if (!this.body || this.crashed || this._wallHitThisTick) return;
    this._wallHitThisTick = true;

    const angle = this.body.angle;
    // Forward direction
    const fx = Math.sin(angle);
    const fy = -Math.cos(angle);

    // Contact normal
    const nx = contact.normal.x;
    const ny = contact.normal.y;

    // Impact angle: |forward dot normal|
    const dot = Math.abs(fx * nx + fy * ny);

    if (dot > Math.cos(CRASH_ANGLE_THRESHOLD)) {
      // Head-on crash
      this.crashed = true;
      this.speed = 0;
      this.body.velocity.set(0, 0);
    } else {
      // Glancing hit — reduce speed
      this.speed *= WALL_SPEED_LOSS;
    }
  }

  // ── Render getters (use interpolated positions) ──

  get x() {
    return this.body ? this.body.renderPosition.x : 0;
  }

  get y() {
    return this.body ? this.body.renderPosition.y : 0;
  }

  get angle() {
    return this.body ? this.body.renderAngle : 0;
  }

  // ── Physics position getters (use direct position) ──

  get physX() {
    return this.body ? this.body.position.x : 0;
  }

  get physY() {
    return this.body ? this.body.position.y : 0;
  }

  get physAngle() {
    return this.body ? this.body.angle : 0;
  }
}
