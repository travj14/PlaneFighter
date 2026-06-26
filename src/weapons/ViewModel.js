import * as THREE from 'three';
import { PLAYER } from '../config.js';

// First-person weapon viewmodel: a procedural scoped rifle rendered in its own
// scene/camera on top of the world (so it never clips into walls). Handles the
// hip <-> aim-down-sights pose, idle/movement bob, look sway, recoil kick, and
// the muzzle flash. Exposes `ads` (0..1) which the scope + weapon spread read.

export class ViewModel {
  constructor() {
    // Dedicated scene + camera so the gun draws over the world after a depth
    // clear. A slightly narrower FOV than the world reduces edge distortion.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.01,
      10
    );

    // Lights local to the viewmodel scene.
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x202428, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-0.5, 1, 0.6);
    this.scene.add(key);

    this.gun = new THREE.Group();
    this.scene.add(this.gun);
    this._buildRifle();

    // Poses (position + euler) blended by `ads`.
    this.hipPos = new THREE.Vector3(0.26, -0.3, -0.62);
    this.adsPos = new THREE.Vector3(0.0, -0.12, -0.5);
    this.hipRot = new THREE.Euler(0.03, -0.05, 0.02);
    this.adsRot = new THREE.Euler(0, 0, 0);

    this.ads = 0; // current aim-down-sights progress 0..1
    this.scopeToggled = false; // keyboard (M) toggle for mouse-free aiming
    this._mPrev = false;

    // Transient recoil state.
    this.kickBack = 0;
    this.kickUp = 0;
    this.flashTimer = 0;

    // Sway state.
    this.swayX = 0;
    this.swayY = 0;
    this.bobT = 0;

    // Scratch.
    this._pos = new THREE.Vector3();
    this._rot = new THREE.Euler();
  }

  _mat(color, metalness = 0.7, roughness = 0.45) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  _addPart(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    this.gun.add(m);
    return m;
  }

  _buildRifle() {
    const metal = this._mat(0x23272e, 0.75, 0.4);
    const polymer = this._mat(0x2c2f36, 0.2, 0.7);
    const optic = this._mat(0x111317, 0.5, 0.5);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x16242e,
      metalness: 0.1,
      roughness: 0.15,
      emissive: 0x0a141c,
    });

    // Barrel points toward -Z (away from the player).
    this._addPart(new THREE.BoxGeometry(0.1, 0.11, 0.46), metal, 0, 0, 0); // receiver
    this._addPart(new THREE.BoxGeometry(0.075, 0.085, 0.34), polymer, 0, 0, -0.36); // handguard
    this._addPart(
      new THREE.CylinderGeometry(0.018, 0.018, 0.5, 12),
      metal,
      0,
      0.005,
      -0.62,
      Math.PI / 2
    ); // barrel
    this._addPart(new THREE.BoxGeometry(0.07, 0.1, 0.22), polymer, 0, -0.01, 0.3); // stock
    this._addPart(new THREE.BoxGeometry(0.05, 0.13, 0.06), polymer, 0, -0.11, 0.08, 0.3); // grip
    this._addPart(new THREE.BoxGeometry(0.055, 0.2, 0.09), metal, 0, -0.14, -0.05, -0.25); // magazine
    this._addPart(new THREE.BoxGeometry(0.03, 0.02, 0.4), metal, 0, 0.075, -0.1); // top rail

    // --- scope ---
    // Tube
    this._addPart(
      new THREE.CylinderGeometry(0.04, 0.04, 0.26, 16),
      optic,
      0,
      0.12,
      -0.02,
      Math.PI / 2
    );
    // Objective (front) + ocular (rear) bells
    this._addPart(
      new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16),
      optic,
      0,
      0.12,
      -0.16,
      Math.PI / 2
    );
    this._addPart(
      new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16),
      optic,
      0,
      0.12,
      0.12,
      Math.PI / 2
    );
    // Lens glass discs
    this._addPart(new THREE.CircleGeometry(0.042, 16), glass, 0, 0.12, -0.181, 0, 0, 0); // front
    this._addPart(new THREE.CircleGeometry(0.042, 16), glass, 0, 0.12, 0.145, 0, Math.PI, 0); // rear
    // Mounts
    this._addPart(new THREE.BoxGeometry(0.02, 0.05, 0.03), metal, 0, 0.095, -0.1);
    this._addPart(new THREE.BoxGeometry(0.02, 0.05, 0.03), metal, 0, 0.095, 0.06);

    // Muzzle anchor + flash (additive, hidden until firing).
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.005, -0.88);
    this.gun.add(this.muzzle);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), flashMat);
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    // --- Charge-up visuals (laser): a red glow at the nose that brightens as
    // it charges, plus crackling sparks once it's fully charged/ready. ---
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff2a18,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.chargeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), glowMat);
    this.chargeGlow.visible = false;
    this.chargeGlow.position.set(0, 0, -0.02);
    this.muzzle.add(this.chargeGlow);

    this.chargeLight = new THREE.PointLight(0xff2a18, 0, 1.6, 2);
    this.muzzle.add(this.chargeLight);

    // Sparks: red triangular spikes radiating out past the glow circle in a
    // ring around the nose — wide at the base, tapering to a point. Three
    // vertices (two base + apex) per spark.
    const SP = 18;
    const spPos = new Float32Array(SP * 3 * 3);
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const spMat = new THREE.MeshBasicMaterial({
      color: 0xff3320,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.chargeSparks = new THREE.Mesh(spGeo, spMat);
    this.chargeSparks.visible = false;
    this.chargeSparkCount = SP;
    this.muzzle.add(this.chargeSparks);
  }

  // Drive the muzzle charge glow + sparks from the weapon's charge ratio (0..1).
  setCharge(ratio) {
    if (ratio <= 0.001) {
      this.chargeGlow.visible = false;
      this.chargeSparks.visible = false;
      this.chargeLight.intensity = 0;
      return;
    }

    const t = performance.now() * 0.02;
    const pulse = 0.85 + Math.sin(t) * 0.15;

    this.chargeGlow.visible = true;
    this.chargeGlow.scale.setScalar((0.55 + ratio * 1.5) * pulse);
    this.chargeGlow.material.opacity = Math.min(1, 0.25 + ratio * 0.85);
    this.chargeLight.intensity = ratio * 3 * pulse;

    const ready = ratio >= 0.999;
    this.chargeSparks.visible = ready;
    if (ready) {
      // Flickering red triangular spikes radiating out in a ring around the
      // nose, each based at the glow's edge and tapering past it.
      const glowR = 0.05 * this.chargeGlow.scale.x; // current glow radius
      const inner = glowR * 0.9;
      const pos = this.chargeSparks.geometry.attributes.position;
      for (let i = 0; i < this.chargeSparkCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const px = -dy; // perpendicular, for the triangle base width
        const py = dx;
        const halfW = 0.013 + Math.random() * 0.012;
        const outer = glowR + 0.07 + Math.random() * 0.18; // tip past the circle
        const z = -0.02 + (Math.random() - 0.5) * 0.03;
        const j = i * 3;
        // Two base verts at the inner ring, apex at the outer tip.
        pos.setXYZ(j, dx * inner + px * halfW, dy * inner + py * halfW, z);
        pos.setXYZ(j + 1, dx * inner - px * halfW, dy * inner - py * halfW, z);
        pos.setXYZ(j + 2, dx * outer, dy * outer, z);
      }
      pos.needsUpdate = true;
      this.chargeGlow.material.opacity = 0.8 + Math.random() * 0.2;
    }
  }

  // Called when a shot is fired.
  kick() {
    this.kickBack = Math.min(0.06, this.kickBack + 0.035);
    this.kickUp = Math.min(0.05, this.kickUp + 0.028);
    this.flashTimer = 0.05;
    this.flash.visible = true;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.8);
    this.flash.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }

  update(dt, input, player) {
    // M toggles aim-down-sights for mouse-free play (edge-detected).
    const mDown = input.isDown('KeyM');
    if (mDown && !this._mPrev) this.scopeToggled = !this.scopeToggled;
    this._mPrev = mDown;

    // ADS progress: held right mouse OR the M toggle.
    const target = input.mouseRightDown || this.scopeToggled ? 1 : 0;
    this.ads += (target - this.ads) * Math.min(1, dt * 12);
    if (Math.abs(this.ads - target) < 0.001) this.ads = target;

    // Blend pose.
    this._pos.lerpVectors(this.hipPos, this.adsPos, this.ads);
    this._rot.set(
      THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, this.ads),
      THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, this.ads),
      THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, this.ads)
    );

    // Movement bob (muted while aiming).
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moveFrac = Math.min(speed / PLAYER.walkSpeed, 1);
    this.bobT += dt * (8 + speed * 0.8);
    const bobAmt = moveFrac * 0.014 * (1 - this.ads * 0.85);
    const bobX = Math.cos(this.bobT) * bobAmt;
    const bobY = Math.abs(Math.sin(this.bobT)) * bobAmt;

    // Look sway (muted while aiming) — eased toward the inverse of look delta.
    const swayScale = 0.00018 * (1 - this.ads * 0.7);
    const tgtSX = THREE.MathUtils.clamp(-player.lookDX * swayScale, -0.04, 0.04);
    const tgtSY = THREE.MathUtils.clamp(player.lookDY * swayScale, -0.04, 0.04);
    this.swayX += (tgtSX - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (tgtSY - this.swayY) * Math.min(1, dt * 8);

    // Recoil decay.
    const decay = Math.max(0, 1 - dt * 14);
    this.kickBack *= decay;
    this.kickUp *= decay;

    // Compose final transform.
    this.gun.position.set(
      this._pos.x + bobX + this.swayX,
      this._pos.y + bobY + this.swayY,
      this._pos.z + this.kickBack
    );
    this.gun.rotation.set(
      this._rot.x - this.kickUp + this.swayY * 0.5,
      this._rot.y - this.swayX * 0.6,
      this._rot.z
    );

    // Muzzle flash fade.
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.material.opacity = Math.max(0, this.flashTimer / 0.05);
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
  }

  setSize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
