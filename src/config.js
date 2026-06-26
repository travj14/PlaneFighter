// Central tuning values for the vertical slice. Keep gameplay numbers here so
// balancing doesn't require hunting through systems.

export const ARENA = {
  size: 400, // playable square, metres (±size/2 from origin)
  groundY: 0,
  fogColor: 0xb8c6d6,
  fogNear: 120,
  fogFar: 900,
  skyColor: 0x9fc4e8,
};

export const PLAYER = {
  height: 1.7, // eye height, metres
  radius: 0.4, // collision radius
  walkSpeed: 7,
  sprintSpeed: 12,
  acceleration: 60, // m/s^2 toward target velocity
  damping: 12, // ground friction
  jumpSpeed: 7,
  gravity: 22,
  maxHealth: 100,
  lookSensitivity: 0.0022,
  pitchLimit: Math.PI / 2 - 0.02, // ~89° so you can aim nearly straight up
};

export const WEAPONS = {
  AR: {
    name: 'AR',
    damage: 18,
    fireRate: 9, // rounds per second
    auto: true,
    magSize: 30,
    reserveAmmo: 180,
    reloadTime: 1.8,
    spread: 0.012, // radians at hip; cone half-angle
    range: 1200,
    recoil: 0.012, // radians of upward camera kick per shot
    beamColor: 0xffe08a,
    beamThickness: 1,
  },
  LASER: {
    name: 'Laser',
    fireRate: 4, // cap on shots/sec after a release
    auto: true,
    magSize: 12,
    reserveAmmo: 60,
    reloadTime: 2.2,
    spread: 0.004,
    range: 1600,
    recoil: 0.02,
    beamColor: 0xff4444,
    // Charge weapon: hold to power up, release to fire. A quick tap is weak;
    // a full charge is much stronger with a bigger blast and thicker beam.
    charge: {
      maxTime: 1.4, // seconds to reach full charge
      minDamage: 20,
      maxDamage: 110,
      minRadius: 1.5,
      maxRadius: 10,
      minThickness: 1.5,
      maxThickness: 6,
      recoilMax: 0.04,
    },
  },
};

// Weapon selection order for the sandbox weapon bar.
export const WEAPON_ORDER = ['AR', 'LASER'];
