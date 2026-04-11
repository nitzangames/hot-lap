# Leaderboard + Top Ghost Design

**Date:** 2026-04-10
**Status:** Approved (pending user review)

## Goal

Connect Hot Lap to the GamesPlatform leaderboard system so each of the 20 tracks has its own per-track world leaderboard with a downloadable world-record ghost. Players see where they'd rank before racing, see the full leaderboard after finishing, and can race against the world-record ghost alongside their own.

## Motivation

The track-selection feature (shipped 2026-04-10) gives every track a persistent personal best and ghost. The next natural step is social: *"how does my best compare to everyone else's, and can I race their ghost?"* The GamesPlatform team added the supporting infrastructure (top-attachment blob per leaderboard, preview-rank API, expanded PlaySDK) so we can do this end-to-end.

This spec is the first Hot Lap feature to depend on player sign-in state, and the first to push binary game data across the platform API.

## Design

### Boards and metadata

One leaderboard board per track, named `track-01` … `track-20` (matching the in-game tile labels). Boards are independent; a player can be #1 on one and unranked on another.

Every score submission carries this metadata:

```js
{
  name:       <display name — PlaySDK auto-attaches from the player's profile>,
  styleIndex: <0-4, the car style used on this run>,
  hue:        <0-359, the color hue used on this run>,
}
```

~30 bytes of JSON, trivial against the 1024-byte metadata cap. The `styleIndex` and `hue` allow the finish-screen leaderboard panel to render each entry's actual car, and allow the top-ghost playback to show the world record holder's car instead of the current player's.

### Ghost binary codec

The existing `Ghost` class continues to record `[{x, y, angle}, ...]` in memory during a race. Encoding to binary happens **once, on submit** via a new pure module `js/ghost-codec.js`.

**Wire format** (little-endian):

```
Header (6 bytes)
  [0..1]  magic  "HL"                                      (2 bytes)
  [2]     version = 1                                      (uint8)
  [3]     reserved = 0                                     (uint8)
  [4..5]  frameCount                                       (uint16)

First frame (6 bytes) — absolute position
  [0..1]  x       (int16)         world px, signed
  [2..3]  y       (int16)
  [4..5]  angle   (int16)         radians * 10000, covers ±π

Subsequent frames (3 bytes each) — deltas from previous
  [0]  dx     (int8)               per-frame displacement, max ~22 px
  [1]  dy     (int8)
  [2]  dangle (int8)               delta_radians * 500, covers ±0.254 rad
```

**Size.** A 45-second lap is 2700 frames → `6 + 6 + 2699*3 = 8109 bytes` binary → ~10.8 KB base64. The 90-second hard cap yields ~21.6 KB base64, well under the platform's 32 KB attachment limit.

**Clamping.** On encode, any `dx/dy` outside `[-127, 127]` is clamped; same for `dangle` outside the scaled int8 range. The physics engine (`MAX_SPEED = 1350 px/s` → 22.5 px/frame at 60 Hz; `TURN_RATE = 2.5 rad/s` → 0.042 rad/frame) never reaches these limits in normal play, so clamping is defensive only.

**90-second cap.** A lap longer than 90 seconds **is** submitted (the score still counts), but its attachment is not uploaded. The top-ghost feature is best-effort — a 91-second world record would just not have a downloadable ghost.

**Decoding** reverses the process, producing the same `[{x, y, angle}, ...]` frame array the `Ghost` / `TopGhost` classes consume.

### Data flow orchestration

**On entering track select:**

1. `refreshBestTimes()` runs as today (localStorage read for all 20 boards).
2. In parallel, fire two new batches:
   - `leaderboard.fetchPreviewRanks(myBestTimes)` — 20 concurrent `previewRank` calls, one per track (signed-out players included; previewRank is public). Result stored in `cachedPreviewRanks[]`.
   - `leaderboard.fetchTopMetadata()` — 20 concurrent `getLeaderboard(board, 1)` calls. Stores `{metadata, time, hasAttachment}` per track in `cachedTopMetadata[]`.
3. The track-select render uses these arrays when drawing tiles. Before the fetches resolve, tiles render normally without the rank line.

**On tile tap → race start:**

1. `initTrack(seed)` runs as today (sync).
2. If `cachedTopMetadata[trackIndex].hasAttachment === true`, kick off `leaderboard.fetchTopGhost(trackIndex)` in parallel with the 3-second countdown. The download + decode takes <300 ms in practice, well within the countdown window.
3. The decoded frames are stored in `cachedTopGhosts[trackIndex]`. A new `TopGhost` instance is constructed from these frames when the race starts and its tick counter is synchronized with the player's ghost (both start at frame 0 when the countdown ends).

**On lap finish:**

1. `finishDelayTimer` elapses → transition to `finished` state (0.5 s after crossing the line, as today).
2. Two network calls fire in parallel:
   - If the player is signed in AND this run set a new PB AND the lap is ≤ 90 seconds: `leaderboard.submitIfBest(trackIndex, raceTime, ghostFrames, {styleIndex, hue})`. Returns `{rank, total, replaced, blob_stored}` or null on failure.
   - `leaderboard.fetchFinishPanel(trackIndex)` — calls `getLeaderboardAroundMe(board, 3)` to get top 3 + three rows around the player.
