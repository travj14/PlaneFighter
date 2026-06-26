import * as THREE from 'three';
import { ARENA } from '../config.js';

// Builds the battlefield: ground, sky, fog, lighting, natural-feeling
// boundaries, and a few cover/landmark structures. Also exposes the list of
// solid colliders (AABBs) the player is pushed out of.

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.half = ARENA.size / 2;

    // Axis-aligned solid boxes for player collision: {min:Vector3, max:Vector3}.
    this.colliders = [];

    // Meshes the weapon raycast can hit (cover + landmarks + targets).
    this.solids = [];

    this._buildSkyAndFog();
    this._buildLights();
    this._buildGround();
    this._buildBoundary();
    this._buildCover();
  }

  _buildSkyAndFog() {
    this.scene.background = new THREE.Color(ARENA.skyColor);
    this.scene.fog = new THREE.Fog(ARENA.fogColor, ARENA.fogNear, ARENA.fogFar);

    // Large gradient sky dome so the sky reads as deep when you look up.
    const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f6fb0) },
        bottom: { value: new THREE.Color(0xbcd2e6) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 top;
        uniform vec3 bottom;
        void main() {
          float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xcfe2f5, 0x4a5a44, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.15);
    sun.position.set(-120, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = this.half + 40;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.sun = sun;
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(ARENA.size, ARENA.size, 64, 64);
    geo.rotateX(-Math.PI / 2);

    // Gentle height variation so the ground isn't a dead-flat plane. Kept tiny
    // so movement/collision can still treat the field as effectively flat.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h =
        Math.sin(x * 0.03) * Math.cos(z * 0.027) * 0.8 +
        Math.sin(x * 0.011 + z * 0.013) * 1.2;
      pos.setY(i, h);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x5f6b43,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.ground = ground;

    // Distant lower terrain ring to imply a battlefield beyond the arena.
    const ringGeo = new THREE.RingGeometry(this.half, this.half + 1400, 64, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x55603e,
      roughness: 1,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -2;
    this.scene.add(ring);
  }

  _buildBoundary() {
    // A perimeter of hill mounds + occasional concrete barriers so the edge
    // feels like terrain rather than an invisible wall.
    const moundMat = new THREE.MeshStandardMaterial({
      color: 0x4d5836,
      roughness: 1,
    });
    const count = 56;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const r = this.half + 6 + Math.random() * 10;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const radius = 8 + Math.random() * 10;
      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        moundMat
      );
      mound.position.set(x, -1, z);
      mound.scale.y = 0.5 + Math.random() * 0.5;
      mound.castShadow = true;
      mound.receiveShadow = true;
      this.scene.add(mound);
    }
  }

  // Add a box-shaped solid: registers a collider AABB and a raycast target.
  _addBox(w, h, d, x, z, color, y = null) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    const baseY = y === null ? h / 2 : y;
    mesh.position.set(x, baseY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const min = new THREE.Vector3(x - w / 2, baseY - h / 2, z - d / 2);
    const max = new THREE.Vector3(x + w / 2, baseY + h / 2, z + d / 2);
    this.colliders.push({ min, max });
    this.solids.push(mesh);
    return mesh;
  }

  _buildCover() {
    // A handful of tactical landmarks: bunker blocks, ruined walls, crates.
    this._addBox(10, 4, 10, -40, -30, 0x6b6f63); // bunker
    this._addBox(3, 3, 14, 25, 35, 0x7a7468); // long wall
    this._addBox(14, 3, 3, 60, -10, 0x7a7468); // wall
    this._addBox(2.2, 2.2, 2.2, 8, 8, 0x8a6a3a); // crate
    this._addBox(2.2, 2.2, 2.2, 10.4, 8, 0x8a6a3a); // crate
    this._addBox(2.2, 2.2, 2.2, 9.2, 10.2, 0x8a6a3a); // crate
    this._addBox(6, 8, 6, -70, 60, 0x6b6f63); // tower-ish
    this._addBox(5, 2.5, 5, 70, 70, 0x6b6f63); // emplacement
  }

  // Sample approximate ground height at (x,z) using the same function as the
  // mesh displacement, so the player stands on the terrain.
  groundHeight(x, z) {
    return (
      Math.sin(x * 0.03) * Math.cos(z * 0.027) * 0.8 +
      Math.sin(x * 0.011 + z * 0.013) * 1.2
    );
  }
}
