import { NormalPlane } from './NormalPlane.js';
import { KamikazePlane } from './KamikazePlane.js';
import { Bomber } from './Bomber.js';
import { Projectile } from './Projectile.js';

// Owns all enemy aircraft + their projectiles. For now it runs a simple
// sandbox spawner (a steady mix of plane types up to a cap) so the planes can
// be tested; the wave director will later drive spawning instead. Registers
// each plane's hitbox with the weapon system so they can be shot, applies
// player damage, and awards score on kills.

const TYPES = { NormalPlane, KamikazePlane, Bomber };

export class AircraftManager {
  constructor({ scene, effects, weapons, player, hud, arena, input, onScore }) {
    this.scene = scene;
    this.effects = effects;
    this.weapons = weapons;
    this.player = player;
    this.hud = hud;
    this.arena = arena;
    this.input = input;
    this.onScore = onScore;

    this.aircraft = [];
    this.projectiles = [];

    this.mode = 'sandbox'; // 'sandbox' auto-spawns + test keys; 'wave' is driven externally
    this.cap = 6;
    this.spawnTimer = 2;
    this._prevKeys = {};

    // Reused per-frame context for entity updates.
    this.ctx = {
      player,
      arena,
      effects,
      spawnProjectile: (opts) => this._spawnProjectile(opts),
      damagePlayer: (amt) => {
        this.player.takeDamage(amt);
        this.hud.flashDamage();
      },
    };
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Remove all aircraft + projectiles (used when (re)starting a session).
  reset() {
    for (const a of this.aircraft) {
      this.weapons.removeDestructible(a.hitMesh);
      a.dispose();
    }
    this.aircraft.length = 0;
    for (const p of this.projectiles) p.dispose();
    this.projectiles.length = 0;
    this.spawnTimer = 2;
  }

  // Public spawn used by the wave director.
  spawnPlane(typeName) {
    this._spawn(typeName);
  }

  get aliveCount() {
    return this.aircraft.length;
  }

  _spawn(typeName) {
    const Cls = TYPES[typeName];
    if (!Cls) return;
    const plane = new Cls(this.scene, this.effects);
    plane.spawn(this.arena, this.player);
    this.weapons.addDestructible(plane.hitMesh);
    this.aircraft.push(plane);
  }

  _spawnRandom() {
    const r = Math.random();
    if (r < 0.55) this._spawn('NormalPlane');
    else if (r < 0.85) this._spawn('KamikazePlane');
    else this._spawn('Bomber');
  }

  _spawnProjectile(opts) {
    this.projectiles.push(new Projectile(this.scene, this.effects, opts));
  }

  // Edge-detected test-spawn keys: Z normal, X kamikaze, C bomber.
  _handleSpawnKeys() {
    const edge = (code) => {
      const down = this.input.isDown(code);
      const was = this._prevKeys[code];
      this._prevKeys[code] = down;
      return down && !was;
    };
    if (edge('KeyZ')) this._spawn('NormalPlane');
    if (edge('KeyX')) this._spawn('KamikazePlane');
    if (edge('KeyC')) this._spawn('Bomber');
  }

  update(dt, time) {
    // Sandbox-only: test-spawn keys + steady auto-spawn. In wave mode the
    // WaveDirector drives spawning instead.
    if (this.mode === 'sandbox') {
      this._handleSpawnKeys();
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.aircraft.length < this.cap) {
        this.spawnTimer = 2 + Math.random() * 2.5;
        this._spawnRandom();
      }
    }

    this.ctx.time = time;

    // Update aircraft; remove finished ones.
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const a = this.aircraft[i];
      a.update(dt, this.ctx);
      if (a.done) {
        if (a.dead && a.score > 0) this.onScore?.(a.score);
        this.weapons.removeDestructible(a.hitMesh);
        a.dispose();
        this.aircraft.splice(i, 1);
      }
    }

    // Update projectiles; remove spent ones.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const spent = p.update(dt, this.ctx);
      if (spent || p.done) {
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
