import * as THREE from 'three';
import { NormalPlane } from './NormalPlane.js';

// Jet: a fast, agile interceptor that swoops in with the same strafing-run
// pattern as the fighter, but much quicker, more fragile, and with a weaker
// gun. Distinct sleek delta silhouette with an afterburner glow.

export class Jet extends NormalPlane {
  _setup() {
    this.health = this.maxHealth = 28;
    this.score = 120;
    this.gunDamage = 3; // less than the fighter's 6
    this.gunColor = 0x66e0ff;
    this.speed = 74 + Math.random() * 16; // much faster than the fighter
    this.turnRate = 1.05 + Math.random() * 0.35; // a touch more agile
    this.maxAge = 120;
    this.fireTimer = 0.7 + Math.random() * 0.9;
    this._buildJetModel();
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

    // Slim fuselage + pointed nose (nose toward +Z).
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, len, 12), body);
    fus.rotation.x = Math.PI / 2;
    fus.castShadow = true;
    this.group.add(fus);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 12), body);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = len / 2 + 0.7;
    this.group.add(nose);

    // Swept delta wings (a flat triangle each side).
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

    // Tail fin.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.9), wing);
    fin.position.set(0, 0.45, -len / 2 + 0.4);
    this.group.add(fin);

    // Canopy.
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x16242e, metalness: 0.3, roughness: 0.2 })
    );
    canopy.position.set(0, 0.26, 1.0);
    canopy.scale.set(1, 0.6, 2);
    this.group.add(canopy);

    // Afterburner glow trailing behind.
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
    burner.rotation.x = -Math.PI / 2; // apex points -Z (backwards)
    burner.position.z = -len / 2 - 0.4;
    this.group.add(burner);

    this._buildHitbox(5.5, 1.2, len * 1.1);
  }
}
