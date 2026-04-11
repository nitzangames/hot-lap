// ── TopGhost ─────────────────────────────────────────────────────────────────
// Playback wrapper for a world-record ghost loaded from the leaderboard.
// Shape mirrors Ghost's playback side (getGhostFrame / advancePlayback) but
// has no recording, no localStorage, no save-if-best — it only plays.
//
// Constructed from an in-memory frame array (decoded by ghost-codec.js).

export class TopGhost {
  /**
   * @param {Array<{x:number,y:number,angle:number}>} frames
   */
  constructor(frames) {
    this.frames = frames || [];
    this._playbackTick = 0;
  }

  /**
   * Return the frame at the current playback tick, or null if past the end
   * or if the instance has no frames.
   */
  getFrame() {
    if (!this.frames || this._playbackTick >= this.frames.length) return null;
    return this.frames[this._playbackTick];
  }

  /** Advance the playback tick by one. */
  advancePlayback() {
    this._playbackTick++;
  }

  /** Reset playback to frame 0 (used on retry/respawn). */
  resetPlayback() {
    this._playbackTick = 0;
  }

  /** True if this instance has any frames to play. */
  hasFrames() {
    return this.frames && this.frames.length > 0;
  }
}
