// Generic object pool. Avoids per-frame allocation/GC churn for short-lived
// objects like tracers and impact sparks (per the design doc's perf section).

export class Pool {
  /**
   * @param {() => T} factory     - create a fresh inactive item
   * @param {(item:T)=>void} reset - prepare an item for reuse (hide it)
   */
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
  }

  acquire() {
    const item = this.free.pop() || this.factory();
    this.active.push(item);
    return item;
  }

  release(item) {
    const i = this.active.indexOf(item);
    if (i !== -1) this.active.splice(i, 1);
    this.reset(item);
    this.free.push(item);
  }

  // Update all active items via fn; if fn returns true the item is released.
  update(dt, fn) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      if (fn(item, dt)) this.release(item);
    }
  }
}