3. The finish screen renders immediately with the big time + delta + `NEW RECORD` banner. The leaderboard panel area shows `LOADING LEADERBOARD…` centered until both promises resolve.
4. On success: the panel shape is populated and rendered on the next frame.
5. On failure (either call): panel shows `LEADERBOARD UNAVAILABLE`, dimmed. Rest of screen works normally.

**Post-finish caching side effects:**

- If the submit returned `blob_stored: true`, clear `cachedTopGhosts[trackIndex]` and `cachedTopMetadata[trackIndex]` — the player is now the #1, and the next race should re-fetch fresh data. (Their own recording is in localStorage as always, so the top-ghost toggle during the next race will show *themselves* if we re-fetch quickly, which is fine.)
- `cachedLeaderboardPanel` is discarded when leaving the finish screen.

### Track select tile updates

The 230×230 tile layout adds a rank line below the best time:

```
┌────────────────────┐
│  01                │
│                    │
│   [ minimap ]      │   ← mapH = tileSize * 0.60 (was 0.68)
│                    │
│                    │
│     00:45.67       │   ← best time, gold if set
│     #42 / 892      │   ← NEW: rank preview, grey (or gold if rank==1)
└────────────────────┘
```

**Rank line visibility rules:**

- Shown only when **all** of: the player has a PB for this track AND the `previewRank` call succeeded AND the board has at least one entry.
- Hidden when the player has no PB, when the preview call failed, or when the board is empty.
- When `rank === 1`: text is gold (`#f0c040`), marking the world record. Otherwise grey (`#888`).
- Font: `bold 16px sans-serif`.

**Layout knob:** the minimap region shrinks from `0.68 * tileSize` to `0.60 * tileSize` to free vertical space for the new line. The `01`-`20` corner label stays where it is.

### Finish screen (inline leaderboard panel)

The existing `drawFinishScreen` layout is reworked to fit a leaderboard panel between the big time display and the buttons.

**Vertical budget on the 1920 px canvas:**

| y-range | Element | Notes |
|---|---|---|
| 90–170 | `NEW RECORD!` / `FINISH` banner | `bold 70px` (down from 80) |
| 200–320 | Big time `00:34.82` | `bold 90px monospace` (down from 110) |
| 330–370 | Delta pill `−0.42` | `bold 32px monospace` (down from 64) |
| 400–1380 | **Leaderboard panel (new)** | ~980 px tall |
| 1440–1560 | RETRY button | 120 px tall |
| 1580–1680 | NEXT TRACK button | 100 px tall |
| 1700–1790 | TRACKS button | 90 px tall |

**Leaderboard panel internals** (filled-rounded-rect, 60 px side margins):

1. **Header row:** `TRACK 07 LEADERBOARD` (small grey, left-aligned) + `RANK 42 / 892` (bold white, right-aligned).
2. **Top 3 entries**, one row per entry, ~60 px tall each:
   - Rank number (small, grey)
   - 40×40 car sprite rendered via `drawStyledCar` using the entry's metadata `{styleIndex, hue}`
   - Name (white, left)
   - Time (`bold 20px monospace`, gold for rank 1, else white, right-aligned)
3. Dashed divider.
4. **Nearby section** — from `getLeaderboardAroundMe(board, 1)`:
   - Row for `rank - 1` (if exists)
   - YOU row, filled `rgba(255,255,255,0.12)` background, rank in bold white, time gold if new record
   - Row for `rank + 1` (if exists)
5. **Footer line** — `TOP GHOST AVAILABLE` when `hasAttachment`, else blank. Informational only.

**Signed-out variant (replaces section 4 above):**

Instead of nearby rows, a single full-width call-out card:

```
Your time would rank #42 / 892
Sign in on play.nitzan.games to save your ghost and compete
```

Top 3 entries still render above. Footer line still renders.

**Loading / error states:**

- Loading: `LOADING LEADERBOARD…` centered in the panel frame. No spinner animation.
- Error: `LEADERBOARD UNAVAILABLE` centered, dim. Panel frame stays.

**Crashed screen:** no changes. A crash produces no finish time, so no leaderboard interaction.

### Pause menu ghost toggles

Two new toggles added to `drawPauseMenu`, between the existing Haptics toggle and the Resume button:

```
SFX          [ON]
Haptics      [ON]
Your ghost   [ON]         ← NEW, default ON
Top ghost    [OFF]        ← NEW, default OFF

[ RESUME ]
[ RETRY  ]
[ MENU   ]
```

**Behavior:**

- **Your ghost** — gates rendering of the player's own ghost (from the `Ghost` class + localStorage). Default ON.
- **Top ghost** — gates rendering of the world-record ghost (from the `TopGhost` class). Default OFF. Four sub-states:
  - `[OFF]` — user-disabled.
  - `[ON]` — draws the top ghost using the WR holder's car style/hue from metadata.
  - `(none)` — disabled / greyed. Shown when `hasAttachment === false` for the current track, or when the download failed.
  - `(loading…)` — disabled temporarily. Shown when the download is in flight and the user tried to toggle it on. Auto-flips to `[ON]` when bytes arrive.

