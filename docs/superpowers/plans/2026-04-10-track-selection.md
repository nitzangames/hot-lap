# Track Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the random-track-every-time model with a fixed roster of 20 tracks the player picks from after choosing a car, with per-track persisted best lap + ghost.

**Architecture:** A static `TRACK_SEEDS` array of 20 integers in `constants.js` drives everything. A new `trackselect` state sits between car select and countdown. Tracks are identified by index (0–19); the seed is just a lookup. Ghost storage already keys per seed in `ghost.js` — we just stop wiping it. Track select UI shows a 4×5 minimap grid, computed lazily on first entry and cached.

**Tech Stack:** Vanilla JS ES modules, HTML5 Canvas, no frameworks, no build step. Testing is done via `node check-errors.js` (headless Chrome) and visual inspection via `node screenshot.js` — there is no unit test framework.

**Spec:** `docs/superpowers/specs/2026-04-10-track-selection-design.md`

---

## File Structure

Files to modify:
- `js/constants.js` — add `TRACK_SEEDS` constant
- `js/main.js` — module-level `currentTrackIndex`, lazy `cachedTrackPaths`, track select input handler, finish screen button rewiring, remove temp ghost-wipe, wire flow transitions
- `js/renderer.js` — remove "CHOOSE CAR" button from title; new `drawTrackSelect`; repurpose finish screen "MAIN MENU" → "TRACKS"; paint "Track NN" in `drawTrack`

No new files. `js/game.js` and `js/ghost.js` need no changes.

---

## Task 1: Add TRACK_SEEDS constant

**Files:**
- Modify: `js/constants.js`

- [ ] **Step 1: Add the constant**

Append to `js/constants.js`:

```js
// Fixed roster of 20 track seeds. Order is stable; tracks are identified
// by index (0-19) throughout the app. Seeds chosen randomly once.
export const TRACK_SEEDS = [
  3536688103, 2190564216, 2404477373, 2891183426,   41266754,
   545496861, 1519839472, 1429483613, 3538153913, 3380586140,
  1357795990, 1156852666, 2730074476, 3217832626, 3885142516,
   139478688, 2870132872, 3744827128,  611838112, 1436850013,
];
```

- [ ] **Step 2: Verify game still loads**

Start the dev server in one terminal: `node dev-server.js`
Run: `node check-errors.js`
Expected: `NO ERRORS - Game loaded successfully`

- [ ] **Step 3: Commit**

```bash
git add js/constants.js
git commit -m "feat: add TRACK_SEEDS roster of 20 fixed tracks"
```

---

## Task 2: Remove temp ghost-wipe and initialize on first track

**Files:**
- Modify: `js/main.js` (around line 68 — `currentSeed` init; and around line 88 — temp wipe)

This unblocks per-track best-time persistence (currently best times are wiped on every track load) and switches the initial seed from `Date.now()` to `TRACK_SEEDS[0]` so the game boots on track index 0.

- [ ] **Step 1: Add TRACK_SEEDS to imports and a currentTrackIndex module var**

In `js/main.js`, update the `./constants.js` import at the top:

```js
import { GAME_W, GAME_H, TILE, FIXED_DT, GHOST_ALPHA, TRACK_SEEDS } from './constants.js';
```

Find the block near line 64-70:

```js
let world, track, centerLine, walls, wallBodies, curbs, brakeMarkers;
const screenShake = new ScreenShake();
const tireSmoke = new TireSmoke();
let car, ghost, gameState, skidmarks;
let currentSeed = Date.now();
let currentSeedAlpha = seedToAlpha(currentSeed);
let trackStartAngle = 0;
```

Replace the `currentSeed = Date.now()` line with:

```js
let currentTrackIndex = 0;
let currentSeed = TRACK_SEEDS[currentTrackIndex];
```

The `currentSeedAlpha` and `trackStartAngle` lines stay unchanged.

- [ ] **Step 2: Remove the temp ghost-wipe line**

