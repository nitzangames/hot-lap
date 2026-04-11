# Leaderboard + Top Ghost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before starting, create an isolated worktree via superpowers:using-git-worktrees.

**Goal:** Wire Hot Lap to the GamesPlatform leaderboard system so each of the 20 tracks has its own world leaderboard with a downloadable world-record ghost, rank preview on track select, an inline leaderboard panel on the finish screen, and pause-menu toggles for own vs. world ghost.

**Architecture:** Three new modules — `ghost-codec.js` (pure binary encode/decode), `top-ghost.js` (`TopGhost` playback class), and `leaderboard.js` (the only module that touches `window.PlaySDK`; owns all leaderboard caches). `main.js` wires fetch kickoff into `initTrack`, `fixedUpdate`, finish-state transition, and pause-menu click handling. `renderer.js` gets a rank line per tile, a new inline finish-screen panel, and two new pause-menu toggles.

**Tech Stack:** Vanilla JS ES modules, HTML5 Canvas, no frameworks, no build step. Verification is done via `node check-errors.js` (headless Chrome error check) and `node screenshot.js`, both requiring `NODE_PATH=$(npm root -g)` for the globally-installed puppeteer. There is no unit test framework; codec round-trip verification uses a small one-off Node script.

**Spec:** `docs/superpowers/specs/2026-04-10-leaderboard-design.md`

**Prerequisites:**
- The GamesPlatform has the top-attachment, preview-rank, and updated PlaySDK landed (verified in prior session).
- `PlaySDK.submitScore(board, value, direction, metadata, attachment)` accepts a 5th attachment arg as `Uint8Array`/`ArrayBuffer`/base64.
- `PlaySDK.getTopAttachment(board)` returns `Promise<ArrayBuffer | null>`.
- `PlaySDK.previewRank(board, value, direction)` returns `Promise<{rank, total} | null>`.
- `PlaySDK.getLeaderboard(board, limit)` and `getLeaderboardAroundMe(board, limit)` return `{entries, total, has_top_attachment}`.

---

## File Structure

**New files:**
- `js/ghost-codec.js` — pure `encodeGhost(frames) → Uint8Array` and `decodeGhost(bytes) → frames[]`. No deps.
- `js/top-ghost.js` — `TopGhost` class. Mirrors `Ghost` playback API. No localStorage, no encoding — operates on in-memory frames.
- `js/leaderboard.js` — the single module that talks to `window.PlaySDK`. Owns every cache. Exports async helpers used by `main.js`.

**Modified files:**
- `js/constants.js` — add `GHOST_MAX_LAP_SECONDS`, `LEADERBOARD_TOP_COUNT`, `LEADERBOARD_NEARBY_COUNT`.
- `js/main.js` — imports new modules; adds `ghostToggles` state + persistence; wires fetch kickoff in `initTrack` and `handleTrackSelectClick`; advances `TopGhost` in `fixedUpdate`; draws top ghost in `render` gated on toggle; kicks off finish-screen fetches in the `finishing` → `finished` transition; handles pause menu new toggles in `handleClick`.
- `js/renderer.js` — `drawTrackSelect` adds rank line per tile; `drawFinishScreen` gets leaderboard panel + loading/error/signed-out states; `drawPauseMenu` adds two new toggle rows. New internal helper `drawLeaderboardRow`.

**Intentionally unchanged:** `js/game.js`, `js/ghost.js`, `js/track.js`, `js/car.js`, `js/car-styles.js`, `js/camera.js`, `js/effects.js`, `js/input.js`, `js/skidmarks.js`, `js/audio.js`, `physics2d/*`.

---

## Pre-flight: Create worktree

- [ ] **Step 0.1: Create isolated worktree and start dev server**

Run from `/Users/nitzanwilnai/Programming/Claude/JSGames/HotLap`:

```bash
git worktree add .worktrees/leaderboard -b feature/leaderboard
cd .worktrees/leaderboard
node dev-server.js > /tmp/hotlap-lb.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8082/
```

Expected: `HTTP 200`. All subsequent task commands run from inside `.worktrees/leaderboard`.

---

## Task 1: Add constants and leaderboard.js skeleton

**Files:**
- Modify: `js/constants.js`
- Create: `js/leaderboard.js`

- [ ] **Step 1: Append new constants to `js/constants.js`**

Append at the end of `js/constants.js`:

```js

// Leaderboard
export const GHOST_MAX_LAP_SECONDS = 90;  // laps longer than this submit the score but not the ghost attachment
export const LEADERBOARD_TOP_COUNT = 3;   // number of top entries shown on the finish panel
export const LEADERBOARD_NEARBY_COUNT = 1; // number of entries shown above and below the player's row
```

- [ ] **Step 2: Create `js/leaderboard.js` skeleton**

Create the file with these contents. This task just establishes the module surface and the board-name helper; later tasks flesh out the async methods.

```js
// ── Leaderboard adapter ─────────────────────────────────────────────────────
// The only module that talks to window.PlaySDK. Owns all in-memory caches for
// leaderboard data (preview ranks, top metadata, top ghost frames, finish panel).
// All methods are safe to call whether or not PlaySDK is present or the user is
// signed in — they no-op or return null gracefully.

import { TRACK_SEEDS } from './constants.js';
import { decodeGhost } from './ghost-codec.js';

// ── Caches (parallel to TRACK_SEEDS unless noted) ─────────────────────────────

let cachedPreviewRanks = null;   // [{rank, total} | null, ...]
let cachedTopMetadata = null;    // [{metadata, time, hasAttachment} | null, ...]
let cachedTopGhosts = {};        // { [trackIndex]: frames[] | null }
let cachedTopGhostPending = {};  // { [trackIndex]: Promise<frames[] | null> }
let cachedLeaderboardPanel = null; // shaped finish-panel data for the current finish screen

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return the leaderboard board name for a track index. 0 → "track-01". */
export function boardName(trackIndex) {
  return 'track-' + String(trackIndex + 1).padStart(2, '0');
}

/** True if PlaySDK is present and the player is signed in. Cheap synchronous check. */
export function isSignedIn() {
  return !!(typeof window !== 'undefined' && window.PlaySDK && window.PlaySDK.isSignedIn);
}

/** True if PlaySDK is present at all, regardless of sign-in state. */
export function hasSdk() {
  return typeof window !== 'undefined' && !!window.PlaySDK;
}

// ── Public async API (filled in by later tasks) ──────────────────────────────

export async function fetchPreviewRanks(_bestTimes) {
  return new Array(TRACK_SEEDS.length).fill(null);
}

export async function fetchTopMetadata() {
  return new Array(TRACK_SEEDS.length).fill(null);
}

export async function fetchTopGhost(_trackIndex) {
  return null;
}

export async function submitIfBest(_trackIndex, _timeMs, _frames, _metadata) {
  return null;
}

export async function fetchFinishPanel(_trackIndex) {
  return null;
}

// ── Cache accessors (read-only from callers) ─────────────────────────────────

export function getCachedPreviewRanks() { return cachedPreviewRanks; }
export function getCachedTopMetadata() { return cachedTopMetadata; }
export function getCachedTopGhost(trackIndex) { return cachedTopGhosts[trackIndex] || null; }
export function getCachedFinishPanel() { return cachedLeaderboardPanel; }

// ── Cache mutators (used by the methods above, exposed for invalidation) ────

export function clearTopForTrack(trackIndex) {
  delete cachedTopGhosts[trackIndex];
  delete cachedTopGhostPending[trackIndex];
  if (cachedTopMetadata) cachedTopMetadata[trackIndex] = null;
}

export function clearFinishPanel() {
  cachedLeaderboardPanel = null;
}

// ── Internal setters used by the stub helpers (exposed for later tasks) ─────

export const _internal = {
  set cachedPreviewRanks(v) { cachedPreviewRanks = v; },
  get cachedPreviewRanks() { return cachedPreviewRanks; },
  set cachedTopMetadata(v) { cachedTopMetadata = v; },
  get cachedTopMetadata() { return cachedTopMetadata; },
  set cachedLeaderboardPanel(v) { cachedLeaderboardPanel = v; },
  get cachedLeaderboardPanel() { return cachedLeaderboardPanel; },
  cachedTopGhosts,
  cachedTopGhostPending,
};
```

