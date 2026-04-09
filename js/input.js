// ── Input: drag-to-steer ─────────────────────────────────────────────────────

export class Input {
  constructor(canvas) {
    this._steering = 0;
    this._dragging = false;
    this._startX = 0;
    this._maxDragPx = 150;

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._startX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._startX;
      this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
      this._steering = 0;
    });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._dragging = true;
      this._startX = e.touches[0].clientX;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const dx = e.touches[0].clientX - this._startX;
      this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    });

    window.addEventListener('touchend', () => {
      this._dragging = false;
      this._steering = 0;
    });
  }

  get steering() {
    return this._steering;
  }
}
