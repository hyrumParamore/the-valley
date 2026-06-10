// Player — 8-directional movement with acceleration/friction, tile collision,
// a small carried light, and a hand-authored pixel sprite (hooded wanderer,
// blue cloak like the cover art).
TV.Player = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  speed: 105, accel: 850, friction: 700,
  facing: 'down',
  moving: false,
  animTime: 0,
  stepTimer: 0,
  sprites: {},

  HW: 5, HH: 4, // collision half-extents (feet box)

  init() {
    this.x = TV.World.SPAWN.x;
    this.y = TV.World.SPAWN.y;
    this._buildSprites();
  },

  _buildSprites() {
    const PAL = {
      h: '#46688c', H: '#37526e', c: '#3c5a86', C: '#2c4264',
      s: '#d8a878', b: '#262019', g: '#7ad0e8', p: '#6a4a2e',
    };
    const mk = rows => {
      const cv = document.createElement('canvas');
      cv.width = 14; cv.height = 17; // +1px margin for the outline
      const c = cv.getContext('2d');
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch !== '.') { c.fillStyle = PAL[ch]; c.fillRect(x + 1, y + 1, 1, 1); }
        }
      });
      // dark outline around the silhouette — reads crisply against any floor
      const id = c.getImageData(0, 0, 14, 17);
      const d = id.data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < 14 && y < 17 && d[(y * 14 + x) * 4 + 3] > 0;
      const oc = cv.getContext('2d');
      oc.fillStyle = '#0c0f18';
      for (let y = 0; y < 17; y++) {
        for (let x = 0; x < 14; x++) {
          if (solid(x, y)) continue;
          if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) {
            oc.fillRect(x, y, 1, 1);
          }
        }
      }
      return cv;
    };
    const down1 = [
      '....hhhh....',
      '...hhhhhh...',
      '...hHssHh...',
      '...hssssh...',
      '....ssss....',
      '...cccccc...',
      '..cccggccc..',
      '..cccccccc..',
      '..cCccccCc..',
      '..cCccccCc..',
      '...CccccC...',
      '...CccccC...',
      '...Cc..cC...',
      '...bb..bb...',
      '...bb..bb...',
      '............',
    ];
    const down2 = down1.slice(0, 12).concat(['...Cc..cC...', '....bb.bb...', '...bb...bb..', '............']);
    const up1 = [
      '....hhhh....',
      '...hhhhhh...',
      '...hhhhhh...',
      '...hhhhhh...',
      '....hhhh....',
      '...cccccc...',
      '..cccccccc..',
      '..ccpppccc..',
      '..cCpppcCc..',
      '..cCccccCc..',
      '...CccccC...',
      '...CccccC...',
      '...Cc..cC...',
      '...bb..bb...',
      '...bb..bb...',
      '............',
    ];
    const up2 = up1.slice(0, 12).concat(['...Cc..cC...', '....bb.bb...', '...bb...bb..', '............']);
    const side1 = [
      '....hhhh....',
      '...hhhhhh...',
      '...hhHss....',
      '...hhsss....',
      '....csss....',
      '...ccccc....',
      '...cgcccc...',
      '...cccccc...',
      '...Cccccc...',
      '...CccccC...',
      '...Cccccc...',
      '...Ccccc....',
      '....cc.c....',
      '....bb.b....',
      '....bbbb....',
      '............',
    ];
    const side2 = side1.slice(0, 12).concat(['....c.cc....', '....b.bb....', '...bb..bb...', '............']);
    this.sprites = {
      down: [mk(down1), mk(down2)],
      up: [mk(up1), mk(up2)],
      side: [mk(side1), mk(side2)],
    };
  },

  update(dt, input) {
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (ix && iy) { ix *= 0.7071; iy *= 0.7071; }
    this.moving = !!(ix || iy);

    if (this.moving) {
      this.vx += ix * this.accel * dt;
      this.vy += iy * this.accel * dt;
      if (Math.abs(ix) > Math.abs(iy)) this.facing = ix > 0 ? 'right' : 'left';
      else if (iy) this.facing = iy > 0 ? 'down' : 'up';
    } else {
      const f = this.friction * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp <= f) { this.vx = 0; this.vy = 0; }
      else { this.vx -= (this.vx / sp) * f; this.vy -= (this.vy / sp) * f; }
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > this.speed) { this.vx = (this.vx / sp) * this.speed; this.vy = (this.vy / sp) * this.speed; }

    this._move(this.vx * dt, 0);
    this._move(0, this.vy * dt);

    if (this.moving) {
      this.animTime += dt;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = 0.34; TV.Audio.step(); }
    } else {
      this.animTime = 0;
      this.stepTimer = 0;
    }
  },

  _move(dx, dy) {
    const nx = this.x + dx, ny = this.y + dy;
    if (!this._collides(nx, this.y)) this.x = nx;
    if (!this._collides(this.x, ny)) this.y = ny;
  },

  _collides(px, py) {
    const x0 = Math.floor((px - this.HW) / 16), x1 = Math.floor((px + this.HW) / 16);
    const y0 = Math.floor((py - this.HH) / 16), y1 = Math.floor((py + this.HH) / 16);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (TV.World.isSolid(tx, ty)) return true;
    return false;
  },

  draw(ctx) {
    const dir = (this.facing === 'left' || this.facing === 'right') ? 'side' : this.facing;
    const frame = this.moving ? (Math.floor(this.animTime / 0.16) % 2) : 0;
    const spr = this.sprites[dir][frame];
    const bob = this.moving ? -(Math.floor(this.animTime / 0.16) % 2) : 0;
    ctx.save();
    // soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(this.x) - 4, Math.round(this.y) + 1, 8, 3);
    if (this.facing === 'left') {
      ctx.translate(Math.round(this.x) + 7, Math.round(this.y) - 13 + bob);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, 0, 0);
    } else {
      ctx.drawImage(spr, Math.round(this.x) - 7, Math.round(this.y) - 13 + bob);
    }
    ctx.restore();
  },
};
