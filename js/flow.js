// ResourceFlowManager — flow logic is tick-based (0.5s), visuals are per-frame,
// mirroring the Godot architecture: the math never depends on rendering.
TV.Flow = {
  TICK: 0.5,
  _tickTimer: 0,
  states: {},   // routeId -> {active, fillFront, complete}

  // fire — flows from the ember vent through player-built conduits
  fire: null,
  _fireTick: 0,
  litTiles: [],
  benchFire: false, // lit conduit adjacent to the herbalist bench

  init() {
    this.states = {};
    for (const id in TV.World.routes) {
      this.states[id] = { active: false, fillFront: 0, complete: false, millPowered: false };
    }
    this.fire = { active: false, litFront: 0, smelterLit: false, unsealed: false, delivered: false, blockedNoted: false };
    this.litTiles = [];
  },

  activate(id) {
    const s = this.states[id];
    if (!s || s.active) return;
    s.active = true;
    TV.EventBus.emit('resource_flow_started', id);
  },

  completeInstantly(id) { // used when loading a save
    const s = this.states[id];
    s.active = true;
    s.fillFront = TV.World.routes[id].length;
    s.complete = true;
    if (id === 'r3') s.millPowered = true;
  },

  update(dt) {
    // smooth visual front
    for (const id in this.states) {
      const s = this.states[id], route = TV.World.routes[id];
      if (!s.active || s.complete) continue;
      s.fillFront = Math.min(route.length, s.fillFront + route.speed * dt);
      if (id === 'r3' && !s.millPowered && route.millDist && s.fillFront >= route.millDist) {
        s.millPowered = true;
        TV.EventBus.emit('station_powered', 'watermill');
      }
    }
    // delivery decided on the tick, like the Godot design
    this._tickTimer += dt;
    if (this._tickTimer >= this.TICK) {
      this._tickTimer -= this.TICK;
      for (const id in this.states) {
        const s = this.states[id], route = TV.World.routes[id];
        if (s.active && !s.complete && s.fillFront >= route.length) {
          s.complete = true;
          TV.EventBus.emit('resource_delivered', id);
        }
      }
    }
    // fire spreads through the conduit network on its own faster tick
    this._fireTick += dt;
    if (this._fireTick >= 0.22) {
      this._fireTick -= 0.22;
      this._updateFire();
    }
  },

  _updateFire() {
    const W = TV.World, f = this.fire;
    this.litTiles = [];
    if (!f.active) return;
    f.litFront++;

    // BFS from the vent over 4-connected conduit tiles
    const dist = new Map();
    const queue = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const k = W.key(W.VENT.x + dx, W.VENT.y + dy);
      if (W.conduits.has(k) && !dist.has(k)) { dist.set(k, 1); queue.push(k); }
    }
    while (queue.length) {
      const k = queue.shift();
      const d = dist.get(k);
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of dirs) {
        const nk = W.key(x + dx, y + dy);
        if (W.conduits.has(nk) && !dist.has(nk)) { dist.set(nk, d + 1); queue.push(nk); }
      }
    }

    let smelterTouch = false, hearthTouch = false, benchTouch = false;
    for (const [k, c] of W.conduits) {
      const d = dist.get(k);
      c.lit = d !== undefined && d <= f.litFront;
      if (!c.lit) continue;
      const [x, y] = k.split(',').map(Number);
      this.litTiles.push([x, y]);
      const S = W.SMELTER;
      if (x >= S.x0 - 1 && x <= S.x1 + 1 && y >= S.y0 - 1 && y <= S.y1 + 1) smelterTouch = true;
      if (Math.abs(x - W.HEARTH.x) + Math.abs(y - W.HEARTH.y) === 1) hearthTouch = true;
      const B = W.BENCH;
      if (x >= B.x0 - 1 && x <= B.x1 + 1 && y >= B.y0 - 1 && y <= B.y1 + 1) benchTouch = true;
    }
    if (benchTouch && !this.benchFire) {
      this.benchFire = true;
      if (this.states.r3.complete) TV.EventBus.emit('station_powered', 'herbalist_bench');
    } else if (!benchTouch) {
      this.benchFire = false;
    }

    if (smelterTouch && !f.smelterLit) {
      f.smelterLit = true;
      TV.EventBus.emit('station_powered', 'smelter');
    }
    if (hearthTouch && !f.delivered) {
      if (f.unsealed) {
        f.delivered = true;
        TV.EventBus.emit('resource_delivered', 'fire');
      } else if (!f.blockedNoted) {
        f.blockedNoted = true;
        TV.EventBus.emit('show_notification', 'The hearth is sealed — black iron, old and cold.');
      }
    }
  },

  // is this channel tile carrying water right now?
  tileFilled(x, y) {
    const list = TV.World.channelTiles.get(TV.World.key(x, y));
    if (!list) return false;
    for (const e of list) {
      const s = this.states[e.route];
      if (s && s.active && s.fillFront >= e.dist) return true;
    }
    return false;
  },

  // point at distance d along a channel route's tile path
  pointAt(id, d) {
    const route = TV.World.routes[id];
    if (route.type === 'cascade') {
      const t = Math.min(1, d / route.length);
      return { x: route.from.x + (route.to.x - route.from.x) * t, y: route.from.y + (route.to.y - route.from.y) * t };
    }
    const i = Math.max(0, Math.min(route.tiles.length - 1, Math.floor(d / 16)));
    const [tx, ty] = route.tiles[i];
    return { x: tx * 16 + 8, y: ty * 16 + 8 };
  },

  anyComplete() {
    for (const id in this.states) if (this.states[id].complete) return true;
    return false;
  },
};
