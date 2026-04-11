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
