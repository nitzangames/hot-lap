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
