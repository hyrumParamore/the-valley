// ResourceFlowManager — flow logic is tick-based (0.5s), visuals are per-frame,
// mirroring the Godot architecture: the math never depends on rendering.
TV.Flow = {
  TICK: 0.5,
  _tickTimer: 0,
  states: {},   // routeId -> {active, fillFront, complete}

  init() {
    this.states = {};
    for (const id in TV.World.routes) {
      this.states[id] = { active: false, fillFront: 0, complete: false, millPowered: false };
    }
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