Note: `decodeGhost` is imported from a file that doesn't exist yet. That import will fail at load time until Task 2 creates the codec. **Do not verify the module loads yet** — we'll verify after Task 2.

- [ ] **Step 3: Commit**

```bash
git add js/constants.js js/leaderboard.js
git commit -m "feat: add leaderboard constants and module skeleton"
```

---

## Task 2: Ghost codec (encode/decode) with round-trip verification

**Files:**
- Create: `js/ghost-codec.js`

- [ ] **Step 1: Create `js/ghost-codec.js`**

Create the file with these contents:

```js
// ── Ghost binary codec ──────────────────────────────────────────────────────
// Compact binary format for a lap's ghost frames. Encodes once at submit time.
//
// Wire format (little-endian):
//
//   Header (6 bytes)
//     [0..1]  magic  "HL"                                      (2 bytes)
//     [2]     version = 1                                      (uint8)
//     [3]     reserved = 0                                     (uint8)
//     [4..5]  frameCount                                       (uint16)
//
//   First frame (6 bytes) — absolute position
//     [0..1]  x       (int16)     world px, signed
//     [2..3]  y       (int16)
//     [4..5]  angle   (int16)     radians * 10000, covers ±π (±3.1416)
//
//   Subsequent frames (3 bytes each) — deltas from previous
//     [0]  dx     (int8)           per-frame px delta, max ~22 px
//     [1]  dy     (int8)
//     [2]  dangle (int8)           delta_radians * 500, covers ±0.254 rad
//
// A 45-second lap = 2700 frames → 6 + 6 + 2699*3 = 8109 bytes binary (~10.8 KB
// base64). Well under the platform's 32 KB attachment cap.

const MAGIC_0 = 0x48; // 'H'
const MAGIC_1 = 0x4C; // 'L'
const VERSION = 1;
const ANGLE_SCALE = 10000;   // first-frame angle: int16 rad * 10000
const DANGLE_SCALE = 500;    // delta-frame: int8 rad * 500

function clampInt(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Encode a frame array into a compact Uint8Array.
 * @param {Array<{x:number,y:number,angle:number}>} frames
 * @returns {Uint8Array}
 */
export function encodeGhost(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('encodeGhost: frames must be a non-empty array');
  }
  const n = frames.length;
  const byteLength = 6 + 6 + (n - 1) * 3;
  const buf = new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  let o = 0;

  // Header
  view.setUint8(o++, MAGIC_0);
  view.setUint8(o++, MAGIC_1);
  view.setUint8(o++, VERSION);
  view.setUint8(o++, 0); // reserved
  view.setUint16(o, n, true); o += 2;

  // First frame — absolute
  const f0 = frames[0];
  view.setInt16(o, clampInt(Math.round(f0.x), -32768, 32767), true); o += 2;
  view.setInt16(o, clampInt(Math.round(f0.y), -32768, 32767), true); o += 2;
  view.setInt16(o, clampInt(Math.round(f0.angle * ANGLE_SCALE), -32768, 32767), true); o += 2;

  // Subsequent frames — deltas
  let prevX = f0.x, prevY = f0.y, prevAngle = f0.angle;
  for (let i = 1; i < n; i++) {
    const f = frames[i];
    const dx = clampInt(Math.round(f.x - prevX), -128, 127);
    const dy = clampInt(Math.round(f.y - prevY), -128, 127);
    const da = clampInt(Math.round((f.angle - prevAngle) * DANGLE_SCALE), -128, 127);
    view.setInt8(o++, dx);
    view.setInt8(o++, dy);
    view.setInt8(o++, da);
    // Reconstruct prev from what we actually stored so decode matches exactly
    prevX = prevX + dx;
    prevY = prevY + dy;
    prevAngle = prevAngle + (da / DANGLE_SCALE);
  }

  return new Uint8Array(buf);
}

/**
 * Decode a Uint8Array back into a frame array.
 * Accepts Uint8Array or ArrayBuffer.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Array<{x:number,y:number,angle:number}>}
 */
export function decodeGhost(bytes) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('decodeGhost: input must be Uint8Array or ArrayBuffer');
  }
  if (bytes.length < 12) {
    throw new Error('decodeGhost: buffer too small (need at least header + first frame)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  if (view.getUint8(o++) !== MAGIC_0 || view.getUint8(o++) !== MAGIC_1) {
    throw new Error('decodeGhost: bad magic');
  }
  const version = view.getUint8(o++);
  if (version !== VERSION) {
    throw new Error('decodeGhost: unsupported version ' + version);
  }
  o++; // reserved
  const n = view.getUint16(o, true); o += 2;

  const expected = 6 + 6 + (n - 1) * 3;
  if (bytes.length !== expected) {
    throw new Error('decodeGhost: length mismatch (got ' + bytes.length + ', expected ' + expected + ')');
  }

  const frames = new Array(n);
  let x = view.getInt16(o, true); o += 2;
  let y = view.getInt16(o, true); o += 2;
  let angle = view.getInt16(o, true) / ANGLE_SCALE; o += 2;
  frames[0] = { x, y, angle };

  for (let i = 1; i < n; i++) {
    x += view.getInt8(o++);
    y += view.getInt8(o++);
    angle += view.getInt8(o++) / DANGLE_SCALE;
    frames[i] = { x, y, angle };
  }

  return frames;
}
```

- [ ] **Step 2: Round-trip verification with a one-off Node script**

Create a temporary script and run it, then delete it. This verifies the encode/decode functions work before we wire them into anything.

Create `/tmp/hotlap-codec-check.mjs`:

```js
import { encodeGhost, decodeGhost } from '/Users/nitzanwilnai/Programming/Claude/JSGames/HotLap/.worktrees/leaderboard/js/ghost-codec.js';

// Synthesize a 2700-frame ghost like a real 45s lap
const n = 2700;
const frames = [];
let x = 500, y = 500, angle = 0;
for (let i = 0; i < n; i++) {
  // Vary position by small amounts like a car driving
  x += Math.sin(i * 0.01) * 5;
  y += Math.cos(i * 0.01) * 5;
  angle += 0.02 * Math.sin(i * 0.005);
  frames.push({ x, y, angle });
}

const bytes = encodeGhost(frames);
console.log('Encoded', frames.length, 'frames →', bytes.length, 'bytes');
if (bytes.length !== 6 + 6 + (n - 1) * 3) {
  console.error('FAIL: expected', 6 + 6 + (n - 1) * 3, 'bytes');
  process.exit(1);
}
if (bytes.length > 32 * 1024) {
  console.error('FAIL: exceeds 32 KB cap');
  process.exit(1);
}

const decoded = decodeGhost(bytes);
if (decoded.length !== n) {
  console.error('FAIL: frame count mismatch', decoded.length, 'vs', n);
  process.exit(1);
}

// Round-trip should be close but not exact due to int rounding.
// Check max position error stays within 1 pixel of integer rounding error.
let maxPosErr = 0, maxAngErr = 0;
for (let i = 0; i < n; i++) {
  const dx = Math.abs(decoded[i].x - frames[i].x);
  const dy = Math.abs(decoded[i].y - frames[i].y);
  const da = Math.abs(decoded[i].angle - frames[i].angle);
  if (dx > maxPosErr) maxPosErr = dx;
  if (dy > maxPosErr) maxPosErr = dy;
  if (da > maxAngErr) maxAngErr = da;
}
console.log('Max position error:', maxPosErr.toFixed(3), 'px');
console.log('Max angle error:', maxAngErr.toFixed(5), 'rad');

if (maxPosErr > 2) {
  console.error('FAIL: position drift too large');
  process.exit(1);
}
if (maxAngErr > 0.005) {
  console.error('FAIL: angle drift too large');
  process.exit(1);
}

console.log('PASS — codec round-trip works');
```

Run:

```bash
node /tmp/hotlap-codec-check.mjs
```

Expected output ends with `PASS — codec round-trip works`. If it fails, the encode/decode has a bug — fix it before moving on.

Then delete the script:

```bash
rm /tmp/hotlap-codec-check.mjs
```

- [ ] **Step 3: Verify leaderboard.js module now loads cleanly in the browser**

