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
