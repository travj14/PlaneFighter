import * as THREE from 'three';
import { Aircraft } from './Aircraft.js';

// Standard fighter: makes curving strafing runs at the player. It steers toward
// a waypoint with a limited turn rate (which produces banking, circular arcs
// rather than straight lines), diving in to near point-blank range, then peels
// away and climbs before looping back for another pass. After a few passes it
// egresses for good. Fires gun bursts while attacking.

export class NormalPlane extends Aircraft {
  constructor(scene, effects) {
    super(scene, effects);
    this.fireTimer = 1 + Math.random() * 1.2;
    this.waypoint = new THREE.Vector3();
    this.state = 'attack';
    this._setup(); // virtual — subclasses (Jet) override stats + model
  }

  // Stats + model. Overridden by subclasses for variants like the Jet.
  _setup() {
    this.health = this.maxHealth = 45;
    this.score = 100;
    this.gunDamage = 6;
    this.gunColor = 0xffe066;
    this.speed = 48 + Math.random() * 12;
    this.turnRate = 0.85 + Math.random() * 0.4; // rad/s — lower = wider circles
    this.maxAge = 120; // keep looping back rather than despawning
    this._buildPlaneModel({ bodyColor: 0x7d8590, wingColor: 0x636a73, length: 6, wingspan: 7 });
  }

  spawn(arena, player) {
    const alt = 40 + Math.random() * 25;
    this._edgeSpawn(arena, alt);
    this.arena = arena;
    this._pickAttackPoint(player);
    // Initial heading toward the first attack point so it banks straight in.
    this.velocity.copy(this.waypoint).sub(this.position).normalize().multiplyScalar(this.speed);
  }

  _pickAttackPoint(player) {
    // A point in the player's airspace, low enough for a close buzzing pass.
    this.waypoint.set(
      player.position.x + (Math.random() - 0.5) * 8,
      player.position.y + 7 + Math.random() * 9,
      player.position.z + (Math.random() - 0.5) * 8
    );
  }

  _pickEgressPoint(player) {
    // A moderate, high point in a random direction — close enough that the
    // plane stays near the island, then curves back around for another run.
    const ang = Math.random() * Math.PI * 2;
    const r = 130 + Math.random() * 40;
    this.waypoint.set(
      player.position.x + Math.cos(ang) * r,
      55 + Math.random() * 25,
      player.position.z + Math.sin(ang) * r
    );
  }

  // Clamp the velocity's vertical angle so the plane can't pitch beyond
  // ±maxDeg from horizontal (prevents it from flying straight up/down).
  _clampPitch(maxDeg) {
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    const maxVy = horiz * Math.tan((maxDeg * Math.PI) / 180);
    this.velocity.y = Math.max(-maxVy, Math.min(maxVy, this.velocity.y));
  }

  // Rotate the velocity toward a desired direction, capped by the turn rate.
  _steer(dt, desired) {
    const dir = this.velocity.clone().normalize();
    const angle = dir.angleTo(desired);
    if (angle > 1e-3) {
      const t = Math.min(1, (this.turnRate * dt) / angle);
      dir.lerp(desired, t).normalize();
    }
    this.velocity.copy(dir).multiplyScalar(this.speed);

    // Bank into the horizontal component of the turn.
    const cx = dir.x, cz = dir.z;
    const cross = cx * desired.z - cz * desired.x;
    this.targetRoll = THREE.MathUtils.clamp(-cross * 2.5, -0.9, 0.9);
  }

  _behavior(dt, ctx) {
    const player = ctx.player;
    const toPlayer = player.position.clone().sub(this.position);
    const dist = toPlayer.length();

    const desired = this.waypoint.clone().sub(this.position).normalize();
    this._steer(dt, desired);

    // Don't fly into the ground on the low pass.
    const gy = ctx.arena.groundHeight(this.position.x, this.position.z);
    if (this.position.y < gy + 4) {
      this.velocity.y = Math.max(this.velocity.y, this.speed * 0.4);
    }

    // Fighters fly mostly level — never pitch more than 25° up or down.
    this._clampPitch(25);

    if (this.state === 'attack') {
      // Close pass complete: within point-blank range, or we've passed the
      // player (heading now points away from them).
      const passed = this.velocity.dot(toPlayer) < 0;
      if (dist < 22 || (passed && dist < 70)) {
        this._pickEgressPoint(player);
        this.state = 'egress';
      }
      this._maybeShoot(dt, ctx, toPlayer, dist);
    } else {
      // Egress: once far enough out, curve back in for another run.
      if (dist > 120) {
        this._pickAttackPoint(player);
        this.state = 'attack';
      }
    }
  }

  _maybeShoot(dt, ctx, toPlayer, dist) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    this.fireTimer = 0.9 + Math.random() * 1.2;
    if (dist > 240) return;
    const fwd = this.velocity.clone().normalize();
    if (fwd.dot(toPlayer.clone().normalize()) < 0.4) return; // must face player

    const dir = toPlayer.clone().normalize();
    dir.x += (Math.random() - 0.5) * 0.05;
    dir.y += (Math.random() - 0.5) * 0.05;
    dir.normalize();
    ctx.spawnProjectile({
      type: 'bullet',
      position: this.position.clone(),
      velocity: dir.multiplyScalar(150),
      damage: this.gunDamage,
      color: this.gunColor,
    });
  }
}