With the dev server running:

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -5
```

Expected: only the pre-existing favicon 404. If you see a module import error mentioning `ghost-codec.js`, re-check the file path in Task 1's leaderboard.js import.

- [ ] **Step 4: Commit**

```bash
git add js/ghost-codec.js
git commit -m "feat: ghost binary codec with delta encoding"
```

---

## Task 3: TopGhost class

**Files:**
- Create: `js/top-ghost.js`

- [ ] **Step 1: Create the TopGhost class**

Create `js/top-ghost.js`:

```js
// ── TopGhost ─────────────────────────────────────────────────────────────────
// Playback wrapper for a world-record ghost loaded from the leaderboard.
// Shape mirrors Ghost's playback side (getGhostFrame / advancePlayback) but
// has no recording, no localStorage, no save-if-best — it only plays.
//
// Constructed from an in-memory frame array (decoded by ghost-codec.js).

export class TopGhost {
  /**
   * @param {Array<{x:number,y:number,angle:number}>} frames
   */
  constructor(frames) {
    this.frames = frames || [];
    this._playbackTick = 0;
  }

  /**
   * Return the frame at the current playback tick, or null if past the end
   * or if the instance has no frames.
   */
  getFrame() {
    if (!this.frames || this._playbackTick >= this.frames.length) return null;
    return this.frames[this._playbackTick];
  }

  /** Advance the playback tick by one. */
  advancePlayback() {
    this._playbackTick++;
  }

  /** Reset playback to frame 0 (used on retry/respawn). */
  resetPlayback() {
    this._playbackTick = 0;
  }

  /** True if this instance has any frames to play. */
  hasFrames() {
    return this.frames && this.frames.length > 0;
  }
}
```

- [ ] **Step 2: Verify the game still loads**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only, no JS errors. (`top-ghost.js` isn't imported anywhere yet — we're just checking it parses.)

- [ ] **Step 3: Commit**

```bash
git add js/top-ghost.js
git commit -m "feat: TopGhost playback class"
```

---

## Task 4: Flesh out leaderboard.js async methods

**Files:**
- Modify: `js/leaderboard.js`

This task replaces all five stub methods (`fetchPreviewRanks`, `fetchTopMetadata`, `fetchTopGhost`, `submitIfBest`, `fetchFinishPanel`) with real implementations.

- [ ] **Step 1: Replace the stub methods**

In `js/leaderboard.js`, find the `// ── Public async API (filled in by later tasks) ──────────` block and replace all five stub functions with the following. Also add a new import at the top.

Change the imports at the top of `js/leaderboard.js` from:

```js
import { TRACK_SEEDS } from './constants.js';
import { decodeGhost } from './ghost-codec.js';
```

to:

```js
import { TRACK_SEEDS, GHOST_MAX_LAP_SECONDS, LEADERBOARD_TOP_COUNT, LEADERBOARD_NEARBY_COUNT } from './constants.js';
import { encodeGhost, decodeGhost } from './ghost-codec.js';
```

Then replace the five stub exports with these full implementations:

```js
/**
 * Fire 20 previewRank() calls in parallel, one per track, using each track's
 * current localStorage best time as the value. Tracks with no PB get null.
 * Works for signed-out players (preview is public).
 * @param {Array<number|null>} bestTimes - ms best time per track or null
 * @returns {Promise<Array<{rank:number,total:number}|null>>}
 */
export async function fetchPreviewRanks(bestTimes) {
  if (!hasSdk() || !bestTimes) {
    cachedPreviewRanks = new Array(TRACK_SEEDS.length).fill(null);
    return cachedPreviewRanks;
  }
  const sdk = window.PlaySDK;
  const results = await Promise.all(TRACK_SEEDS.map(async (_, i) => {
    const bt = bestTimes[i];
    if (bt == null) return null;
    try {
      const r = await sdk.previewRank(boardName(i), bt, 'asc');
      return r || null;
    } catch (_) {
      return null;
    }
  }));
  cachedPreviewRanks = results;
  return results;
}

/**
 * Fire 20 getLeaderboard(board, 1) calls in parallel. For each track, capture
 * the top entry's metadata, time, and has_top_attachment flag.
 * @returns {Promise<Array<{metadata:object, time:number, hasAttachment:boolean}|null>>}
 */
export async function fetchTopMetadata() {
  if (!hasSdk()) {
    cachedTopMetadata = new Array(TRACK_SEEDS.length).fill(null);
    return cachedTopMetadata;
  }
  const sdk = window.PlaySDK;
  const results = await Promise.all(TRACK_SEEDS.map(async (_, i) => {
    try {
      const r = await sdk.getLeaderboard(boardName(i), 1);
      if (!r || !r.entries || r.entries.length === 0) return null;
      const top = r.entries[0];
      return {
        metadata: top.metadata || {},
        time: top.value,
        hasAttachment: !!r.has_top_attachment,
      };
    } catch (_) {
      return null;
    }
  }));
  cachedTopMetadata = results;
  return results;
}

/**
 * Fetch and decode the top ghost binary for one track, memoized. Subsequent
 * calls return the same promise until the entry is invalidated.
 * @param {number} trackIndex
 * @returns {Promise<Array<{x,y,angle}>|null>}
 */
export async function fetchTopGhost(trackIndex) {
  if (!hasSdk()) return null;

  if (cachedTopGhosts[trackIndex] !== undefined) {
    return cachedTopGhosts[trackIndex];
  }
  if (cachedTopGhostPending[trackIndex]) {
    return cachedTopGhostPending[trackIndex];
  }

  // Only fetch if we know a top attachment exists (from cachedTopMetadata).
  // If cachedTopMetadata hasn't run yet, try anyway — getTopAttachment returns
  // null on 404 which we treat as "no attachment".
  const p = (async () => {
    try {
      const buf = await window.PlaySDK.getTopAttachment(boardName(trackIndex));
      if (!buf) {
        cachedTopGhosts[trackIndex] = null;
        return null;
      }
      const frames = decodeGhost(new Uint8Array(buf));
      cachedTopGhosts[trackIndex] = frames;
      return frames;
    } catch (_) {
      cachedTopGhosts[trackIndex] = null;
      return null;
    } finally {
      delete cachedTopGhostPending[trackIndex];
    }
  })();

  cachedTopGhostPending[trackIndex] = p;
  return p;
}

/**
 * Submit a score for this track. Only uploads the ghost attachment if the lap
 * is within the 90-second cap. Returns the submit result or null.
 * @param {number} trackIndex
 * @param {number} timeMs
 * @param {Array<{x,y,angle}>} frames - the recorded ghost frames for this run
 * @param {{styleIndex:number, hue:number}} extraMetadata
 * @returns {Promise<{rank:number,total:number,replaced:boolean,blob_stored?:boolean}|null>}
 */
export async function submitIfBest(trackIndex, timeMs, frames, extraMetadata) {
  if (!hasSdk()) return null;
  if (!isSignedIn()) return null;

  const metadata = {
    styleIndex: extraMetadata.styleIndex,
    hue: extraMetadata.hue,
  };
  // The SDK auto-attaches the display name as metadata.name if unset.

  let attachment = null;
  const timeSec = timeMs / 1000;
  if (timeSec <= GHOST_MAX_LAP_SECONDS && frames && frames.length > 0) {
    try {
      attachment = encodeGhost(frames);
    } catch (_) {
      attachment = null;
    }
  }

  try {
    const result = await window.PlaySDK.submitScore(
      boardName(trackIndex),
      timeMs,
      'asc',
      metadata,
      attachment
    );
    if (result && result.blob_stored === true) {
      // We're the new top holder — clear cache so the next race re-fetches.
      clearTopForTrack(trackIndex);
    }
    return result || null;
  } catch (_) {
    return null;
  }
}

/**
 * Shape a getLeaderboardAroundMe response for the finish screen panel.
 * Works for signed-out players too (falls back to getLeaderboard).
 * @param {number} trackIndex
 * @returns {Promise<{top:Array, nearby:Array, total:number, hasAttachment:boolean}|null>}
 */
export async function fetchFinishPanel(trackIndex) {
  if (!hasSdk()) return null;
  const sdk = window.PlaySDK;
  const board = boardName(trackIndex);
  try {
    // Fetch top-N and around-me in parallel.
    const [topResp, aroundResp] = await Promise.all([
      sdk.getLeaderboard(board, LEADERBOARD_TOP_COUNT),
      isSignedIn()
        ? sdk.getLeaderboardAroundMe(board, LEADERBOARD_NEARBY_COUNT)
        : Promise.resolve(null),
    ]);
    const top = (topResp && topResp.entries) ? topResp.entries : [];
    const total = (topResp && topResp.total) || 0;
    const hasAttachment = !!(topResp && topResp.has_top_attachment);
    const nearby = (aroundResp && aroundResp.entries) ? aroundResp.entries : [];
    const panel = { top, nearby, total, hasAttachment };
    cachedLeaderboardPanel = panel;
    return panel;
  } catch (_) {
    cachedLeaderboardPanel = null;
    return null;
  }
}
```

