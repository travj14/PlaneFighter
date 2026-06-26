import * as THREE from 'three';
import { Aircraft } from './Aircraft.js';

// Bomber: large, slow, tanky aircraft that stays high and far. It crosses the
// battlefield at altitude, firing weaving long-range missiles at the player and
// dropping bombs as it passes over the play space.

export class Bomber extends Aircraft {
  constructor(scene, effects) {
    super(scene, effects);
    this.health = this.maxHealth = 160;
    this.score = 300;
    this._buildPlaneModel({ bodyColor: 0x4d5560, wingColor: 0x3c424b, length: 12, wingspan: 16 });
    this._addEngines();

    this.missileTimer = 2 + Math.random() * 1.5;
    this.bombTimer = 3 + Math.random() * 2;
  }

  _addEngines() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.5, roughness: 0.6 });
    for (const x of [-5, -2.6, 2.6, 5]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), mat);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(x, -0.3, 0.6);
      this.group.add(eng);
    }
  }

  spawn(arena, player) {
    const alt = 85 + Math.random() * 25;
    // Offset the pass to one side so it stays away from directly overhead.
    this.dir = this._edgeSpawn(arena, alt);
    this.position.z = (Math.random() < 0.5 ? 1 : -1) * (arena.half * 0.5 + 30);
    this.speed = 20 + Math.random() * 6;
    this.velocity.set(this.dir * this.speed, 0, 0);
    this.arenaHalf = arena.half;
  }

  _behavior(dt, ctx) {
    this.velocity.set(this.dir * this.speed, 0, 0);

    if (Math.abs(this.position.x) > this.arenaHalf + 90) this.done = true;

    // Weaving missiles aimed at the player.
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = 3.2 + Math.random() * 1.8;
      const dir = ctx.player.position.clone().sub(this.position).normalize();
      ctx.spawnProjectile({
        type: 'missile',
        position: this.position.clone(),
        velocity: dir.multiplyScalar(26),
        damage: 20,
        splash: 4.5,
        maxLife: 6,
        homing: 0.5,
        color: 0xff6a3a,
      });
    }

    // Drop bombs while over the play area.
    this.bombTimer -= dt;
    if (this.bombTimer <= 0 && Math.abs(this.position.x) < this.arenaHalf) {
      this.bombTimer = 1.4 + Math.random() * 1.2;
      ctx.spawnProjectile({
        type: 'bomb',
        position: this.position.clone(),
        velocity: new THREE.Vector3(this.velocity.x * 0.5, -4, this.velocity.z * 0.5),
        damage: 38,
        splash: 9,
        color: 0x20242a,
      });
    }
  }
}
