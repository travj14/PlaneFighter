import * as THREE from 'three';
import { NormalPlane } from './NormalPlane.js';

// Jet: a fast interceptor that hunts like a shark. It circles the player out
// wide, then darts in fast and low along the ground, breaking off to the side
// before reaching point-blank range (so it never offers an easy close shot),
// and swings back out to circle again. Fragile, fast, weak gun.
//
// Reuses NormalPlane's _steer() / _maybeShoot() / model helpers but overrides
// spawn() and _behavior() with the circle → strafe → break loop.

export class Jet extends NormalPlane {
  _setup() {
    this.kind = 'jet';
    this.health = this.maxHealth = 28;
    this.score = 120;
    this.gunDamage = 3;
    this.gunColor = 0x66e0ff;
    this.maxAge = 120;

    // Shark-attack parameters.
    this.state = 'circle';
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.circleRadius = 165 + Math.random() * 45; // circle out wide from the player
    this.circleAlt = 55 + Math.random() * 25; // stays high while circling out wide
    this.lowAlt = 6 + Math.random() * 6; // hugs the ground on the run
    this.breakDistance = 28 + Math.random() * 14; // peel off before point-blank
    this.circleSpeed = 50 + Math.random() * 8;
    this.strafeSpeed = 94 + Math.random() * 16; // speed boost on the attack run
    this.circleTurn = 0.9;
    this.diveTurn = 2.6; // sharp turn in to line the nose up on the player
    this.runTurn = 1.8; // track the player on the straight run
    this.breakTurn = 2.4; // sharp swerve out
    this.circleTimer = 2 + Math.random() * 2.5;
    this.breakSide = 1;
    this.fireTimer = 0.6 + Math.random() * 0.8;

    this.speed = this.circleSpeed;
    this.turnRate = this.circleTurn;

    this._buildJetModel();
  }

  spawn(arena, player) {
    this._edgeSpawn(arena, this.circleAlt);
    this.arena = arena;
    const to = player.position.clone().sub(this.position);
    to.y = 0;
    to.normalize();
    this.velocity.copy(to).multiplyScalar(this.circleSpeed);
  }

  _behavior(dt, ctx) {
    const p = ctx.player.position;
    const radial = new THREE.Vector3(this.position.x - p.x, 0, this.position.z - p.z);
    const distH = radial.length();
    if (distH < 1) radial.set(1, 0, 0);
    const gHere = ctx.arena.groundHeight(this.position.x, this.position.z);
    const gPlayer = ctx.arena.groundHeight(p.x, p.z);
    const toPlayer = new THREE.Vector3().subVectors(p, this.position);

    if (this.state === 'circle') {
      // Big loop: orbit the player out wide.
      this.speed = this.circleSpeed;
      this.turnRate = this.circleTurn;
      const ang = Math.atan2(radial.z, radial.x) + this.circleDir * 0.5;
      const wp = new THREE.Vector3(
        p.x + Math.cos(ang) * this.circleRadius,
        this.circleAlt,
        p.z + Math.sin(ang) * this.circleRadius
      );
      this._steer(dt, wp.sub(this.position).normalize());
      this.targetRoll = this.circleDir * 0.5;

      this.circleTimer -= dt;
      if (this.circleTimer <= 0) {
        this.state = 'dive';
        this.fireTimer = 0.12;
      }
    } else if (this.state === 'dive') {
      // Sharp turn in toward the player while dropping low — lining up the nose.
      this.speed = this.strafeSpeed;
      this.turnRate = this.diveTurn;
      const aim = new THREE.Vector3(p.x, gPlayer + this.lowAlt, p.z);
      this._steer(dt, aim.sub(this.position).normalize());
      // Fire as soon as we're lined up (the burst is gated to a 35° cone).
      this._rapidFire(dt, ctx, toPlayer.clone());

      const facing = this.velocity.clone().normalize().dot(toPlayer.clone().normalize());
      if (distH < this.breakDistance) {
        this._startBreak();
      } else if (facing > Math.cos((30 * Math.PI) / 180)) {
        // Lined up — commit to the straight firing run.
        this.state = 'run';
      }
    } else if (this.state === 'run') {
      // Straight, low run aimed directly at the player; spray when on target.
      this.speed = this.strafeSpeed;
      this.turnRate = this.runTurn;
      const aim = new THREE.Vector3(p.x, Math.max(p.y, gPlayer + 2), p.z);
      this._steer(dt, aim.sub(this.position).normalize());
      this._rapidFire(dt, ctx, toPlayer.clone());

      const passed = this.velocity.dot(toPlayer) < 0;
      if (distH < this.breakDistance || passed) this._startBreak();
    } else {
      // Break: swerve out to the side and climb back toward circling altitude.
      this.speed = this.strafeSpeed;
      this.turnRate = this.breakTurn;
      const away = radial.clone().normalize(); // player -> plane (outward)
      const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(this.breakSide);
      const dir = away.multiplyScalar(0.6).add(side);
      const wp = new THREE.Vector3(
        this.position.x + dir.x * 40,
        this.circleAlt,
        this.position.z + dir.z * 40
      );
      this._steer(dt, wp.sub(this.position).normalize());
      this.targetRoll = this.breakSide * 0.7;

      if (distH > this.circleRadius * 0.8) {
        this.state = 'circle';
        this.circleDir = Math.random() < 0.5 ? 1 : -1;
        this.circleTimer = 2 + Math.random() * 2.5;
      }
    }

    // Never plow into the ground on the low pass.
    if (this.position.y < gHere + 3.5) {
      this.velocity.y = Math.max(this.velocity.y, this.speed * 0.3);
    }
  }