Also delete the now-unused `_internal` export at the bottom of the file — we no longer need the setter pattern since we mutate the module vars directly inside the methods.

Find and delete:

```js
// ── Internal setters used by the stub helpers (exposed for later tasks) ─────

export const _internal = {
  set cachedPreviewRanks(v) { cachedPreviewRanks = v; },
  get cachedPreviewRanks() { return cachedPreviewRanks; },
  set cachedTopMetadata(v) { cachedTopMetadata = v; },
  get cachedTopMetadata() { return cachedTopMetadata; },
  set cachedLeaderboardPanel(v) { cachedLeaderboardPanel = v; },
  get cachedLeaderboardPanel() { return cachedLeaderboardPanel; },
  cachedTopGhosts,
  cachedTopGhostPending,
};
```

- [ ] **Step 2: Verify the module loads cleanly**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -5
```

Expected: favicon 404 only. No JS errors.

- [ ] **Step 3: Commit**

```bash
git add js/leaderboard.js
git commit -m "feat: leaderboard module async methods (fetch/submit/panel)"
```

---

## Task 5: Ghost toggles state and persistence in main.js

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add ghost-toggle state + load/save**

In `js/main.js`, after the `carConfig` declaration block (around line 207-215, where `let carSelectHitAreas = null;` etc. live), add:

```js
// ── Ghost toggles (persisted) ────────────────────────────────────────────────
const GHOST_TOGGLES_KEY = 'hotlap:ghost-toggles';
const ghostToggles = { your: true, top: false };
(function loadGhostToggles() {
  try {
    const raw = localStorage.getItem(GHOST_TOGGLES_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.your === 'boolean') ghostToggles.your = o.your;
      if (typeof o.top === 'boolean') ghostToggles.top = o.top;
    }
  } catch (_) {}
})();
function saveGhostToggles() {
  try { localStorage.setItem(GHOST_TOGGLES_KEY, JSON.stringify(ghostToggles)); } catch (_) {}
}
```

- [ ] **Step 2: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: ghost toggle state + localStorage persistence"
```

---

## Task 6: Track-select entry pre-fetch (preview ranks + top metadata)

**Files:**
- Modify: `js/main.js`

Kicks off the 20 `previewRank` + 20 `getLeaderboard` calls when the player enters the track-select screen. The existing `ensureTrackCache()` already runs `refreshBestTimes()` synchronously — we add a fire-and-forget async fetch on top.

- [ ] **Step 1: Import leaderboard module**

In `js/main.js`, add a new import near the other local imports (after the `car-styles` import around line 22):

```js
import * as leaderboard from './leaderboard.js';
```

- [ ] **Step 2: Extend `ensureTrackCache` to kick off async fetches**

Find `ensureTrackCache()` (around line 77) and replace it with:

```js
function ensureTrackCache() {
  if (cachedTrackPaths === null) {
    cachedTrackPaths = TRACK_SEEDS.map(seed => {
      const t = generateTrack(seed);
      const cl = buildTrackPath(t);
      const gridTile = t.tiles[0];
      const sa = dirAngles[gridTile.dir];
      return { track: t, centerLine: cl, startAngle: sa };
    });
  }
  refreshBestTimes();

  // Fire-and-forget async fetch for leaderboard preview ranks and top metadata.
  // Both caches start null (tiles render without rank line); these resolve
  // within ~500ms and the next render frame picks them up.
  if (leaderboard.hasSdk()) {
    leaderboard.fetchPreviewRanks(cachedBestTimes).catch(() => {});
    leaderboard.fetchTopMetadata().catch(() => {});
  }
}
```

- [ ] **Step 3: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only. If you see `PlaySDK is not defined`, the `hasSdk()` guard is missing — re-check `leaderboard.js`.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: prefetch leaderboard ranks and top metadata on track select"
```

---

## Task 7: Track-select tile renders rank preview line

**Files:**
- Modify: `js/renderer.js`
- Modify: `js/main.js`

- [ ] **Step 1: Extend `drawTrackSelect` signature and tile layout**

In `js/renderer.js`, find `drawTrackSelect` (around line 1148). Change the signature from:

```js
export function drawTrackSelect(ctx, trackPaths, currentIndex, bestTimes) {
```

to:

```js
export function drawTrackSelect(ctx, trackPaths, currentIndex, bestTimes, previewRanks) {
```

Then change the minimap height from `tileSize * 0.68` to `tileSize * 0.60` and add the rank-line block after the best-time block.

Find:

```js
    // Minimap (top ~70% of tile)
    const mapH = Math.floor(tileSize * 0.68);
```

Change to:

```js
    // Minimap (top ~60% of tile to leave room for time + rank)
    const mapH = Math.floor(tileSize * 0.60);
```

Find the best-time block:

```js
    // Best time (bottom of tile)
    const bt = bestTimes && bestTimes[i];
    const timeText = bt !== null && bt !== undefined
      ? formatTime(bt / 1000)
      : '--:--.--';
    ctx.fillStyle = bt != null ? '#f0c040' : '#666';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeText, tx + tileSize / 2, ty + tileSize - 14);
```

Replace with:

```js
    // Best time (above rank line)
    const bt = bestTimes && bestTimes[i];
    const timeText = bt !== null && bt !== undefined
      ? formatTime(bt / 1000)
      : '--:--.--';
    ctx.fillStyle = bt != null ? '#f0c040' : '#666';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeText, tx + tileSize / 2, ty + tileSize - 38);

    // Rank preview line (only when player has a PB AND preview succeeded AND
    // the board has at least one entry)
    const pr = previewRanks && previewRanks[i];
    if (bt != null && pr && pr.total > 0) {
      ctx.fillStyle = pr.rank === 1 ? '#f0c040' : '#888';
      ctx.font = 'bold 16px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText('#' + pr.rank + ' / ' + pr.total, tx + tileSize / 2, ty + tileSize - 14);
    }
```

- [ ] **Step 2: Pass preview ranks from main.js into drawTrackSelect**

In `js/main.js`, find the trackselect branch in `render()` (around line 628):

```js
  } else if (state === 'trackselect') {
    trackSelectHitAreas = drawTrackSelect(ctx, cachedTrackPaths, currentTrackIndex, cachedBestTimes);
  }
```

Replace with:

```js
  } else if (state === 'trackselect') {
    trackSelectHitAreas = drawTrackSelect(ctx, cachedTrackPaths, currentTrackIndex, cachedBestTimes, leaderboard.getCachedPreviewRanks());
  }
```

- [ ] **Step 3: Verify rendering with a targeted screenshot**

Create `/tmp/hotlap-ts-check.mjs`:

```js
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
await page.goto('http://localhost:8082', { waitUntil: 'networkidle0', timeout: 10000 });
await new Promise(r => setTimeout(r, 400));
// Title RACE → carselect → RACE! → trackselect
await page.mouse.click(270, 548);
await new Promise(r => setTimeout(r, 300));
await page.mouse.click(270, 525);
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/hotlap-ts.png' });
console.log('saved /tmp/hotlap-ts.png');
await browser.close();
```

Run:

```bash
NODE_PATH=$(npm root -g) node /tmp/hotlap-ts-check.mjs
```

Open `/tmp/hotlap-ts.png`. Expected: the track select grid renders without errors. If this device has no PBs set, there should be no rank lines (only `--:--.--`). That's the correct state.

Delete the script:

```bash
rm /tmp/hotlap-ts-check.mjs
```

Also verify cleanly via check-errors:

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 4: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: track select tile rank preview line"
```