**Persistence.** Both toggles save to localStorage under `hotlap:ghost-toggles` as `{your: true, top: false}`. Loaded on page load via a helper in `main.js` mirroring the `hotlap:audio` pattern.

**In-race toggle flip.** Toggles take effect the next render frame after the pause menu is closed. No rewind — if the top ghost is toggled on 10 seconds into a race, it appears at the current race tick, not at frame 0.

**Visual treatment.** Reuses the existing SFX/Haptics toggle-row rendering in `drawPauseMenu`.

### Module layout

**New files:**

- `js/ghost-codec.js` — pure functions. `encodeGhost(frames) → Uint8Array` and `decodeGhost(bytes) → frames[]`. Binary format spec as a comment at the top. No dependencies on game state.

- `js/leaderboard.js` — the only module that talks to `window.PlaySDK`. API:
  - `init()` — sets up SDK-ready state, safe to call repeatedly.
  - `isSignedIn()` — boolean.
  - `submitIfBest(trackIndex, timeMs, frames, metadata)` — handles 90s cap, encodes, calls `PlaySDK.submitScore`. Returns `{rank, total, replaced, blob_stored} | null`.
  - `fetchPreviewRanks(myBestTimes)` — 20 parallel calls. Returns `Promise<({rank,total}|null)[]>`.
  - `fetchTopMetadata()` — 20 parallel `getLeaderboard(board, 1)` calls.
  - `fetchTopGhost(trackIndex)` — lazy download + decode + memoize. Returns `Promise<frames[] | null>`.
  - `fetchFinishPanel(trackIndex)` — shapes `getLeaderboardAroundMe` result for the finish screen.
  - `boardName(trackIndex)` — `"track-01"` … `"track-20"`.
  - All module-level caches (`cachedPreviewRanks`, `cachedTopMetadata`, `cachedTopGhosts`, `cachedTopGhostPending`, `cachedLeaderboardPanel`) live here. `main.js` never touches localStorage or network for leaderboard state.

- `js/top-ghost.js` — `TopGhost` class. Constructed from in-memory frame data. Methods: `getFrame()`, `advancePlayback()`, `resetPlayback()`. Tick counter synchronized with the player's `Ghost` instance (both advance on each physics tick during `racing`/`finishing`).

**Modified files:**

| File | Change |
|---|---|
| `js/main.js` | Imports new modules. Extends `initTrack` to kick off top-ghost fetch. Extends `fixedUpdate` to advance `TopGhost` and handle finish-screen fetch kickoff. Extends `render` to draw top ghost gated on toggle. Wires pause menu toggle click handling. Adds `ghostToggles` module state + load/save helpers. Adds finish-screen fetch state tracking. |
| `js/renderer.js` | `drawTrackSelect` gets the rank line per tile. `drawFinishScreen` gets the leaderboard panel, loading/error states, signed-out call-out card. `drawPauseMenu` gets two new toggle rows. New helper `drawLeaderboardRow(ctx, x, y, w, h, entry, highlighted)` factored out. |
| `js/constants.js` | Add `GHOST_MAX_LAP_SECONDS = 90`, `LEADERBOARD_TOP_COUNT = 3`, `LEADERBOARD_NEARBY_COUNT = 1`. |
| `js/game.js` | No changes. |
| `js/ghost.js` | No changes. Still localStorage-backed per-track. |

**What stays intentionally unchanged:** ghost recording pipeline, localStorage persistence for best times, track selection logic, physics, car styles, pause/resume mechanics, crashed screen.

### Cache invalidation summary

| Trigger | Action |
|---|---|
| Enter `trackselect` | Refresh `cachedPreviewRanks` and `cachedTopMetadata` (20 parallel calls each). `cachedTopGhosts` untouched. |
| Tile tapped on a track without cached top ghost | Lazy fetch into `cachedTopGhosts[i]`. |
| `submitIfBest` returns `blob_stored: true` | Clear `cachedTopGhosts[trackIndex]` and `cachedTopMetadata[trackIndex]`. |
| Leave finish screen | Discard `cachedLeaderboardPanel`. |
| Page reload | Everything cleared (in-memory caches only). |

## Non-goals

- Persistent leaderboard browsing UI (tap an entry to see their profile, etc.).
- Downloading any ghost other than the current #1 on each board.
- Showing multiple ghosts beyond own + top (e.g., top 3 ghosts simultaneously).
- Live leaderboard updates during a race.
- In-game sign-in flow (the platform owns this).
- Decimated or fallback ghost encoding for laps > 90 seconds.
- A "has top ghost" badge on track select tiles.
- Preview rank displayed on the countdown screen or during a race.
- Leaderboard interaction on the crashed screen.
- Retrying failed submissions automatically.
- Deduplicating own-ghost vs top-ghost rendering when the player is the current #1 (both toggles on will render two ghosts on the same path, which is harmless and visually subtle).

## Open questions

None — all design questions resolved during brainstorming.
