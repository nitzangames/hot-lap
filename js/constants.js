// Display
export const GAME_W = 1080;
export const GAME_H = 1920;

// Tile grid
export const TILE = 512; // pixels per tile

// Car dimensions
export const CAR_W = 64;
export const CAR_H = 141; // ~2.2:1 ratio

// Car physics
export const MAX_SPEED = 1350;       // px/s at full speed
export const ACCELERATION = 600;     // px/s² forward force
export const TURN_RATE = 2.5;        // rad/s at full steering input
export const TURN_SPEED_PENALTY = 0.35; // speed multiplier at max turn (0-1, lower = more penalty)
export const LINEAR_DAMPING = 0.3;   // natural speed decay
export const CAR_MASS = 1;
export const CAR_RESTITUTION = 0.3;  // wall bounce
export const CAR_FRICTION = 0.5;

// Wall collision
export const CRASH_ANGLE_THRESHOLD = 0.7; // radians (~40°) — above this angle vs wall normal = crash
export const WALL_SPEED_LOSS = 0.4;       // speed multiplier on glancing wall hit

// Track generation
export const MIN_TRACK_TILES = 28;
export const MAX_TRACK_TILES = 34;
export const WALL_THICKNESS = 8;     // visual wall thickness in px
export const WALL_SEGMENTS_PER_CURVE = 8; // edge segments to approximate curve arcs

// Ghost
export const GHOST_ALPHA = 0.3;

// Timing
export const FIXED_DT = 1 / 60;
export const COUNTDOWN_SECONDS = 3;

// Fixed roster of 20 track seeds. Order is stable; tracks are identified
// by index (0-19) throughout the app. Seeds were brute-force selected
// against the track generator so each slot has a specific turn count,
// gradually increasing with the track index:
//   Tracks 01-02: 6 turns    Tracks 03-04: 8 turns
//   Tracks 05-06: 10 turns   Tracks 07-08: 12 turns
//   Tracks 09-12: 14 turns   Tracks 13-16: 16 turns
//   Tracks 17-18: 18 turns   Tracks 19-20: 20 turns
export const TRACK_SEEDS = [
  1000000502, 1000000560, 1000000002, 1000000005, 1000000000,
  1000000003, 1000000001, 1000000008, 1000000004, 1000000020,
  1000000023, 1000000029, 1000000012, 1000000017, 1000000024,
  1000000039, 1000000055, 1000000071, 1000000150, 1000000747,
];

// Leaderboard
export const GHOST_MAX_LAP_SECONDS = 90;  // laps longer than this submit the score but not the ghost attachment
export const LEADERBOARD_TOP_COUNT = 3;   // number of top entries shown on the finish panel
export const LEADERBOARD_NEARBY_COUNT = 1; // number of entries shown above and below the player's row
