// Drives wave-mode pacing: spawns each wave's aircraft over time, waits for the
// wave to be cleared, runs a short resupply intermission, then escalates. The
// laser unlocks at wave 3 (per the design doc). Clearing the final wave wins.

const N = 'NormalPlane';
const K = 'KamikazePlane';
const B = 'Bomber';
const J = 'Jet';

// Waves 1-5: fighters + kamikazes only. Waves 6-10: all plane types.
// Spawn interval tightens as the waves escalate.
const WAVES = [
  { spawns: [N, N, N, N], interval: 2.0 }, // 1
  { spawns: [N, N, N, N, K, K], interval: 1.9 }, // 2
  { spawns: [N, N, N, N, K, K, K], interval: 1.8 }, // 3 — ammo
  { spawns: [N, N, N, N, N, K, K, K, K], interval: 1.7 }, // 4
  { spawns: [N, N, N, N, N, K, K, K, K, K], interval: 1.6 }, // 5 — laser + ammo
  { spawns: [N, N, N, K, K, K, J, J, B], interval: 1.6 }, // 6 — all types
  { spawns: [N, N, N, K, K, K, K, J, J, J, B], interval: 1.5 }, // 7
  { spawns: [N, N, N, N, K, K, K, K, J, J, J, B, B], interval: 1.4 }, // 8 — ammo
  { spawns: [N, N, N, N, K, K, K, K, K, J, J, J, J, B, B], interval: 1.3 }, // 9
  { spawns: [N, N, N, N, N, K, K, K, K, K, K, J, J, J, J, B, B, B], interval: 1.2 }, // 10 — ammo
];

const LASER_WAVE = 5;
const REFILL_WAVES = new Set([3, 5, 8, 10]);

export class WaveDirector {
  constructor({ manager, hud, weapons, onWin }) {
    this.manager = manager;
    this.hud = hud;
    this.weapons = weapons;
    this.onWin = onWin;

    this.active = false;
    this.phase = 'idle'; // 'intermission' | 'spawning' | 'idle'
    this.wave = 0;
    this.queue = [];
    this.timer = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2;
  }

  start() {
    this.active = true;
    this.wave = 0;
    this._startIntermission(3);
  }

  stop() {
    this.active = false;
    this.phase = 'idle';
  }

  _startIntermission(time) {
    const next = this.wave + 1;
    if (next > WAVES.length) {
      this.active = false;
      this.phase = 'idle';
      this.onWin?.();
      return;
    }
    this.phase = 'intermission';
    this.timer = time;

    const bits = [];
    if (next === LASER_WAVE) bits.push('Laser unlocked');
    if (REFILL_WAVES.has(next)) bits.push('Ammo resupplied');
    const sub = bits.length ? bits.join(' · ') : 'Get ready';
    this.hud.showMessage(`WAVE ${next} OF ${WAVES.length}`, sub, time * 1000 - 200);
  }

  _startWave() {
    this.wave++;
    this.phase = 'spawning';
    const w = WAVES[this.wave - 1];
    this.queue = w.spawns.slice();
    this.spawnInterval = w.interval;
    this.spawnTimer = 0;
    this.hud.setWave(this.wave);

    if (this.wave >= LASER_WAVE) this.weapons.unlockWeapon('LASER');
    if (REFILL_WAVES.has(this.wave)) this.weapons.refillAmmo();
  }

  update(dt) {
    if (!this.active) return;

    if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this._startWave();
      return;
    }

    if (this.phase === 'spawning') {
      if (this.queue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = this.spawnInterval;
          this.manager.spawnPlane(this.queue.shift());
        }
      } else if (this.manager.aliveCount === 0) {
        // Wave cleared.
        if (this.wave < WAVES.length) {
          this.hud.showMessage(`WAVE ${this.wave} CLEARED`, 'Resupplying…', 2400);
        }
        this._startIntermission(4);
      }
    }
  }
}
