// Player-centric rotating radar in the corner. The player sits fixed at the
// centre pointing up; everything else is drawn relative to the player's
// position and facing, so the whole map spins as you turn. Enemy aircraft are
// coloured by type (and clamped to the rim if out of range).

const COLORS = {
  normal: '#dfe6ee',
  jet: '#66e0ff',
  kamikaze: '#ff4d4d',
  bomber: '#ffae3a',
};

export class Minimap {
  constructor(canvas, arenaHalf) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width; // backing-store size (square)
    this.arenaHalf = arenaHalf;
    this.range = arenaHalf + 60; // world half-extent shown on the map
  }

  _scale() {
    return (this.size / 2 - 5) / this.range;
  }

  // World (x,z) -> canvas, transformed into player-local space: player at the
  // centre, the player's forward pointing up, right pointing right.
  _project(wx, wz, player) {
    const rx = wx - player.position.x;
    const rz = wz - player.position.z;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const right = rx * cos - rz * sin; // along the player's right axis
    const forward = -rx * sin - rz * cos; // along the player's forward axis
    const s = this._scale();
    return [this.size / 2 + right * s, this.size / 2 - forward * s];
  }

  update(player, aircraft) {
    const ctx = this.ctx;
    const S = this.size;
    const R = S / 2 - 1;

    ctx.clearRect(0, 0, S, S);

    // Clip to the round radar face.
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    ctx.clip();

    // Background.
    ctx.fillStyle = 'rgba(10, 14, 20, 0.6)';
    ctx.fillRect(0, 0, S, S);

    // Arena boundary (rotated into player space).
    const corners = [
      [-this.arenaHalf, -this.arenaHalf],
      [this.arenaHalf, -this.arenaHalf],
      [this.arenaHalf, this.arenaHalf],
      [-this.arenaHalf, this.arenaHalf],
    ];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach(([x, z], i) => {
      const [px, py] = this._project(x, z, player);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    // Fixed centre crosshairs (player's own axes).
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(S / 2, 0);
    ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2);
    ctx.lineTo(S, S / 2);
    ctx.stroke();

    // Enemy aircraft.
    for (const a of aircraft) {
      let [px, py] = this._project(a.position.x, a.position.z, player);
      const dx = px - S / 2;
      const dy = py - S / 2;
      const d = Math.hypot(dx, dy);
      const lim = R - 4;
      if (d > lim) {
        px = S / 2 + (dx / d) * lim;
        py = S / 2 + (dy / d) * lim;
      }
      ctx.fillStyle = COLORS[a.kind] || '#fff';
      const r = a.kind === 'bomber' ? 3.6 : 2.6;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow — fixed at centre, always pointing up.
    const cx = S / 2;
    const cy = S / 2;
    const len = 8;
    const wid = 5;
    ctx.fillStyle = '#b6ff4d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - len); // tip (up)
    ctx.lineTo(cx + wid, cy + len * 0.6);
    ctx.lineTo(cx - wid, cy + len * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Radar rim.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    ctx.stroke();
  }
}