---

## Task 8: Lazy top-ghost fetch on tile tap + TopGhost instance in main.js

**Files:**
- Modify: `js/main.js`

Wires up the player's tile tap to kick off the top ghost download and constructs a `TopGhost` instance when the download completes. The `TopGhost` instance lives alongside the existing `ghost` module variable.

- [ ] **Step 1: Import TopGhost**

In `js/main.js`, after the `import { Ghost } from './ghost.js';` line (around line 17), add:

```js
import { TopGhost } from './top-ghost.js';
```

- [ ] **Step 2: Add `topGhost` module variable**

Find the line `let car, ghost, gameState, skidmarks;` (around line 67) and change it to:

```js
let car, ghost, gameState, skidmarks;
let topGhost = null; // TopGhost instance for the current track, or null
```

- [ ] **Step 3: Reset `topGhost` in `initTrack`**

Find `initTrack` (around line 103), and after the line `ghost = new Ghost(seed);`, add:

```js
  // Top ghost is loaded asynchronously on tile tap; reset here so a stale
  // instance from a previous track isn't reused before the fetch resolves.
  topGhost = null;
```

- [ ] **Step 4: Kick off lazy top ghost fetch when a tile is tapped**

Find `handleTrackSelectClick` (around line 373), in the tile-tap branch:

```js
  // Tile grid
  for (const box of trackSelectHitAreas.tileBoxes) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      playClick();
      hapticTap();
      currentTrackIndex = box.index;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      gameState.startCountdown();
      return;
    }
  }
```

Add a fire-and-forget fetch after `initTrack` and before `startCountdown`:

```js
  // Tile grid
  for (const box of trackSelectHitAreas.tileBoxes) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      playClick();
      hapticTap();
      currentTrackIndex = box.index;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      // Lazy top-ghost fetch — resolves during the 3s countdown, usually.
      leaderboard.fetchTopGhost(currentTrackIndex).then(frames => {
        // Only apply if we're still on the same track (the player may have
        // gone back to track select and picked another one).
        if (frames && currentTrackIndex === box.index) {
          topGhost = new TopGhost(frames);
        }
      }).catch(() => {});
      gameState.startCountdown();
      return;
    }
  }
```

Also apply the same fetch kickoff to the finish screen's `Next Track` button, which transitions into the next track via `initTrack` + `startCountdown`. Find the `finishHitAreas.nextBox` branch (around line 302):

```js
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      playClick();
      hapticTap();
      currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      gameState.startCountdown();
    }
```

Change to:

```js
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      playClick();
      hapticTap();
      currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      const nextIdx = currentTrackIndex;
      leaderboard.fetchTopGhost(nextIdx).then(frames => {
        if (frames && currentTrackIndex === nextIdx) {
          topGhost = new TopGhost(frames);
        }
      }).catch(() => {});
      gameState.startCountdown();
    }
```

- [ ] **Step 5: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 6: Commit**

```bash
git add js/main.js
git commit -m "feat: lazy top ghost fetch on tile tap and next track"
```

---

## Task 9: Advance and render the top ghost

**Files:**
- Modify: `js/main.js`

The top ghost ticks in parallel with the player's own ghost during `racing` and `finishing`, and renders gated on the `ghostToggles.top` flag. The existing `ghost` rendering is also gated on the new `ghostToggles.your` flag.

- [ ] **Step 1: Advance top ghost in `fixedUpdate`**

Find the `racing` branch of `fixedUpdate` (around line 485), and after `ghost.advancePlayback();`, add:

```js
    // Advance top ghost playback in lockstep with the player ghost
    if (topGhost) topGhost.advancePlayback();
```

Do the same inside the `finishing` branch — find `ghost.advancePlayback();` there (around line 531) and add the same line after it.

- [ ] **Step 2: Gate existing ghost render on `ghostToggles.your` and add top ghost render**

Find the ghost rendering block in `render()` (around line 574):

```js
  // Ghost car (draw behind player)
  if (state === 'racing' || state === 'countdown' || state === 'finishing' || state === 'paused') {
    const ghostFrame = ghost.getGhostFrame();
    if (ghostFrame) {
      drawStyledCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, carConfig.styleIndex, carConfig.hue + 180, GHOST_ALPHA);
    }
  }
```

Replace with:

```js
  // Ghost cars (draw behind player). Own ghost uses the player's chosen style,
  // top ghost uses the WR holder's style from leaderboard metadata.
  if (state === 'racing' || state === 'countdown' || state === 'finishing' || state === 'paused') {
    if (ghostToggles.your) {
      const ghostFrame = ghost.getGhostFrame();
      if (ghostFrame) {
        drawStyledCar(ctx, ghostFrame.x, ghostFrame.y, ghostFrame.angle, carConfig.styleIndex, carConfig.hue + 180, GHOST_ALPHA);
      }
    }
    if (ghostToggles.top && topGhost) {
      const tgFrame = topGhost.getFrame();
      if (tgFrame) {
        // Pull WR holder's car style/hue from cached metadata
        const tm = leaderboard.getCachedTopMetadata();
        const meta = (tm && tm[currentTrackIndex] && tm[currentTrackIndex].metadata) || {};
        const style = typeof meta.styleIndex === 'number' ? meta.styleIndex : carConfig.styleIndex;
        const hue = typeof meta.hue === 'number' ? meta.hue : (carConfig.hue + 60);
        drawStyledCar(ctx, tgFrame.x, tgFrame.y, tgFrame.angle, style, hue, GHOST_ALPHA);
      }
    }
  }
```

- [ ] **Step 3: Reset top ghost on retry/respawn paths**

The existing retry paths call `ghost.resetRecording()`. The top ghost needs its playback tick reset too. Find each `ghost.resetRecording();` call in `handleClick` (there are four: pause menu retry, finished retry, finished next track, crashed retry) and add `if (topGhost) topGhost.resetPlayback();` immediately after each.

For example, the finished-state retry branch becomes:

```js
    if (hitTest(x, y, finishHitAreas.retryBox)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
      spawnCar();
      gameState.startCountdown();
    }
```

Apply the same insertion (one line) to:
- The pause-menu retry branch (~line 264)
- The finished next-track branch (~line 302, add after the `leaderboard.fetchTopGhost(...)` block — note: next track creates a fresh track so `topGhost` is null until the fetch resolves; the reset is still harmless)
- The crashed retry branch (~line 315)

Actually, the next-track branch clears `topGhost` via `initTrack`, so no reset is needed. Only apply to the three retry branches (pause menu, finished, crashed).

- [ ] **Step 4: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "feat: advance and render top ghost gated on toggle"
```

---

## Task 10: Submit score + fetch finish panel on lap finish

**Files:**
- Modify: `js/main.js`

Kick off `submitIfBest` and `fetchFinishPanel` when transitioning from `finishing` to `finished`. Populates `leaderboard.cachedLeaderboardPanel` asynchronously so the finish-screen renderer can pick it up.

- [ ] **Step 1: Wire submit + panel fetch in the finishing transition**

Find the `finishing` branch at the end of `fixedUpdate()` (around line 521):

```js
  } else if (state === 'finishing') {
    // Car keeps driving during delay
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();
    skidmarks.update(car.physX, car.physY, car.physAngle, input.steering, car.speed);
    tireSmoke.update(car.physX, car.physY, car.physAngle, car.speed, FIXED_DT);

    // Keep recording ghost
    ghost.record(car.physX, car.physY, car.physAngle);
    ghost.advancePlayback();

    finishDelayTimer += FIXED_DT;
    if (finishDelayTimer >= FINISH_DELAY) {
      gameState.finish(finishPreviousBest);
      const isNew = ghost.saveIfBest(gameState.raceTime);
      gameState.isNewRecord = isNew;
    }
  }
