import * as THREE from 'three';

// Base class for enemy aircraft. Handles the procedural model, flight
// integration + orientation (banking), the shoot-to-destroy interface used by
// the weapon system, hit feedback, and the death explosion. Subclasses
// implement spawn placement and per-frame behaviour (flight path + attacks).
//
// Convention: models are built nose-along +Z, so `group.lookAt(pos + velocity)`
// points the nose along the direction of travel.

export class Aircraft {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;

    this.group = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.dead = false; // destroyed by the player
    this.done = false; // flagged for removal (killed or exited)
    this.age = 0;
    this.maxAge = 32; // safety despawn (seconds)
    this.boundaryRadius = Infinity; // set on spawn; planes are curved back inside it

    this.hitFlash = 0;
    this.materials = []; // standard materials that flash on hit
    this.roll = 0;
    this.targetRoll = 0;

    this.health = 1;
    this.maxHealth = 1;
    this.score = 100;
    this.kind = 'normal'; // minimap colour tag

    this._lookTarget = new THREE.Vector3();

    scene.add(this.group);
  }

  get position() {
    return this.group.position;
  }

  _registerMaterial(mat) {
    this.materials.push(mat);
    return mat;
  }

  // Build a generic plane into this.group. Subclasses tweak afterwards.
  _buildPlaneModel({
    bodyColor = 0x8a8f98,
    wingColor = 0x6f747c,
    length = 6,
    wingspan = 7,
  } = {}) {
    const body = this._registerMaterial(
      new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.4, roughness: 0.6 })
    );
    const wing = this._registerMaterial(
      new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.3, roughness: 0.7 })
    );
    this.bodyMat = body;
    this.wingMat = wing;

    const r = length * 0.09;

    const fus = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.55, length, 10),
      body
    );
    fus.rotation.x = Math.PI / 2; // align along Z
    fus.castShadow = true;
    this.group.add(fus);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(r, length * 0.3, 10), body);
    nose.rotation.x = Math.PI / 2; // apex toward +Z
    nose.position.z = length * 0.5 + length * 0.13;
    this.group.add(nose);

    const wings = new THREE.Mesh(
      new THREE.BoxGeometry(wingspan, length * 0.04, length * 0.42),
      wing
    );
    wings.position.z = length * 0.04;
    wings.castShadow = true;
    this.group.add(wings);

    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(wingspan * 0.42, length * 0.035, length * 0.2),
      wing
    );
    tail.position.z = -length * 0.42;
    this.group.add(tail);

    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.04, length * 0.26, length * 0.2),
      wing
    );
    fin.position.set(0, length * 0.13, -length * 0.42);
    this.group.add(fin);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.8, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x223040, metalness: 0.2, roughness: 0.3 })
    );
    cockpit.position.set(0, r * 0.7, length * 0.18);
    cockpit.scale.set(1, 0.7, 1.6);
    this.group.add(cockpit);

    this._buildHitbox(wingspan * 0.95, length * 0.4, length * 1.05);
  }

  // Oversized transparent box used as the raycast target (generous hit area).
  _buildHitbox(w, h, d) {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    this.hitMesh.userData.entity = this;
    this.group.add(this.hitMesh);
  }

  // --- shoot-to-destroy interface (called by the weapon system) ---
  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.done = true;
    this.effects.spawnExplosion(this.position.clone(), 8, 0xffa84a);
  }

  _orient() {
    if (this.velocity.lengthSq() > 1e-4) {
      this._lookTarget.copy(this.position).add(this.velocity);
      this.group.lookAt(this._lookTarget);
    }
    this.group.rotateZ(this.roll);
  }

  _common(dt) {
    // Bank toward target roll.
    this.roll += (this.targetRoll - this.roll) * Math.min(1, dt * 4);

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      for (const m of this.materials) {
        if (m.emissive) m.emissive.setRGB(this.hitFlash, this.hitFlash * 0.15, 0);
      }
    }
  }

  update(dt, ctx) {
    if (this.dead) return;
    this.age += dt;
    if (this.age > this.maxAge) this.done = true;

    this._behavior(dt, ctx);
    this._containWithinIsland(dt);
    this.position.addScaledVector(this.velocity, dt);
    this._orient();
    this._common(dt);
  }

  // Keep aircraft near the island: once beyond the boundary radius, gently
  // curve the horizontal velocity back toward the centre (no teleport/despawn).
  _containWithinIsland(dt) {
    const r = Math.hypot(this.position.x, this.position.z);
    if (r <= this.boundaryRadius) return;
    const inX = -this.position.x / r;
    const inZ = -this.position.z / r;
    const sp = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const k = Math.min(1, dt * 1.5);
    this.velocity.x += (inX * sp - this.velocity.x) * k;
    this.velocity.z += (inZ * sp - this.velocity.z) * k;
  }

  // Subclasses override:
  spawn(/* arena, player */) {}
  _behavior(/* dt, ctx */) {}

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  // Helper: random spawn point just outside the arena, with a heading that
  // sends the plane across the play space.
  _edgeSpawn(arena, altitude) {
    const half = arena.half;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const alongZ = (Math.random() * 2 - 1) * half * 0.8;
    this.position.set(-dir * (half + 45), altitude, alongZ);
    // Planes spawn just outside the arena (half + 45); allow a bit beyond that
    // before curving them back, so they stay close to the island.
    this.boundaryRadius = half + 70;
    return dir; // travelling toward +x * dir
  }
}