In `js/main.js`, inside `initTrack`, find:

```js
  // Ghost system for this seed (TEMP: clear old ghost data)
  try { localStorage.removeItem(`racing-2d:ghost:${seed}`); } catch(_) {}
  ghost = new Ghost(seed);
```

Replace with:

```js
  // Ghost system for this seed — persists across sessions
  ghost = new Ghost(seed);
```

- [ ] **Step 3: Verify no errors**

With `node dev-server.js` running:
Run: `node check-errors.js`
Expected: `NO ERRORS - Game loaded successfully`

- [ ] **Step 4: Manually confirm best times persist**

Take a screenshot to confirm the game still loads at the title screen:
Run: `node screenshot.js`
Expected: `Saved: screenshot-title.png` and no errors.

(Manual sanity later: race a lap, refresh page, the same seed should still show a best time in localStorage under key `racing-2d:ghost:3536688103`.)

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "feat: boot on fixed track 0, remove temp ghost wipe"
```

---

## Task 3: Simplify title screen to a single RACE button

**Files:**
- Modify: `js/renderer.js:398-461` (`drawTitleScreen`)
- Modify: `js/main.js` (click handling for title state)

With the new flow (title → carselect → trackselect → race), the "CHOOSE CAR" button on the title is redundant — car select is always in the path. The title becomes a single RACE button that goes to carselect.

- [ ] **Step 1: Update drawTitleScreen**

In `js/renderer.js`, replace the whole `drawTitleScreen` function (starts at line 398) with:

```js
export function drawTitleScreen(ctx, seed, bodyColor, dt) {
  titleAnimTime += (dt || 0.016);
  const cx = GAME_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Animated speed lines in background
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    const seed2 = i * 137.5;
    const x = (Math.sin(seed2) * 0.5 + 0.5) * GAME_W;
    const baseY = ((seed2 * 0.73 + titleAnimTime * 400) % (GAME_H + 200)) - 100;
    const lineLen = 60 + Math.sin(seed2 * 2.1) * 40;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + lineLen);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RACING 2D', cx, GAME_H * 0.36);

  // RACE button
  const raceY = GAME_H * 0.54;
  ctx.fillStyle = bodyColor || '#e63030';
  ctx.beginPath();
  ctx.roundRect(cx - 220, raceY, 440, 120, 20);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('RACE', cx, raceY + 60);

  ctx.fillStyle = '#666';
  ctx.font = '24px sans-serif';
  ctx.fillText('v0.31', cx, GAME_H * 0.92);

  ctx.restore();

  return {
    raceBox: { x: cx - 220, y: raceY, w: 440, h: 120 },
  };
}
```

Note the returned hit area no longer includes `carBox`. Also note: version bump from v0.30 → v0.31 per the "always bump version" memory.

- [ ] **Step 2: Update title click handling in main.js**

In `js/main.js`, find the title-state branch inside `handleClick` (around line 252):

```js
  if (gameState.state === 'title' && titleHitAreas) {
    if (hitTest(x, y, titleHitAreas.raceBox)) {
      gameState.startCountdown();
    } else if (hitTest(x, y, titleHitAreas.carBox)) {
      gameState.state = 'carselect';
    }
  } else if (gameState.state === 'finished' && finishHitAreas) {
```

Replace with:

```js
  if (gameState.state === 'title' && titleHitAreas) {
    if (hitTest(x, y, titleHitAreas.raceBox)) {
      playClick();
      hapticTap();
      gameState.state = 'carselect';
    }
  } else if (gameState.state === 'finished' && finishHitAreas) {
```

The RACE button now goes to `carselect`, not straight to `countdown`.

- [ ] **Step 3: Verify with headless check**

Run: `node check-errors.js`
Expected: `NO ERRORS - Game loaded successfully`

- [ ] **Step 4: Visual check**

Run: `node screenshot.js`
Expected: `Saved: screenshot-title.png` showing a single large RACE button (no "CHOOSE CAR" button below it).

- [ ] **Step 5: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: simplify title to single RACE button -> car select"
```

---

## Task 4: Add trackselect state transition from car select

**Files:**
- Modify: `js/main.js` (`handleCarSelectClick` — GO button branch)

The car select "RACE!" button currently calls `gameState.startCountdown()`. With the new flow it should go to the track select screen instead.

- [ ] **Step 1: Change the car select GO button target**

In `js/main.js`, find `handleCarSelectClick` (around line 284) and the GO button branch:

```js
  // Check GO button
  const go = carSelectHitAreas.goBox;
  if (x >= go.x && x <= go.x + go.w && y >= go.y && y <= go.y + go.h) {
    gameState.startCountdown();
    return;
  }
```

Replace with:

```js
  // Check GO button
  const go = carSelectHitAreas.goBox;
  if (x >= go.x && x <= go.x + go.w && y >= go.y && y <= go.y + go.h) {
    playClick();
    hapticTap();
    gameState.state = 'trackselect';
    return;
  }
```

- [ ] **Step 2: Verify no errors**

Run: `node check-errors.js`
Expected: `NO ERRORS`. (The `trackselect` state has no renderer yet, so if you manually click RACE! the screen will freeze blank — that's expected and fixed in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: car select RACE! button transitions to trackselect"
```

---

## Task 5: Track path caching helpers in main.js

**Files:**
- Modify: `js/main.js` (add module-level cache + builder function)

Before the track select screen can render, we need a cache of all 20 tracks' center-lines and the current best times. Build once on first trackselect entry, refresh best times on each entry (cheap — 20 localStorage reads).

- [ ] **Step 1: Add cache module vars and builder**

In `js/main.js`, after the `trackStartAngle` declaration (around line 70), add:

```js
// Track select cache — built lazily on first entry to 'trackselect' state
let cachedTrackPaths = null; // [{ track, centerLine, startAngle }, ...]
let cachedBestTimes = null;  // [number|null, ...] — parallel to TRACK_SEEDS

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
}

function refreshBestTimes() {
  cachedBestTimes = TRACK_SEEDS.map(seed => {
    try {
      const raw = localStorage.getItem(`racing-2d:ghost:${seed}`);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.time != null) return data.time;
      }
    } catch (_) {}
    return null;
  });
}
```

`generateTrack`, `buildTrackPath`, and `dirAngles` are already imported/defined in this file.

- [ ] **Step 2: Call ensureTrackCache when entering trackselect from car select**

In `js/main.js`, find the car select GO button branch just edited in Task 4:

```js
  const go = carSelectHitAreas.goBox;
  if (x >= go.x && x <= go.x + go.w && y >= go.y && y <= go.y + go.h) {
    playClick();
    hapticTap();
    gameState.state = 'trackselect';
    return;
  }