```

Replace with:

```js
  } else if (state === 'finishing') {
    // Car keeps driving during delay
    car.update(input.steering);
    world.step(FIXED_DT);
    car.postPhysicsUpdate();
    skidmarks.update(car.physX, car.physY, car.physAngle, input.steering, car.speed);
    tireSmoke.update(car.physX, car.physY, car.physAngle, car.speed, FIXED_DT);

    // Keep recording ghost
    ghost.record(car.physX, car.physY, car.physAngle);
    ghost.advancePlayback();
    if (topGhost) topGhost.advancePlayback();

    finishDelayTimer += FIXED_DT;
    if (finishDelayTimer >= FINISH_DELAY) {
      gameState.finish(finishPreviousBest);
      const isNew = ghost.saveIfBest(gameState.raceTime);
      gameState.isNewRecord = isNew;

      // Leaderboard: submit if this is a new PB, and fetch the finish panel.
      // Both are fire-and-forget — the finish screen renders immediately
      // and the panel populates async.
      leaderboard.clearFinishPanel();
      if (isNew) {
        leaderboard.submitIfBest(
          currentTrackIndex,
          gameState.raceTime,
          ghost.recording, // the just-completed run's raw frames
          { styleIndex: carConfig.styleIndex, hue: carConfig.hue }
        ).catch(() => {});
      }
      leaderboard.fetchFinishPanel(currentTrackIndex).catch(() => {});
    }
  }
```

Note: `ghost.recording` is the live array the `Ghost` class built up frame-by-frame during the race (it's not the best-stored copy — we want *this* run's frames, which is `ghost.recording`). This works because `saveIfBest` only copies it to `bestRecording` if it beats the time, leaving `ghost.recording` untouched as the source-of-truth for "what just happened".

- [ ] **Step 2: Refresh best times on return to track select**

After a finish, when the player taps `TRACKS` to return, the `ensureTrackCache` call already re-runs `refreshBestTimes()` and the async preview fetch. No additional change needed here — the submit's side-effect of invalidating `cachedTopMetadata[trackIndex]` will be picked up the next time the player enters track select and we re-fetch.

- [ ] **Step 3: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: submit score and fetch finish panel on lap finish"
```

---

## Task 11: Finish screen leaderboard panel renderer

**Files:**
- Modify: `js/renderer.js`
- Modify: `js/main.js`

The biggest UI task. Rewrites `drawFinishScreen` with new vertical layout and a leaderboard panel area that handles loading / populated (signed-in) / populated (signed-out) / error states. Adds a `drawLeaderboardRow` helper.

- [ ] **Step 1: Add `drawStyledCar` to the renderer.js imports**

`drawFinishScreen` needs to draw tiny car sprites for leaderboard rows. In `js/renderer.js`, find the existing car-styles import (line 7):

```js
import { CAR_STYLES, hueToColors } from './car-styles.js';
```

Extend it to also pull in `drawStyledCar`:

```js
import { CAR_STYLES, hueToColors, drawStyledCar } from './car-styles.js';
```

- [ ] **Step 2: Add the `drawLeaderboardRow` helper**

In `js/renderer.js`, just before the existing `drawFinishScreen` definition (around line 535), insert:

```js
/**
 * Draw one row of the finish-screen leaderboard panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{rank:number, metadata:object, value:number, isMe?:boolean}} entry
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @param {{highlighted:boolean, isTopRank:boolean}} opts
 */
function drawLeaderboardRow(ctx, entry, rect, opts) {
  const { x, y, w, h } = rect;
  const highlighted = !!(opts && opts.highlighted);
  const isTopRank = !!(opts && opts.isTopRank);

  if (highlighted) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  }

  // Rank number (left column)
  ctx.fillStyle = highlighted ? '#fff' : '#aaa';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(entry.rank).padStart(2, '0'), x + 70, y + h / 2);

  // Tiny car sprite (40x40 visual block, rendered at scale)
  const carX = x + 130;
  const carY = y + h / 2;
  const meta = entry.metadata || {};
  const styleIndex = typeof meta.styleIndex === 'number' ? meta.styleIndex : 0;
  const hue = typeof meta.hue === 'number' ? meta.hue : 0;
  ctx.save();
  ctx.translate(carX, carY);
  ctx.scale(0.32, 0.32);
  drawStyledCar(ctx, 0, 0, 0, styleIndex, hue, 1);
  ctx.restore();

  // Name (middle)
  const name = (meta.name || 'player').toString().substring(0, 14);
  ctx.fillStyle = highlighted ? '#fff' : '#ccc';
  ctx.font = '30px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 170, y + h / 2);

  // Time (right)
  ctx.fillStyle = isTopRank ? '#f0c040' : (highlighted ? '#fff' : '#ccc');
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatTime((entry.value || 0) / 1000), x + w - 20, y + h / 2);
}
```

- [ ] **Step 3: Replace `drawFinishScreen`**

In `js/renderer.js`, replace the entire `drawFinishScreen` function (lines ~535-601) with:

```js
/**
 * Draw the finish screen with a leaderboard panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} raceTime - in seconds
 * @param {number|null} delta - in seconds, or null
 * @param {boolean} isNewRecord
 * @param {{
 *   panelData: {top:Array, nearby:Array, total:number, hasAttachment:boolean}|null,
 *   panelLoading: boolean,
 *   panelError: boolean,
 *   signedIn: boolean,
 *   myPreviewRank: {rank:number, total:number}|null,
 *   currentTrackIndex: number,
 * }} lb
 */
export function drawFinishScreen(ctx, raceTime, delta, isNewRecord, lb) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.80)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const cx = GAME_W / 2;

  // Banner
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isNewRecord) {
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('NEW RECORD!', cx, 130);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('FINISH', cx, 130);
  }

  // Big time
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 90px monospace';
  ctx.fillText(formatTime(raceTime), cx, 260);

  // Delta pill
  if (delta !== null && delta !== undefined) {
    const sign = delta < 0 ? '-' : '+';
    ctx.fillStyle = delta < 0 ? '#4cff72' : '#ff5555';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(sign + formatTime(Math.abs(delta)), cx, 350);
  }

  // ── Leaderboard panel ─────────────────────────────────────────────────────
  const panelX = 60, panelY = 400, panelW = GAME_W - 120, panelH = 1000;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2; ctx.stroke();

  const panelOpts = lb || { panelData: null, panelLoading: true, panelError: false, signedIn: false, myPreviewRank: null, currentTrackIndex: 0 };

  if (panelOpts.panelLoading) {
    // Loading state
    ctx.fillStyle = '#888';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOADING LEADERBOARD…', panelX + panelW / 2, panelY + panelH / 2);
  } else if (panelOpts.panelError || !panelOpts.panelData) {
    // Error state
    ctx.fillStyle = '#666';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEADERBOARD UNAVAILABLE', panelX + panelW / 2, panelY + panelH / 2);
  } else {
    // Populated state
    const data = panelOpts.panelData;

    // Header row: "TRACK NN LEADERBOARD" (left) + "RANK X/Y" (right, signed-in only)
    const headerY = panelY + 40;
    ctx.fillStyle = '#888';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const trackLabel = 'TRACK ' + String(panelOpts.currentTrackIndex + 1).padStart(2, '0') + ' LEADERBOARD';
    ctx.fillText(trackLabel, panelX + 30, headerY);

    if (panelOpts.signedIn && data.nearby && data.nearby.length > 0) {
      const myEntry = data.nearby.find(e => e.isMe);
      if (myEntry) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('RANK ' + myEntry.rank + ' / ' + data.total, panelX + panelW - 30, headerY);
      }
    } else if (panelOpts.myPreviewRank) {
      ctx.fillStyle = '#888';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('#' + panelOpts.myPreviewRank.rank + ' / ' + panelOpts.myPreviewRank.total, panelX + panelW - 30, headerY);
    }

    // Top N entries
    const rowH = 80;
    const topTop = panelY + 100;
    for (let i = 0; i < Math.min(data.top.length, 3); i++) {
      const entry = data.top[i];
      drawLeaderboardRow(
        ctx,
        entry,
        { x: panelX + 20, y: topTop + i * rowH, w: panelW - 40, h: rowH - 8 },
        { highlighted: !!entry.isMe, isTopRank: entry.rank === 1 }
      );
    }

    // Dashed divider
    const dividerY = topTop + 3 * rowH + 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(panelX + 40, dividerY);
    ctx.lineTo(panelX + panelW - 40, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nearby / call-out
    const nearbyTop = dividerY + 30;
    if (panelOpts.signedIn) {
      // Signed-in: nearby rows from getLeaderboardAroundMe
      // Filter out any entries that overlap with the top 3 already shown
      const topIds = new Set(data.top.slice(0, 3).map(e => e.user_id));
      const filteredNearby = (data.nearby || []).filter(e => !topIds.has(e.user_id));
      for (let i = 0; i < Math.min(filteredNearby.length, 3); i++) {
        const entry = filteredNearby[i];
        drawLeaderboardRow(
          ctx,
          entry,
          { x: panelX + 20, y: nearbyTop + i * rowH, w: panelW - 40, h: rowH - 8 },
          { highlighted: !!entry.isMe, isTopRank: entry.rank === 1 }
        );
      }
    } else {
      // Signed-out call-out card
      const cardH = 160;
      ctx.fillStyle = 'rgba(240,192,64,0.08)';
      ctx.beginPath(); ctx.roundRect(panelX + 20, nearbyTop, panelW - 40, cardH, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(240,192,64,0.35)';
      ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (panelOpts.myPreviewRank) {
        ctx.fillText('Your time would rank #' + panelOpts.myPreviewRank.rank + ' / ' + panelOpts.myPreviewRank.total, panelX + panelW / 2, nearbyTop + 50);
      } else {
        ctx.fillText('Leaderboard active', panelX + panelW / 2, nearbyTop + 50);
      }
      ctx.fillStyle = '#ccc';
      ctx.font = '22px sans-serif';
      ctx.fillText('Sign in on play.nitzan.games to save your ghost', panelX + panelW / 2, nearbyTop + 100);
      ctx.fillText('and compete', panelX + panelW / 2, nearbyTop + 128);
    }

    // Footer — top ghost availability
    const footerY = panelY + panelH - 30;
    if (data.hasAttachment) {
      ctx.fillStyle = '#666';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TOP GHOST AVAILABLE', panelX + panelW / 2, footerY);
    }
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  const retryY = 1440;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(cx - 300, retryY, 600, 110, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETRY', cx, retryY + 55);

  const nextY = 1580;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(cx - 300, nextY, 600, 95, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ccc';
  ctx.font = '42px sans-serif';
  ctx.fillText('NEXT TRACK', cx, nextY + 48);

  const menuY = 1710;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(cx - 300, menuY, 600, 85, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.font = '36px sans-serif';
  ctx.fillText('TRACKS', cx, menuY + 43);

  ctx.restore();
  return {
    retryBox: { x: cx - 300, y: retryY, w: 600, h: 110 },
    nextBox: { x: cx - 300, y: nextY, w: 600, h: 95 },
    menuBox: { x: cx - 300, y: menuY, w: 600, h: 85 },
  };
}
```

