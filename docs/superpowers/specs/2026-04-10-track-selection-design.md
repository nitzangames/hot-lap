# Track Selection Design

**Date:** 2026-04-10
**Status:** Approved

## Goal

Replace the current "random track every time" model with a fixed set of 20 tracks the player picks from. Each track has its own persisted best lap time and ghost replay. Players pick car first, then track, then race.

## Motivation

Today the game generates a new random seed on every launch (`currentSeed = Date.now()`) and the "Next Track" finish-screen button just generates another random seed. Ghost/best-time data is keyed per seed but effectively orphaned — players never revisit a seed. A fixed 20-track roster makes the game feel like a designed product, gives players something to master, and unlocks future features (leaderboards, shared times).

## Design

### Data model

Twenty fixed seeds live in `js/constants.js` as a static array:

```js
export const TRACK_SEEDS = [
  3536688103, 2190564216, 2404477373, 2891183426,   41266754,
   545496861, 1519839472, 1429483613, 3538153913, 3380586140,
  1357795990, 1156852666, 2730074476, 3217832626, 3885142516,
   139478688, 2870132872, 3744827128,  611838112, 1436850013,
];
```

Tracks are identified by **index (0–19)**, not by seed — the seed is a lookup (`TRACK_SEEDS[index]`). This keeps external references stable (e.g. "Track 07") even if we ever swap a seed out.

Ghost storage is already per-seed (`racing-2d:ghost:${seed}` in `js/ghost.js`), so per-track persistence works automatically as long as we stop wiping it.

### State machine and flow

New state `trackselect` added to `GameState`.

Flow:

```
title → carselect → trackselect → countdown → racing → finished / crashed
                                     ↑            ↓
                                     └────────────┘  (Retry / Next Track / Tracks)
```

- **Title screen:** single "RACE" button → `carselect`. The existing "CAR" button is removed (car select is now always in the flow and redundant from the title).
- **Car select:** "RACE!" button → `trackselect` (previously went to `countdown`).
- **Track select:** tap a tile → set `currentTrackIndex`, `initTrack(TRACK_SEEDS[i])`, `startCountdown()`. A back arrow top-left returns to `carselect`.
- **Finish screen:** three buttons — `Retry` (same track), `Next Track` (`(currentTrackIndex + 1) % 20`, runs `initTrack` then `startCountdown`), `Tracks` (back to `trackselect`). The existing "Menu" button is dropped from this screen; `Tracks` serves that role.
- **Crash screen:** unchanged (`Retry` + `Menu`).
- **Pause menu:** unchanged. "Menu" still resets to title.

### Track select screen (UI)

Rendered by a new `drawTrackSelect(ctx, trackPaths, currentIndex, bestTimes)` in `js/renderer.js`. Returns hit areas for click handling.

Layout on the 1920×1080 canvas:

- Title "CHOOSE TRACK" at the top (~80 px from top)
- 4 columns × 5 rows grid of square tiles, centered
- Tile size ~200 px with 20 px gap
- Back arrow ("← BACK") top-left returning to `carselect`

Each tile contains:

1. **Minimap preview** — the track shape rendered at tile scale. The rendering logic is shared with the in-game `drawMinimap`: a new helper takes a bounds rect and draws the center-line path scaled to fit.
2. **Label** overlay — big "01" … "20" in a corner of the tile (always legible, independent of minimap scale).
3. **Best time** — formatted `MM:SS.CC` below the minimap, or `— : — . — —` if no time yet.
4. **Border** — subtle white stroke; thicker/highlighted on the most recently played track (the current `currentTrackIndex`).

All 20 tiles fit in one screen; no scrolling.

### Minimap caching

Rendering all 20 track geometries every frame is wasteful. On first `trackselect` entry, we lazily generate each track once and cache the computed `centerLine` path in a module-level array:

```js
let cachedTrackPaths = null; // [{ centerLine, bounds }, ... ] or null
```

Best times are read from localStorage by key `racing-2d:ghost:${TRACK_SEEDS[i]}` into a parallel array, refreshed when entering `trackselect` (cheap — 20 reads).

### In-world track label ("Track NN")

The seed alpha HUD in the top-left (`seed: LFEGJAZ  tiles: N`) is kept as-is.

Additionally, the text "Track NN" is painted on the asphalt of the tile immediately after the start/finish line, oriented along the track's forward direction. It's rendered in world space during `drawTrack`, so it follows the rotating camera and reads correctly from the player's perspective at the grid.

Implementation: translate to the tile center, rotate to the tile's forward angle (`dirAngles[tile.dir]` offset for text baseline), draw the text in a muted color. Because the camera rotates with the car so that forward is always up-screen, no extra flip is needed for in-game rendering. On the track select minimap, the same world-space text would render too small to read — which is why tiles carry a separate overlay label (see UI section).

### Cleanup

- Remove the `TEMP: clear old ghost data` line in `initTrack` in `js/main.js` — it currently runs `localStorage.removeItem` on every track load, which prevents best times from persisting.
- Remove the "CAR" button and its hit area from `drawTitleScreen` in `js/renderer.js`.
- The existing "Next Track" logic in `handleClick` that does `initTrack(Date.now())` is replaced with `currentTrackIndex = (currentTrackIndex + 1) % 20; initTrack(TRACK_SEEDS[currentTrackIndex])`.

## File touchpoints

| File | Change |
|---|---|
| `js/constants.js` | Add `TRACK_SEEDS` array (20 integers) |
| `js/game.js` | Add `'trackselect'` to the allowed state values (or rely on string states as today) |
| `js/main.js` | `currentTrackIndex` module var; new `handleTrackSelectClick`; finish-screen three-button handling; remove temp ghost-wipe; wire up new flow transitions |
| `js/renderer.js` | New `drawTrackSelect`; new minimap helper parameterized by bounds; modify `drawFinishScreen` for three buttons; remove "CAR" button from `drawTitleScreen`; paint "Track NN" in `drawTrack` |
| `js/ghost.js` | No changes |

## Non-goals

- Leaderboards / shared times — out of scope.
- Track unlock progression (all 20 are available from the start).
- Editable seed input.
- Scrolling / paging in the track select screen.
- Per-track metadata (difficulty, length) beyond what's derivable from the generator output.

## Open questions

None — all design questions resolved in brainstorming.
