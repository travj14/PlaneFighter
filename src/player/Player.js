import * as THREE from 'three';
import { PLAYER, ARENA } from '../config.js';

// First-person player controller. The camera is the player's eyes. Yaw is
// applied to a "body" rotation, pitch to the camera, so movement stays
// horizontal while you can still aim nearly straight up at aircraft.

export class Player {
  constructor(camera, arena, input) {
    this.camera = camera;
    this.arena = arena;
    this.input = input;

    this.yaw = 0; // radians, around Y
    this.pitch = 0; // radians, look up/down
    this.recoilPitch = 0; // transient upward kick from firing

    this.lookScale = 1; // sensitivity multiplier (reduced while aiming)
    this.sensMultiplier = 1; // user-configurable sensitivity setting
    this.lookDX = 0; // last frame's mouse delta (for weapon sway)
    this.lookDY = 0;

    this.position = new THREE.Vector3(0, 0, 30);
    this.velocity = new THREE.Vector3();
    this.onGround = true;

    this.health = PLAYER.maxHealth;
    this.maxHealth = PLAYER.maxHealth;
    this.alive = true;

    // Scratch vectors to avoid per-frame allocation.
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();

    this._syncCamera();
  }

  // --- look ---------------------------------------------------------------
  _applyLook() {
    const { dx, dy } = this.input.consumeMouseDelta();
    this.lookDX = dx;
    this.lookDY = dy;
    const sens = PLAYER.lookSensitivity * this.lookScale * this.sensMultiplier;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const limit = PLAYER.pitchLimit;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  addRecoil(amount) {
    this.recoilPitch += amount;
  }

  // Direction the camera (and thus weapon) is aiming, including pitch + recoil.
  getAimDirection(out = new THREE.Vector3()) {
    this.camera.getWorldDirection(out);
    return out;
  }

  // --- movement -----------------------------------------------------------
  _move(dt) {
    // Build horizontal basis from yaw only.
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._wish.set(0, 0, 0);
    if (this.input.isDown('KeyW')) this._wish.add(this._forward);
    if (this.input.isDown('KeyS')) this._wish.sub(this._forward);
    if (this.input.isDown('KeyD')) this._wish.add(this._right);
    if (this.input.isDown('KeyA')) this._wish.sub(this._right);

    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    if (this._wish.lengthSq() > 0) {
      this._wish.normalize().multiplyScalar(speed);
      // Accelerate horizontal velocity toward wish velocity.
      this.velocity.x += (this._wish.x - this.velocity.x) *
        Math.min(1, PLAYER.acceleration * dt / speed);
      this.velocity.z += (this._wish.z - this.velocity.z) *
        Math.min(1, PLAYER.acceleration * dt / speed);
    } else {
      // Friction.
      const d = Math.max(0, 1 - PLAYER.damping * dt);
      this.velocity.x *= d;
      this.velocity.z *= d;
    }

    // Jump + gravity.
    if (this.onGround && this.input.isDown('Space')) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    // Integrate.
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    this._collideWorld();
  }

  _collideWorld() {
    const r = PLAYER.radius;
    const half = ARENA.size / 2 - r - 2;

    // Arena bounds.
    this.position.x = Math.max(-half, Math.min(half, this.position.x));
    this.position.z = Math.max(-half, Math.min(half, this.position.z));

    // Push out of solid AABBs (horizontal only — treat as pillars).
    for (const c of this.arena.colliders) {
      const px = this.position.x;
      const pz = this.position.z;
      // Closest point on box in XZ, expanded by radius.
      const minx = c.min.x - r, maxx = c.max.x + r;
      const minz = c.min.z - r, maxz = c.max.z + r;
      // Only collide if player vertical span overlaps box and we're inside XZ.
      const feet = this.position.y;
      const headRoom = c.max.y;
      if (feet > headRoom) continue; // standing on top / above
      if (px > minx && px < maxx && pz > minz && pz < maxz) {
        // Resolve along the axis of least penetration.
        const dxLeft = px - minx;
        const dxRight = maxx - px;
        const dzNear = pz - minz;
        const dzFar = maxz - pz;
        const m = Math.min(dxLeft, dxRight, dzNear, dzFar);
        if (m === dxLeft) this.position.x = minx;
        else if (m === dxRight) this.position.x = maxx;
        else if (m === dzNear) this.position.z = minz;
        else this.position.z = maxz;
      }
    }

    // Ground clamp.
    const groundY = this.arena.groundHeight(this.position.x, this.position.z);
    const standY = groundY + PLAYER.height;
    if (this.position.y <= standY) {
      this.position.y = standY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  _syncCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch + this.recoilPitch);
  }

  // Restore to a fresh state for a new session.
  reset() {
    this.health = this.maxHealth;
    this.alive = true;
    this.position.set(0, 0, 30);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.onGround = true;
    this._syncCamera();
  }

  // Restore health, capped at max.
  heal(amount) {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  }

  update(dt) {
    if (!this.alive) return;
    this._applyLook();
    this._move(dt);

    // Recoil recovers toward zero.
    this.recoilPitch *= Math.max(0, 1 - 10 * dt);
    if (this.recoilPitch < 0.0001) this.recoilPitch = 0;

    this._syncCamera();
  }
}
