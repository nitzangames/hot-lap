import { TILE, MIN_TRACK_TILES, MAX_TRACK_TILES, WALL_SEGMENTS_PER_CURVE } from './constants.js';
import { Vec2 } from '../physics2d/index.js';
import { Body } from '../physics2d/src/body.js';
import { Edge } from '../physics2d/src/shapes.js';

// Directions: 0=N(up), 1=E(right), 2=S(down), 3=W(left)
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

// Direction vectors (Y increases downward)
export const DIR_VEC = [
  { x: 0, y: -1 }, // N
  { x: 1, y: 0 },  // E
  { x: 0, y: 1 },  // S
  { x: -1, y: 0 }, // W
];

export function turnLeft(dir) {
  return (dir + 3) % 4; // N->W->S->E->N
}

export function turnRight(dir) {
  return (dir + 1) % 4; // N->E->S->W->N
}

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Tile placement helpers ---

// Get the perpendicular-left direction vector for a given facing direction
function perpLeft(dir) {
  return DIR_VEC[turnLeft(dir)];
}

// Get the perpendicular-right direction vector for a given facing direction
function perpRight(dir) {
  return DIR_VEC[turnRight(dir)];
}

/**
 * Compute the grid cells occupied by a curve tile.
 *
 * For a curve of size NxN entering at (gx, gy) heading in `dir` and turning by `sign`:
 *   sign = +1 means turn left, sign = -1 means turn right.
 *
 * The occupied cells form an NxN block. The entry cell is at one corner
 * of this block. The block extends:
 *   - (size-1) cells in the forward direction from the entry cell
 *   - (size-1) cells in the lateral direction of the turn from the entry cell
 */
function curveCells(gx, gy, dir, sign, size) {
  const fwd = DIR_VEC[dir];
  const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
  const cells = [];
  for (let f = 0; f < size; f++) {
    for (let l = 0; l < size; l++) {
      cells.push({
        x: gx + fwd.x * f + lat.x * l,
        y: gy + fwd.y * f + lat.y * l,
      });
    }
  }
  return cells;
}

/**
 * Compute exit position and direction for a curve.
 * The exit is at the far corner of the NxN block, one cell beyond in the turned direction.
 */
function curveExit(gx, gy, dir, sign, size) {
  const fwd = DIR_VEC[dir];
  const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
  const exitDir = sign === 1 ? turnLeft(dir) : turnRight(dir);
  const exitDirVec = DIR_VEC[exitDir];
  // Far corner cell of the NxN block
  const farX = gx + fwd.x * (size - 1) + lat.x * (size - 1);
  const farY = gy + fwd.y * (size - 1) + lat.y * (size - 1);
  // Exit cell is one step beyond in the exit (turned) direction
  const exitGx = farX + exitDirVec.x;
  const exitGy = farY + exitDirVec.y;
  return { gx: exitGx, gy: exitGy, dir: exitDir };
}

/**
 * Create a tile descriptor.
 */
function makeTile(type, gx, gy, dir, cells, exitGx, exitGy, exitDir, sign, size) {
  return { type, gx, gy, dir, cells, exitGx, exitGy, exitDir, sign, size };
}

function makeStraight(gx, gy, dir) {
  const fwd = DIR_VEC[dir];
  return makeTile(
    'straight', gx, gy, dir,
    [{ x: gx, y: gy }],
    gx + fwd.x, gy + fwd.y, dir,
    0, 1
  );
}

function makeCurve(type, gx, gy, dir, sign, size) {
  const cells = curveCells(gx, gy, dir, sign, size);
  const exit = curveExit(gx, gy, dir, sign, size);
  return makeTile(type, gx, gy, dir, cells, exit.gx, exit.gy, exit.dir, sign, size);
}

// --- Track generation ---

