export class Ghost {
  constructor(seed) {
    this.seed = seed;
    this.storageKey = `racing-2d:ghost:${seed}`;
    this.recording = [];
    this.bestRecording = null;
    this.bestTime = null;
    this.bestStyleIndex = null; // car style used when the best was set
    this.bestHue = null;        // car hue used when the best was set
    this._playbackTick = 0;

    // Load from localStorage
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.time != null && Array.isArray(data.frames)) {
          this.bestTime = data.time;
          this.bestRecording = data.frames;
          this.bestStyleIndex = typeof data.styleIndex === 'number' ? data.styleIndex : null;
          this.bestHue = typeof data.hue === 'number' ? data.hue : null;
        }
      }
    } catch (_) {
      // localStorage may be unavailable (e.g. iframe)
    }
  }

  /**
   * Record one tick of car state.
   */
  record(x, y, angle) {
    this.recording.push({ x, y, angle });
  }

  /**
   * Clear recording for a new run and reset playback.
   */
  resetRecording() {
    this.recording = [];
    this._playbackTick = 0;
  }

  /**
   * Save current recording if it beats the best time.
   * @param {number} timeMs
   * @param {number} [styleIndex] - car style used for this run
   * @param {number} [hue] - car hue used for this run
   * Returns true if a new record was set.
   */
  saveIfBest(timeMs, styleIndex, hue) {
    if (this.bestTime === null || timeMs < this.bestTime) {
      this.bestTime = timeMs;
      this.bestRecording = this.recording.slice();
      this.bestStyleIndex = typeof styleIndex === 'number' ? styleIndex : null;
      this.bestHue = typeof hue === 'number' ? hue : null;
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({
          time: timeMs,
          frames: this.bestRecording,
          styleIndex: this.bestStyleIndex,
          hue: this.bestHue,
        }));
      } catch (_) {
        // localStorage may be unavailable
      }
      return true;
    }
    return false;
  }

  /**
   * Get {x, y, angle} at the current playback tick.
   * Returns null if no ghost data or past the end.
   */
  getGhostFrame() {
    if (!this.bestRecording || this._playbackTick >= this.bestRecording.length) {
      return null;
    }
    return this.bestRecording[this._playbackTick];
  }

  /**
   * Increment the playback tick.
   */
  advancePlayback() {
    this._playbackTick++;
  }
}
