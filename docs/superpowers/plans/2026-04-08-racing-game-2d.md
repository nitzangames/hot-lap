# Racing 2D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-player top-down 2D racing time-trial game with ghost replay, deployed on the GamesPlatform.

**Architecture:** Vanilla JS ES modules. Physics2D engine handles collision detection/response for wall interactions. The car uses a simplified arcade physics model (direct velocity control + Physics2D for wall collisions). Track is tile-based, randomly generated as a point-to-point path. Canvas rendering with car-fixed camera rotation.

**Tech Stack:** HTML5 Canvas, ES Modules, Physics2D engine (local copy), localStorage for ghost persistence.

---

## File Structure

```
RacingGame2D/
├── index.html              — Entry point, canvas + module script
├── meta.json               — GamesPlatform metadata
├── thumbnail.png           — Platform thumbnail (created last)
├── physics2d/              — Copied from ../Physics2D (ES modules)
│   ├── index.js
│   └── src/
│       ├── math.js
│       ├── shapes.js
│       ├── body.js
│       ├── collision.js
│       ├── world.js
│       ├── raycast.js
│       └── debug.js
├── js/
│   ├── constants.js        — All tuning values (tile size, car dimensions, speeds)
│   ├── track.js            — Tile definitions, track generation algorithm, wall geometry
│   ├── car.js              — Car physics body, movement model, collision handling
│   ├── ghost.js            — Ghost recording, playback, localStorage persistence
│   ├── input.js            — Mouse/touch drag-to-steer
│   ├── camera.js           — Car-centered rotating camera transform
│   ├── renderer.js         — Track, car, ghost, HUD drawing
│   ├── game.js             — Game state machine (title, countdown, racing, finish, crash)
│   └── main.js             — Entry: canvas setup, DPR, game loop, wire modules together
└── tests/
    ├── test.html           — Browser test runner
    └── track.test.js       — Track generation tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `index.html`, `meta.json`, `js/constants.js`
- Copy: `physics2d/` from `../Physics2D`

- [ ] **Step 1: Copy Physics2D engine**

```bash
cp -r /Users/nitzanwilnai/Programming/Claude/JSGames/Physics2D/src /Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/physics2d/src
cp /Users/nitzanwilnai/Programming/Claude/JSGames/Physics2D/index.js /Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/physics2d/index.js
```

- [ ] **Step 2: Create meta.json**

```json
{
  "slug": "racing-2d",
  "title": "Racing 2D",
  "description": "Top-down formula racing time trial. Race against your ghost on randomly generated tracks.",
  "tags": ["racing", "time-trial"],
  "author": "Nitzan Wilnai",
  "thumbnail": "thumbnail.png"
}
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Racing 2D</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #2d5a1e; touch-action: none; }
canvas { display: block; position: absolute; top: 0; left: 50%; transform: translateX(-50%); }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create js/constants.js**

```js
// Display
export const GAME_W = 1080;
export const GAME_H = 1920;

// Tile grid
export const TILE = 512; // pixels per tile

// Car dimensions
export const CAR_W = 128;
export const CAR_H = 282; // ~2.2:1 ratio

// Car physics
export const MAX_SPEED = 900;        // px/s at full speed
export const ACCELERATION = 400;     // px/s² forward force
export const TURN_RATE = 2.5;        // rad/s at full steering input
export const TURN_SPEED_PENALTY = 0.6; // speed multiplier at max turn (0-1, lower = more penalty)
export const LINEAR_DAMPING = 0.3;   // natural speed decay
export const CAR_MASS = 1;
export const CAR_RESTITUTION = 0.3;  // wall bounce
export const CAR_FRICTION = 0.5;

// Wall collision
export const CRASH_ANGLE_THRESHOLD = 0.7; // radians (~40°) — above this angle vs wall normal = crash
export const WALL_SPEED_LOSS = 0.4;       // speed multiplier on glancing wall hit

// Track generation
export const MIN_TRACK_TILES = 40;   // minimum tiles for ~30s race
export const MAX_TRACK_TILES = 55;
export const WALL_THICKNESS = 8;     // visual wall thickness in px
export const WALL_SEGMENTS_PER_CURVE = 8; // edge segments to approximate curve arcs

// Ghost
export const GHOST_ALPHA = 0.3;

// Timing
export const FIXED_DT = 1 / 60;
export const COUNTDOWN_SECONDS = 3;
```

- [ ] **Step 5: Commit**

```bash
git add index.html meta.json js/constants.js physics2d/
git commit -m "feat: project scaffolding with Physics2D and constants"
```

---

### Task 2: Track Data Model and Generation

**Files:**
- Create: `js/track.js`, `tests/track.test.js`, `tests/test.html`

