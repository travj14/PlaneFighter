// Centralised keyboard + mouse input with pointer-lock handling.
// Other systems read the public state each frame; Input owns the listeners.

export class Input {
  constructor(domElement) {
    this.dom = domElement;

    // Held key state, keyed by event.code (e.g. "KeyW", "Space").
    this.keys = new Set();

    // Mouse buttons.
    this.mouseDown = false; // left
    this.mouseRightDown = false; // right (aim down sights)

    // Accumulated mouse movement since last consume(). Yaw = x, pitch = y.
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.locked = false;
    this._skipNextMove = false; // drop the spiky first event after locking

    // Optional callbacks.
    this.onLockChange = null;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      // Don't trap browser shortcuts when not playing.
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // The first event after pointer-lock can carry a huge jump — discard it.
      if (this._skipNextMove) {
        this._skipNextMove = false;
        return;
      }
      // Clamp to filter rare rogue spikes; raw (unaccelerated) movement keeps
      // turns consistent regardless of how fast the mouse is moved.
      const MAX = 250;
      const clamp = (v) => Math.max(-MAX, Math.min(MAX, v || 0));
      this.mouseDX += clamp(e.movementX);
      this.mouseDY += clamp(e.movementY);
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRightDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });

    // Suppress the browser context menu so right-click can be used to aim.
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.locked) {
        this._skipNextMove = true;
      } else {
        this.mouseDown = false;
        this.mouseRightDown = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    const el = this.dom;
    if (!el.requestPointerLock) return;
    // Request raw, unaccelerated movement so sensitivity is consistent (no OS
    // mouse acceleration making fast flicks disproportionately large).
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.then === 'function') r.catch(() => el.requestPointerLock());
    } catch {
      el.requestPointerLock();
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Read + reset accumulated mouse motion for this frame.
  consumeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
}
