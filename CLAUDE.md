# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Hot Lap** — a top-down 2D formula racing time trial game. Built with HTML5 Canvas and the Physics2D engine. Target platform: GamesPlatform (play.nitzan.games).

## Development

- `node dev-server.js` — starts dev server on port 8082 with error logging to `error.log`
- `node check-errors.js` — runs headless Chrome to check for JS errors
- `node screenshot.js` — takes screenshots of game screens
- No build step or package manager required. ES modules throughout.

## Architecture

Vanilla JS browser game, ES modules, no frameworks.

### Key Files
- `js/main.js` — entry point, game loop, state coordination, all wiring
- `js/track.js` — tile system, track generation (closed loop circuits), center-line/wall/curb geometry, brake markers
- `js/car.js` — car physics (Circle collider, arcade movement model)
- `js/car-styles.js` — 5 car styles (Wide Wings, Swept Aero, Endplate, Layered, Arrow) + hue color system
- `js/renderer.js` — all canvas drawing (track, car, HUD, minimap, steering wheel, overlays)
- `js/effects.js` — screen shake, grass texture, track noise, speed lines, crash flash
- `js/ghost.js` — per-tick recording/playback, localStorage persistence
- `js/game.js` — state machine (title, carselect, countdown, racing, finishing, finished, crashed)
- `js/input.js` — drag-to-steer (mouse/touch)
- `js/camera.js` — car-centered rotating camera
- `js/skidmarks.js` — accumulated tire marks on track
- `js/constants.js` — all tuning values
- `physics2d/` — copied from ../Physics2D, ES module physics engine

### Track System
- Tiles on a 512px grid: straight (1x1), medium curve (2x2), gentle curve (3x3)
- Closed loop generation: free phase → greedy return-home pathfinding
- Seeded PRNG (mulberry32) for deterministic tracks
- Seed displayed as alpha string (e.g. LFEGJAZ)

### Car Physics
- Circle collider (radius = CAR_W/2) — avoids edge collision issues
- Auto-acceleration, drag-to-steer, turn speed penalty
- Wall collision: glancing = speed loss, high-angle = crash
- Zero gravity Physics2D world

### Game Flow
Main Menu → (Choose Car) → Countdown (F1 lights) → Racing → Finish/Crash → Retry/Next Track/Main Menu
