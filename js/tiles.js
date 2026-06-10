// Procedural pixel-art tileset — no image assets, every tile is drawn in code.
// 16px tiles, several seeded variants each; water/channel tiles get 3 animation frames.
TV.TILE = 16;

TV.T = {
  GRASS: 0, PATH: 1, PLAZA: 2, CLIFF: 3, RUIN: 4,
  WATER: 5, CHAN: 6, CHAN_F: 7, BASIN: 8, BASIN_F: 9, FLOWERS: 10,
  CINDER: 11,
};

TV.SOLID = new Set([TV.T.CLIFF, TV.T.RUIN, TV.T.WATER]);

// deterministic rng so the world looks the same every run
TV.mulberry32 = function (a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

TV.Tiles = {
  atlas: {},      // id -> [canvas variants]  (animated ids -> [frame][variant])
  warmGrass: [],  // warm variants of GRASS
  warmTrees: [],
  trees: [],

  build() {
    const T = TV.T;
    this.atlas[T.GRASS] = this._variants(4, (c, r) => this._grass(c, r, '#1a212e', ['#141a26', '#222c3c', '#1f2836'], '#2a564a', 0.05));
    this.warmGrass = this._variants(4, (c, r) => this._grass(c, r, '#2a4226', ['#1f3419', '#37542c', '#2f4a24'], '#dcb45c', 0.04));
    this.atlas[T.PATH] = this._variants(4, (c, r) => this._speckle(c, r, '#3a3022', ['#473b2c', '#2c2418', '#52462f'], 16));
    this.atlas[T.PLAZA] = this._variants(4, (c, r) => this._plaza(c, r));
    this.atlas[T.CLIFF] = this._variants(4, (c, r) => this._cliff(c, r));
    this.atlas[T.RUIN] = this._variants(2, (c, r) => this._speckle(c, r, '#262b3a', ['#1f2430', '#2e3444'], 10));
    this.atlas[T.WATER] = this._frames(3, (c, r, f) => this._water(c, r, f, '#0a1c30', '#16405c', '#5ad0ee', 0.04));
    this.atlas[T.CHAN] = this._variants(2, (c, r) => this._channel(c, r, false, 0));
    this.atlas[T.CHAN_F] = this._frames(3, (c, r, f) => this._channel(c, r, true, f));
    this.atlas[T.BASIN] = this._variants(1, (c, r) => this._basin(c, r, false, 0));
    this.atlas[T.BASIN_F] = this._frames(3, (c, r, f) => this._basin(c, r, true, f));
    this.atlas[T.FLOWERS] = this._variants(4, (c, r) => {
      this._grass(c, r, '#2a4226', ['#1f3419', '#37542c'], '#dcb45c', 0);
      const cols = ['#e8c060', '#d870a0', '#7ad0e8', '#f0e8c8'];
      for (let i = 0; i < 3; i++) {
        c.fillStyle = cols[(r() * cols.length) | 0];
        c.fillRect((1 + r() * 14) | 0, (1 + r() * 14) | 0, 1, 1);
      }
    });
    this.atlas[T.CINDER] = this._variants(4, (c, r) => {
      this._speckle(c, r, '#16110d', ['#211913', '#0d0a07', '#2a2018'], 14);
      if (r() < 0.35) { c.fillStyle = '#7a2c16'; c.fillRect((2 + r() * 12) | 0, (2 + r() * 12) | 0, 1, 1); }
    });
    // fire conduits — laid by the player, basalt groove carrying embers
    this.conduit = this._variants(2, (c, r) => this._conduit(c, r, false, 0));
    this.conduitFire = this._frames(3, (c, r, f) => this._conduit(c, r, true, f));
    this.trees = [this._tree(1, false), this._tree(2, false), this._tree(3, false)];
    this.warmTrees = [this._tree(1, true), this._tree(2, true), this._tree(3, true)];
  },

  _conduit(c, r, lit, f) {
    c.fillStyle = '#2e2620'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#41362c'; c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1);
    c.fillStyle = '#171210'; c.fillRect(1, 3, 14, 10);
    if (lit) {
      c.fillStyle = '#b8401a'; c.fillRect(2, 4, 12, 8);
      c.fillStyle = '#ff9c3a';
      for (let i = 0; i < 3; i++) {
        const x = ((i * 5 + f * 2) % 11) + 2;
        c.fillRect(x, 5 + i * 2, 3, 1);
      }
      c.fillStyle = '#ffe08a';
      c.fillRect(((f * 7 + 4) % 12) + 2, 4 + ((f * 3) % 7), 1, 1);
    } else {
      c.fillStyle = '#0d0a08';
      for (let i = 0; i < 4; i++) c.fillRect((2 + r() * 11) | 0, (4 + r() * 7) | 0, 2, 1);
    }
  },

  _canvas(w = 16, h = 16) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  },

  _variants(n, draw) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const cv = this._canvas();
      draw(cv.getContext('2d'), TV.mulberry32(1000 + i * 77));
      out.push(cv);
    }
    return out;
  },

  _frames(nf, draw) {
    const out = [];
    for (let f = 0; f < nf; f++) {
      const cv = this._canvas();
      draw(cv.getContext('2d'), TV.mulberry32(500 + f * 13), f);
      out.push(cv);
    }
    return out; // animated: [frame] (single variant)
  },

  _grass(c, r, base, blades, sproutCol, sproutChance) {
    c.fillStyle = base; c.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 14; i++) {
      c.fillStyle = blades[(r() * blades.length) | 0];
      c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1 + ((r() * 2) | 0));
    }
    if (r() < sproutChance * 4) {
      c.fillStyle = sproutCol;
      const x = (2 + r() * 12) | 0, y = (2 + r() * 12) | 0;
      c.fillRect(x, y, 1, 2); c.fillRect(x - 1, y, 1, 1); c.fillRect(x + 1, y, 1, 1);
    }
  },

  _speckle(c, r, base, cols, n) {
    c.fillStyle = base; c.fillRect(0, 0, 16, 16);
    for (let i = 0; i < n; i++) {
      c.fillStyle = cols[(r() * cols.length) | 0];
      c.fillRect((r() * 15) | 0, (r() * 15) | 0, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0));
    }
  },

  _plaza(c, r) {
    c.fillStyle = '#333b4b'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#272e3d';
    c.fillRect(0, 0, 16, 1); c.fillRect(0, 8, 16, 1);
    c.fillRect(0, 0, 1, 16); c.fillRect(8, ((r() < .5) ? 0 : 8), 1, 8);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = r() < .5 ? '#3b4456' : '#2c3343';
      c.fillRect((r() * 15) | 0, (r() * 15) | 0, 1, 1);
    }
    if (r() < 0.3) { // crack
      c.fillStyle = '#222837';
      let x = (r() * 12 + 2) | 0, y = 2;
      for (let i = 0; i < 5; i++) { c.fillRect(x, y, 1, 2); x += r() < .5 ? 1 : -1; y += 2; }
    }
    if (r() < 0.25) { c.fillStyle = '#2c4a3a'; c.fillRect((r() * 13) | 0, (r() * 13) | 0, 2, 1); } // moss
  },

  _cliff(c, r) {
    c.fillStyle = '#10141f'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#293350'; c.fillRect(0, 0, 16, 2);
    c.fillStyle = '#1c2335'; c.fillRect(0, 2, 16, 2);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = r() < .5 ? '#171d2c' : '#0b0e16';
      c.fillRect((r() * 14) | 0, (4 + r() * 11) | 0, 2, 1 + ((r() * 2) | 0));
    }
  },

  _water(c, r, f, deep, wave, sparkle, sparkleChance) {
    c.fillStyle = deep; c.fillRect(0, 0, 16, 16);
    c.fillStyle = wave;
    for (let row = 0; row < 3; row++) {
      const y = 2 + row * 5 + ((row + f) % 3);
      const x = ((row * 5 + f * 2) % 12) | 0;
      c.fillRect(x, y, 4, 1);
    }
    if (r() < sparkleChance * 8) {
      c.fillStyle = sparkle;
      c.fillRect((r() * 15) | 0, (r() * 15) | 0, 1, 1);
    }
  },

  _channel(c, r, filled, f) {
    // carved stone groove — the aqueduct that doubles as base decoration
    c.fillStyle = '#2c3242'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#3e4860'; c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1);
    c.fillStyle = '#171c29'; c.fillRect(1, 3, 14, 10);
    if (filled) {
      c.fillStyle = '#1f8cc0'; c.fillRect(2, 4, 12, 8);
      c.fillStyle = '#45c2ea';
      for (let i = 0; i < 3; i++) {
        const x = ((i * 5 + f * 2) % 11) + 2;
        c.fillRect(x, 5 + i * 2, 3, 1);
      }
      c.fillStyle = '#bdf0ff';
      c.fillRect(((f * 5 + 3) % 12) + 2, 4 + ((f * 3) % 7), 1, 1);
    } else {
      c.fillStyle = '#11151f';
      for (let i = 0; i < 4; i++) c.fillRect((2 + r() * 11) | 0, (4 + r() * 7) | 0, 2, 1);
    }
  },

  _basin(c, r, filled, f) {
    c.fillStyle = '#333b4b'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#4a5570'; c.fillRect(1, 1, 14, 14);
    c.fillStyle = filled ? '#2aa8d8' : '#0d111c';
    c.fillRect(3, 3, 10, 10);
    if (filled) {
      c.fillStyle = '#8ae2ff';
      c.fillRect(4 + ((f * 3) % 7), 4 + ((f * 2) % 7), 2, 1);
      c.fillRect(10 - ((f * 2) % 5), 9 - ((f * 3) % 5), 1, 1);
    }
  },

  _tree(seed, warm) {
    const cv = this._canvas(26, 34);
    const c = cv.getContext('2d');
    const r = TV.mulberry32(seed * 991);
    const trunk = warm ? '#3a2c1c' : '#221b12';
    const dark = warm ? '#23401e' : '#121e18';
    const mid = warm ? '#30562a' : '#1a2c22';
    const lite = warm ? '#406e36' : '#22392c';
    c.fillStyle = trunk; c.fillRect(11, 26, 4, 8);
    const layers = [[13, 22, 11], [13, 16, 9], [13, 10, 7], [13, 5, 4]];
    for (const [cx, cy, rad] of layers) {
      for (let y = -rad; y <= rad; y++) {
        const hw = Math.floor(Math.sqrt(rad * rad - y * y) * (0.8 + r() * 0.35));
        c.fillStyle = y < -rad / 3 ? lite : (y < rad / 3 ? mid : dark);
        c.fillRect(cx - hw, cy + y, hw * 2, 1);
      }
    }
    for (let i = 0; i < 10; i++) { // texture specks
      c.fillStyle = r() < .5 ? dark : lite;
      c.fillRect((5 + r() * 16) | 0, (4 + r() * 20) | 0, 1, 1);
    }
    return cv;
  },
};