```

Add the cache-building call:

```js
  const go = carSelectHitAreas.goBox;
  if (x >= go.x && x <= go.x + go.w && y >= go.y && y <= go.y + go.h) {
    playClick();
    hapticTap();
    ensureTrackCache();
    gameState.state = 'trackselect';
    return;
  }
```

- [ ] **Step 3: Verify no errors on load**

Run: `node check-errors.js`
Expected: `NO ERRORS`.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: lazy cache of 20 track paths + best times"
```

---

## Task 6: Implement drawTrackSelect renderer

**Files:**
- Modify: `js/renderer.js` (add new exported function `drawTrackSelect`, plus a small helper)

- [ ] **Step 1: Add drawTrackSelect and drawMinimapIntoRect helper**

In `js/renderer.js`, append at the very bottom of the file (after the last export):

```js
// ── Track selection screen ──────────────────────────────────────────────────

/**
 * Draw a small minimap of a track's center line into a rectangular region.
 * Scales and centers the track to fill the rect with padding.
 */
function drawMinimapIntoRect(ctx, centerLine, startAngle, x, y, w, h) {
  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of centerLine) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = TILE;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const trackW = maxX - minX;
  const trackH = maxY - minY;
  // Account for rotation by using the larger dimension both ways
  const maxDim = Math.max(trackW, trackH);
  const inset = 16;
  const scale = Math.min((w - inset * 2) / maxDim, (h - inset * 2) / maxDim);
  const trackCx = (minX + trackW / 2);
  const trackCy = (minY + trackH / 2);

  ctx.save();
  // Center of the destination rect
  ctx.translate(x + w / 2, y + h / 2);
  // Rotate so start direction points up
  ctx.rotate(-(startAngle || 0));

  const ox = -trackCx * scale;
  const oy = -trackCy * scale;

  // Track path stroke
  ctx.strokeStyle = '#888';
  ctx.lineWidth = Math.max(2, TILE * scale * 0.8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < centerLine.length; i++) {
    const px = centerLine[i].x * scale + ox;
    const py = centerLine[i].y * scale + oy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw the track selection screen.
 * @param {Array<{track, centerLine, startAngle}>} trackPaths - cached paths (length 20)
 * @param {number} currentIndex - currently selected/last-played track index
 * @param {Array<number|null>} bestTimes - best time in ms per track, or null
 * @returns {{ tileBoxes: {x,y,w,h,index}[], backBox: {x,y,w,h} }} hit areas
 */
export function drawTrackSelect(ctx, trackPaths, currentIndex, bestTimes) {
  const cx = GAME_W / 2;

  // Dark overlay
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Back button (top-left)
  const backX = 30, backY = 30, backW = 140, backH = 70;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← BACK', backX + backW / 2, backY + backH / 2);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHOOSE TRACK', cx, 140);

  // Grid: 4 cols x 5 rows
  const cols = 4;
  const rows = 5;
  const gap = 20;
  const tileSize = 230;
  const gridW = cols * tileSize + (cols - 1) * gap;
  const gridLeft = (GAME_W - gridW) / 2;
  const gridTop = 220;

  const tileBoxes = [];

  for (let i = 0; i < trackPaths.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx = gridLeft + col * (tileSize + gap);
    const ty = gridTop + row * (tileSize + gap);

    // Tile background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.roundRect(tx, ty, tileSize, tileSize, 12); ctx.fill();

    // Border (thicker for current)
    if (i === currentIndex) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
    }
    ctx.beginPath(); ctx.roundRect(tx, ty, tileSize, tileSize, 12); ctx.stroke();

    // Minimap (top ~70% of tile)
    const mapH = Math.floor(tileSize * 0.68);
    const path = trackPaths[i];
    drawMinimapIntoRect(ctx, path.centerLine, path.startAngle, tx, ty, tileSize, mapH);

    // Number label (top-left corner)
    const label = String(i + 1).padStart(2, '0');
    ctx.fillStyle = i === currentIndex ? '#fff' : '#ccc';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, tx + 12, ty + 10);

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

    tileBoxes.push({ x: tx, y: ty, w: tileSize, h: tileSize, index: i });
  }

  return {
    tileBoxes,
    backBox: { x: backX, y: backY, w: backW, h: backH },
  };
}
```

