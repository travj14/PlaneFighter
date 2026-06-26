import * as THREE from 'three';

// Temporary shootable practice targets so the shooting mechanics can be tested
// before aircraft exist. Each target has health, shows hit feedback, "dies"
// when depleted, and respawns after a delay. The destructible interface
// (mesh, takeDamage) mirrors what aircraft will later implement, so the weapon
// system won't need to change when planes arrive.

class Target {
  constructor(scene, position) {
    this.scene = scene;
    this.home = position.clone();
    this.maxHealth = 60;
    this.health = this.maxHealth;
    this.dead = false;
    this.respawnTimer = 0;
    this.hitFlash = 0;

    const geo = new THREE.IcosahedronGeometry(1.4, 0);
    this.baseColor = new THREE.Color(0xc23b3b);
    this.mat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.5,
      metalness: 0.1,
      emissive: new THREE.Color(0x000000),
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);
    this.mesh.userData.entity = this; // raycast → entity lookup
    scene.add(this.mesh);

    this.spin = 0.4 + Math.random() * 0.6;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  // Called by the weapon system. point/normal are world-space hit info.
  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (this.health <= 0) this._die();
  }

  _die() {
    this.dead = true;
    this.respawnTimer = 3;
    this.mesh.visible = false;
    if (this.onDeath) this.onDeath(this);
  }

  _respawn() {
    this.dead = false;
    this.health = this.maxHealth;
    this.mesh.visible = true;
    this.hitFlash = 0;
  }

  update(dt, time) {
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this._respawn();
      return;
    }
    this.mesh.rotation.y += this.spin * dt;
    this.mesh.rotation.x += this.spin * 0.4 * dt;
    this.mesh.position.y =
      this.home.y + Math.sin(time * 1.4 + this.bobPhase) * 0.6;

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      this.mat.emissive.setRGB(this.hitFlash, this.hitFlash, this.hitFlash);
    }
    // Tint toward dark as health drops.
    const f = this.health / this.maxHealth;
    this.mat.color.copy(this.baseColor).multiplyScalar(0.4 + 0.6 * f);
  }
}

export class Targets {
  constructor(scene) {
    this.scene = scene;
    this.list = [];

    const spots = [
      [0, 5, -35],
      [-22, 6, -50],
      [22, 7, -55],
      [-45, 8, -20],
      [45, 6, -25],
      [0, 12, -75],
    ];
    for (const [x, y, z] of spots) {
      const t = new Target(scene, new THREE.Vector3(x, y, z));
      this.list.push(t);
    }
  }

  // Meshes for the weapon raycast.
  get meshes() {
    return this.list.map((t) => t.mesh);
  }

  update(dt, time) {
    for (const t of this.list) t.update(dt, time);
  }
}
