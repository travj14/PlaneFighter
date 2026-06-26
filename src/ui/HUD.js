// Thin DOM wrapper over the HUD markup in index.html. Keeps all element lookups
// in one place so game systems just call semantic setters.

export class HUD {
  constructor() {
    this.waveValue = document.getElementById('wave-value');
    this.scoreValue = document.getElementById('score-value');
    this.healthBar = document.getElementById('health-bar');
    this.ammoMag = document.getElementById('ammo-mag');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.weaponName = document.getElementById('weapon-name');
    this.centerMsg = document.getElementById('center-msg');
    this.damageFlash = document.getElementById('damage-flash');
    this.reticle = document.getElementById('reticle');

    this.weaponSlots = Array.from(document.querySelectorAll('.weapon-slot'));
    this.onSelectWeapon = null; // callback(weaponKey) — set by the game
    for (const slot of this.weaponSlots) {
      slot.addEventListener('click', () => {
        this.onSelectWeapon?.(slot.dataset.weapon);
      });
    }

    this._msgTimer = null;
  }

  // Highlight the active weapon in the bottom bar.
  setActiveWeapon(key) {
    for (const slot of this.weaponSlots) {
      slot.classList.toggle('active', slot.dataset.weapon === key);
    }
  }

  // Grey out a weapon slot that isn't unlocked yet.
  setWeaponLocked(key, locked) {
    const slot = this.weaponSlots.find((s) => s.dataset.weapon === key);
    if (slot) slot.classList.toggle('locked', locked);
  }

  setHealth(current, max) {
    const pct = Math.max(0, Math.min(1, current / max));
    this.healthBar.style.width = `${pct * 100}%`;
    // Shift colour from green → red as health drops.
    const hue = pct * 120;
    this.healthBar.style.background = `linear-gradient(90deg, hsl(${hue} 80% 50%), hsl(${hue + 25} 80% 55%))`;
  }

  setAmmo(mag, reserve, weaponName) {
    this.ammoMag.textContent = mag;
    this.ammoReserve.textContent = reserve;
    if (weaponName) this.weaponName.textContent = weaponName;
  }

  setWeaponNote(note) {
    // Append a transient note (e.g. "Reloading…") after the weapon name.
    const base = this.weaponName.dataset.base || this.weaponName.textContent;
    this.weaponName.dataset.base = base;
    this.weaponName.textContent = note ? `${base} — ${note}` : base;
  }

  setWave(n) {
    this.waveValue.textContent = n;
  }

  setScore(n) {
    this.scoreValue.textContent = n;
  }

  // Fade the hip-fire reticle out as the player aims down sights.
  setReticleOpacity(o) {
    this.reticle.style.opacity = o;
  }

  flashDamage() {
    this.damageFlash.style.opacity = '1';
    setTimeout(() => (this.damageFlash.style.opacity = '0'), 90);
  }

  showMessage(main, sub = '', holdMs = 1800) {
    this.centerMsg.innerHTML = sub
      ? `${main}<span class="sub">${sub}</span>`
      : main;
    this.centerMsg.style.opacity = '1';
    if (this._msgTimer) clearTimeout(this._msgTimer);
    if (holdMs > 0) {
      this._msgTimer = setTimeout(() => {
        this.centerMsg.style.opacity = '0';
      }, holdMs);
    }
  }

  hideMessage() {
    this.centerMsg.style.opacity = '0';
  }
}