Note: `formatTime`, `TILE`, `GAME_W`, `GAME_H` are all already available in this file.

- [ ] **Step 2: Wire the new renderer into main.js render()**

In `js/main.js`, find the overlay-rendering block inside `render()` (around line 552):

```js
  // Overlays
  if (state === 'title') {
    const { bodyColor } = hueToColors(carConfig.hue);
    titleHitAreas = drawTitleScreen(ctx, currentSeedAlpha, bodyColor, 1/60);
  } else if (state === 'carselect') {
    carSelectHitAreas = drawCarSelect(ctx, carConfig.styleIndex, carConfig.hue);
  } else if (state === 'countdown') {
```

Add a new branch for `trackselect` between the `carselect` and `countdown` branches:

```js
  // Overlays
  if (state === 'title') {
    const { bodyColor } = hueToColors(carConfig.hue);
    titleHitAreas = drawTitleScreen(ctx, currentSeedAlpha, bodyColor, 1/60);
  } else if (state === 'carselect') {
    carSelectHitAreas = drawCarSelect(ctx, carConfig.styleIndex, carConfig.hue);
  } else if (state === 'trackselect') {
    trackSelectHitAreas = drawTrackSelect(ctx, cachedTrackPaths, currentTrackIndex, cachedBestTimes);
  } else if (state === 'countdown') {
```

