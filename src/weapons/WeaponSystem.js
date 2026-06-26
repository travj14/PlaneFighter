import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from '../config.js';

// Hitscan weapon handling: multiple weapons with independent ammo, switching,
// fire-rate gating, spread, recoil, reload (with auto-reload on empty), and
// raycasting against destructible entities + world solids. The laser adds an
// area-of-effect explosion on impact.

export class WeaponSystem {
  constructor({ camera, player, effects, hud }) {
    this.camera = camera;
    this.player = player;
    this.effects = effects;
    this.hud = hud;

    this.adsProgress = 0; // 0..1, set by the game each frame; tightens spread
    this.onShot = null; // callback fired on each shot (viewmodel kick / sfx)

    // Charge weapon state (laser): held to power up, fired on release.
    this.charging = false;
    this.chargeTime = 0;
    this.chargeRatio = 0; // 0..1, read by the viewmodel for the muzzle glow

    // Per-weapon state so each keeps its own ammo/reload.
    this.states = {};
    for (const key of WEAPON_ORDER) {
      const def = WEAPONS[key];
      this.states[key] = {
        key,
        def,
        mag: def.magSize,
        reserve: def.reserveAmmo,
        reloading: false,
        reloadTimer: 0,
        cooldown: 0,
      };
    }
    this.current = WEAPON_ORDER[0];
    this.locked = {}; // weaponKey -> true when not yet unlocked (wave mode)

    this.raycaster = new THREE.Raycaster();

    // Targets are anything destructible (test targets now, aircraft later) plus
    // world geometry that should stop bullets.
    this.destructibleMeshes = [];
    this.solidMeshes = [];

    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();

    this._refreshHud();
    this.hud?.setActiveWeapon(this.current);
  }

  get state() {
    return this.states[this.current];
  }

  get def() {
    return this.state.def;
  }

  setTargets(destructibleMeshes, solidMeshes) {
    this.destructibleMeshes = destructibleMeshes;
    this.solidMeshes = solidMeshes;
  }

  // Register/unregister a raycastable mesh (e.g. an aircraft hitbox) so it can
  // be shot. The mesh's userData.entity must expose takeDamage().
  addDestructible(mesh) {
    if (!this.destructibleMeshes.includes(mesh)) this.destructibleMeshes.push(mesh);
  }

  removeDestructible(mesh) {
    const i = this.destructibleMeshes.indexOf(mesh);
    if (i !== -1) this.destructibleMeshes.splice(i, 1);
  }

  switchWeapon(key) {
    if (!this.states[key] || key === this.current) return;
    if (this.locked[key]) return; // not unlocked yet
    this.current = key;
    this._cancelCharge();
    this._refreshHud();
    this.hud?.setActiveWeapon(key);
  }

  lockWeapon(key) {
    this.locked[key] = true;
    this.hud?.setWeaponLocked(key, true);
    if (this.current === key) this.switchWeapon(WEAPON_ORDER[0]);
  }

  unlockWeapon(key) {
    this.locked[key] = false;
    this.hud?.setWeaponLocked(key, false);
  }

  // Top up every weapon's magazine + reserve (mid-session resupply), leaving
  // locks, the current weapon, and any charge untouched.
  refillAmmo() {
    for (const key of WEAPON_ORDER) {
      const st = this.states[key];
      st.mag = st.def.magSize;
      st.reserve = st.def.reserveAmmo;
      st.reloading = false;
      st.reloadTimer = 0;
    }
    this._refreshHud();
  }

  // Refill all weapons, clear locks, and reset to the default weapon.
  reset() {
    for (const key of WEAPON_ORDER) {
      const st = this.states[key];
      st.mag = st.def.magSize;
      st.reserve = st.def.reserveAmmo;
      st.reloading = false;
      st.reloadTimer = 0;
      st.cooldown = 0;
      this.locked[key] = false;
      this.hud?.setWeaponLocked(key, false);
    }
    this._cancelCharge();
    this.current = WEAPON_ORDER[0];
    this._refreshHud();
    this.hud?.setActiveWeapon(this.current);
  }

  _cancelCharge() {
    this.charging = false;
    this.chargeTime = 0;
    this.chargeRatio = 0;
  }

  _refreshHud() {
    const st = this.state;
    this.hud?.setAmmo(st.mag, st.reserve, st.def.name);
    this.hud?.setWeaponNote(st.reloading ? 'Reloading…' : '');
  }

  startReload() {
    const st = this.state;
    if (st.reloading) return;
    if (st.mag >= st.def.magSize) return;
    if (st.reserve <= 0) return;
    st.reloading = true;
    st.reloadTimer = st.def.reloadTime;
    this._cancelCharge();
    this.hud?.setWeaponNote('Reloading…');
  }

  _finishReload(st) {
    const need = st.def.magSize - st.mag;
    const take = Math.min(need, st.reserve);
    st.mag += take;
    st.reserve -= take;
    st.reloading = false;
    if (st.key === this.current) {
      this.hud?.setWeaponNote('');
      this._refreshHud();
    }
  }

