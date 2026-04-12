// ── Leaderboard adapter ─────────────────────────────────────────────────────
// The only module that talks to window.PlaySDK. Owns all in-memory caches for
// leaderboard data (preview ranks, top metadata, top ghost frames, finish panel).
// All methods are safe to call whether or not PlaySDK is present or the user is
// signed in — they no-op or return null gracefully.

import { TRACK_SEEDS, GHOST_MAX_LAP_SECONDS, LEADERBOARD_TOP_COUNT, LEADERBOARD_NEARBY_COUNT } from './constants.js';
import { encodeGhost, decodeGhost } from './ghost-codec.js';

// ── Caches (parallel to TRACK_SEEDS unless noted) ─────────────────────────────

let cachedPreviewRanks = null;   // [{rank, total} | null, ...]
let cachedTopMetadata = null;    // [{metadata, time, hasAttachment} | null, ...]
let cachedTopGhosts = {};        // { [trackIndex]: frames[] | null }
let cachedTopGhostPending = {};  // { [trackIndex]: Promise<frames[] | null> }
let cachedLeaderboardPanel = null; // shaped finish-panel data for the current finish screen

// ── Debug diagnostics ────────────────────────────────────────────────────────
// Exposed via getDiagnostics() so the finish screen can show SDK state on mobile
// where dev tools aren't easily available.

export function getDiagnostics() {
  const sdk = typeof window !== 'undefined' && window.PlaySDK;
  return {
    hasSdk: !!sdk,
    signedIn: !!(sdk && sdk.isSignedIn),
    pathname: typeof window !== 'undefined' ? window.location.pathname : '?',
    slugMatch: typeof window !== 'undefined' ? (window.location.pathname.match(/\/games\/([^/]+)\//) || [null, null])[1] : null,
  };
}

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

// ── Public async API ─────────────────────────────────────────────────────────

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
    console.log("submitScore: signed in?", isSignedIn(), "board:", boardName(trackIndex), "time:", timeMs);
    const result = await window.PlaySDK.submitScore(
      boardName(trackIndex),
      timeMs,
      'asc',
      metadata,
      attachment
    );
    console.log("submitScore result:", JSON.stringify(result));
    if (!result) {
      document.title = "submit failed: signedIn=" + isSignedIn() + " token=" + !!(window.PlaySDK && window.PlaySDK.isSignedIn);
    }
    if (result && result.blob_stored === true) {
      // We're the new top holder — clear cache so the next race re-fetches.
      clearTopForTrack(trackIndex);
    }
    return result || null;
  } catch (e) {
    console.error("submitIfBest error:", e);
    document.title = "submit error: " + e.message;
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
  if (!hasSdk()) { console.log("fetchFinishPanel: no SDK"); return null; }
  const sdk = window.PlaySDK;
  const board = boardName(trackIndex);
  try {
    console.log("fetchFinishPanel: board=", board, "signedIn=", isSignedIn());
    // Fetch top-N and around-me in parallel.
    const [topResp, aroundResp] = await Promise.all([
      sdk.getLeaderboard(board, LEADERBOARD_TOP_COUNT),
      isSignedIn()
        ? sdk.getLeaderboardAroundMe(board, LEADERBOARD_NEARBY_COUNT)
        : Promise.resolve(null),
    ]);
    console.log("fetchFinishPanel topResp:", JSON.stringify(topResp));
    console.log("fetchFinishPanel aroundResp:", JSON.stringify(aroundResp));
    const top = (topResp && topResp.entries) ? topResp.entries : [];
    const total = (topResp && topResp.total) || 0;
    const hasAttachment = !!(topResp && topResp.has_top_attachment);
    const nearby = (aroundResp && aroundResp.entries) ? aroundResp.entries : [];
    const panel = { top, nearby, total, hasAttachment };
    cachedLeaderboardPanel = panel;
    return panel;
  } catch (e) {
    console.error("fetchFinishPanel error:", e);
    cachedLeaderboardPanel = null;
    return null;
  }
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