And add `drawTrackSelect` to the renderer import at the top of `main.js`:

```js
import {
  drawTrack, drawCar, drawHUD,
  drawTitleScreen, drawCountdown, drawFinishScreen, drawCrashScreen,
  drawSteeringWheel, drawMinimap, drawCarSelect, drawTrackSelect,
  drawPauseButton, drawPauseMenu,
} from './renderer.js';
```

And add a module-level hit area variable near the other UI state vars (around line 178-184):

```js
let trackSelectHitAreas = null;
```

- [ ] **Step 3: Verify renders without errors**

Run: `node check-errors.js`
Expected: `NO ERRORS`.

- [ ] **Step 4: Visual check**

Run: `node screenshot.js`
Expected: the title → carselect screenshots still work. (The puppeteer script stops at countdown; it won't reach trackselect automatically, but it should not error out.)

- [ ] **Step 5: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: render track select screen with 4x5 minimap grid"
```

---

## Task 7: Track select click handling

**Files:**
- Modify: `js/main.js` (add `handleTrackSelectClick` and wire into `pointerdown`)

The track select screen needs click/tap handling: pick a tile → load that track and start countdown; tap BACK → return to carselect.

- [ ] **Step 1: Add handleTrackSelectClick function**

In `js/main.js`, add a new function right after `handleCarSelectRelease` (around line 325, before the `pointerDownX` declarations):

```js
function handleTrackSelectClick(clientX, clientY) {
  if (!trackSelectHitAreas) return;
  const { x, y } = clientToGame(clientX, clientY);

  // Back button
  if (hitTest(x, y, trackSelectHitAreas.backBox)) {
    playClick();
    hapticTap();
    gameState.state = 'carselect';
    return;
  }

  // Tile tiles
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
}
```

- [ ] **Step 2: Dispatch from handleClick**

Track select uses tap-style input (no drag), so it plugs into `handleClick` which already runs from `pointerup` behind a tap-threshold gate — no changes to the `pointerdown`/`pointerup` listeners needed.

In `js/main.js`, find `handleClick` (around line 200). Locate the title-state branch:

```js
  if (gameState.state === 'title' && titleHitAreas) {
```

Insert a track-select branch just before it:

```js
  // Track select
  if (gameState.state === 'trackselect') {
    handleTrackSelectClick(clientX, clientY);
    return;
  }

  if (gameState.state === 'title' && titleHitAreas) {
```

- [ ] **Step 3: Verify no errors**

Run: `node check-errors.js`
Expected: `NO ERRORS`.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: track select tap handling (tile picks track, back returns)"
```

---

## Task 8: Rewire finish screen to Retry / Next Track / Tracks

**Files:**
- Modify: `js/renderer.js:525-591` (`drawFinishScreen`)
- Modify: `js/main.js` (finished-state branch of `handleClick`)

The current finish screen already has three buttons: Retry, Next Track, Main Menu. We rename the third button from "MAIN MENU" to "TRACKS" and change its behavior to go to trackselect. Next Track changes from `initTrack(Date.now())` to the `(i+1) % 20` roster rotation.

- [ ] **Step 1: Update drawFinishScreen labels**

In `js/renderer.js`, find this line inside `drawFinishScreen` (around line 583):

```js
  ctx.fillText('MAIN MENU', cx, menuY + 33);
```

Replace with:

```js
  ctx.fillText('TRACKS', cx, menuY + 33);
```

The returned `menuBox` hit area name stays the same; only the label changes. (Renaming the property would require touching main.js too; keeping `menuBox` minimizes the diff.)

- [ ] **Step 2: Update the finished-state click branch in main.js**

In `js/main.js`, find the finished-state branch inside `handleClick` (around line 258):

```js
  } else if (gameState.state === 'finished' && finishHitAreas) {
    if (hitTest(x, y, finishHitAreas.retryBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      initTrack(Date.now());
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.menuBox)) {
      ghost.resetRecording();
      spawnCar();
      gameState.reset();
    }
  } else if (gameState.state === 'crashed' && crashHitAreas) {
```

Replace with:

```js
  } else if (gameState.state === 'finished' && finishHitAreas) {
    if (hitTest(x, y, finishHitAreas.retryBox)) {
      playClick();
      hapticTap();
      ghost.resetRecording();
      spawnCar();
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.nextBox)) {
      playClick();
      hapticTap();
      currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
      initTrack(TRACK_SEEDS[currentTrackIndex]);
      gameState.startCountdown();
    } else if (hitTest(x, y, finishHitAreas.menuBox)) {
      playClick();
      hapticTap();
      ensureTrackCache();
      gameState.state = 'trackselect';
    }
  } else if (gameState.state === 'crashed' && crashHitAreas) {
```

Note: the TRACKS branch calls `ensureTrackCache()` to refresh best times (the player may have just set a new record on this track). The freshly-updated localStorage entry is picked up by `refreshBestTimes()`.

- [ ] **Step 3: Verify no errors**

Run: `node check-errors.js`
Expected: `NO ERRORS`.

- [ ] **Step 4: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: finish screen Retry/Next/Tracks with roster rotation"
```

---

## Task 9: Paint "Track NN" on the tile after the start/finish line

**Files:**
- Modify: `js/renderer.js` (`drawTrack` function — after existing drawing, before `drawTrackNoise` hook)
- Modify: `js/main.js` (pass `currentTrackIndex` into `drawTrack` call)

The in-world track identifier. Painted on the asphalt of the tile immediately after the start/finish line, oriented along the track's forward direction. Because the camera rotates with the car so that forward is up-screen, text drawn in world space aligned to the track direction will read right-side-up during a race.

- [ ] **Step 1: Update drawTrack signature to accept trackIndex**

In `js/renderer.js`, find `drawTrack` (around line 32):

```js
export function drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers) {
```

Change to:

```js
export function drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers, trackIndex) {
```

- [ ] **Step 2: Paint the label in drawTrack**

Find the end of `drawTrack` — the function ends just before the next function (`drawCar` or another export; look for the closing brace of `drawTrack`). Add this block just before the closing `}` of `drawTrack`:

```js
  // In-world track label ("Track NN") painted on the tile after start/finish.
  // Tile 0 is grid, tile 1 is start/finish; tile 2 is the first tile of the lap.
  if (typeof trackIndex === 'number' && track.tiles.length >= 3) {
    const labelTile = track.tiles[2];
    const wcx = (labelTile.gx + 0.5) * TILE;
    const wcy = (labelTile.gy + 0.5) * TILE;
    const fwd = DIR_VEC[labelTile.dir];
    // Rotation such that canvas -y (text letter-up direction) points along
    // the fwd vector. Derivation: canvas -y after ctx.rotate(θ) becomes
    // (sin θ, -cos θ) in world space; set equal to fwd → θ = atan2(fwd.x, -fwd.y).
    const textAngle = Math.atan2(fwd.x, -fwd.y);

    ctx.save();
    ctx.translate(wcx, wcy);
    ctx.rotate(textAngle);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = 'bold 90px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelStr = 'TRACK ' + String(trackIndex + 1).padStart(2, '0');
    ctx.fillText(labelStr, 0, 0);
    ctx.restore();
  }
```

Note: `DIR_VEC` is already imported at the top of renderer.js (line 6).

- [ ] **Step 3: Pass currentTrackIndex into drawTrack call**

In `js/main.js`, find the `drawTrack` call inside `render()` (around line 495):

```js
  // Track
  drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers);
```

Change to:

```js
  // Track
  drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers, currentTrackIndex);