export function generateTrack(seed) {
  // Tile type definitions with weights
  const tileTypes = [
    { type: 'straight', weight: 35, size: 1 },
    { type: 'tight', weight: 15, size: 1 },
    { type: 'medium', weight: 25, size: 2 },
    { type: 'gentle', weight: 25, size: 3 },
  ];
  const totalWeight = tileTypes.reduce((s, t) => s + t.weight, 0);

  // Retry with different sub-seeds if track gets stuck
  for (let attempt = 0; attempt < 20; attempt++) {
    const rng = mulberry32(seed + attempt * 997);
    const occupied = new Set();
    const tiles = [];

    function cellKey(x, y) {
      return `${x},${y}`;
    }

    function isOccupied(x, y) {
      return occupied.has(cellKey(x, y));
    }

    function markCells(cells) {
      for (const c of cells) {
        occupied.add(cellKey(c.x, c.y));
      }
    }

    function canPlace(cells, exitGx, exitGy) {
      for (const c of cells) {
        if (isOccupied(c.x, c.y)) return false;
      }
      // Also check exit cell isn't occupied (avoid dead ends)
      if (isOccupied(exitGx, exitGy)) return false;
      return true;
    }

    // Place grid tile at origin heading South
    const gridTile = makeStraight(0, 0, DIR_S);
    gridTile.type = 'grid';
    tiles.push(gridTile);
    markCells(gridTile.cells);

    // Place start/finish tile
    let cx = gridTile.exitGx;
    let cy = gridTile.exitGy;
    let cdir = gridTile.exitDir;

    const startTile = makeStraight(cx, cy, cdir);
    startTile.type = 'start';
    tiles.push(startTile);
    markCells(startTile.cells);
    cx = startTile.exitGx;
    cy = startTile.exitGy;
    cdir = startTile.exitDir;

    let consecutiveStraights = 0;
    const maxIter = 500;
    let iter = 0;

    // Generate random tiles
    while (tiles.length < MAX_TRACK_TILES && iter < maxIter) {
      iter++;

      // Pick a random tile type
      let r = rng() * totalWeight;
      let chosen = tileTypes[0];
      for (const tt of tileTypes) {
        r -= tt.weight;
        if (r <= 0) { chosen = tt; break; }
      }

      // Enforce max 4 consecutive straights
      if (chosen.type === 'straight' && consecutiveStraights >= 4) {
        continue;
      }

      // Try to place the tile
      let tile = null;
      if (chosen.type === 'straight') {
        const t = makeStraight(cx, cy, cdir);
        if (canPlace(t.cells, t.exitGx, t.exitGy)) {
          tile = t;
        }
      } else {
        // Curve tile - try both turn directions
        const sign = rng() < 0.5 ? 1 : -1;
        const t1 = makeCurve(chosen.type, cx, cy, cdir, sign, chosen.size);
        if (canPlace(t1.cells, t1.exitGx, t1.exitGy)) {
          tile = t1;
        } else {
          const t2 = makeCurve(chosen.type, cx, cy, cdir, -sign, chosen.size);
          if (canPlace(t2.cells, t2.exitGx, t2.exitGy)) {
            tile = t2;
          }
        }
      }

      if (!tile) continue;

      tiles.push(tile);
      markCells(tile.cells);
      cx = tile.exitGx;
      cy = tile.exitGy;
      cdir = tile.exitDir;

      if (tile.type === 'straight') {
        consecutiveStraights++;
      } else {
        consecutiveStraights = 0;
      }

      // Check if we've reached minimum length - can stop
      if (tiles.length >= MIN_TRACK_TILES) {
        break;
      }
    }

    // If we didn't reach a reasonable length, retry with different sub-seed
    if (tiles.length < MIN_TRACK_TILES / 2) {
      continue;
    }

    // Place finish tile
    const finishTile = makeStraight(cx, cy, cdir);
    finishTile.type = 'finish';
    tiles.push(finishTile);
    markCells(finishTile.cells);

    // Compute grid bounds
    let minGx = Infinity, minGy = Infinity;
    let maxGx = -Infinity, maxGy = -Infinity;
    for (const tile of tiles) {
      for (const c of tile.cells) {
        if (c.x < minGx) minGx = c.x;
        if (c.y < minGy) minGy = c.y;
        if (c.x > maxGx) maxGx = c.x;
        if (c.y > maxGy) maxGy = c.y;
      }
    }

    return {
      seed,
      tiles,
      minGx,
      minGy,
      gridWidth: maxGx - minGx + 1,
      gridHeight: maxGy - minGy + 1,
    };
  }

  // Fallback: should not normally reach here
  throw new Error(`Failed to generate track for seed ${seed}`);
}

