import * as THREE from 'three';
import { Aircraft } from './Aircraft.js';

// Bomber: large, slow, tanky aircraft that stays high. It alternates between
// heading toward the player (a bombing run) and looping around in a wide bank,
// steering with a limited turn rate so it banks rather than snapping. It never
// flies off for good — if it drifts too far it turns back. Throughout, it fires
// weaving missiles and drops bombs while over the play area.

export class Bomber extends Aircraft {
  constructor(scene, effects) {
    super(scene, effects);
    this.health = this.maxHealth = 160;
    this.score = 300;
    this._buildPlaneModel({ bodyColor: 0x4d5560, wingColor: 0x3c424b, length: 12, wingspan: 16 });
    this._addEngines();

    this.state = 'approach';
    this.stateTimer = 5 + Math.random() * 4;
    this.loopDir = Math.random() < 0.5 ? 1 : -1;
    this.loopRadius = 130 + Math.random() * 50;
    this.altTarget = 85 + Math.random() * 25;
    this.turnRate = 0.35; // wide turns for a heavy aircraft
    this.waypoint = new THREE.Vector3();

    this.missileTimer = 2 + Math.random() * 1.5;
    this.bombTimer = 3 + Math.random() * 2;
    this.maxAge = 999; // persist; loops back rather than leaving
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
    this._edgeSpawn(arena, this.altTarget);
    this.arena = arena;
    this.speed = 24 + Math.random() * 5;
    const to = player.position.clone().sub(this.position);
    to.y = 0;
    to.normalize();
    this.velocity.copy(to).multiplyScalar(this.speed);
  }

  // Rotate velocity toward a world point, capped by the turn rate.
  _steerVel(dt, target, turn) {
    const desired = target.clone().sub(this.position).normalize();
    const dir = this.velocity.clone().normalize();
    const ang = dir.angleTo(desired);
    if (ang > 1e-3) {
      const t = Math.min(1, (turn * dt) / ang);
      dir.lerp(desired, t).normalize();
    }
    this.velocity.copy(dir).multiplyScalar(this.speed);
  }

  _behavior(dt, ctx) {
    const p = ctx.player.position;
    const horiz = new THREE.Vector3(this.position.x - p.x, 0, this.position.z - p.z);
    const distH = horiz.length();

    // Alternate between approach and loop; force a return if it drifts too far.
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = this.state === 'approach' ? 'loop' : 'approach';
      this.stateTimer = 6 + Math.random() * 4;
    }
    if (distH > 280) this.state = 'approach';

    if (this.state === 'approach') {
      // Fly toward (and over) the player at altitude.
      this.waypoint.set(p.x, this.altTarget, p.z);
      this.targetRoll = 0;
    } else {
      // Bank around the player in a wide circle.
      if (distH < 1) horiz.set(1, 0, 0);
      const ang = Math.atan2(horiz.z, horiz.x) + this.loopDir * 0.5;
      this.waypoint.set(
        p.x + Math.cos(ang) * this.loopRadius,
        this.altTarget,
        p.z + Math.sin(ang) * this.loopRadius
      );
      this.targetRoll = this.loopDir * 0.3;
    }
    this._steerVel(dt, this.waypoint, this.turnRate);

    // Weaving, gently-homing missiles aimed at the player.
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = 3.2 + Math.random() * 1.8;
      const dir = p.clone().sub(this.position).normalize();
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

    // Drop bombs while actually over the play area.
    this.bombTimer -= dt;
    const overArena =
      Math.abs(this.position.x) < ctx.arena.half && Math.abs(this.position.z) < ctx.arena.half;
    if (this.bombTimer <= 0 && overArena) {
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
