import * as THREE from 'three';
import { Input } from './Input.js';
import { Arena } from '../world/Arena.js';
import { Targets } from '../world/Targets.js';
import { Player } from '../player/Player.js';
import { Effects } from '../fx/Effects.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { Scope } from '../weapons/Scope.js';
import { AircraftManager } from '../enemies/AircraftManager.js';
import { WaveDirector } from '../enemies/WaveDirector.js';
import { Minimap } from '../ui/Minimap.js';
import { HUD } from '../ui/HUD.js';

// Owns the renderer, scene, camera, the core systems, and the main loop.
// This slice focuses on world + shooting; the wave director and aircraft will
// hang off this same structure later.

export class Game {
  constructor(container) {
    this.container = container;

    // --- renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // We render in multiple passes (world, viewmodel, scope overlay), so manage
    // buffer clearing manually.
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    // --- scene / camera ---
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      78,
      window.innerWidth / window.innerHeight,
      0.1,
      3000
    );

    // --- input (locks the canvas) ---
    this.input = new Input(this.renderer.domElement);

    // --- systems ---
    this.hud = new HUD();
    this.arena = new Arena(this.scene);
    this.targets = new Targets(this.scene);
    this.player = new Player(this.camera, this.arena, this.input);
    this.effects = new Effects(this.scene);
    this.weapons = new WeaponSystem({
      camera: this.camera,
      player: this.player,
      effects: this.effects,
      hud: this.hud,
    });
    this.weapons.setTargets(this.targets.meshes, this.arena.solids);

    // Gun viewmodel + see-through scope.
    this.viewModel = new ViewModel();
    this.scope = new Scope(this.camera);
    this.weapons.onShot = () => this.viewModel.kick();

    // Clicking a slot in the weapon bar (when the cursor is free) switches.
    this.hud.onSelectWeapon = (key) => this.weapons.switchWeapon(key);

    // Enemy aircraft + their projectiles.
    this.aircraftManager = new AircraftManager({
      scene: this.scene,
      effects: this.effects,
      weapons: this.weapons,
      player: this.player,
      hud: this.hud,
      arena: this.arena,
      input: this.input,
      onScore: (pts) => {
        this.score += pts;
        this.hud.setScore(this.score);
      },
    });

    this.waveDirector = new WaveDirector({
      manager: this.aircraftManager,
      hud: this.hud,
      weapons: this.weapons,
      onWin: () => this._onWin(),
    });

    this.minimap = new Minimap(document.getElementById('minimap'), this.arena.half);

    // Session state. A session starts when a mode is chosen on the home screen.
    this.mode = 'sandbox';
    this.started = false;
    this.onGameEnd = null; // (result) => void — set by main for the home screen

    // Score bump when a practice target is destroyed (placeholder scoring).
    this.score = 0;
    for (const t of this.targets.list) {
      t.onDeath = () => {
        this.score += 10;
        this.hud.setScore(this.score);
      };
    }

    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setWave(1);
    this.hud.setScore(0);

    this.clock = new THREE.Clock();
    this.running = false;
    this.time = 0;

    this.player.onDeath = () => this._onPlayerDeath();

    this._bindWindow();
  }

  _bindWindow() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.viewModel.setSize(w, h);
      this.scope.setSize(w, h);
    });
  }

  setSensitivity(multiplier) {
    this.player.sensMultiplier = multiplier;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running = true;
  }

  // Begin a fresh session in the given mode ('wave' | 'sandbox').
  startSession(mode) {
    this.mode = mode;
    this.started = true;

    this.score = 0;
    this.hud.setScore(0);
    this.hud.hideMessage();

    this.player.reset();
    this.hud.setHealth(this.player.health, this.player.maxHealth);

    this.aircraftManager.reset();
    this.aircraftManager.setMode(mode);
    this.weapons.reset();

    if (mode === 'wave') {
      this.weapons.lockWeapon('LASER');
      this.waveDirector.start();
    } else {
      this.waveDirector.stop();
      this.hud.setWave('—');
      this.hud.showMessage(
        'SANDBOX',
        'Summon: Z fighter · V jet · X kamikaze · C bomber',
        2600
      );
    }
  }

  _endSession(result) {
    if (!this.started) return;
    this.started = false;
    this.waveDirector.stop();
    if (this.onGameEnd) this.onGameEnd(result);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _onPlayerDeath() {
    this._endSession({ type: 'lose' });
  }

  _onWin() {
    this._endSession({ type: 'win' });
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05); // clamp huge frame gaps

    if (this.running && this.input.locked) {
      this.time += dt;

      // Viewmodel first so its ADS value drives sensitivity + spread this frame.
      this.viewModel.update(dt, this.input, this.player);
      const ads = this.viewModel.ads;
      this.player.lookScale = THREE.MathUtils.lerp(1, 0.45, ads);
      this.weapons.adsProgress = ads;

      this.player.update(dt);
      this.weapons.update(dt, this.input);
      this.viewModel.setCharge(this.weapons.chargeRatio); // muzzle glow/sparks
      this.targets.update(dt, this.time);
      this.aircraftManager.update(dt, this.time);
      this.waveDirector.update(dt);
      this.effects.update(dt);
      this.minimap.update(this.player, this.aircraftManager.aircraft);

      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setReticleOpacity(1 - ads);
    }

    this._render();
  }

  _render() {
    const r = this.renderer;
    const ads = this.viewModel.ads;
    const scopeActive = ads > 0.002;

    // Pre-pass: render the magnified world into the scope's render target.
    if (scopeActive) {
      const isLaser = this.weapons.current === 'LASER';
      this.scope.update(ads, this.camera, this.weapons.chargeRatio, isLaser);
      this.scope.renderRT(r, this.scene);
    }

    // Pass 1: world.
    r.clear();
    r.render(this.scene, this.camera);

    // Pass 2: weapon viewmodel, drawn over the world.
    r.clearDepth();
    r.render(this.viewModel.scene, this.viewModel.camera);

    // Pass 3: scope overlay (the see-through optic + blackout + crosshair).
    if (scopeActive) {
      r.clearDepth();
      r.render(this.scope.overlayScene, this.scope.overlayCamera);
    }
  }
}
