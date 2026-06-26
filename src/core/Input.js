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
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
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
      if (!this.locked) {
        this.mouseDown = false;
        this.mouseRightDown = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    this.dom.requestPointerLock?.();
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
