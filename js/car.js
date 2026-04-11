import { Vec2, Capsule, Body } from '../physics2d/index.js';
import {
  CAR_W, CAR_H, CAR_MASS, CAR_RESTITUTION, CAR_FRICTION,
  MAX_SPEED, ACCELERATION, TURN_RATE, TURN_SPEED_PENALTY,
  CRASH_ANGLE_THRESHOLD, WALL_SPEED_LOSS, FIXED_DT,
} from './constants.js';

// ── Capsule / car angle convention ────────────────────────────────────────
//
// Hot Lap's car uses "logical angle" = 0 means facing north (up-screen) and
// forward direction = (sin(angle), -cos(angle)). Physics2D's Capsule orients
// its spine horizontally at body.angle=0 (along +x). To make the capsule's
// long axis align with the car's forward direction we store
//
//     body.angle = logicalAngle + π/2
//
// All external consumers read the car's angle through the getters below,
// which subtract π/2 back out. Inside this file, any forward-direction math
// that used to read `body.angle` directly now uses the substitution
//
//     sin(logicalAngle) = sin(body.angle - π/2) = -cos(body.angle)
//    -cos(logicalAngle) = -cos(body.angle - π/2) = -sin(body.angle)
//
// so forward = (-cos(body.angle), -sin(body.angle)).

const ANGLE_OFFSET = Math.PI / 2;

export class Car {
  constructor(world) {
    this.world = world;
    this.body = null;
    this.speed = 0;       // current forward speed px/s
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
    // Glancing-wall bounce state — nonzero timer means input is locked and
    // the car is coasting with a reflected bounce velocity.
    this._bounceTimer = 0;
    this._bounceVelX = 0;
    this._bounceVelY = 0;
  }

  /**
   * Create the car's physics body and add it to the world.
   * @param {number} angle - logical angle (0 = facing north)
   */
  spawn(x, y, angle) {
    // Capsule: spine length = CAR_H - CAR_W, hemisphere radius = CAR_W/2.
    // Total collider length = spine + 2*radius = CAR_H, so the collider
    // matches the rendered car's footprint instead of a short circle.
    const shape = new Capsule(CAR_H - CAR_W, CAR_W * 0.5);
    this.body = new Body({
      shape,
      position: new Vec2(x, y),
      mass: CAR_MASS,
      restitution: CAR_RESTITUTION,
      friction: CAR_FRICTION,
      angle: angle + ANGLE_OFFSET,
      userData: { type: 'car' },
    });
    this.world.addBody(this.body);
    this.speed = 0;
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
    this._bounceTimer = 0;
    this._bounceVelX = 0;
    this._bounceVelY = 0;
  }

  /**
   * Called each physics tick BEFORE world.step().
   * Applies steering and sets velocity in the forward direction.
   */
  update(steering) {
    if (!this.body || this.crashed) return;

    this.tickCount++;
    this._wallHitThisTick = false;

    // 0. Bounce lockout — after a glancing wall hit, input is ignored for
    //    half a second and the car coasts along the reflected velocity with
    //    a gentle per-tick decay. This gives a visible "bounce off the wall"
    //    moment before normal control resumes.
    if (this._bounceTimer > 0) {
      this._bounceTimer -= FIXED_DT;
      const decay = 0.985;
      this._bounceVelX *= decay;
      this._bounceVelY *= decay;
      this.body.velocity.set(this._bounceVelX, this._bounceVelY);
      this.body.angularVelocity = 0;
      this.speed = Math.sqrt(
        this._bounceVelX * this._bounceVelX +
        this._bounceVelY * this._bounceVelY
      );
      return;
    }

    // 1. Apply steering — directly modify body.angle (capsule-oriented)
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

    // 4. Set velocity in forward direction.
    //    forward = (-cos(body.angle), -sin(body.angle))  — see top-of-file note
    const a = this.body.angle;
    const vx = -Math.cos(a) * this.speed;
    const vy = -Math.sin(a) * this.speed;
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
    // While a bounce is in progress, the engine keeps firing contacts as the
    // car separates from the wall over several ticks. Ignore them — the
    // reflection we computed on the first contact is the authority, and
    // re-reflecting the already-moving-away velocity would just ping-pong.
    // Force velocity back to the stored bounce in case the engine's impulse
    // mutated it during this step.
    if (this._bounceTimer > 0) {
      this.body.velocity.set(this._bounceVelX, this._bounceVelY);
      this._wallHitThisTick = true;
      return;
    }
    this._wallHitThisTick = true;

    // Forward direction — see top-of-file note on the angle offset
    const a = this.body.angle;
    const fx = -Math.cos(a);
    const fy = -Math.sin(a);

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
      // Glancing hit — slide along the wall instead of bouncing off.
      // Project the forward vector onto the wall tangent by removing the
      // normal component entirely:
      //     f' = f - (f·n) n
      // The remaining vector points along the wall in whichever direction
      // the car was already heading. Normalize and use as the new heading.
      const preSpeed = this.speed;
      const fDotN = fx * nx + fy * ny;
      let slideFx = fx - fDotN * nx;
      let slideFy = fy - fDotN * ny;
      const slideMag = Math.sqrt(slideFx * slideFx + slideFy * slideFy) || 1;
      slideFx /= slideMag;
      slideFy /= slideMag;

      // Turn the car to face along the wall
      this.body.angle = Math.atan2(-slideFy, -slideFx);
      this.body._aabbDirty = true;

      // Light speed loss — the car stays mostly at its pre-collision pace
      const BOUNCE_DAMPEN = 0.75;
      const bounceSpeed = preSpeed * BOUNCE_DAMPEN;
      const rx = slideFx * bounceSpeed;
      const ry = slideFy * bounceSpeed;
      this.body.velocity.set(rx, ry);

      this._bounceVelX = rx;
      this._bounceVelY = ry;
      this._bounceTimer = 0.1;
      this.speed = bounceSpeed;
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
    return this.body ? this.body.renderAngle - ANGLE_OFFSET : 0;
  }

  // ── Physics position getters (use direct position) ──

  get physX() {
    return this.body ? this.body.position.x : 0;
  }

  get physY() {
    return this.body ? this.body.position.y : 0;
  }

  get physAngle() {
    return this.body ? this.body.angle - ANGLE_OFFSET : 0;
  }
}