- [ ] **Step 1: Create test runner tests/test.html**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Racing 2D Tests</title>
<style>
body { font-family: monospace; padding: 20px; background: #1a1a2e; color: #eee; }
.pass { color: #4caf50; }
.fail { color: #f44336; }
pre { margin: 4px 0; }
</style>
</head>
<body>
<h2>Racing 2D — Tests</h2>
<div id="results"></div>
<script type="module" src="track.test.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create js/track.js — tile definitions and data structures**

The track module defines tile types and how they connect. Each tile has:
- `type`: straight, tight, medium, gentle
- `gridCells`: array of {dx, dy} offsets this tile occupies on the grid (relative to entry cell)
- `exitDir`: the direction the car exits relative to entry direction (+1 = left turn, -1 = right turn, 0 = straight)
- `size`: 1, 2, or 3 (tile span)

Directions are 0=north, 1=east, 2=south, 3=west. The entry point and exit point of each tile depend on the current heading.

```js
import { TILE, MIN_TRACK_TILES, MAX_TRACK_TILES, WALL_SEGMENTS_PER_CURVE } from './constants.js';

// Direction constants: 0=N, 1=E, 2=S, 3=W
const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;

// Direction vectors [dx, dy] for each direction (grid coords, Y increases downward)
const DIR_VEC = [
  [0, -1], // N
  [1, 0],  // E
  [0, 1],  // S
  [-1, 0], // W
];

function turnLeft(dir) { return (dir + 3) % 4; }
function turnRight(dir) { return (dir + 1) % 4; }

// Tile type definitions
// Each returns the grid cells occupied (relative to entry cell) and the exit position/direction
// Entry is always at grid (0,0) coming from direction `dir`

// Straight: 1x1, exit is one cell ahead in current direction
function straightTile(dir) {
  const [dx, dy] = DIR_VEC[dir];
  return {
    type: 'straight',
    cells: [{ x: 0, y: 0 }],
    exitX: dx,
    exitY: dy,
    exitDir: dir,
  };
}

// Tight curve (1x1): 90° turn in one cell
// turnSign: -1 = right, +1 = left
function tightCurve(dir, turnSign) {
  const newDir = turnSign > 0 ? turnLeft(dir) : turnRight(dir);
  const [dx, dy] = DIR_VEC[newDir];
  return {
    type: 'tight',
    turnSign,
    cells: [{ x: 0, y: 0 }],
    exitX: dx,
    exitY: dy,
    exitDir: newDir,
  };
}

// Medium curve (2x2): 90° turn over 4 cells
// The car sweeps through a 2x2 block. Which cells are occupied depends on entry dir and turn direction.
function mediumCurve(dir, turnSign) {
  const newDir = turnSign > 0 ? turnLeft(dir) : turnRight(dir);
  const [fdx, fdy] = DIR_VEC[dir];       // forward
  const [sdx, sdy] = turnSign > 0 ? DIR_VEC[turnLeft(dir)] : DIR_VEC[turnRight(dir)]; // sideways toward turn
  // Cells: entry cell, one ahead, one to the side, one ahead+to the side (the 2x2 block)
  const cells = [
    { x: 0, y: 0 },
    { x: fdx, y: fdy },
    { x: sdx, y: sdy },
    { x: fdx + sdx, y: fdy + sdy },
  ];
  // Exit: 2 cells forward in new direction from entry
  const exitX = fdx + sdx + DIR_VEC[newDir][0];
  const exitY = fdy + sdy + DIR_VEC[newDir][1];
  return {
    type: 'medium',
    turnSign,
    cells,
    exitX,
    exitY,
    exitDir: newDir,
  };
}

// Gentle curve (3x3): 90° turn over 9 cells
function gentleCurve(dir, turnSign) {
  const newDir = turnSign > 0 ? turnLeft(dir) : turnRight(dir);
  const [fdx, fdy] = DIR_VEC[dir];
  const [sdx, sdy] = turnSign > 0 ? DIR_VEC[turnLeft(dir)] : DIR_VEC[turnRight(dir)];
  const cells = [];
  for (let f = 0; f < 3; f++) {
    for (let s = 0; s < 3; s++) {
      cells.push({ x: fdx * f + sdx * s, y: fdy * f + sdy * s });
    }
  }
  // Exit: from the far corner of the 3x3 block, one step in new direction
  const exitX = fdx * 2 + sdx * 2 + DIR_VEC[newDir][0];
  const exitY = fdy * 2 + sdy * 2 + DIR_VEC[newDir][1];
  return {
    type: 'gentle',
    turnSign,
    cells,
    exitX,
    exitY,
    exitDir: newDir,
  };
}

// Seeded random number generator (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random track.
 * Returns { seed, tiles, gridWidth, gridHeight } where tiles is an array of
 * { type, gridX, gridY, dir, turnSign, cells } placed tiles.
 */
export function generateTrack(seed) {
  if (seed === undefined) seed = Date.now();
  const rand = mulberry32(seed);
  const targetLen = MIN_TRACK_TILES + Math.floor(rand() * (MAX_TRACK_TILES - MIN_TRACK_TILES + 1));

  const occupied = new Set(); // "x,y" strings for occupied cells
  const tiles = [];

  function isOccupied(cells, ox, oy) {
    for (const c of cells) {
      if (occupied.has(`${ox + c.x},${oy + c.y}`)) return true;
    }
    return false;
  }

  function occupy(cells, ox, oy) {
    for (const c of cells) occupied.add(`${ox + c.x},${oy + c.y}`);
  }

  // Start heading north from (0, 0)
  let cx = 0, cy = 0, dir = DIR_N;

  // Place grid tile (special straight)
  const gridTile = straightTile(dir);
  tiles.push({ ...gridTile, gridX: cx, gridY: cy, dir, special: 'grid' });
  occupy(gridTile.cells, cx, cy);
  cx += gridTile.exitX;
  cy += gridTile.exitY;

  // Place start/finish tile
  const startTile = straightTile(dir);
  tiles.push({ ...startTile, gridX: cx, gridY: cy, dir, special: 'start' });
  occupy(startTile.cells, cx, cy);
  cx += startTile.exitX;
  cy += startTile.exitY;

  // Generate middle track tiles
  let placed = 0;
  let consecutiveStraights = 0;
  const maxAttempts = targetLen * 20;
  let attempts = 0;

  while (placed < targetLen && attempts < maxAttempts) {
    attempts++;
    // Weighted random tile choice
    const r = rand();
    let candidate;
    if (r < 0.35) {
      candidate = straightTile(dir);
      candidate.turnSign = 0;
    } else if (r < 0.50) {
      candidate = tightCurve(dir, rand() < 0.5 ? 1 : -1);
    } else if (r < 0.75) {
      candidate = mediumCurve(dir, rand() < 0.5 ? 1 : -1);
    } else {
      candidate = gentleCurve(dir, rand() < 0.5 ? 1 : -1);
    }

    // Avoid too many consecutive straights
    if (candidate.type === 'straight') {
      if (consecutiveStraights >= 4) continue;
    }

    // Check if cells are free
    if (isOccupied(candidate.cells, cx, cy)) continue;

    // Also check that exit cell is not occupied (to avoid dead-end on next step)
    const exitGx = cx + candidate.exitX;
    const exitGy = cy + candidate.exitY;
    if (occupied.has(`${exitGx},${exitGy}`)) continue;

    // Place it
    tiles.push({ ...candidate, gridX: cx, gridY: cy, dir });
    occupy(candidate.cells, cx, cy);
    cx = exitGx;
    cy = exitGy;
    dir = candidate.exitDir;
    placed++;

    if (candidate.type === 'straight') consecutiveStraights++;
    else consecutiveStraights = 0;
  }

  // Place finish tile
  const finishTile = straightTile(dir);
  tiles.push({ ...finishTile, gridX: cx, gridY: cy, dir, special: 'finish' });
  occupy(finishTile.cells, cx, cy);

  // Compute grid bounds
  let minGx = Infinity, minGy = Infinity, maxGx = -Infinity, maxGy = -Infinity;
  for (const key of occupied) {
    const [x, y] = key.split(',').map(Number);
    if (x < minGx) minGx = x;
    if (y < minGy) minGy = y;
    if (x > maxGx) maxGx = x;
    if (y > maxGy) maxGy = y;
  }

  return {
    seed,
    tiles,
    minGx, minGy,
    gridWidth: maxGx - minGx + 1,
    gridHeight: maxGy - minGy + 1,
  };
}

/**
 * Build the center-line path of the track as an array of {x, y} world-space points.
 * Used for wall generation and rendering the driving line.
 * Each straight tile produces 2 points (entry center, exit center).
 * Each curve tile produces WALL_SEGMENTS_PER_CURVE+1 points along the arc.
 */
export function buildTrackPath(track) {
  const points = [];
  for (const tile of track.tiles) {
    const ox = tile.gridX * TILE;
    const oy = tile.gridY * TILE;
    const halfTile = TILE / 2;

    if (tile.type === 'straight') {
      const [dx, dy] = DIR_VEC[tile.dir];
      // Entry center
      const ex = ox + halfTile - dx * halfTile;
      const ey = oy + halfTile - dy * halfTile;
      if (points.length === 0 || points[points.length - 1].x !== ex || points[points.length - 1].y !== ey) {
        points.push({ x: ex, y: ey });
      }
      // Exit center
      points.push({ x: ox + halfTile + dx * halfTile, y: oy + halfTile + dy * halfTile });
    } else {
      // Curve tile: generate arc points
      const turnSign = tile.turnSign;
      const size = tile.type === 'tight' ? 1 : tile.type === 'medium' ? 2 : 3;
      const [fdx, fdy] = DIR_VEC[tile.dir];
      const [sdx, sdy] = turnSign > 0 ? DIR_VEC[turnLeft(tile.dir)] : DIR_VEC[turnRight(tile.dir)];

      // Arc center is at the inner corner of the curve block
      // For a right turn (turnSign=-1), center is to the right of entry
      // For a left turn (turnSign=+1), center is to the left of entry
      const arcCenterX = ox + halfTile + sdx * (size - 0.5) * TILE;
      const arcCenterY = oy + halfTile + sdy * (size - 0.5) * TILE;
      const arcRadius = (size - 0.5) * TILE;

      // Start angle: direction car is coming FROM (opposite of entry dir)
      const entryAngle = Math.atan2(-fdy, -fdx);
      const newDir = turnSign > 0 ? turnLeft(tile.dir) : turnRight(tile.dir);
      const [ndx, ndy] = DIR_VEC[newDir];
      const exitAngle = Math.atan2(-ndy, -ndx);

      // Sweep from entry to exit angle
      let startA = Math.atan2(oy + halfTile - arcCenterY, ox + halfTile - arcCenterX);
      // Exit point
      const exitTileX = ox + tile.exitX * TILE;
      const exitTileY = oy + tile.exitY * TILE;
      // Actually compute entry and exit points on the arc
      const entryPx = ox + halfTile;
      const entryPy = oy + halfTile;
      const exitPx = entryPx + (tile.exitX - DIR_VEC[tile.dir][0]) * TILE + DIR_VEC[tile.dir][0] * TILE;
      const exitPy = entryPy + (tile.exitY - DIR_VEC[tile.dir][1]) * TILE + DIR_VEC[tile.dir][1] * TILE;

      startA = Math.atan2(entryPy - arcCenterY, entryPx - arcCenterX);
      let endA = Math.atan2(exitPy - arcCenterY, exitPx - arcCenterX);

      // Ensure we sweep in the correct direction (CW for right turn, CCW for left)
      let sweep = endA - startA;
      if (turnSign > 0) {
        // Left turn = CCW sweep (negative in canvas coords)
        while (sweep > 0) sweep -= Math.PI * 2;
        while (sweep < -Math.PI) sweep += Math.PI * 2;
      } else {
        // Right turn = CW sweep (positive in canvas coords)
        while (sweep < 0) sweep += Math.PI * 2;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
      }

      const segments = WALL_SEGMENTS_PER_CURVE;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = startA + sweep * t;
        const px = arcCenterX + Math.cos(a) * arcRadius;
        const py = arcCenterY + Math.sin(a) * arcRadius;
        if (i === 0 && points.length > 0) {
          // Skip duplicate entry point
          const last = points[points.length - 1];
          if (Math.abs(last.x - px) < 1 && Math.abs(last.y - py) < 1) continue;
        }
        points.push({ x: px, y: py });
      }
    }
  }
  return points;
}

/**
 * Generate left and right wall paths by offsetting the center-line.
 * Returns { left: [{x,y}], right: [{x,y}] }
 */
export function buildWallPaths(centerLine) {
  const halfTrack = TILE / 2;
  const left = [];
  const right = [];

  for (let i = 0; i < centerLine.length; i++) {
    // Compute tangent direction at this point
    let tx, ty;
    if (i === 0) {
      tx = centerLine[1].x - centerLine[0].x;
      ty = centerLine[1].y - centerLine[0].y;
    } else if (i === centerLine.length - 1) {
      tx = centerLine[i].x - centerLine[i - 1].x;
      ty = centerLine[i].y - centerLine[i - 1].y;
    } else {
      tx = centerLine[i + 1].x - centerLine[i - 1].x;
      ty = centerLine[i + 1].y - centerLine[i - 1].y;
    }
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len < 0.001) continue;
    tx /= len;
    ty /= len;

    // Normal (perpendicular) — left is to the left of forward direction
    const nx = -ty;
    const ny = tx;

    left.push({ x: centerLine[i].x + nx * halfTrack, y: centerLine[i].y + ny * halfTrack });
    right.push({ x: centerLine[i].x - nx * halfTrack, y: centerLine[i].y - ny * halfTrack });
  }

  return { left, right };
}

export { DIR_VEC, DIR_N, DIR_E, DIR_S, DIR_W, turnLeft, turnRight };
```

- [ ] **Step 3: Create tests/track.test.js**

```js
import { generateTrack, buildTrackPath, buildWallPaths } from '../js/track.js';

const results = document.getElementById('results');
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    results.innerHTML += `<pre class="pass">✓ ${msg}</pre>`;
  } else {
    failed++;
    results.innerHTML += `<pre class="fail">✗ ${msg}</pre>`;
  }
}

// Test: generateTrack produces tiles
{
  const track = generateTrack(12345);
  assert(track.tiles.length > 10, 'generateTrack produces at least 10 tiles');
  assert(track.seed === 12345, 'seed is preserved');
}

// Test: deterministic with same seed
{
  const a = generateTrack(99);
  const b = generateTrack(99);
  assert(a.tiles.length === b.tiles.length, 'same seed produces same tile count');
  const match = a.tiles.every((t, i) => t.gridX === b.tiles[i].gridX && t.gridY === b.tiles[i].gridY);
  assert(match, 'same seed produces identical tile positions');
}

// Test: different seeds produce different tracks
{
  const a = generateTrack(1);
  const b = generateTrack(2);
  const same = a.tiles.length === b.tiles.length &&
    a.tiles.every((t, i) => t.gridX === b.tiles[i].gridX && t.gridY === b.tiles[i].gridY);
  assert(!same, 'different seeds produce different tracks');
}

// Test: no self-intersection (no duplicate grid cells)
{
  const track = generateTrack(42);
  const cellSet = new Set();
  let hasDuplicate = false;
  for (const tile of track.tiles) {
    for (const c of tile.cells) {
      const key = `${tile.gridX + c.x},${tile.gridY + c.y}`;
      if (cellSet.has(key)) { hasDuplicate = true; break; }
      cellSet.add(key);
    }
    if (hasDuplicate) break;
  }
  assert(!hasDuplicate, 'no self-intersection in generated track');
}

// Test: first tile is grid, second is start, last is finish
{
  const track = generateTrack(77);
  assert(track.tiles[0].special === 'grid', 'first tile is grid tile');
  assert(track.tiles[1].special === 'start', 'second tile is start/finish');
  assert(track.tiles[track.tiles.length - 1].special === 'finish', 'last tile is finish');
}

// Test: buildTrackPath produces points
{
  const track = generateTrack(55);
  const path = buildTrackPath(track);
  assert(path.length > track.tiles.length, 'path has more points than tiles (curves add segments)');
  assert(typeof path[0].x === 'number' && typeof path[0].y === 'number', 'path points have x,y');
}

// Test: buildWallPaths produces left and right
{
  const track = generateTrack(55);
  const path = buildTrackPath(track);
  const walls = buildWallPaths(path);
  assert(walls.left.length === walls.right.length, 'left and right walls have same point count');
  assert(walls.left.length > 0, 'wall paths are not empty');
}

// Test: run 20 random seeds without crashing
{
  let allOk = true;
  for (let s = 0; s < 20; s++) {
    try {
      const track = generateTrack(s * 1000 + 1);
      const path = buildTrackPath(track);
      buildWallPaths(path);
    } catch (e) {
      allOk = false;
      results.innerHTML += `<pre class="fail">  seed ${s * 1000 + 1}: ${e.message}</pre>`;
    }
  }
  assert(allOk, '20 random seeds generate without errors');
}

// Summary
results.innerHTML += `<hr><pre>${passed} passed, ${failed} failed</pre>`;
```

- [ ] **Step 4: Run tests in browser**

Open `tests/test.html` in a browser (or use a local server). All tests should pass.

Run: `cd /Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D && python3 -m http.server 8080 &`

Then open http://localhost:8080/tests/test.html — all tests should show green checkmarks.

- [ ] **Step 5: Iterate on track generation until tests pass**

Fix any issues found in the track generation logic. The arc geometry for curves is the trickiest part — debug by examining the center-line points for a known seed.

- [ ] **Step 6: Commit**

```bash
git add js/track.js tests/
git commit -m "feat: track generation with tile system and tests"
```

---

### Task 3: Canvas Setup, Camera, and Track Rendering

**Files:**
- Create: `js/camera.js`, `js/renderer.js`, `js/main.js`

- [ ] **Step 1: Create js/camera.js**

The camera transform rotates the world so the car always points up. It translates to keep the car centered on screen.

```js
import { GAME_W, GAME_H } from './constants.js';

export class Camera {
  constructor() {
    this.x = 0;      // follow target x (world space)
    this.y = 0;      // follow target y (world space)
    this.angle = 0;   // follow target angle (radians)
  }

  /** Update camera to follow a position and angle */
  follow(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
  }

  /** Apply camera transform to canvas context. Call before drawing world objects. */
  apply(ctx) {
    ctx.save();
    // Move origin to screen center
    ctx.translate(GAME_W / 2, GAME_H / 2);
    // Rotate so car's forward (angle=0 means moving in -Y direction) points up
    ctx.rotate(-this.angle);
    // Translate so car position is at origin
    ctx.translate(-this.x, -this.y);
  }

  /** Restore canvas context after drawing world objects. */
  restore(ctx) {
    ctx.restore();
  }
}
```

- [ ] **Step 2: Create js/renderer.js**

Draws the track (asphalt, center line, walls, curbs), car, ghost, and HUD.

```js
import { TILE, GAME_W, GAME_H, CAR_W, CAR_H, WALL_THICKNESS, GHOST_ALPHA } from './constants.js';

/**
 * Draw the track: asphalt tiles, center dashes, walls, curbs.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} track - from generateTrack
 * @param {object} walls - { left: [{x,y}], right: [{x,y}] } from buildWallPaths
 * @param {Array} centerLine - [{x,y}] from buildTrackPath
 */
export function drawTrack(ctx, track, walls, centerLine) {
  // Draw asphalt for each tile
  ctx.fillStyle = '#3d3d3d';
  for (const tile of track.tiles) {
    for (const c of tile.cells) {
      const px = (tile.gridX + c.x) * TILE;
      const py = (tile.gridY + c.y) * TILE;
      ctx.fillRect(px, py, TILE, TILE);
    }
  }

  // Draw center dashes
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 15]);
  ctx.beginPath();
  for (let i = 0; i < centerLine.length; i++) {
    if (i === 0) ctx.moveTo(centerLine[i].x, centerLine[i].y);
    else ctx.lineTo(centerLine[i].x, centerLine[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw curbs on curve tiles (inside wall)
  for (const tile of track.tiles) {
    if (tile.type === 'straight') continue;
    drawCurbs(ctx, tile);
  }

  // Draw walls (concrete barriers)
  drawWall(ctx, walls.left);
  drawWall(ctx, walls.right);

  // Draw start/finish lines
  for (const tile of track.tiles) {
    if (tile.special === 'start' || tile.special === 'finish') {
      drawFinishLine(ctx, tile);
    } else if (tile.special === 'grid') {
      drawGridMarkings(ctx, tile);
    }
  }
}

function drawWall(ctx, wallPath) {
  ctx.strokeStyle = '#888';
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < wallPath.length; i++) {
    if (i === 0) ctx.moveTo(wallPath[i].x, wallPath[i].y);
    else ctx.lineTo(wallPath[i].x, wallPath[i].y);
  }
  ctx.stroke();
  // Highlight edge
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < wallPath.length; i++) {
    if (i === 0) ctx.moveTo(wallPath[i].x, wallPath[i].y);
    else ctx.lineTo(wallPath[i].x, wallPath[i].y);
  }
  ctx.stroke();
}

function drawCurbs(ctx, tile) {
  // Simplified: draw alternating red/white rectangles along the inside of the curve
  // This is a visual approximation — exact placement depends on arc geometry
  const ox = tile.gridX * TILE;
  const oy = tile.gridY * TILE;
  const size = tile.type === 'tight' ? 1 : tile.type === 'medium' ? 2 : 3;
  const curbW = 12;
  const segments = 12;

  // Use the tile's arc parameters to place curbs along the inner wall
  // For now, skip detailed curb rendering — it will be refined visually
}

function drawFinishLine(ctx, tile) {
  const ox = tile.gridX * TILE;
  const oy = tile.gridY * TILE;
  const half = TILE / 2;

  ctx.save();
  ctx.translate(ox + half, oy + half);
  // Rotate so the line is perpendicular to the track direction
  const dirAngle = [- Math.PI / 2, 0, Math.PI / 2, Math.PI][tile.dir];
  ctx.rotate(dirAngle);

  // Draw checkered pattern across the track
  const squareSize = TILE / 16;
  const rows = 2;
  const cols = Math.ceil(TILE / squareSize);
  ctx.translate(-TILE / 2, -squareSize);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#111';
      ctx.fillRect(c * squareSize, r * squareSize, squareSize, squareSize);
    }
  }
  ctx.restore();
}

function drawGridMarkings(ctx, tile) {
  const ox = tile.gridX * TILE;
  const oy = tile.gridY * TILE;
  const half = TILE / 2;

  ctx.save();
  ctx.translate(ox + half, oy + half);
  const dirAngle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][tile.dir];
  ctx.rotate(dirAngle);

  // Draw grid box (pole position)
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.strokeRect(-CAR_W * 0.8, -CAR_H * 0.6, CAR_W * 1.6, CAR_H * 1.2);

  ctx.restore();
}

/**
 * Draw the flat formula car.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - world x
 * @param {number} y - world y
 * @param {number} angle - rotation in radians
 * @param {string} bodyColor - main body color
 * @param {string} wingColor - wing color
 * @param {number} alpha - opacity (1 for player, GHOST_ALPHA for ghost)
 */
export function drawCar(ctx, x, y, angle, bodyColor, wingColor, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  const w = CAR_W;
  const h = CAR_H;
  const tireW = w * 0.16;
  const tireH = w * 0.42;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 2, w * 0.5, h * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rear tires
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w / 2 - tireW / 2, h * 0.08, tireW, tireH);
  ctx.fillRect(w / 2 - tireW / 2, h * 0.08, tireW, tireH);

  // Front tires
  ctx.fillRect(-w / 2 - tireW / 2, -h * 0.35, tireW, tireH * 0.75);
  ctx.fillRect(w / 2 - tireW / 2, -h * 0.35, tireW, tireH * 0.75);

  // Rear wing
  ctx.fillStyle = wingColor;
  ctx.fillRect(-w * 0.48, h * 0.32, w * 0.96, w * 0.08);

  // Front wing
  ctx.fillRect(-w * 0.48, -h * 0.44, w * 0.96, w * 0.06);

  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-w * 0.08, -h * 0.42);
  ctx.lineTo(w * 0.08, -h * 0.42);
  ctx.lineTo(w * 0.28, -h * 0.2);
  ctx.lineTo(w * 0.35, 0);
  ctx.lineTo(w * 0.35, h * 0.3);
  ctx.lineTo(-w * 0.35, h * 0.3);
  ctx.lineTo(-w * 0.35, 0);
  ctx.lineTo(-w * 0.28, -h * 0.2);
  ctx.closePath();
  ctx.fill();

  // Sidepods (darker shade)
  ctx.fillStyle = darken(bodyColor, 25);
  ctx.fillRect(-w * 0.38, -h * 0.02, w * 0.1, h * 0.2);
  ctx.fillRect(w * 0.28, -h * 0.02, w * 0.1, h * 0.2);

  // Cockpit
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(-w * 0.12, -h * 0.14, w * 0.24, h * 0.16);

  // Air intake
  ctx.fillStyle = '#222';
  ctx.fillRect(-w * 0.06, -h * 0.22, w * 0.12, w * 0.1);

  ctx.restore();
}

function darken(hex, amt) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw the HUD (current time, best time, speed).
 * Called AFTER camera.restore() so it draws in screen space.
 */
export function drawHUD(ctx, currentTime, bestTime, speed) {
  ctx.save();

  // Timer pill (top center)
  const timeStr = formatTime(currentTime);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, GAME_W / 2 - 120, 16, 240, 52, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, GAME_W / 2, 52);

  // Best time (below)
  if (bestTime !== null) {
    ctx.fillStyle = 'rgba(100,180,255,0.8)';
    ctx.font = '22px monospace';
    ctx.fillText('BEST  ' + formatTime(bestTime), GAME_W / 2, 82);
  }

  // Speed pill (bottom center)
  const speedStr = Math.round(speed) + ' km/h';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, GAME_W / 2 - 100, GAME_H - 70, 200, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(speedStr, GAME_W / 2, GAME_H - 38);

  ctx.restore();
}

function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const hundredths = Math.floor((totalSec % 1) * 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
```

- [ ] **Step 3: Create js/main.js — minimal version to render track**

A minimal main.js to verify track generation + rendering works visually before adding car/input/game logic.

```js
import { GAME_W, GAME_H } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths } from './track.js';
import { Camera } from './camera.js';
import { drawTrack, drawCar } from './renderer.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// DPR-aware sizing
const dpr = window.devicePixelRatio || 1;
canvas.width = GAME_W * dpr;
canvas.height = GAME_H * dpr;
canvas.style.width = GAME_W / (GAME_W / Math.min(window.innerWidth, GAME_W * window.innerHeight / GAME_H)) + 'px';
canvas.style.height = window.innerHeight + 'px';
ctx.scale(dpr, dpr);

// Fit canvas to viewport while maintaining aspect ratio
function resize() {
  const aspect = GAME_W / GAME_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (w / h > aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// Generate track
const track = generateTrack();
const centerLine = buildTrackPath(track);
const walls = buildWallPaths(centerLine);

// Camera follows the start position
const camera = new Camera();
const startTile = track.tiles[1]; // start/finish tile
const startX = (startTile.gridX + 0.5) * 512;
const startY = (startTile.gridY + 0.5) * 512;
const startAngle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][startTile.dir];
camera.follow(startX, startY, startAngle);

// Render loop
function render() {
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  // Grass background
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  camera.apply(ctx);
  drawTrack(ctx, track, walls, centerLine);
  // Draw car at start position
  drawCar(ctx, startX, startY, startAngle, '#cc1111', '#dd3333', 1.0);
  camera.restore(ctx);

  requestAnimationFrame(render);
}
render();
```

- [ ] **Step 4: Open in browser, verify track renders**

Open http://localhost:8080/ — you should see a generated track with asphalt tiles, walls, center line, and the red formula car at the start. The camera should be centered on the car with the world rotated so the car points up.

Debug and iterate until the visual is correct. Common issues:
- Arc geometry in curves may need tuning
- Wall offset direction may be inverted
- Camera rotation angle may need adjustment

- [ ] **Step 5: Commit**

```bash
git add js/camera.js js/renderer.js js/main.js
git commit -m "feat: track rendering with camera and car sprite"
```

---

### Task 4: Car Physics and Input

**Files:**
- Create: `js/car.js`, `js/input.js`
- Modify: `js/main.js`

- [ ] **Step 1: Create js/input.js**

```js
/**
 * Drag-to-steer input handler.
 * On mouse/touch down, records the start X position.
 * While dragging, the horizontal delta controls steering intensity.
 * On release, steering returns to zero.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.steering = 0;   // -1 (full left) to +1 (full right)
    this._dragging = false;
    this._startX = 0;
    this._maxDragPx = 150; // pixels of drag for full steering

    // Mouse events
    canvas.addEventListener('mousedown', (e) => this._onDown(e.clientX));
    window.addEventListener('mousemove', (e) => this._onMove(e.clientX));
    window.addEventListener('mouseup', () => this._onUp());

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onDown(e.touches[0].clientX);
    });
    window.addEventListener('touchmove', (e) => {
      if (this._dragging) this._onMove(e.touches[0].clientX);
    });
    window.addEventListener('touchend', () => this._onUp());
  }

  _onDown(clientX) {
    this._dragging = true;
    this._startX = clientX;
    this.steering = 0;
  }

  _onMove(clientX) {
    if (!this._dragging) return;
    const dx = clientX - this._startX;
    this.steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
  }

  _onUp() {
    this._dragging = false;
    this.steering = 0;
  }
}
```

- [ ] **Step 2: Create js/car.js**

The car uses Physics2D for collision with walls but manages its own arcade-style movement. Each tick:
1. Apply steering (rotate car)
2. Compute forward direction
3. Accelerate toward max speed (reduced when turning)
4. Set velocity to forward * speed
5. Physics detects/resolves wall collisions
6. Read back velocity after physics, update speed

```js
import { World, Body, Rectangle, Edge, Vec2 } from '../physics2d/index.js';
import {
  TILE, CAR_W, CAR_H, CAR_MASS, CAR_RESTITUTION, CAR_FRICTION,
  MAX_SPEED, ACCELERATION, TURN_RATE, TURN_SPEED_PENALTY,
  CRASH_ANGLE_THRESHOLD, WALL_SPEED_LOSS, FIXED_DT
} from './constants.js';

export class Car {
  constructor(world) {
    this.world = world;
    this.body = null;
    this.speed = 0;         // current forward speed (px/s)
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
  }

  /** Spawn the car at a world position and angle. */
  spawn(x, y, angle) {
    this.body = new Body({
      shape: new Rectangle(CAR_W, CAR_H),
      position: new Vec2(x, y),
      mass: CAR_MASS,
      restitution: CAR_RESTITUTION,
      friction: CAR_FRICTION,
      angle: angle,
      linearDamping: 0,
      angularDamping: 0,
    });
    this.world.addBody(this.body);
    this.speed = 0;
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
  }

  /**
   * Update car for one physics tick.
   * @param {number} steering - -1 to +1
   */
  update(steering) {
    if (this.crashed || this.finished || !this.body) return;

    this.tickCount++;
    const dt = FIXED_DT;

    // Steering
    const turnAmount = steering * TURN_RATE * dt;
    this.body.angle += turnAmount;
    this.body._aabbDirty = true;

    // Speed: accelerate toward max, penalized by turning
    const turnFactor = 1 - Math.abs(steering) * (1 - TURN_SPEED_PENALTY);
    const effectiveMax = MAX_SPEED * turnFactor;
    if (this.speed < effectiveMax) {
      this.speed = Math.min(this.speed + ACCELERATION * dt, effectiveMax);
    } else {
      // Gradually reduce if over effective max (from turning)
      this.speed = Math.max(this.speed - ACCELERATION * 2 * dt, effectiveMax);
    }

    // Set velocity in car's forward direction
    // angle=0 means car faces up (-Y in canvas), so forward is (sin(angle), -cos(angle))
    const fx = Math.sin(this.body.angle);
    const fy = -Math.cos(this.body.angle);
    this.body.velocity.set(fx * this.speed, fy * this.speed);
    this.body.angularVelocity = 0;
  }

  /**
   * Called after physics step to read back collision effects.
   * If a wall collision happened, physics modified the velocity.
   * We read the new speed from the velocity magnitude.
   */
  postPhysicsUpdate() {
    if (this.crashed || !this.body) return;
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    this.speed = Math.sqrt(vx * vx + vy * vy);
  }

  /**
   * Handle collision with a wall body.
   * @param {object} contact - Physics2D contact info
   * @param {Body} wallBody - the wall body
   */
  onWallCollision(contact) {
    if (this.crashed) return;

    // Compute impact angle: dot product of car's forward direction with wall normal
    const fx = Math.sin(this.body.angle);
    const fy = -Math.cos(this.body.angle);
    const dot = Math.abs(fx * contact.normal.x + fy * contact.normal.y);

    // dot close to 1 = head-on, close to 0 = glancing
    if (dot > Math.cos(CRASH_ANGLE_THRESHOLD)) {
      this.crashed = true;
      this.speed = 0;
      this.body.velocity.set(0, 0);
    } else {
      // Glancing hit — speed is already reduced by physics impulse
      // Apply additional penalty
      this.speed *= WALL_SPEED_LOSS;
    }
  }

  get x() { return this.body ? this.body.renderPosition.x : 0; }
  get y() { return this.body ? this.body.renderPosition.y : 0; }
  get angle() { return this.body ? this.body.renderAngle : 0; }
  get physX() { return this.body ? this.body.position.x : 0; }
  get physY() { return this.body ? this.body.position.y : 0; }
  get physAngle() { return this.body ? this.body.angle : 0; }
}
```

- [ ] **Step 3: Create wall bodies from wall paths**

Add a function to create Physics2D static Edge bodies from wall paths. Add to the bottom of `js/track.js`:

```js
/**
 * Create Physics2D static Edge bodies for walls.
 * @param {World} world - Physics2D world
 * @param {object} walls - { left, right } from buildWallPaths
 * @returns {Body[]} array of wall bodies
 */
export function createWallBodies(world, walls) {
  const wallBodies = [];

  function addWallSegments(path) {
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const body = new Body({
        shape: new Edge(
          new Vec2(p1.x - mx, p1.y - my),
          new Vec2(p2.x - mx, p2.y - my)
        ),
        position: new Vec2(mx, my),
        isStatic: true,
        restitution: 0.2,
        friction: 0.8,
        userData: { type: 'wall' },
      });
      world.addBody(body);
      wallBodies.push(body);
    }
  }

  addWallSegments(walls.left);
  addWallSegments(walls.right);
  return wallBodies;
}
```

This requires adding Vec2, Body, Edge imports at the top of track.js:

```js
import { Vec2 } from '../physics2d/index.js';
import { Body } from '../physics2d/src/body.js';
import { Edge } from '../physics2d/src/shapes.js';
```

- [ ] **Step 4: Update js/main.js to wire car + input + physics**

Replace the minimal main.js with the full game loop:

```js
import { GAME_W, GAME_H, TILE, FIXED_DT } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies, DIR_VEC } from './track.js';
import { Camera } from './camera.js';
import { drawTrack, drawCar, drawHUD } from './renderer.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { World, Vec2 } from '../physics2d/index.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// DPR-aware sizing
const dpr = window.devicePixelRatio || 1;
canvas.width = GAME_W * dpr;
canvas.height = GAME_H * dpr;
ctx.scale(dpr, dpr);

function resize() {
  const aspect = GAME_W / GAME_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// Physics world (no gravity — top-down game)
const world = new World({ gravity: new Vec2(0, 0) });

// Generate track
const track = generateTrack();
const centerLine = buildTrackPath(track);
const walls = buildWallPaths(centerLine);
const wallBodies = createWallBodies(world, walls);

// Car setup
const car = new Car(world);
const startTile = track.tiles[1]; // start/finish tile
const dirAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const startX = (startTile.gridX + 0.5) * TILE;
const startY = (startTile.gridY + 0.5) * TILE;
const startAngle = dirAngles[startTile.dir];
car.spawn(startX, startY, startAngle);

// Collision handling
world.onCollision = (a, b, contact) => {
  const isCarA = a === car.body;
  const isCarB = b === car.body;
  if (!isCarA && !isCarB) return;
  const other = isCarA ? b : a;
  if (other.userData && other.userData.type === 'wall') {
    car.onWallCollision(contact);
  }
};

// Input
const input = new Input(canvas);

// Camera
const camera = new Camera();

// Timing
let raceTime = 0; // ms
let lastTime = performance.now();
let accumulator = 0;
const maxFrameDt = 1 / 30; // cap at 30fps minimum

function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > maxFrameDt) dt = maxFrameDt;

  // Fixed timestep accumulator
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    // Game tick
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();
    if (!car.crashed && !car.finished) {
      raceTime += FIXED_DT * 1000;
    }
    accumulator -= FIXED_DT;
  }

  // Camera follows car
  camera.follow(car.x, car.y, car.angle);

  // Render
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  camera.apply(ctx);
  drawTrack(ctx, track, walls, centerLine);
  drawCar(ctx, car.x, car.y, car.angle, '#cc1111', '#dd3333', 1.0);
  camera.restore(ctx);

  // HUD (screen space)
  const displaySpeed = car.speed * 3.6 * 0.5; // convert px/s to fake km/h
  drawHUD(ctx, raceTime, null, displaySpeed);

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
```

- [ ] **Step 5: Test in browser**

Open http://localhost:8080/ — you should be able to:
- See the track rendered with the car at the start
- Drag left/right to steer the car
- Car auto-accelerates and moves forward
- Camera rotates with the car
- Walls should block the car (collision response)

Debug and fix issues. Common problems:
- Car angle convention (which direction is "forward" for angle=0)
- Camera rotation direction
- Wall collision detection not triggering (Edge body placement)

- [ ] **Step 6: Commit**

```bash
git add js/car.js js/input.js js/track.js js/main.js
git commit -m "feat: car physics, input steering, and wall collisions"
```

---

### Task 5: Ghost System

**Files:**
- Create: `js/ghost.js`
- Modify: `js/main.js`

- [ ] **Step 1: Create js/ghost.js**

```js
import { GHOST_ALPHA } from './constants.js';

/**
 * Records car position/angle each physics tick.
 * Plays back ghost from saved data.
 * Persists best ghost to localStorage.
 */
export class Ghost {
  constructor(seed) {
    this.seed = seed;
    this.recording = [];       // current run: [{x, y, angle}]
    this.bestRecording = null;  // saved best: [{x, y, angle}]
    this.bestTime = null;       // ms
    this.playbackTick = 0;
    this._load();
  }

  /** Record one tick of car state. */
  record(x, y, angle) {
    this.recording.push({ x, y, angle });
  }

  /** Reset recording for a new run. */
  resetRecording() {
    this.recording = [];
    this.playbackTick = 0;
  }

  /** Save current recording as best if it beats the previous. */
  saveIfBest(timeMs) {
    if (this.bestTime === null || timeMs < this.bestTime) {
      this.bestTime = timeMs;
      this.bestRecording = this.recording.slice();
      this._save();
      return true;
    }
    return false;
  }

  /** Get ghost position/angle at current tick. Returns null if no ghost. */
  getGhostFrame() {
    if (!this.bestRecording || this.playbackTick >= this.bestRecording.length) return null;
    return this.bestRecording[this.playbackTick];
  }

  /** Advance playback by one tick. */
  advancePlayback() {
    this.playbackTick++;
  }

  _storageKey() {
    return `racing-2d:ghost:${this.seed}`;
  }

  _save() {
    try {
      const data = {
        time: this.bestTime,
        frames: this.bestRecording,
      };
      localStorage.setItem(this._storageKey(), JSON.stringify(data));
    } catch (e) {
      // localStorage full or unavailable — silently fail
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (raw) {
        const data = JSON.parse(raw);
        this.bestTime = data.time;
        this.bestRecording = data.frames;
      }
    } catch (e) {
      // corrupt data — ignore
    }
  }
}
```

- [ ] **Step 2: Wire ghost into main.js**

Add ghost recording during the physics tick, ghost rendering during draw, and ghost playback.

In the game tick section of the loop (inside `while (accumulator >= FIXED_DT)`):

```js
// After car.update and before world.step:
if (!car.crashed && !car.finished) {
  ghost.record(car.physX, car.physY, car.physAngle);
  ghost.advancePlayback();
}
```

In the render section, draw the ghost before the player car:

```js
// Inside camera transform, before drawCar for player:
const ghostFrame = ghost.getGhostFrame();
if (ghostFrame) {
  drawCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, '#3366cc', '#4477dd', GHOST_ALPHA);
}
```

Pass `ghost.bestTime` to `drawHUD` instead of `null`.

- [ ] **Step 3: Commit**

```bash
git add js/ghost.js js/main.js
git commit -m "feat: ghost recording, playback, and localStorage persistence"
```

---

### Task 6: Game State Machine

**Files:**
- Create: `js/game.js`
- Modify: `js/main.js`

- [ ] **Step 1: Create js/game.js**

```js
import { COUNTDOWN_SECONDS, FIXED_DT } from './constants.js';

/**
 * Game states: title, countdown, racing, finished, crashed
 */
export class GameState {
  constructor() {
    this.state = 'title';
    this.countdownTimer = 0;
    this.countdownNumber = 0; // 3, 2, 1, 0 (0 = GO)
    this.raceTime = 0;       // ms
    this.finishDelta = null;  // ms difference from best (negative = new record)
    this.isNewRecord = false;
  }

  /** Start countdown from title screen. */
  startCountdown() {
    this.state = 'countdown';
    this.countdownTimer = 0;
    this.countdownNumber = COUNTDOWN_SECONDS;
    this.raceTime = 0;
  }

  /** Tick the countdown. Returns true when countdown finishes. */
  tickCountdown() {
    this.countdownTimer += FIXED_DT;
    if (this.countdownTimer >= 1.0) {
      this.countdownTimer -= 1.0;
      this.countdownNumber--;
      if (this.countdownNumber < 0) {
        this.state = 'racing';
        return true;
      }
    }
    return false;
  }

  /** Tick race timer. */
  tickRace() {
    this.raceTime += FIXED_DT * 1000;
  }

  /** Transition to finished state. */
  finish(bestTime) {
    this.state = 'finished';
    if (bestTime !== null) {
      this.finishDelta = this.raceTime - bestTime;
      this.isNewRecord = this.finishDelta < 0;
    } else {
      this.finishDelta = null;
      this.isNewRecord = true;
    }
  }

  /** Transition to crashed state. */
  crash() {
    this.state = 'crashed';
  }

  /** Reset to title (for retry). */
  reset() {
    this.state = 'title';
    this.raceTime = 0;
    this.finishDelta = null;
    this.isNewRecord = false;
  }
}
```

- [ ] **Step 2: Add overlay drawing to renderer.js**

Add these functions to `js/renderer.js`:

```js
export function drawTitleScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RACING 2D', GAME_W / 2, GAME_H / 2 - 60);
  ctx.font = '32px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Tap to start', GAME_W / 2, GAME_H / 2 + 20);
}

export function drawCountdown(ctx, number) {
  const text = number > 0 ? String(number) : 'GO!';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, GAME_W / 2, GAME_H / 2);
  ctx.textBaseline = 'alphabetic';
}

export function drawFinishScreen(ctx, raceTime, delta, isNewRecord) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = isNewRecord ? '#4caf50' : '#fff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(isNewRecord ? 'NEW RECORD!' : 'FINISHED', GAME_W / 2, GAME_H / 2 - 80);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px monospace';
  ctx.fillText(formatTime(raceTime), GAME_W / 2, GAME_H / 2);

  if (delta !== null && !isNewRecord) {
    ctx.fillStyle = '#f44336';
    ctx.font = '32px monospace';
    ctx.fillText('+' + formatTime(Math.abs(delta)), GAME_W / 2, GAME_H / 2 + 50);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '28px sans-serif';
  ctx.fillText('Tap to retry', GAME_W / 2, GAME_H / 2 + 130);
  ctx.font = '24px sans-serif';
  ctx.fillText('Double-tap for new track', GAME_W / 2, GAME_H / 2 + 175);
}

export function drawCrashScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f44336';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('CRASHED', GAME_W / 2, GAME_H / 2 - 40);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '28px sans-serif';
  ctx.fillText('Tap to retry', GAME_W / 2, GAME_H / 2 + 40);
  ctx.font = '24px sans-serif';
  ctx.fillText('Double-tap for new track', GAME_W / 2, GAME_H / 2 + 85);
}
```

- [ ] **Step 3: Rewrite js/main.js to use GameState**

Integrate GameState, ghost, finish line detection, tap-to-restart, and double-tap for new track into the full main.js. This is the final wiring of all modules.

Key additions:
- Finish detection: check if car has passed the finish tile (compare car position against finish tile center, accounting for direction)
- Tap/click handling: on title screen → start countdown. On finish/crash → retry same track. Double-tap → new track.
- State-driven rendering: draw appropriate overlays per state
- Ghost save on finish

```js
import { GAME_W, GAME_H, TILE, FIXED_DT, GHOST_ALPHA } from './constants.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies, DIR_VEC } from './track.js';
import { Camera } from './camera.js';
import { drawTrack, drawCar, drawHUD, drawTitleScreen, drawCountdown, drawFinishScreen, drawCrashScreen } from './renderer.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { Ghost } from './ghost.js';
import { GameState } from './game.js';
import { World, Vec2 } from '../physics2d/index.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// DPR
const dpr = window.devicePixelRatio || 1;
canvas.width = GAME_W * dpr;
canvas.height = GAME_H * dpr;
ctx.scale(dpr, dpr);

function resize() {
  const aspect = GAME_W / GAME_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// --- Game state ---
let world, track, centerLine, wallPaths, wallBodies, car, ghost, input, camera, gameState;
let currentSeed;

const dirAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

function initTrack(seed) {
  currentSeed = seed !== undefined ? seed : Date.now();
  world = new World({ gravity: new Vec2(0, 0) });
  track = generateTrack(currentSeed);
  centerLine = buildTrackPath(track);
  wallPaths = buildWallPaths(centerLine);
  wallBodies = createWallBodies(world, wallPaths);
  ghost = new Ghost(currentSeed);
  gameState = new GameState();
}

function spawnCar() {
  car = new Car(world);
  const startTile = track.tiles[1]; // start/finish tile
  const sx = (startTile.gridX + 0.5) * TILE;
  const sy = (startTile.gridY + 0.5) * TILE;
  const sa = dirAngles[startTile.dir];
  car.spawn(sx, sy, sa);

  world.onCollision = (a, b, contact) => {
    const isCarA = a === car.body;
    const isCarB = b === car.body;
    if (!isCarA && !isCarB) return;
    const other = isCarA ? b : a;
    if (other.userData && other.userData.type === 'wall') {
      car.onWallCollision(contact);
    }
  };
}

function retry() {
  // Remove old car body, respawn
  if (car.body) world.removeBody(car.body);
  ghost.resetRecording();
  gameState.reset();
  gameState.startCountdown();
  spawnCar();
}

function newTrack() {
  initTrack();
  spawnCar();
  gameState.startCountdown();
}

// Init
initTrack();
spawnCar();
input = new Input(canvas);
camera = new Camera();

// Finish line detection
function checkFinishLine() {
  const finishTile = track.tiles[track.tiles.length - 1];
  const fx = (finishTile.gridX + 0.5) * TILE;
  const fy = (finishTile.gridY + 0.5) * TILE;
  const dx = car.physX - fx;
  const dy = car.physY - fy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Check if car is within the finish tile and has crossed the center
  if (dist < TILE * 0.5) {
    // Check car is moving in the right direction
    const [fdx, fdy] = DIR_VEC[finishTile.dir];
    const carFx = Math.sin(car.body.angle);
    const carFy = -Math.cos(car.body.angle);
    const dot = carFx * fdx + carFy * fdy; // negative if wrong way
    // Direction vector for tile dir points in the travel direction
    // DIR_VEC is grid coords, need to account for that
    if (dist < TILE * 0.4) {
      return true;
    }
  }
  return false;
}

// Tap handling
let lastTapTime = 0;
canvas.addEventListener('click', () => {
  const now = performance.now();
  const isDoubleTap = now - lastTapTime < 400;
  lastTapTime = now;

  if (gameState.state === 'title') {
    gameState.startCountdown();
  } else if (gameState.state === 'finished' || gameState.state === 'crashed') {
    if (isDoubleTap) {
      newTrack();
    } else {
      retry();
    }
  }
});

// Game loop
let lastTime = performance.now();
let accumulator = 0;

function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 1 / 30) dt = 1 / 30;

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    accumulator -= FIXED_DT;

    if (gameState.state === 'countdown') {
      gameState.tickCountdown();
    } else if (gameState.state === 'racing') {
      car.update(input.steering);
      world.step(FIXED_DT);
      car.postPhysicsUpdate();
      gameState.tickRace();

      // Record ghost
      ghost.record(car.physX, car.physY, car.physAngle);
      ghost.advancePlayback();

      // Check crash
      if (car.crashed) {
        gameState.crash();
      }

      // Check finish
      if (checkFinishLine()) {
        car.finished = true;
        const previousBest = ghost.bestTime;
        ghost.saveIfBest(gameState.raceTime);
        gameState.finish(previousBest);
      }
    }
  }

  // Camera
  camera.follow(car.x, car.y, car.angle);

  // Render
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  camera.apply(ctx);
  drawTrack(ctx, track, wallPaths, centerLine);

  // Ghost car
  const ghostFrame = ghost.getGhostFrame();
  if (ghostFrame) {
    drawCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, '#3366cc', '#4477dd', GHOST_ALPHA);
  }

  // Player car
  drawCar(ctx, car.x, car.y, car.angle, '#cc1111', '#dd3333', 1.0);
  camera.restore(ctx);

  // HUD
  const displaySpeed = car.speed * 3.6 * 0.5;
  drawHUD(ctx, gameState.raceTime, ghost.bestTime, displaySpeed);

  // Overlays
  if (gameState.state === 'title') {
    drawTitleScreen(ctx);
  } else if (gameState.state === 'countdown') {
    drawCountdown(ctx, gameState.countdownNumber);
  } else if (gameState.state === 'finished') {
    drawFinishScreen(ctx, gameState.raceTime, gameState.finishDelta, gameState.isNewRecord);
  } else if (gameState.state === 'crashed') {
    drawCrashScreen(ctx);
  }

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
```

- [ ] **Step 4: Test full game flow in browser**

Open http://localhost:8080/ and verify:
1. Title screen shows, tap to start
2. Countdown 3-2-1-GO
3. Car accelerates, drag to steer
4. Camera rotates with car
5. Wall collision: glancing = bounce, head-on = crash
6. Reaching finish tile shows time
7. Ghost appears on retry
8. Double-tap generates new track

- [ ] **Step 5: Commit**

```bash
git add js/game.js js/renderer.js js/main.js
git commit -m "feat: game state machine, finish detection, overlays, and full game loop"
```

---

### Task 7: Polish and Tuning

**Files:**
- Modify: `js/constants.js`, `js/renderer.js`, `js/track.js`, `js/car.js`

- [ ] **Step 1: Tune physics constants**

Play the game and adjust these values in `constants.js` until it feels good:
- `MAX_SPEED` — should a clean run take ~30s
- `ACCELERATION` — how quickly the car reaches top speed
- `TURN_RATE` — how responsive steering feels
- `TURN_SPEED_PENALTY` — how much turning costs
- `CRASH_ANGLE_THRESHOLD` — when a wall hit becomes a crash
- `MIN_TRACK_TILES` / `MAX_TRACK_TILES` — track length for ~30s

- [ ] **Step 2: Add grass texture to background**

In `js/renderer.js`, before drawing the track, draw scattered grass detail rects across the visible area to add texture to the green background.

- [ ] **Step 3: Cap rendering to 60fps**

In `js/main.js`, add a frame time check at the top of `gameLoop`:

```js
const MIN_FRAME_MS = 1000 / 61; // slightly under 60fps to avoid skipping
let lastRenderTime = 0;

function gameLoop(now) {
  if (now - lastRenderTime < MIN_FRAME_MS) {
    requestAnimationFrame(gameLoop);
    return;
  }
  lastRenderTime = now;
  // ... rest of loop
}
```

- [ ] **Step 4: Commit**

```bash
git add js/
git commit -m "feat: tuning, grass texture, 60fps cap"
```

---

### Task 8: Platform Deployment Prep

**Files:**
- Modify: `CLAUDE.md`
- Create: `thumbnail.png` (screenshot)

- [ ] **Step 1: Take a screenshot for thumbnail**

Use the browser to take a screenshot of the game in action (car racing on the track). Save as `thumbnail.png` at a reasonable size (e.g. 480x854).

- [ ] **Step 2: Update CLAUDE.md**

Update with the final architecture, file structure, and key details about the codebase.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat: platform deployment ready with thumbnail and docs"
```

- [ ] **Step 4: Test deployment**

From the GamesPlatform directory:
```bash
cd /Users/nitzanwilnai/Programming/Claude/GamesPlatform
./scripts/deploy-game.sh /Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D
```

Verify the game loads on the platform and plays correctly in the sandboxed iframe.