```

- [ ] **Step 4: Verify no errors**

Run: `node check-errors.js`
Expected: `NO ERRORS`.

- [ ] **Step 5: Visual check**

Run: `node screenshot.js`
Expected: `screenshot-racing.png` should show the racing view; the "TRACK 01" text should be visible on the asphalt ahead of the grid, reading right-side-up. (Manual inspection — the puppeteer flow ends at the racing screen.)

- [ ] **Step 6: Commit**

```bash
git add js/renderer.js js/main.js
git commit -m "feat: paint TRACK NN label on asphalt after start line"
```

---

## Task 10: End-to-end smoke test

**Files:**
- None modified — verification only.

Manual playthrough confirming the full flow works, the roster is persistent, and best times survive a reload.

- [ ] **Step 1: Headless error check**

Run: `node check-errors.js`
Expected: `NO ERRORS - Game loaded successfully`

- [ ] **Step 2: Screenshots at key stages**

Run: `node screenshot.js`
Expected: `screenshot-title.png` (single RACE button), `screenshot-carselect.png` (unchanged), `screenshot-countdown.png`, `screenshot-racing.png` (with TRACK 01 visible on asphalt).

- [ ] **Step 3: Manual flow check in a browser**

Start dev server if not running: `node dev-server.js`
Open `http://localhost:8082` in a browser.

