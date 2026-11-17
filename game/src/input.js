// DUSTFALL input: keyboard state with edge-triggered presses, mouse look
// deltas, and pointer lock. Menus read one clean tap per key; the game
// loop reads the held set. The demo autopilot writes into the same shape.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.onPress = null; // (code) => void, set by the game for menu keys
    this.onMouseDown = null; // (button) => void
    this.onMouseUp = null;
    this._down = (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
      if (this.onPress) this.onPress(e.code);
    };
    this._up = (e) => { this.held.delete(e.code); };
    this._move = (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    };
    this._md = (e) => { if (this.onMouseDown) this.onMouseDown(e.button); };
    this._mu = (e) => { if (this.onMouseUp) this.onMouseUp(e.button); };
    this._lock = () => { this.locked = document.pointerLockElement === canvas; };
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('mousemove', this._move);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    document.addEventListener('pointerlockchange', this._lock);
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable (headless): play on without it */ }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Consume the accumulated look deltas for this tick.
  takeLook() {
    const x = this.dx, y = this.dy;
    this.dx = 0; this.dy = 0;
    return [x, y];
  }

  // True once for the tick in which the key went down.
  wasPressed(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  endTick() { this.pressed.clear(); }
}