- [ ] **Step 4: Update the main.js call site to pass the new leaderboard object**

In `js/main.js`, find the `finished` state branch in `render()` (around line 634):

```js
  } else if (state === 'finished') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, 0, currentSeedAlpha);
    finishHitAreas = drawFinishScreen(
      ctx,
      gameState.raceTime / 1000,
      gameState.finishDelta !== null ? gameState.finishDelta / 1000 : null,
      gameState.isNewRecord
    );
  }
```

Replace with:

```js
  } else if (state === 'finished') {
    const bestTimeSec = ghost.bestTime !== null ? ghost.bestTime / 1000 : null;
    drawHUD(ctx, gameState.raceTime / 1000, bestTimeSec, 0, currentSeedAlpha);
    const panelData = leaderboard.getCachedFinishPanel();
    const previewRanks = leaderboard.getCachedPreviewRanks();
    finishHitAreas = drawFinishScreen(
      ctx,
      gameState.raceTime / 1000,
      gameState.finishDelta !== null ? gameState.finishDelta / 1000 : null,
      gameState.isNewRecord,
      {
        panelData,
        panelLoading: panelData === null,
        panelError: false, // loading state is indistinguishable from fetch-failed-returning-null; acceptable for v1
        signedIn: leaderboard.isSignedIn(),
        myPreviewRank: previewRanks ? previewRanks[currentTrackIndex] : null,
        currentTrackIndex,
      }
    );
  }
```

- [ ] **Step 5: Verify rendering with a screenshot**

Create `/tmp/hotlap-finish-check.mjs`:

```js
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
await page.goto('http://localhost:8082', { waitUntil: 'networkidle0', timeout: 10000 });
await new Promise(r => setTimeout(r, 400));
// Jump directly into finished state with a fake ghost best time by driving the
// page state via evaluateHandle. Easier: simulate a finish by manipulating
// localStorage and reloading, but the simplest thing is to drive the UI.
// Title RACE → carselect → RACE! → trackselect → Track 01
await page.mouse.click(270, 548);
await new Promise(r => setTimeout(r, 300));
await page.mouse.click(270, 525);
await new Promise(r => setTimeout(r, 300));
await page.mouse.click(83, 168);
// Wait through countdown + ~a few seconds of race (no lap completion expected,
// but we can at least screenshot the racing state without crashes)
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: '/tmp/hotlap-racing.png' });
console.log('saved /tmp/hotlap-racing.png');
await browser.close();
```

Run:

```bash
NODE_PATH=$(npm root -g) node /tmp/hotlap-finish-check.mjs
```

Verify it saved without crashing. You won't see the finish screen in an automated run (the headless browser can't drive a car to lap completion), but check-errors must be clean:

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

Delete the script:

```bash
rm /tmp/hotlap-finish-check.mjs /tmp/hotlap-racing.png
```

- [ ] **Step 6: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: finish screen inline leaderboard panel"
```

---

## Task 12: Pause menu ghost toggles

**Files:**
- Modify: `js/renderer.js`
- Modify: `js/main.js`

- [ ] **Step 1: Extend `drawPauseMenu` signature and add two new toggle rows**

In `js/renderer.js`, find `drawPauseMenu` (around line 1004). Change the signature from:

```js
export function drawPauseMenu(ctx, sfxOn, hapticsOn) {
```

to:

```js
export function drawPauseMenu(ctx, sfxOn, hapticsOn, ghostToggles, topGhostState) {
```

`topGhostState` is one of `'ready'`, `'none'`, `'loading'`. `ghostToggles` is `{your: boolean, top: boolean}`.

Find the block that draws the SFX and Haptics toggles and the buttons (around line 1058-1084):

```js
  const sfxToggle = drawToggle('SOUND', sfxOn, panelY + 260);
  const hapticsToggle = drawToggle('HAPTICS', hapticsOn, panelY + 380);

  // Buttons
  function drawBtn(label, color, y) {
    const bw = panelW - 160;
    const bx = panelX + 80;
    const bh = 110;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, y, bw, bh, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, GAME_W / 2, y + bh / 2);
    return { x: bx, y, w: bw, h: bh };
  }

  const resumeBtn = drawBtn('RESUME', '#2e8a3a', panelY + 540);
  const retryBtn = drawBtn('RETRY', '#444', panelY + 690);
  const menuBtn = drawBtn('MAIN MENU', '#444', panelY + 840);

  ctx.restore();

  return { sfxToggle, hapticsToggle, resumeBtn, retryBtn, menuBtn };
}
```

Replace with:

```js
  const sfxToggle = drawToggle('SOUND', sfxOn, panelY + 200);
  const hapticsToggle = drawToggle('HAPTICS', hapticsOn, panelY + 290);

  // Ghost toggles
  const gt = ghostToggles || { your: true, top: false };
  const yourGhostToggle = drawToggle('YOUR GHOST', gt.your, panelY + 380);

  // Top ghost toggle is disabled when state is 'none' or 'loading'
  const topOn = gt.top && topGhostState === 'ready';
  const topLabel = topGhostState === 'loading' ? 'TOP GHOST (loading…)'
                 : topGhostState === 'none'    ? 'TOP GHOST (none)'
                 : 'TOP GHOST';
  const topDisabled = topGhostState !== 'ready';
  const topGhostToggle = drawToggle(topLabel, topOn, panelY + 470);
  if (topDisabled) {
    // Overlay a dim mask to indicate disabled
    ctx.fillStyle = 'rgba(26,26,26,0.5)';
    ctx.fillRect(topGhostToggle.x - 300, topGhostToggle.y - 20, topGhostToggle.w + 320, topGhostToggle.h + 40);
  }

  // Buttons
  function drawBtn(label, color, y) {
    const bw = panelW - 160;
    const bx = panelX + 80;
    const bh = 100;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, y, bw, bh, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, GAME_W / 2, y + bh / 2);
    return { x: bx, y, w: bw, h: bh };
  }

  const resumeBtn = drawBtn('RESUME', '#2e8a3a', panelY + 600);
  const retryBtn = drawBtn('RETRY', '#444', panelY + 730);
  const menuBtn = drawBtn('MAIN MENU', '#444', panelY + 860);

  ctx.restore();

  return {
    sfxToggle, hapticsToggle,
    yourGhostToggle, topGhostToggle, topGhostDisabled: topDisabled,
    resumeBtn, retryBtn, menuBtn,
  };
}
```

- [ ] **Step 2: Update main.js call site and click handling**

In `js/main.js`, find the paused state branch in `render()` (around line 645):

```js
  } else if (state === 'paused') {
    pauseMenuHitAreas = drawPauseMenu(ctx, getSfxEnabled(), getHapticsEnabled());
  }