Verify manually:
1. Title screen shows single RACE button (no "CHOOSE CAR")
2. Tap RACE → car select screen
3. Tap RACE! on car select → track select screen shows 4×5 grid of minimaps
4. All 20 tiles show "01"–"20" labels and "--:--.--" for best time
5. Tap Track 01 → countdown → racing
6. "TRACK 01" visible on asphalt just past the start line
7. Complete a lap → finish screen shows Retry / Next Track / Tracks
8. Tap Next Track → goes to Track 02, countdown, racing, "TRACK 02" label visible
9. Complete Track 02 → finish screen → tap Tracks → track select shows Track 02 with its best time
10. Tap Track 01 → Track 01 shows its previously recorded best time
11. Refresh the page. Open track select. Best times for Tracks 01 and 02 still present.
12. From finish screen on any track, tap Next Track repeatedly to confirm roster wraps 20 → 1.

- [ ] **Step 4: Commit (empty — version tag the verified state)**

No file changes at this step — verification only. Skip commit.

---

## Self-Review Notes

Checked against the spec (`docs/superpowers/specs/2026-04-10-track-selection-design.md`):

- ✅ `TRACK_SEEDS` array — Task 1
- ✅ Remove temp ghost wipe — Task 2
- ✅ New `trackselect` state — Task 4, 5, 6, 7
- ✅ Title screen single RACE → carselect — Task 3
- ✅ Car select → trackselect — Task 4
- ✅ Track select minimap grid (4×5, 230px tiles) — Task 6
- ✅ Back button on track select — Task 6, 7
- ✅ Best times shown on tiles + cached — Tasks 5, 6
- ✅ Current track highlighted — Task 6
- ✅ Finish screen three buttons (Retry / Next / Tracks) — Task 8
- ✅ Next Track wraps roster — Task 8
- ✅ Tracks button → trackselect with refreshed best times — Task 8
- ✅ In-world "TRACK NN" painted on tile after start — Task 9
- ✅ Minimap caching helper — Task 5, 6
- ✅ No changes needed to `js/ghost.js` — confirmed (per-seed storage already works)
