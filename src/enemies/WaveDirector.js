// Drives wave-mode pacing: spawns each wave's aircraft over time, waits for the
// wave to be cleared, runs a short resupply intermission, then escalates. The
// laser unlocks at wave 3 (per the design doc). Clearing the final wave wins.

const N = 'NormalPlane';
const K = 'KamikazePlane';
const B = 'Bomber';

const WAVES = [
  { spawns: [N, N, N, N], interval: 2.0 },
  { spawns: [N, N, N, K, K, K], interval: 1.8 },
  { spawns: [N, N, N, N, K, K, K, K, B], interval: 1.6 },
];

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
    const sub = next === 3 ? 'LASER UNLOCKED — press 2' : 'Get ready';
    this.hud.showMessage(`WAVE ${next}`, sub, time * 1000 - 200);
  }

  _startWave() {
    this.wave++;
    this.phase = 'spawning';
    const w = WAVES[this.wave - 1];
    this.queue = w.spawns.slice();
    this.spawnInterval = w.interval;
    this.spawnTimer = 0;
    this.hud.setWave(this.wave);
    if (this.wave >= 3) this.weapons.unlockWeapon('LASER');
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
