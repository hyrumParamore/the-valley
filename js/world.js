// World — the valley itself. Handcrafted layout built in code:
// south camp -> central plaza & ancient structure -> west spring cavern,
// north upper falls (gated by rubble), east garden terrace (gated by bramble).
TV.World = {
  W: 110, H: 80,
  map: null,
  variantSeed: null,
  overlays: new Map(),   // "x,y" -> {kind:'rubble'|'bramble'}  solid until cleared
  channelTiles: new Map(), // "x,y" -> [{route, dist}]
  entities: [],
  trees: [],
  routes: {},
  flowersPlanted: false,

  // landmark positions (tiles)
  STRUCT: { x0: 44, y0: 22, x1: 66, y1: 38, px: 44 * 16, py: 39 * 16 - 288, cx: 55.5 * 16, cy: 30 * 16 },
  BASIN: [{ x: 54, y: 39 }, { x: 55, y: 39 }, { x: 56, y: 39 }],
  SPAWN: { x: 55.5 * 16, y: 64 * 16 },
  CAMPFIRE: { x: 53 * 16 + 8, y: 62 * 16 + 8 },
  SPRING1: { x: 16, y: 40 },
  FALLS: { x: 55, y: 10 },
  SPRING3: { x: 93, y: 40 },
  MILL: { x: 74, y: 41 },
  FOUNTAIN: { x: 61, y: 46 },
  MURAL: { x0: 46, x1: 49, y: 44 },

  key(x, y) { return x + ',' + y; },

  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return TV.T.CLIFF;
    return this.map[y * this.W + x];
  },
  setTile(x, y, t) { if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.map[y * this.W + x] = t; },

  isSolid(x, y) {
    if (this.overlays.has(this.key(x, y))) return true;
    if (this.solidEntities.has(this.key(x, y))) return true;
    return TV.SOLID.has(this.tile(x, y));
  },

  solidEntities: new Set(),

  rect(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setTile(x, y, t);
  },

  build() {
    const T = TV.T;
    this.map = new Uint8Array(this.W * this.H).fill(T.GRASS);
    this.variantSeed = new Uint8Array(this.W * this.H);
    const r = TV.mulberry32(99);
    for (let i = 0; i < this.variantSeed.length; i++) this.variantSeed[i] = (r() * 255) | 0;

    // map border
    this.rect(0, 0, this.W - 1, 2, T.CLIFF);
    this.rect(0, this.H - 3, this.W - 1, this.H - 1, T.CLIFF);
    this.rect(0, 0, 2, this.H - 1, T.CLIFF);
    this.rect(this.W - 3, 0, this.W - 1, this.H - 1, T.CLIFF);

    // north divider (gap behind the structure, buried in rubble at start)
    this.rect(3, 16, this.W - 4, 18, T.CLIFF);
    this.rect(52, 16, 58, 18, T.GRASS);
    for (let y = 16; y <= 18; y++) for (let x = 52; x <= 58; x++)
      this.overlays.set(this.key(x, y), { kind: 'rubble' });

    // upper falls basin
    this.rect(51, 5, 59, 9, T.WATER);

    // west spring cavern
    this.rect(4, 26, 34, 27, T.CLIFF);
    this.rect(4, 51, 34, 52, T.CLIFF);
    this.rect(4, 26, 5, 52, T.CLIFF);
    this.rect(33, 26, 34, 52, T.CLIFF);
    this.rect(33, 38, 34, 43, T.GRASS); // entrance
    this.rect(11, 38, 15, 42, T.WATER); // spring pool

    // east divider (gap choked by bramble)
    this.rect(77, 16, 78, this.H - 4, T.CLIFF);
    this.rect(77, 38, 78, 43, T.GRASS);
    for (let y = 38; y <= 43; y++) for (let x = 77; x <= 78; x++)
      this.overlays.set(this.key(x, y), { kind: 'bramble' });

    // garden terrace pool
    this.rect(94, 38, 98, 42, T.WATER);

    // plaza + structure
    this.rect(45, 39, 67, 51, T.PLAZA);
    this.rect(this.STRUCT.x0, this.STRUCT.y0, this.STRUCT.x1, this.STRUCT.y1, T.RUIN);
    for (const b of this.BASIN) this.setTile(b.x, b.y, T.BASIN);

    // south path and camp clearing
    this.rect(54, 52, 56, 63, T.PATH);
    this.rect(52, 61, 58, 66, T.PATH);
    this.rect(36, 40, 44, 41, T.PATH); // plaza -> west corridor

    // mural wall (freestanding ruin chunk on the plaza)
    this.rect(this.MURAL.x0, this.MURAL.y0, this.MURAL.x1, this.MURAL.y0, T.RUIN);

    // ---- resource routes (carved channels; the infrastructure IS the decoration)
    this.routes = {};
    const carve = (id, tiles) => {
      tiles.forEach(([x, y], i) => {
        if (this.tile(x, y) !== T.BASIN) this.setTile(x, y, T.CHAN);
        const k = this.key(x, y);
        if (!this.channelTiles.has(k)) this.channelTiles.set(k, []);
        this.channelTiles.get(k).push({ route: id, dist: (i + 0.5) * 16 });
      });
      return tiles;
    };

    const r1tiles = [];
    for (let x = 17; x <= 55; x++) r1tiles.push([x, 40]);
    carve('r1', r1tiles);
    this.routes.r1 = {
      id: 'r1', type: 'channel',
      tiles: r1tiles,
      length: r1tiles.length * 16,
      speed: 75,
      end: { x: 55.5 * 16, y: 39.6 * 16 },
    };

    this.routes.r2 = { // underground pulse from the falls into the structure's cistern
      id: 'r2', type: 'cascade',
      from: { x: 55.5 * 16, y: 11.5 * 16 },
      to: { x: 55.5 * 16, y: 21.5 * 16 },
      length: 10 * 16,
      speed: 55,
    };

    const r3tiles = [];
    for (let x = 92; x >= 58; x--) r3tiles.push([x, 41]);
    r3tiles.push([57, 41], [56, 40]);
    carve('r3', r3tiles);
    this.routes.r3 = {
      id: 'r3', type: 'channel',
      tiles: r3tiles,
      length: r3tiles.length * 16,
      speed: 75,
      end: { x: 55.5 * 16, y: 39.6 * 16 },
      millDist: (r3tiles.findIndex(([x, y]) => x === this.MILL.x && y === this.MILL.y) + 0.5) * 16,
    };

    this._placeEntities();
    this._scatterTrees();
  },

  _placeEntities() {
    // solid footprints for built things
    const solid = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.solidEntities.add(this.key(x, y));
    };
    solid(73, 40, 75, 40);                       // watermill hut
    solid(this.FOUNTAIN.x, this.FOUNTAIN.y, this.FOUNTAIN.x + 1, this.FOUNTAIN.y + 1); // fountain
    solid(this.SPRING1.x, this.SPRING1.y, this.SPRING1.x, this.SPRING1.y);
    solid(this.SPRING3.x, this.SPRING3.y, this.SPRING3.x, this.SPRING3.y);
  },

  _scatterTrees() {
    const r = TV.mulberry32(777);
    const T = TV.T;
    this.trees = [];
    const blocked = (x, y) =>
      (x >= 36 && x <= 76 && y >= 19 && y <= 21) ||   // back corridor strip
      (x >= 51 && x <= 59 && y >= 3 && y <= 15) ||    // falls approach
      (x >= 52 && x <= 58 && y >= 12 && y <= 22) ||   // north gap path
      (x >= 35 && x <= 44 && y >= 36 && y <= 46) ||   // west corridor mouth
      (x >= 67 && x <= 80 && y >= 36 && y <= 46) ||   // east corridor mouth
      (x >= 50 && x <= 60 && y >= 50 && y <= 70);     // south path
    for (let y = 4; y < this.H - 4; y++) {
      for (let x = 4; x < this.W - 4; x++) {
        if (this.tile(x, y) !== T.GRASS || blocked(x, y)) continue;
        // keep clear of anything carved or built
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++)
          for (let dx = -1; dx <= 1 && clear; dx++) {
            const t = this.tile(x + dx, y + dy);
            if (t !== T.GRASS && t !== T.CLIFF) clear = false;
            if (this.overlays.has(this.key(x + dx, y + dy))) clear = false;
          }
        if (!clear) continue;
        // denser near map edges, sparse in the open
        const edge = Math.min(x, y, this.W - x, this.H - y);
        const chance = edge < 9 ? 0.16 : 0.025;
        if (r() < chance) {
          this.trees.push({ x: x * 16 + 8, y: y * 16 + 14, kind: (r() * 3) | 0 });
          this.solidEntities.add(this.key(x, y));
        }
      }
    }
    this.trees.sort((a, b) => a.y - b.y);
  },

  clearOverlays(kind) {
    const cleared = [];
    for (const [k, v] of this.overlays) {
      if (v.kind === kind) {
        const [x, y] = k.split(',').map(Number);
        cleared.push({ x, y });
        this.overlays.delete(k);
      }
    }
    return cleared;
  },

  plantGarden() {
    if (this.flowersPlanted) return;
    this.flowersPlanted = true;
    const r = TV.mulberry32(313);
    for (let y = 20; y < this.H - 4; y++)
      for (let x = 80; x < this.W - 4; x++)
        if (this.tile(x, y) === TV.T.GRASS && r() < 0.18) this.setTile(x, y, TV.T.FLOWERS);
    // a few blooms around the plaza too
    for (let y = 39; y <= 51; y++)
      for (let x = 42; x <= 70; x++)
        if (this.tile(x, y) === TV.T.GRASS && r() < 0.3) this.setTile(x, y, TV.T.FLOWERS);
  },
};