  // power: 0..1 charge level (1 for non-charge weapons).
  _fire(power = 1) {
    const st = this.state;
    const def = st.def;
    if (st.mag <= 0) {
      this.startReload();
      return;
    }
    st.mag--;
    st.cooldown = 1 / def.fireRate;
    this._refreshHud();

    // Derive shot values: charge weapons scale with `power`.
    const lerp = THREE.MathUtils.lerp;
    let damage = def.damage;
    let radius = def.explosionRadius;
    let thickness = def.beamThickness;
    let recoil = def.recoil;
    if (def.charge) {
      const c = def.charge;
      damage = lerp(c.minDamage, c.maxDamage, power);
      radius = lerp(c.minRadius, c.maxRadius, power);
      thickness = lerp(c.minThickness, c.maxThickness, power);
      recoil = lerp(def.recoil, c.recoilMax, power);
    }

    // Aim from the camera with a spread cone (tightened while aiming).
    this.camera.getWorldPosition(this._origin);
    this.camera.getWorldDirection(this._dir);
    const s = def.spread * (1 - 0.8 * this.adsProgress);
    this._dir.x += (Math.random() - 0.5) * 2 * s;
    this._dir.y += (Math.random() - 0.5) * 2 * s;
    this._dir.z += (Math.random() - 0.5) * 2 * s;
    this._dir.normalize();

    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = def.range;

    const candidates = this.destructibleMeshes.concat(this.solidMeshes);
    const hits = this.raycaster.intersectObjects(candidates, false);

    let endPoint;
    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point;
      const entity = hit.object.userData.entity;
      if (entity && typeof entity.takeDamage === 'function') {
        entity.takeDamage(damage, hit.point, hit.face?.normal);
      }
      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0);

      if (radius) {
        this.effects.spawnExplosion(endPoint, radius, def.beamColor);
        this._applyAreaDamage(endPoint, radius, damage, entity);
      } else {
        this.effects.spawnImpact(endPoint, normal);
      }
    } else {
      endPoint = this._origin.clone().addScaledVector(this._dir, def.range);
    }

    // Tracer / beam from just below the camera (muzzle-ish) to the impact.
    const muzzle = this._origin.clone();
    muzzle.addScaledVector(this._dir, 0.6);
    muzzle.y -= 0.15;
    this.effects.spawnTracer(muzzle, endPoint, def.beamColor, thickness);

    // Reduced visual/aim recoil while aiming down sights.
    this.player.addRecoil(recoil * (1 - 0.5 * this.adsProgress));

    if (this.onShot) this.onShot();
  }

  // Splash damage to destructibles near an impact point (excluding the one
  // already hit directly), with linear falloff.
  _applyAreaDamage(point, radius, damage, primary) {
    for (const mesh of this.destructibleMeshes) {
      const entity = mesh.userData.entity;
      if (!entity || entity === primary) continue;
      if (typeof entity.takeDamage !== 'function') continue;
      const d = mesh.getWorldPosition(this._tmp || (this._tmp = new THREE.Vector3()))
        .distanceTo(point);
      if (d <= radius) {
        const falloff = 1 - d / radius;
        entity.takeDamage(damage * 0.6 * falloff, point, null);
      }
    }
  }

  update(dt, input) {
    // Weapon switching (keys 1 / 2).
    if (input.isDown('Digit1')) this.switchWeapon('AR');
    if (input.isDown('Digit2')) this.switchWeapon('LASER');

    // Advance cooldown/reload for all weapons so they recover in the background.
    for (const key in this.states) {
      const st = this.states[key];
      if (st.cooldown > 0) st.cooldown -= dt;
      if (st.reloading) {
        st.reloadTimer -= dt;
        if (st.reloadTimer <= 0) this._finishReload(st);
      }
    }

    const st = this.state;
    if (st.reloading) return;

    if (input.isDown('KeyR')) {
      this.startReload();
      return;
    }

    // Fire on left mouse OR the N key (mouse-free alternate).
    const wantFire = input.mouseDown || input.isDown('KeyN');

    if (st.def.charge) {
      this._updateCharge(dt, st, wantFire);
      return;
    }

    if (wantFire && st.cooldown <= 0) {
      this._fire();
      // Auto-reload when the magazine runs dry (e.g. firing the last round).
      if (st.mag <= 0) this.startReload();
      if (!st.def.auto) input.mouseDown = false; // semi-auto: one per click
    }
  }

  // Charge-weapon firing: hold to build power, release to fire.
  _updateCharge(dt, st, wantFire) {
    const maxTime = st.def.charge.maxTime;

    if (wantFire) {
      if (st.mag <= 0) {
        this.startReload(); // nothing to charge with
        return;
      }
      // Begin charging only once the post-shot cooldown has elapsed.
      if (!this.charging && st.cooldown <= 0) {
        this.charging = true;
        this.chargeTime = 0;
      }
      if (this.charging) {
        this.chargeTime = Math.min(maxTime, this.chargeTime + dt);
        this.chargeRatio = this.chargeTime / maxTime;
      }
    } else if (this.charging) {
      // Released — fire a shot scaled by how long it was held.
      const power = this.chargeTime / maxTime;
      this.charging = false;
      this.chargeTime = 0;
      this.chargeRatio = 0;
      this._fire(power);
      if (st.mag <= 0) this.startReload();
    } else {
      this.chargeRatio = 0;
    }
  }
}
