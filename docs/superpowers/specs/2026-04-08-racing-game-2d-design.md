# 2D Racing Game — Design Spec

## Overview

Single-player top-down 2D racing game. The player drives a formula car on a randomly generated point-to-point track, racing against the ghost of their best time. Built with HTML5 Canvas and the Physics2D engine, deployed on the GamesPlatform (play.nitzan.games).

## Core Gameplay

- **Single-player time trial** on a randomly generated point-to-point track
- **Auto-acceleration** — car always moves forward, no gas/brake input
- **Steering via mouse drag** — click and drag horizontally; drag delta from start point controls turn amount. Release to go straight.
- **Turning slows the car** — the sharper the turn, the more speed is lost. There is a max speed cap.
- **Wall collisions** — glancing hits bounce the car and lose speed. High-angle impacts crash the car and end the race.
- **Ghost system** — after completing a run, the best time ghost appears on subsequent attempts. Ghost updates when beaten.
- **End of race** — show final time (or "CRASHED"), tap to retry same track. Option to generate a new track.
- **Target race duration** — ~30 seconds for a clean run

## Visual Style

- **Realistic top-down** — asphalt with subtle texture, grass off-track, dashed center line
- **Flat-shaded formula car** — minimalist geometric open-wheel car, no gradients or glow
- **Concrete walls** on both sides with segment lines
- **Red/white curbs** on inside of corners
- **Ghost car** — same shape, blue, drawn at ~30% opacity

## Dimensions

- **Resolution:** 1080x1920 logical pixels, DPR-aware
- **Tile size:** 512px
- **Car width:** 128px, height ~282px (2.2:1 ratio)
- **Track width:** 512px (one tile) = 4 car widths

## Camera

- **Top-down, car-fixed rotation** — the car always points "up" on screen, the world rotates around it
- **Centered on car** — car stays at screen center
- **Visible area** — approximately 2x4 tiles on screen at any time

## Track Generation

### Tile Types

All tiles sit on a 512px grid:

- **Straight** — 1x1 tile, track continues in same direction
- **Tight curve** — 1x1 tile, 90-degree sharp turn
- **Medium curve** — 2x2 tiles, 90-degree turn over a moderate arc
- **Gentle curve** — 3x3 tiles, 90-degree turn over a wide arc

### Special Tiles

- **Grid tile** — starting grid markings (pole position box)
- **Start/Finish tile** — checkered line across the track

### Track Structure

Grid tile → Start/Finish tile → [generated tiles] → Start/Finish tile

### Generation Algorithm

1. Start with Grid + Start/Finish tiles
2. Place tiles on a grid one at a time, choosing randomly from valid next tiles (straight or curve left/right at any tightness)
3. Reject any placement that would overlap existing tiles (no self-intersection)
4. Stop when target length is reached (tuned for ~30 second race)
5. Place final Start/Finish tile

### Track Features

- Walls on both sides of every tile (concrete barriers)
- Red/white curbs on inside of corners
- Asphalt surface with subtle noise texture
- Dashed white center line

## Physics & Car Behavior

Uses the Physics2D engine (ES modules, copied into game directory).

### Fixed Timestep

- Physics runs at **60Hz fixed timestep** (Physics2D's built-in accumulator pattern)
- Rendering capped at **60fps** — skip frames faster than 16.67ms
- Ghost recording at physics tick rate (one entry per tick)

### Car Physics

- **Body** — Rectangle shape in Physics2D, appropriate mass/friction/damping
- **Auto-acceleration** — constant forward force each physics tick, up to max speed
- **Steering** — drag delta rotates the car body. Speed penalty proportional to turn sharpness.
- **No braking** — only way to slow down is turning or hitting walls

### Wall Collisions

- Walls are static bodies (Edge or Rectangle) lining the track
- Physics2D handles collision detection and impulse-based response
- **Glancing hit** — car bounces off, loses speed (handled by physics restitution/friction)
- **High-angle impact** — crash detected by checking collision angle vs wall normal; if above threshold, race ends
- Collision angle checked via `world.onCollision` callback

## Ghost System

- **Recording** — each physics tick, store car position (x, y) and angle. At 60Hz, a 30-second race = 1800 entries.
- **Playback** — on subsequent runs, index into ghost array by tick number. Draw ghost car at that position/angle.
- **Storage** — localStorage, keyed by track seed: `racing-2d:ghost:{seed}` (position/angle array), `racing-2d:best:{seed}` (best time)
- **Update** — ghost data only replaced when current run beats the stored best time
- **Visual** — same flat formula car shape, blue color, ~30% opacity, no physics interaction

## UI & Game Flow

### Screens

1. **Title screen** — "Tap to start", generates a track
2. **Countdown** — 3-2-1-GO before the car starts moving
3. **Racing** — HUD overlay on gameplay
4. **Finish** — final time, delta vs best (green if record, red if slower), "Tap to retry" + "New Track"
5. **Crash** — "CRASHED" overlay, same retry/new track options

### HUD (during race)

- Current time (top center, monospace, dark background pill)
- Best time (below current time, blue text)
- Speed (bottom center, monospace, dark background pill)

### Input

- **Steering** — mouse/touch drag. Click/touch down starts drag, horizontal delta from start point controls turn amount. Release returns to straight.
- **UI interactions** — tap/click for buttons on non-racing screens

## Platform Integration

- **Self-contained** — HTML5 Canvas game, ES modules, no build step or bundler
- **Physics2D** — copied into game directory (platform deploys as zip, no external references)
- **meta.json:**
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
- **localStorage** — namespaced with `racing-2d:` prefix
- **Sandbox compatible** — runs in iframe with `allow-scripts allow-pointer-lock allow-same-origin`