// --- Center-line path ---

export function buildTrackPath(track) {
  const points = [];
  const T = TILE;

  for (const tile of track.tiles) {
    const { gx, gy, dir, type, sign, size } = tile;

    if (type === 'straight' || type === 'grid' || type === 'start' || type === 'finish') {
      // Straight: entry center and exit center
      const fwd = DIR_VEC[dir];
      const entryX = (gx + 0.5) * T - fwd.x * T * 0.5;
      const entryY = (gy + 0.5) * T - fwd.y * T * 0.5;
      const exitX = (gx + 0.5) * T + fwd.x * T * 0.5;
      const exitY = (gy + 0.5) * T + fwd.y * T * 0.5;

      // Only add entry point for first tile to avoid duplicates
      if (points.length === 0) {
        points.push({ x: entryX, y: entryY });
      }
      points.push({ x: exitX, y: exitY });
    } else {
      // Curve tile: generate arc points
      const fwd = DIR_VEC[dir];
      const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
      const R = (size - 0.5) * T;

      // Entry point: center of entry edge of entry cell
      const entryX = (gx + 0.5) * T - fwd.x * T * 0.5;
      const entryY = (gy + 0.5) * T - fwd.y * T * 0.5;

      // Arc center: offset from entry point by R in the lateral (inside) direction
      const acx = entryX + lat.x * R;
      const acy = entryY + lat.y * R;

      // Start angle: from arc center toward entry point
      const startAngle = Math.atan2(entryY - acy, entryX - acx);

      // Sweep is always 90 degrees
      // sign=+1 (left turn): CW in screen coords = negative angular sweep
      // sign=-1 (right turn): CCW in screen coords = positive angular sweep
      const sweep = sign === 1 ? -Math.PI / 2 : Math.PI / 2;

      const segs = WALL_SEGMENTS_PER_CURVE;
      for (let i = 0; i <= segs; i++) {
        // Skip the first point if we already have points, to avoid duplicates
        if (i === 0 && points.length > 0) continue;
        const t = i / segs;
        const angle = startAngle + sweep * t;
        points.push({
          x: acx + R * Math.cos(angle),
          y: acy + R * Math.sin(angle),
        });
      }
    }
  }

  return points;
}

// --- Wall paths ---

export function buildWallPaths(centerLine) {
  const halfWidth = TILE / 2;
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

    // Normalize tangent
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len > 0) {
      tx /= len;
      ty /= len;
    }

    // Perpendicular: left of forward direction
    // In screen coords (Y down), left of (tx,ty) is (-ty, tx)
    const nx = -ty;
    const ny = tx;

    const p = centerLine[i];
    left.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
    right.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
  }

  return { left, right };
}

// --- Wall physics bodies ---

export function createWallBodies(world, walls) {
  const bodies = [];

  function addWallSegments(path) {
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i];
      const p1 = path[i + 1];

      // Midpoint becomes body position
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;

      // Edge start/end relative to midpoint
      const start = new Vec2(p0.x - mx, p0.y - my);
      const end = new Vec2(p1.x - mx, p1.y - my);

      const shape = new Edge(start, end);
      const body = new Body({
        shape,
        position: { x: mx, y: my },
        isStatic: true,
        userData: { type: 'wall' },
      });

      world.addBody(body);
      bodies.push(body);
    }
  }

  addWallSegments(walls.left);
  addWallSegments(walls.right);

  return bodies;
}
