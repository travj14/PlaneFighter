import * as THREE from 'three';
import { Pool } from '../core/Pool.js';

// Pooled visual effects: bullet tracers and impact spark bursts. Cheap,
// allocation-free during play. Aircraft explosions will plug in here later.

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // --- Tracers: thin stretched lines that fade quickly. ---
    const tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    tracerGeo.translate(0, 0.5, 0); // pivot at base so we can scale length
    tracerGeo.rotateX(Math.PI / 2); // align along +Z
    this._tracerGeo = tracerGeo;

    this.tracers = new Pool(
      () => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffe08a,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(this._tracerGeo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        return { mesh, life: 0, maxLife: 0.06 };
      },
      (t) => {
        t.mesh.visible = false;
      }
    );

    // --- Impact sparks: a small Points burst. ---
    this.SPARKS = 12;
    this.sparks = new Pool(
      () => {
        const positions = new Float32Array(this.SPARKS * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          color: 0xffd27a,
          size: 0.25,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const points = new THREE.Points(geo, mat);
        points.visible = false;
        this.scene.add(points);
        return {
          points,
          velocities: new Array(this.SPARKS).fill(0).map(() => new THREE.Vector3()),
          origin: new THREE.Vector3(),
          life: 0,
          maxLife: 0.35,
        };
      },
      (s) => {
        s.points.visible = false;
      }
    );

    // --- Explosions: an additive sphere that expands and fades. ---
    this.explosions = new Pool(
      () => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff7a3a,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          mat
        );
        mesh.visible = false;
        this.scene.add(mesh);
        return { mesh, life: 0, maxLife: 0.4, radius: 1 };
      },
      (e) => {
        e.mesh.visible = false;
      }
    );
  }

  spawnTracer(from, to, color = 0xffe08a, thickness = 1) {
    const t = this.tracers.acquire();
    const dist = from.distanceTo(to);
    t.mesh.visible = true;
    t.mesh.material.color.set(color);
    t.mesh.material.opacity = 1;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(thickness, thickness, dist);
    t.life = 0;
  }

  spawnImpact(point, normal) {
    const s = this.sparks.acquire();
    s.points.visible = true;
    s.points.material.opacity = 1;
    s.origin.copy(point);
    const pos = s.points.geometry.attributes.position;
    const n = normal || new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.SPARKS; i++) {
      pos.setXYZ(i, point.x, point.y, point.z);
      // Spray roughly along the surface normal with scatter.
      const v = s.velocities[i];
      v.set(
        n.x + (Math.random() - 0.5) * 1.5,
        n.y + (Math.random() - 0.5) * 1.5,
        n.z + (Math.random() - 0.5) * 1.5
      )
        .normalize()
        .multiplyScalar(3 + Math.random() * 5);
    }
    pos.needsUpdate = true;
    s.points.position.set(0, 0, 0);
    s.life = 0;
  }

  spawnExplosion(point, radius = 4, color = 0xff7a3a) {
    const e = this.explosions.acquire();
    e.mesh.visible = true;
    e.mesh.material.color.set(color);
    e.mesh.material.opacity = 1;
    e.mesh.position.copy(point);
    e.mesh.scale.setScalar(0.1);
    e.radius = radius;
    e.life = 0;
    // A spark burst for extra punch.
    this.spawnImpact(point, new THREE.Vector3(0, 1, 0));
  }

  update(dt) {
    this.explosions.update(dt, (e) => {
      e.life += dt;
      const k = e.life / e.maxLife;
      e.mesh.scale.setScalar(0.1 + e.radius * k);
      e.mesh.material.opacity = Math.max(0, 1 - k);
      return e.life >= e.maxLife;
    });

    this.tracers.update(dt, (t) => {
      t.life += dt;
      const k = 1 - t.life / t.maxLife;
      t.mesh.material.opacity = Math.max(0, k);
      return t.life >= t.maxLife;
    });

    this.sparks.update(dt, (s) => {
      s.life += dt;
      const pos = s.points.geometry.attributes.position;
      for (let i = 0; i < this.SPARKS; i++) {
        const v = s.velocities[i];
        v.y -= 12 * dt; // gravity
        pos.setXYZ(
          i,
          pos.getX(i) + v.x * dt,
          pos.getY(i) + v.y * dt,
          pos.getZ(i) + v.z * dt
        );
      }
      pos.needsUpdate = true;
      s.points.material.opacity = Math.max(0, 1 - s.life / s.maxLife);
      return s.life >= s.maxLife;
    });
  }
}
