import * as THREE from 'three';
import { Aircraft } from './Aircraft.js';

// Red-and-white attacker with a randomly chosen behaviour each spawn:
//  - dive   (~18%): approaches, then dive-bombs the player's feet. It homes in
//                   during the dive, then LOCKS its heading once close so a late
//                   strafe/jump can still dodge it. Explodes on impact.
//  - flyby  (~42%): buzzes past the player at altitude, then leaves.
//  - loiter (~40%): circles above the player for a while, then leaves.

export class KamikazePlane extends Aircraft {
  constructor(scene, effects) {
    super(scene, effects);
    this.health = this.maxHealth = 30;
    this.score = 150;
    this._buildPlaneModel({ bodyColor: 0xcf2b2b, wingColor: 0xf2f2f2, length: 5.5, wingspan: 6.2 });
    this._addStripes();

    // Roll behaviour.
    const r = Math.random();
    this.mode = r < 0.18 ? 'dive' : r < 0.6 ? 'flyby' : 'loiter';

    this.approachSpeed = 40 + Math.random() * 8;
    this.diveSpeed = 72;
    this.diveTurn = 1.6; // homing turn rate during the dive (rad/s)
    this.lockDistance = 16; // within this, heading locks (dodgeable late)

    this.state = this.mode === 'dive' ? 'approach' : this.mode;
    this.diveDelay = 2 + Math.random() * 2.5;
    this.locked = false;
    this.leaving = false;

    // Loiter / fly-by params.
    this.waypoint = new THREE.Vector3();
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.orbitRadius = 45 + Math.random() * 30;
    this.altTarget = 38 + Math.random() * 18;
    this.loiterTime = 8 + Math.random() * 8;
  }

  _addStripes() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    for (const z of [0.6, -0.6]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.35, 10), white);
      band.rotation.x = Math.PI / 2;
      band.position.z = z;
      this.group.add(band);
    }
  }

  spawn(arena, player) {
    const alt = 45 + Math.random() * 25;
    this._edgeSpawn(arena, alt);
    this.arena = arena;
    const to = player.position.clone().sub(this.position);
    to.y = 0;
    to.normalize();
    this.velocity.copy(to).multiplyScalar(this.approachSpeed);
  }

  // Rotate velocity toward a world point, capped by a turn rate, at `speed`.
  _steerVel(dt, targetPoint, turn, speed) {
    const desired = targetPoint.clone().sub(this.position).normalize();
    const dir = this.velocity.clone().normalize();
    const ang = dir.angleTo(desired);
    if (ang > 1e-3) {
      const t = Math.min(1, (turn * dt) / ang);
      dir.lerp(desired, t).normalize();
    }
    this.velocity.copy(dir).multiplyScalar(speed);
  }

  _startLeaving(player) {
    const ang = Math.random() * Math.PI * 2;
    this.waypoint.set(
      player.position.x + Math.cos(ang) * 300,
      60 + Math.random() * 25,
      player.position.z + Math.sin(ang) * 300
    );
    this.leaving = true;
    this.state = 'leave';
  }

  _behavior(dt, ctx) {
    const player = ctx.player;

    if (this.state === 'leave') {
      this._steerVel(dt, this.waypoint, 1.2, this.approachSpeed);
      this.targetRoll = 0;
      if (this.position.distanceTo(player.position) > 260) this.done = true;
      return;
    }

    if (this.state === 'flyby') {
      // Aim for a point above/at the player, buzz past, then leave.
      this.waypoint.set(
        player.position.x,
        player.position.y + 12 + Math.random() * 12,
        player.position.z
      );
      this._steerVel(dt, this.waypoint, 1.3, this.approachSpeed);
      this.targetRoll = 0.2;
      const to = player.position.clone().sub(this.position);
      const dist = to.length();
      const passed = this.velocity.dot(to) < 0;
      if (dist < 22 || (passed && dist < 60)) this._startLeaving(player);
      return;
    }

    if (this.state === 'loiter') {
      // Circle above the player; descend/rise toward altTarget.
      const p = player.position;
      const toPlane = new THREE.Vector3(this.position.x - p.x, 0, this.position.z - p.z);
      if (toPlane.lengthSq() < 1) toPlane.set(1, 0, 0);
      const ang = Math.atan2(toPlane.z, toPlane.x) + this.orbitDir * 0.5;
      this.waypoint.set(
        p.x + Math.cos(ang) * this.orbitRadius,
        this.altTarget,
        p.z + Math.sin(ang) * this.orbitRadius
      );
      this._steerVel(dt, this.waypoint, 1.6, this.approachSpeed);
      this.targetRoll = this.orbitDir * 0.4;

      this.loiterTime -= dt;
      if (this.loiterTime <= 0) this._startLeaving(player);
      return;
    }

    if (this.state === 'approach') {
      const to = player.position.clone().sub(this.position);
      const horiz = new THREE.Vector3(to.x, 0, to.z);
      const horizDist = horiz.length();
      horiz.normalize();
      const desired = horiz.multiplyScalar(this.approachSpeed);
      desired.y = -6;
      this.velocity.lerp(desired, Math.min(1, dt * 1.5));
      this.targetRoll = 0;

      this.diveDelay -= dt;
      if (this.diveDelay <= 0 || horizDist < 55) {
        const dir = player.position.clone().sub(this.position).normalize();
        this.velocity.copy(dir).multiplyScalar(this.diveSpeed);
        this.state = 'dive';
        this.locked = false;
      }
      return;
    }

    // state === 'dive'
    this.targetRoll = 0.5;
    const dp = this.position.distanceTo(player.position);
    if (!this.locked && dp > this.lockDistance) {
      const p = player.position;
      const gy = ctx.arena.groundHeight(p.x, p.z);
      const aim = new THREE.Vector3(p.x, Math.min(p.y, gy + 1.5), p.z);
      this._steerVel(dt, aim, this.diveTurn, this.diveSpeed);
    } else {
      this.locked = true; // committed line — no more tracking
    }

    const gy = ctx.arena.groundHeight(this.position.x, this.position.z);
    if (this.position.y <= gy + 1.2) {
      this.effects.spawnExplosion(this.position.clone(), 9, 0xff7a30);
      const d = this.position.distanceTo(player.position);
      if (d < 9) ctx.damagePlayer(40 * (1 - d / 9));
      this.dead = true;
      this.done = true;
      this.score = 0; // no score for a self-crash
    }
  }
}