  _startBreak() {
    this.breakSide = Math.random() < 0.5 ? 1 : -1;
    this.state = 'break';
  }

  // Rapid burst fired during the attack run (much faster than the base gun).
  _rapidFire(dt, ctx, toPlayer) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    this.fireTimer = 0.1; // ~10 rounds/sec

    const dist = toPlayer.length();
    if (dist > 240) return;
    // Only fire when the player is within 35° of the jet's heading.
    const fwd = this.velocity.clone().normalize();
    const aimCos = Math.cos((35 * Math.PI) / 180); // ~0.819
    if (fwd.dot(toPlayer.clone().normalize()) < aimCos) return;

    const dir = toPlayer.clone().normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.normalize();
    ctx.spawnProjectile({
      type: 'bullet',
      position: this.position.clone(),
      velocity: dir.multiplyScalar(170),
      damage: this.gunDamage,
      color: this.gunColor,
    });
  }

  _buildJetModel() {
    const len = 7;
    const body = this._registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x33405c, metalness: 0.6, roughness: 0.4 })
    );
    const wing = this._registerMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x232c40,
        metalness: 0.5,
        roughness: 0.5,
        side: THREE.DoubleSide,
      })
    );
    this.bodyMat = body;
    this.wingMat = wing;

    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, len, 12), body);
    fus.rotation.x = Math.PI / 2;
    fus.castShadow = true;
    this.group.add(fus);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 12), body);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = len / 2 + 0.7;
    this.group.add(nose);

    const deltaWing = (sign) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([0, 0, 1.4, 0, 0, -1.6, sign * 3.2, 0, -1.2]),
          3
        )
      );
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, wing);
      m.position.z = -0.4;
      m.castShadow = true;
      return m;
    };
    this.group.add(deltaWing(1));
    this.group.add(deltaWing(-1));

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.9), wing);
    fin.position.set(0, 0.45, -len / 2 + 0.4);
    this.group.add(fin);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x16242e, metalness: 0.3, roughness: 0.2 })
    );
    canopy.position.set(0, 0.26, 1.0);
    canopy.scale.set(1, 0.6, 2);
    this.group.add(canopy);

    const burner = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.9, 10),
      new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    burner.rotation.x = -Math.PI / 2;
    burner.position.z = -len / 2 - 0.4;
    this.group.add(burner);

    this._buildHitbox(5.5, 1.2, len * 1.1);
  }
}
