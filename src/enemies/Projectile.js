import * as THREE from 'three';

// Enemy projectiles. Three kinds:
//  - bullet:  fast and straight; direct hit only, no splash.
//  - missile: weaves left/right around its launch heading (no strong
//             retargeting) and explodes with splash on impact/proximity.
//  - bomb:    falls under gravity and explodes with splash on the ground.
// update() returns true when the projectile is spent and should be removed.

export class Projectile {
  constructor(scene, effects, opts) {
    this.scene = scene;
    this.effects = effects;
    this.type = opts.type;
    this.damage = opts.damage ?? 10;
    this.splash = opts.splash ?? 0;
    this.life = 0;
    this.maxLife = opts.maxLife ?? 7;
    this.done = false;

    this.velocity = opts.velocity.clone();
    this.speed = this.velocity.length();
    this.baseDir = this.velocity.clone().normalize();

    // Missile weave + gentle homing setup.
    if (this.type === 'missile') {
      this.weavePhase = Math.random() * Math.PI * 2;
      this.weaveFreq = 3 + Math.random() * 2;
      // Subtle zag — ~15% of the original amplitude.
      this.weaveAmp = (0.5 + Math.random() * 0.4) * 0.15;
      this.homing = opts.homing ?? 0.9; // rad/s turn toward the player
      this.perp = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
    }

    this.mesh = this._buildMesh(opts.color ?? 0xffaa44);
    this.mesh.position.copy(opts.position);
    scene.add(this.mesh);
  }

  _buildMesh(color) {
    if (this.type === 'bullet') {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), mat);
      return m;
    }
    if (this.type === 'bomb') {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat);
      m.scale.z = 1.6;
      return m;
    }
    // missile — tapered nose toward +Z, baked into the geometry so lookAt()
    // (which sets the mesh's rotation each frame) aligns it along travel.
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: 0x6a1500,
      roughness: 0.5,
    });
    const geo = new THREE.CylinderGeometry(0.05, 0.14, 1.1, 8);
    geo.rotateX(Math.PI / 2); // long axis (and taper) now along +Z
    return new THREE.Mesh(geo, mat);
  }

  _explode(ctx, point) {
    if (this.splash > 0) {
      this.effects.spawnExplosion(point, this.splash, 0xff7a3a);
      const d = point.distanceTo(ctx.player.position);
      if (d < this.splash) ctx.damagePlayer(this.damage * (1 - d / this.splash));
    }
    this.done = true;
  }

  update(dt, ctx) {
    this.life += dt;
    if (this.life > this.maxLife) {
      this.done = true;
      return true;
    }

    if (this.type === 'bomb') {
      this.velocity.y -= 18 * dt; // gravity
    } else if (this.type === 'missile') {
      // Gently home the base heading toward the player (mild, not a hard lock).
      const toP = ctx.player.position.clone().sub(this.mesh.position).normalize();
      const ang = this.baseDir.angleTo(toP);
      if (ang > 1e-3) {
        const t = Math.min(1, (this.homing * dt) / ang);
        this.baseDir.lerp(toP, t).normalize();
      }
      // Weave perpendicular to the current heading.
      this.weavePhase += dt * this.weaveFreq;
      this.perp.crossVectors(this.baseDir, this._up);
      if (this.perp.lengthSq() < 1e-4) this.perp.set(1, 0, 0);
      this.perp.normalize();
      const lateral = this.perp
        .clone()
        .multiplyScalar(Math.sin(this.weavePhase) * this.weaveAmp * this.speed);
      this.velocity.copy(this.baseDir).multiplyScalar(this.speed).add(lateral);
    }

    this.mesh.position.addScaledVector(this.velocity, dt);
    if (this.velocity.lengthSq() > 1e-4) {
      this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
    }

    const pos = this.mesh.position;

    // Ground impact.
    const gy = ctx.arena.groundHeight(pos.x, pos.z);
    if (pos.y <= gy + 0.2) {
      pos.y = gy + 0.2;
      if (this.type === 'bullet') this.done = true;
      else this._explode(ctx, pos.clone());
      return true;
    }

    // Player proximity.
    const dp = pos.distanceTo(ctx.player.position);
    if (this.type === 'bullet') {
      if (dp < 1.3) {
        ctx.damagePlayer(this.damage);
        this.done = true;
        return true;
      }
    } else if (dp < 2.5) {
      this._explode(ctx, pos.clone());
      return true;
    }

    // Out of bounds safety.
    if (Math.abs(pos.x) > ctx.arena.half + 120 || Math.abs(pos.z) > ctx.arena.half + 120) {
      this.done = true;
      return true;
    }

    return false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