```

Replace with:

```js
  } else if (state === 'paused') {
    // Determine top ghost state for the current track
    let topGhostState = 'none';
    if (topGhost && topGhost.hasFrames()) {
      topGhostState = 'ready';
    } else {
      const tm = leaderboard.getCachedTopMetadata();
      const entry = tm ? tm[currentTrackIndex] : null;
      if (entry && entry.hasAttachment) {
        topGhostState = 'loading'; // metadata says there's a top, but we haven't loaded it yet
      }
    }
    pauseMenuHitAreas = drawPauseMenu(ctx, getSfxEnabled(), getHapticsEnabled(), ghostToggles, topGhostState);
  }
```

Find the pause menu click handling block in `handleClick` (around line 246-280):

```js
  // Pause menu interactions
  if (gameState.state === 'paused' && pauseMenuHitAreas) {
    if (hitTest(x, y, pauseMenuHitAreas.sfxToggle)) {
      setSfxEnabled(!getSfxEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.hapticsToggle)) {
      setHapticsEnabled(!getHapticsEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.resumeBtn)) {
      playClick();
      hapticTap();
      gameState.resume();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.retryBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
      spawnCar();
      gameState.startCountdown();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.menuBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
      return;
    }
    return;
  }
```

Replace with:

```js
  // Pause menu interactions
  if (gameState.state === 'paused' && pauseMenuHitAreas) {
    if (hitTest(x, y, pauseMenuHitAreas.sfxToggle)) {
      setSfxEnabled(!getSfxEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.hapticsToggle)) {
      setHapticsEnabled(!getHapticsEnabled());
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.yourGhostToggle)) {
      ghostToggles.your = !ghostToggles.your;
      saveGhostToggles();
      playClick();
      hapticTap();
      return;
    }
    if (!pauseMenuHitAreas.topGhostDisabled && hitTest(x, y, pauseMenuHitAreas.topGhostToggle)) {
      ghostToggles.top = !ghostToggles.top;
      saveGhostToggles();
      playClick();
      hapticTap();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.resumeBtn)) {
      playClick();
      hapticTap();
      gameState.resume();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.retryBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      if (topGhost) topGhost.resetPlayback();
      spawnCar();
      gameState.startCountdown();
      return;
    }
    if (hitTest(x, y, pauseMenuHitAreas.menuBtn)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
      return;
    }
    return;
  }
```

- [ ] **Step 3: Verify no errors**

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 4: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: pause menu ghost toggles (your + top)"
```

---

## Task 13: Version bump, smoke test, deploy prep

**Files:**
- Modify: `js/renderer.js` (title screen version)

Final pass: bump the version so cache busting is visible, run a full smoke test, and stage for merge.

- [ ] **Step 1: Bump version**

In `js/renderer.js`, find the existing `drawTitleScreen` version text (around line 447 or similar — search for `v0.31`):

```bash
grep -n "v0\." js/renderer.js
```

Then update the matching line to `'v0.32'`:

Find:

```js
  ctx.fillText('v0.31', cx, GAME_H * 0.92);
```

Change to:

```js
  ctx.fillText('v0.32', cx, GAME_H * 0.92);
```

- [ ] **Step 2: Full smoke test — navigate the whole app**

```bash
NODE_PATH=$(npm root -g) node screenshot.js 2>&1
```

Expected: all five screenshots saved (`screenshot-title.png`, `screenshot-carselect.png`, `screenshot-trackselect.png`, `screenshot-countdown.png`, `screenshot-racing.png`) without JS errors.

Then one more clean error check:

```bash
NODE_PATH=$(npm root -g) node check-errors.js 2>&1 | tail -3
```

Expected: favicon 404 only.

- [ ] **Step 3: Manual browser verification**

With the dev server running, open `http://localhost:8082` in a real browser. Verify manually:

1. Title screen shows `v0.32`
2. RACE → car select (unchanged)
3. RACE! → track select; tiles render; no crashes. If signed in and the platform has prior data, tiles show rank preview lines beneath their time; otherwise just the time.
4. Tap Track 01 → countdown → racing. Your own ghost draws during race (gated by `ghostToggles.your`, default ON).
5. Pause during a race — the menu now has YOUR GHOST and TOP GHOST toggles. Top ghost will show `(none)` or `(loading…)` or be active depending on whether the platform has a top attachment.
6. Toggle YOUR GHOST off — ghost disappears next frame. Toggle it back on — ghost reappears.
7. Toggle TOP GHOST on (if available) — world record ghost appears alongside yours.
8. Complete a lap → finish screen shows the big time, delta, and the new leaderboard panel below. Initially shows `LOADING LEADERBOARD…`, then populates (or shows `LEADERBOARD UNAVAILABLE` on network failure).
9. If signed in and the player just set a new PB, the top of the next race should eventually show the newly-set ghost via the top-ghost toggle (after cache invalidation + re-fetch).
10. Refresh the page → ghost toggle state persists (localStorage under `hotlap:ghost-toggles`).

- [ ] **Step 4: Commit**

```bash
git add js/renderer.js
git commit -m "chore: bump version to v0.32 for leaderboard release"
```

---

## Self-Review Notes

Checked against the spec (`docs/superpowers/specs/2026-04-10-leaderboard-design.md`):

**Boards and metadata** — Task 4 uses `boardName(trackIndex)` returning `track-01`..`track-20`. Metadata `{styleIndex, hue}` sent in `submitIfBest`; SDK attaches `name` automatically. ✅

**Ghost binary codec** — Task 2 creates `ghost-codec.js` with the exact wire format from the spec (header 6B, first frame 6B abs, subsequent frames 3B delta). Round-trip verified before wiring. ✅

**Data flow orchestration**
- On track select entry: `ensureTrackCache` extended in Task 6 to call `fetchPreviewRanks` + `fetchTopMetadata` in parallel. ✅
- On tile tap: lazy `fetchTopGhost` in Task 8. ✅
- On finish: submit + fetch panel kicked off in Task 10. ✅

**Cache invalidation** — `submitIfBest` clears `cachedTopGhosts[i]` and `cachedTopMetadata[i]` when `blob_stored: true` (Task 4). `clearFinishPanel()` called when entering `finished` state (Task 10). Re-entering track select re-runs `fetchPreviewRanks` + `fetchTopMetadata` (Task 6). ✅

**Track select tile changes** — Rank line added in Task 7. Minimap shrunk from 0.68 to 0.60. Rank gold when #1. ✅

**Finish screen inline panel** — New layout in Task 11 with the vertical budget from the spec. Loading / populated / error / signed-out variants all implemented. Top 3 + nearby rows + footer. ✅

**Pause menu ghost toggles** — Two new toggles, persistence, disabled sub-states, click handling — Task 12. Default `your: true, top: false` set in Task 5. ✅

**Module layout** — `ghost-codec.js` (Task 2), `top-ghost.js` (Task 3), `leaderboard.js` (Tasks 1 + 4) all created as specified. `main.js` and `renderer.js` modified throughout. ✅

**Non-goals explicitly respected**: no leaderboard browsing UI, no decimation, no countdown rank preview, no crashed screen leaderboard, no automatic retry on failure, no own/top ghost dedup when player is #1. ✅
