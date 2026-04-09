// ── Input: drag-to-steer ─────────────────────────────────────────────────────

export class Input {
  constructor(canvas) {
    this._steering = 0;
    this._dragging = false;
    this._startX = 0;
    this._maxDragPx = 150;
    this._canvas = canvas;
    // Screen-space position of the drag origin (for steering wheel display)
    this.dragScreenX = 0;
    this.dragScreenY = 0;
    this.dragging = false;

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._startX = e.clientX;
      this._setDragScreen(e.clientX, e.clientY);
      this.dragging = true;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._startX;
      this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
      this._steering = 0;
      this.dragging = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._dragging = true;
      this._startX = e.touches[0].clientX;
      this._setDragScreen(e.touches[0].clientX, e.touches[0].clientY);
      this.dragging = true;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const dx = e.touches[0].clientX - this._startX;
      this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    });

    window.addEventListener('touchend', () => {
      this._dragging = false;
      this._steering = 0;
      this.dragging = false;
    });
  }

  _setDragScreen(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = 1080 / rect.width;
    const scaleY = 1920 / rect.height;
    this.dragScreenX = (clientX - rect.left) * scaleX;
    this.dragScreenY = (clientY - rect.top) * scaleY;
  }

  get steering() {
    return this._steering;
  }
}
