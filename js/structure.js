// The Ancient Structure — drawn as one large procedural sprite (368x288 px).
// Its facade has window banks that light up per restoration stage, an entrance
// that warms, and a crown that erupts in a waterfall cascade at stage 2.
TV.Structure = {
  W: 368, H: 288,
  base: null,

  // window groups in sprite-local px; lit when stage >= stage field
  windows: [],

  build() {
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H;
    const c = cv.getContext('2d');
    const r = TV.mulberry32(4242);

    const stoneDark = '#232838', stone = '#2c3246', stoneLite = '#3a4258';

    // main block
    c.fillStyle = stone;
    c.fillRect(8, 120, 352, 168);
    // broken parapet
    c.fillStyle = stoneLite;
    for (let x = 8; x < 360; x += 8) {
      const h = 4 + ((r() * 10) | 0);
      c.fillRect(x, 120 - h, 8, h);
    }
    // side wings shading
    c.fillStyle = stoneDark;
    c.fillRect(8, 120, 56, 168);
    c.fillRect(304, 120, 56, 168);

    // central tower
    c.fillStyle = stone; c.fillRect(128, 64, 112, 224);
    c.fillStyle = stoneLite; c.fillRect(128, 64, 112, 4);
    // dome
    c.fillStyle = '#39415e';
    for (let y = 0; y < 44; y++) {
      const hw = Math.floor(Math.sqrt(44 * 44 - (44 - y) * (44 - y)) * 1.27);
      c.fillRect(184 - hw, 20 + y, hw * 2, 1);
    }
    c.fillStyle = '#2c3450'; // dome ribs
    for (const dx of [-40, -20, 0, 20, 40]) c.fillRect(184 + dx, 24, 2, 38);
    c.fillStyle = '#4a547a'; c.fillRect(180, 12, 8, 10); // crown finial

    // columns along facade
    c.fillStyle = stoneLite;
    for (const x of [80, 112, 248, 280]) {
      c.fillRect(x, 136, 10, 152);
      c.fillStyle = stoneDark; c.fillRect(x + 8, 136, 2, 152); c.fillStyle = stoneLite;
      c.fillRect(x - 2, 130, 14, 6);
    }

    // entrance arch
    c.fillStyle = '#0b0e18';
    c.fillRect(168, 232, 32, 56);
    for (let y = 0; y < 16; y++) {
      const hw = Math.floor(Math.sqrt(16 * 16 - (16 - y) * (16 - y)));
      c.fillRect(184 - hw, 216 + y, hw * 2, 1);
    }
    c.fillStyle = '#4a547a';
    c.fillRect(162, 226, 4, 62); c.fillRect(202, 226, 4, 62);

    // window banks
    this.windows = [];
    const slot = (x, y, stage, cool) => {
      this.windows.push({ x, y, stage, cool });
      c.fillStyle = '#0a0d16';
      c.fillRect(x, y, 8, 14);
      c.fillRect(x + 2, y - 2, 4, 2);
    };
    for (const x of [32, 96, 264, 328]) slot(x, 240, 1, false);        // lower — stage 1, warm
    for (const x of [32, 96, 264, 328]) slot(x, 176, 2, true);         // mid wings — stage 2, cool
    for (const x of [148, 172, 196, 212]) slot(x, 140, 2, true);       // tower — stage 2
    slot(176, 84, 3, true); // dome oculus — stage 3

    // age: cracks and moss
    for (let i = 0; i < 60; i++) {
      c.fillStyle = r() < 0.5 ? '#1d2230' : '#262d40';
      c.fillRect((10 + r() * 348) | 0, (124 + r() * 158) | 0, 1 + ((r() * 3) | 0), 1);
    }
    for (let i = 0; i < 26; i++) {
      c.fillStyle = r() < 0.6 ? '#27483a' : '#1d3a2e';
      c.fillRect((10 + r() * 348) | 0, (200 + r() * 84) | 0, 2, 1 + ((r() * 2) | 0));
    }
    // faded relief band — environmental storytelling on the facade itself
    c.fillStyle = '#39415a';
    for (let x = 16; x < 352; x += 12) c.fillRect(x, 156, 6, 6);

    this.base = cv;
  },

  // worldX/worldY = sprite top-left in world px
  draw(ctx, wx, wy, stage, glow, time) {
    ctx.drawImage(this.base, wx, wy);

    // breathing pulse once awake
    const pulse = 0.7 + 0.3 * Math.sin(time * 1.4);

    for (const w of this.windows) {
      if (stage >= w.stage) {
        const a = Math.min(1, glow[w.stage] || 0);
        ctx.fillStyle = w.cool
          ? `rgba(140,216,255,${(0.75 + 0.25 * pulse) * a})`
          : `rgba(255,204,110,${(0.8 + 0.2 * pulse) * a})`;
        ctx.fillRect(wx + w.x + 1, wy + w.y + 1, 6, 12);
        ctx.fillRect(wx + w.x + 3, wy + w.y - 1, 2, 2);
      }
    }
    // entrance warm glow
    if (stage >= 1) {
      const a = Math.min(1, glow[1] || 0);
      const g = ctx.createLinearGradient(0, wy + 216, 0, wy + 288);
      g.addColorStop(0, `rgba(255,190,100,${0.10 * a * pulse})`);
      g.addColorStop(1, `rgba(255,190,100,${0.45 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(wx + 168, wy + 218, 32, 70);
    }
    // crown shimmer at stage 3
    if (stage >= 3) {
      const a = Math.min(1, glow[3] || 0);
      ctx.fillStyle = `rgba(190,235,255,${0.5 * a * pulse})`;
      ctx.fillRect(wx + 178, wy + 8, 12, 16);
    }
    // braziers flare on the column tops once fire returns (stage 4)
    if (stage >= 4) {
      const a = Math.min(1, glow[4] || 0);
      for (const x of [80, 112, 248, 280]) {
        const fl = 0.6 + 0.4 * Math.sin(time * 9 + x);
        ctx.fillStyle = `rgba(255,150,60,${0.9 * a * fl})`;
        ctx.fillRect(wx + x + 2, wy + 122 - 6 * fl, 6, 6 * fl + 2);
        ctx.fillStyle = `rgba(255,225,130,${0.8 * a * fl})`;
        ctx.fillRect(wx + x + 4, wy + 124 - 3 * fl, 2, 3 * fl);
      }
    }
  },

  // waterfall cascading down the tower face (stage >= 2), drawn additively
  drawCascade(ctx, wx, wy, time, strength) {
    if (strength <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cols = [-14, -7, 0, 7, 14];
    for (let i = 0; i < cols.length; i++) {
      const x = wx + 184 + cols[i];
      for (let y = 64; y < 280; y += 4) {
        const ph = (time * 140 + i * 31 + y * 0.7) % 28;
        const a = (ph < 9 ? 0.42 : 0.13) * strength;
        ctx.fillStyle = `rgba(110,210,250,${a})`;
        ctx.fillRect(x - 1, wy + y, 3, 4);
      }
    }
    // mist at the basin
    for (let i = 0; i < 6; i++) {
      const mx = wx + 184 + Math.sin(time * 2 + i * 2.2) * 16;
      const my = wy + 282 + Math.cos(time * 3 + i) * 3;
      ctx.fillStyle = `rgba(180,235,255,${0.10 * strength})`;
      ctx.fillRect(mx - 3, my - 2, 7, 4);
    }
    ctx.restore();
  },
};

// The Heartwood — a great dormant tree in the northwest grove. Waking it
// releases life essence, the third resource (green luminous particles).
TV.Heartwood = {
  W: 72, H: 96,
  base: null,
  veins: [],

  build() {
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H;
    const c = cv.getContext('2d');
    const r = TV.mulberry32(7117);

    // roots
    c.fillStyle = '#241c12';
    for (const [x, w] of [[4, 14], [22, 10], [44, 12], [58, 10]]) {
      c.fillRect(x, 88, w, 8);
    }
    // trunk — broad, ancient, slightly twisted
    for (let y = 30; y < 92; y++) {
      const sway = Math.sin(y * 0.09) * 3;
      const hw = 9 + (92 - y) * 0.12;
      c.fillStyle = y % 7 < 2 ? '#2c2216' : '#241c12';
      c.fillRect(36 + sway - hw, y, hw * 2, 1);
    }
    // bark texture
    for (let i = 0; i < 50; i++) {
      c.fillStyle = r() < 0.5 ? '#1a140c' : '#352a1a';
      c.fillRect((26 + r() * 20) | 0, (32 + r() * 56) | 0, 1, 2 + ((r() * 4) | 0));
    }
    // canopy — wide dark layers
    const layers = [[36, 26, 32], [36, 16, 24], [36, 8, 15]];
    for (const [cx, cy, rad] of layers) {
      for (let y = -rad; y <= rad * 0.8; y++) {
        const hw = Math.floor(Math.sqrt(Math.max(0, rad * rad - y * y)) * (0.85 + r() * 0.3));
        c.fillStyle = y < -rad / 3 ? '#1d3326' : (y < rad / 3 ? '#16281e' : '#101e16');
        c.fillRect(cx - hw, cy + y, hw * 2, 1);
      }
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = r() < 0.5 ? '#101e16' : '#22392c';
      c.fillRect((8 + r() * 56) | 0, (2 + r() * 40) | 0, 1, 1);
    }

    // glow veins traced up the trunk + canopy buds (lit when awakened)
    this.veins = [];
    let vy = 88;
    let vx = 36;
    while (vy > 34) {
      this.veins.push([vx | 0, vy]);
      vy -= 2;
      vx += (r() - 0.5) * 3 + Math.sin(vy * 0.09) * 0.35;
    }
    for (let i = 0; i < 14; i++) {
      this.veins.push([(14 + r() * 44) | 0, (6 + r() * 30) | 0]);
    }

    this.base = cv;
  },

  draw(ctx, wx, wy, awake, glow, time) {
    ctx.drawImage(this.base, wx, wy);
    if (!awake && glow <= 0) {
      // a single faint pulse — the tree is not dead, only sleeping
      const p = 0.25 + 0.2 * Math.sin(time * 1.1);
      ctx.fillStyle = `rgba(90,180,110,${p})`;
      ctx.fillRect(wx + 35, wy + 70, 2, 3);
      return;
    }
    const a = Math.min(1, glow);
    const pulse = 0.65 + 0.35 * Math.sin(time * 2.1);
    for (let i = 0; i < this.veins.length; i++) {
      const [vx, vy] = this.veins[i];
      const ph = 0.5 + 0.5 * Math.sin(time * 2.4 + i * 0.9);
      ctx.fillStyle = vy > 34
        ? `rgba(110,230,140,${(0.35 + 0.5 * ph) * a})`
        : `rgba(150,255,170,${(0.3 + 0.6 * ph) * a * pulse})`;
      ctx.fillRect(wx + vx, wy + vy, vy > 34 ? 2 : 2, 2);
    }
  },
};
