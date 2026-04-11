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
// by index (0-19) throughout the app. Seeds chosen randomly once.
export const TRACK_SEEDS = [
  3536688103, 1436850013, 2404477373, 2891183426, 2190564216,
  1357795990, 1519839472, 1429483613, 3538153913, 3380586140,
   545496861, 1156852666, 2730074476, 3217832626, 3885142516,
   139478688, 2870132872, 3744827128,  611838112,   41266754,
];

// Leaderboard
export const GHOST_MAX_LAP_SECONDS = 90;  // laps longer than this submit the score but not the ghost attachment
export const LEADERBOARD_TOP_COUNT = 3;   // number of top entries shown on the finish panel
export const LEADERBOARD_NEARBY_COUNT = 1; // number of entries shown above and below the player's row
