// Main — game loop, camera, lighting, particles, interaction, restoration
// sequencing, save/load, title screen. GameManager + the render layer.
(function () {
  const W = TV.World, F = TV.Flow, P = TV.Player, BUS = TV.EventBus, AU = TV.Audio;
  const T = TV.T, TILE = 16;
  const VW = 320, VH = 180, SCALE = 3;

  const canvas = document.getElementById('game');
  const mainCtx = canvas.getContext('2d');
  mainCtx.imageSmoothingEnabled = false;

  const view = document.createElement('canvas'); view.width = VW; view.height = VH;
  const vctx = view.getContext('2d');
  const lightCv = document.createElement('canvas'); lightCv.width = VW; lightCv.height = VH;
  const lctx = lightCv.getContext('2d');

  const ui = {
    objective: document.getElementById('objective'),
    pips: document.getElementById('pips'),
    prompt: document.getElementById('prompt'),
    note: document.getElementById('note'),
    controls: document.getElementById('controls'),
    endcard: document.getElementById('endcard'),
    fade: document.getElementById('fade'),
  };

  // ---------- game state ----------
  const G = {
    state: 'title',
    time: 0,
    stage: 0,
    warmth: 0, warmthTarget: 0,
    glow: { 1: 0, 2: 0, 3: 0 },
    cascade: 0,
    camX: 0, camY: 0,
    shake: 0,
    bricks: 0,
    fountainRepaired: false,
    muralLit: false,
    endShown: false,
    endTimer: -1,
    wheelAngle: 0,
    noteTimer: 0,
    hasSave: false,
  };

  const input = { up: 0, down: 0, left: 0, right: 0 };
  let interactPressed = false;

  // ---------- particles ----------
  const particles = []; // {x,y,vx,vy,life,maxLife,size,color:[r,g,b],add,grav}
  function spawn(p) { p.maxLife = p.life; particles.push(p); }

  const fireflies = [];
  function initFireflies() {
    if (fireflies.length) return;
    const r = TV.mulberry32(55);
    const zones = [[45 * 16, 39 * 16, 67 * 16, 51 * 16], [80 * 16, 24 * 16, 105 * 16, 60 * 16], [40 * 16, 52 * 16, 70 * 16, 70 * 16]];
    for (let i = 0; i < 26; i++) {
      const z = zones[i % zones.length];
      fireflies.push({ x: z[0] + r() * (z[2] - z[0]), y: z[1] + r() * (z[3] - z[1]), a: r() * 6.28, ph: r() * 6.28 });
    }
  }

  // ---------- notes / objectives ----------
  let noteTimeout = null;
  function showNote(text, dur = 4200) {
    ui.note.textContent = text;
    ui.note.style.opacity = 1;
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(() => { ui.note.style.opacity = 0; }, dur);
  }
  BUS.on('show_notification', showNote);

  function objectiveText() {
    const r1 = F.states.r1, r2 = F.states.r2, r3 = F.states.r3;
    if (G.stage >= 3) return 'Wander. Rest. It is done.';
    if (r3 && r3.active && !r3.complete) return 'Follow the water home.';
    if (G.stage === 2) return 'East, past the withered bramble, a garden waits.';
    if (r2 && r2.active && !r2.complete) return 'The structure drinks.';
    if (G.stage === 1) return 'A way opened in the north, behind the structure.';
    if (r1 && r1.active && !r1.complete) return 'Follow the water home.';
    return 'Find where the water begins. The west wind smells of rain.';
  }

  let lastObjective = '', lastPips = '';
  function updateHUD() {
    const obj = objectiveText();
    if (obj !== lastObjective) { ui.objective.textContent = obj; lastObjective = obj; }
    let pips = '';
    for (let i = 1; i <= 3; i++) pips += i <= G.stage ? '◆' : '◇';
    if (pips !== lastPips) {
      ui.pips.textContent = pips;
      ui.pips.style.color = G.stage >= 3 ? '#ffd98a' : '#7ec8e8';
      lastPips = pips;
    }
  }

  // ---------- save / load ----------
  const SAVE_KEY = 'thevalley_save_v1';
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1, stage: G.stage,
        routes: { r1: F.states.r1.complete, r2: F.states.r2.complete, r3: F.states.r3.complete },
        bricks: G.bricks, fountain: G.fountainRepaired,
        px: P.x, py: P.y,
      }));
    } catch (e) { /* file:// or private mode — fine, just no persistence */ }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d.version === 1 ? d : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  function applySave(d) {
    for (const id of ['r1', 'r2', 'r3']) if (d.routes[id]) F.completeInstantly(id);
    G.stage = d.stage;
    G.warmth = G.warmthTarget = d.stage / 3;
    for (let i = 1; i <= d.stage; i++) G.glow[i] = 1;
    if (d.stage >= 1) W.clearOverlays('rubble');
    if (d.stage >= 2) { W.clearOverlays('bramble'); G.muralLit = true; G.cascade = 1; initFireflies(); }
    if (d.stage >= 3) { W.plantGarden(); G.endShown = true; }
    G.bricks = d.bricks || 0;
    G.fountainRepaired = !!d.fountain;
    if (d.px && d.py) { P.x = d.px; P.y = d.py; }
  }

  // ---------- restoration sequencing ----------
  function restore(stage) {
    G.stage = Math.max(G.stage, stage);
    G.warmthTarget = G.stage / 3;
    G.shake = 0.5;
    AU.restorationTheme(stage);
    if (stage === 1) {
      showNote('The structure stirs — stone remembers water.');
      setTimeout(() => {
        const cleared = W.clearOverlays('rubble');
        dustBurst(cleared);
        AU.rumble(1.4);
        G.shake = 0.4;
        BUS.emit('area_unlocked', 'north');
        showNote('Something shifted in the north.');
      }, 2600);
    }
    if (stage === 2) {
      G.muralLit = true;
      initFireflies();
      setTimeout(() => {
        const cleared = W.clearOverlays('bramble');
        dustBurst(cleared, [120, 60, 70]);
        showNote('The bramble in the east withers away.');
        BUS.emit('area_unlocked', 'east');
      }, 2600);
      showNote('Light returns to the high windows.');
    }
    if (stage === 3) {
      W.plantGarden();
      showNote('The valley breathes again.');
      if (!G.endShown) G.endTimer = 6;
    }
    save();
    updateHUD();
  }

  function dustBurst(tiles, col = [150, 150, 160]) {
    for (const t of tiles) {
      for (let i = 0; i < 5; i++) {
        spawn({
          x: t.x * TILE + 8 + (Math.random() - 0.5) * 12,
          y: t.y * TILE + 8 + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * 28, vy: -18 - Math.random() * 22,
          life: 0.8 + Math.random() * 0.7, size: 2, color: col, add: false, grav: 18,
        });
      }
    }
  }

  BUS.on('resource_delivered', id => {
    if (id === 'r1') setTimeout(() => restore(1), 700);
    if (id === 'r2') restore(2);
    if (id === 'r3') setTimeout(() => restore(3), 700);
  });

  BUS.on('station_powered', () => {
    showNote('The old wheel turns again.');
    AU.interactChime();
  });

  // ---------- interactables ----------
  const interactables = [
    {
      x: (W.SPRING1.x + 0.5) * TILE, y: (W.SPRING1.y + 0.5) * TILE,
      label: 'Awaken the spring',
      available: () => !F.states.r1.active,
      act() { F.activate('r1'); AU.interactChime(); showNote('Water remembers its path.'); },
    },
    {
      x: (W.FALLS.x + 0.5) * TILE, y: (W.FALLS.y + 1.5) * TILE,
      label: 'Awaken the falls',
      available: () => G.stage >= 1 && !F.states.r2.active,
      act() { F.activate('r2'); AU.interactChime(); AU.rumble(2.2); showNote('Deep below, an old cistern fills.'); },
    },
    {
      x: (W.SPRING3.x + 0.5) * TILE, y: (W.SPRING3.y + 0.5) * TILE,
      label: 'Awaken the spring',
      available: () => G.stage >= 2 && !F.states.r3.active,
      act() { F.activate('r3'); AU.interactChime(); showNote('The last spring wakes.'); },
    },
    {
      x: (W.MILL.x + 0.5) * TILE, y: (W.MILL.y + 1.2) * TILE,
      label: 'Craft stone brick',
      available: () => F.states.r3.millPowered && G.bricks < 3,
      act() {
        G.bricks++;
        AU.craft();
        BUS.emit('item_crafted', 'stone_brick', G.bricks);
        if (G.bricks >= 3) {
          G.fountainRepaired = true;
          setTimeout(() => { showNote('The plaza fountain stands whole again.'); AU.interactChime(); }, 700);
          showNote('Stone brick crafted — 3 of 3. Enough to rebuild.');
        } else {
          showNote(`Stone brick crafted — ${G.bricks} of 3.`);
        }
        save();
      },
    },
    {
      x: 48 * TILE, y: 45.2 * TILE,
      label: 'Study the mural',
      available: () => G.muralLit,
      act() { AU.interactChime(); showNote('Four rivers met here once — water, flame, life, and starlight.'); },
    },
  ];

  function nearestInteractable() {
    let best = null, bd = 30;
    for (const it of interactables) {
      if (!it.available()) continue;
      const d = Math.hypot(it.x - P.x, it.y - P.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ---------- input ----------
  const keyMap = {
    w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
    a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
  };
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    AU.init();
    if (k === 'n' && e.shiftKey) { clearSave(); location.reload(); return; }
    if (G.state === 'title') { startGame(); return; }
    if (G.state === 'end') { dismissEnd(); }
    if (k === 'm') { AU.toggleMute(); return; }
    if (keyMap[k]) { input[keyMap[k]] = 1; e.preventDefault(); }
    if (k === 'e' || k === 'enter') interactPressed = true;
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (keyMap[k]) input[keyMap[k]] = 0;
  });
  window.addEventListener('pointerdown', () => {
    AU.init();
    if (G.state === 'title') startGame();
    else if (G.state === 'end') dismissEnd();
  });

  // ---------- title / start / end ----------
  let coverImg = null;
  (function tryCover() {
    const img = new Image();
    img.onload = () => { coverImg = img; };
    img.src = 'cover.png';
  })();

  function startGame() {
    G.state = 'play';
    ui.fade.style.transition = 'none';
    ui.fade.style.opacity = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ui.fade.style.transition = 'opacity 3.5s ease';
      ui.fade.style.opacity = 0;
    }));
    ui.objective.style.opacity = 1;
    ui.pips.style.opacity = 1;
    ui.controls.style.opacity = 1;
    setTimeout(() => { ui.controls.style.opacity = 0; }, 9000);
    updateHUD();
  }

  function dismissEnd() {
    G.state = 'play';
    ui.endcard.classList.remove('show');
  }

  // ---------- boot ----------
  TV.Tiles.build();
  TV.Structure.build();
  W.build();
  F.init();
  P.init();
  const saved = loadSave();
  if (saved) { applySave(saved); G.hasSave = true; }
  G.camX = P.x; G.camY = P.y;
  // title fades in
  requestAnimationFrame(() => requestAnimationFrame(() => { ui.fade.style.opacity = 0; }));

  // ---------- decorative sprite builders ----------
  const muralCv = (function () {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 18;
    const c = cv.getContext('2d');
    c.fillStyle = '#1d2230'; c.fillRect(0, 0, 64, 18);
    c.fillStyle = '#2e3650'; c.fillRect(1, 1, 62, 16);
    c.fillStyle = '#161b28'; c.fillRect(3, 3, 58, 12);
    // four rivers meeting a structure glyph
    const cols = ['#4aa8d8', '#d87a3a', '#5aa860', '#9a7ad8'];
    cols.forEach((col, i) => {
      c.fillStyle = col;
      const x = 8 + i * 14;
      c.fillRect(x, 12, 2, 2);
      c.fillRect(x + 2, 10, 2, 2);
      c.fillRect(x + 4, 8, 2, 2);
    });
    c.fillStyle = '#c8d4ee';
    c.fillRect(29, 4, 6, 4); c.fillRect(31, 2, 2, 2);
    return cv;
  })();

  // ---------- per-frame world rendering ----------
  function tileVariant(list, x, y) {
    return list[W.variantSeed[y * W.W + x] % list.length];
  }

  function drawGround(x0, y0, x1, y1, frame) {
    const A = TV.Tiles.atlas;
    const cx = 55.5, cy = 30;
    const warmR = G.warmth * 75;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = W.tile(tx, ty);
        let img;
        if (t === T.GRASS || t === T.FLOWERS) {
          const d = Math.hypot(tx - cx, ty - cy);
          const warm = d < warmR - 2 || (d < warmR + 2 && ((tx + ty) & 1));
          if (t === T.FLOWERS && warm) img = tileVariant(A[T.FLOWERS], tx, ty);
          else img = warm ? tileVariant(TV.Tiles.warmGrass, tx, ty) : tileVariant(A[T.GRASS], tx, ty);
        } else if (t === T.WATER) {
          img = A[T.WATER][frame];
        } else if (t === T.CHAN) {
          img = F.tileFilled(tx, ty) ? A[T.CHAN_F][frame] : tileVariant(A[T.CHAN], tx, ty);
        } else if (t === T.BASIN) {
          img = F.anyComplete() ? A[T.BASIN_F][frame] : A[T.BASIN][0];
        } else {
          img = tileVariant(A[t], tx, ty);
        }
        vctx.drawImage(img, tx * TILE, ty * TILE);
      }
    }
  }

  function drawOverlays(x0, y0, x1, y1) {
    for (const [k, v] of W.overlays) {
      const [x, y] = k.split(',').map(Number);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const px = x * TILE, py = y * TILE;
      const r = TV.mulberry32(x * 31 + y * 57);
      if (v.kind === 'rubble') {
        for (let i = 0; i < 4; i++) {
          vctx.fillStyle = ['#3a4254', '#262c3a', '#4a5468'][(r() * 3) | 0];
          const s = 3 + ((r() * 5) | 0);
          vctx.fillRect(px + r() * (16 - s), py + r() * (16 - s), s, s);
        }
      } else {
        vctx.fillStyle = '#33141e';
        vctx.fillRect(px, py + 4, 16, 10);
        vctx.strokeStyle = '#5a2030';
        for (let i = 0; i < 4; i++) {
          vctx.fillStyle = r() < 0.5 ? '#5a2030' : '#7a2a40';
          const bx = px + r() * 13, by = py + 2 + r() * 11;
          vctx.fillRect(bx, by, 2, 4); vctx.fillRect(bx - 2, by + 2, 6, 1);
        }
        if (r() < 0.4) { vctx.fillStyle = '#b03a52'; vctx.fillRect(px + 4 + r() * 8, py + 4 + r() * 8, 1, 1); }
      }
    }
  }

  function drawSpring(px, py, active, time) {
    vctx.fillStyle = '#3c4458';
    vctx.fillRect(px - 7, py - 5, 14, 10);
    vctx.fillStyle = '#4c566e';
    vctx.fillRect(px - 5, py - 7, 10, 4);
    vctx.fillStyle = '#262c3c';
    vctx.fillRect(px - 2, py - 6, 1, 9); vctx.fillRect(px + 1, py - 3, 1, 6);
    if (active) {
      const p = 0.6 + 0.4 * Math.sin(time * 5);
      vctx.fillStyle = `rgba(120,220,255,${p})`;
      vctx.fillRect(px - 2, py - 6, 1, 9); vctx.fillRect(px + 1, py - 3, 1, 6);
      vctx.fillRect(px - 1, py - 8, 2, 2);
    }
  }

  function drawMill(time) {
    const mx = 74.5 * TILE, hy = 40 * TILE;
    // hut
    vctx.fillStyle = '#2e3444'; vctx.fillRect(mx - 22, hy - 12, 44, 26);
    vctx.fillStyle = '#3a4258'; vctx.fillRect(mx - 22, hy - 12, 44, 3);
    vctx.fillStyle = '#241c12'; vctx.fillRect(mx - 24, hy - 18, 48, 7);
    vctx.fillStyle = '#32281a'; vctx.fillRect(mx - 24, hy - 18, 48, 2);
    vctx.fillStyle = '#11141e'; vctx.fillRect(mx - 5, hy + 2, 10, 12); // door
    const powered = F.states.r3.millPowered;
    if (powered) { vctx.fillStyle = 'rgba(255,200,110,0.85)'; vctx.fillRect(mx - 3, hy + 4, 6, 8); }
    // wheel over the channel
    const wy = 41.5 * TILE;
    vctx.save();
    vctx.translate(mx + 16, wy - 2);
    vctx.rotate(G.wheelAngle);
    vctx.fillStyle = '#4a3a26';
    for (let i = 0; i < 4; i++) {
      vctx.fillRect(-10, -1, 20, 2);
      vctx.rotate(Math.PI / 4);
    }
    vctx.restore();
    vctx.strokeStyle = '#5a4830';
    vctx.beginPath(); vctx.arc(mx + 16, wy - 2, 9, 0, 6.29); vctx.stroke();
  }

  function drawFountain(time) {
    const fx = (W.FOUNTAIN.x + 1) * TILE, fy = (W.FOUNTAIN.y + 1) * TILE;
    if (!G.fountainRepaired) {
      const r = TV.mulberry32(8);
      for (let i = 0; i < 7; i++) {
        vctx.fillStyle = ['#3a4254', '#2a3040', '#4a5468'][(r() * 3) | 0];
        const s = 3 + ((r() * 5) | 0);
        vctx.fillRect(fx - 12 + r() * 22, fy - 10 + r() * 18, s, s);
      }
      return;
    }
    vctx.fillStyle = '#4a5570'; vctx.fillRect(fx - 13, fy - 9, 26, 18);
    vctx.fillStyle = '#333b4b'; vctx.fillRect(fx - 10, fy - 6, 20, 12);
    vctx.fillStyle = '#2aa8d8'; vctx.fillRect(fx - 8, fy - 4, 16, 8);
    vctx.fillStyle = '#8ae2ff';
    vctx.fillRect(fx - 6 + ((time * 9) | 0) % 10, fy - 3, 2, 1);
    vctx.fillStyle = '#5a657f'; vctx.fillRect(fx - 2, fy - 7, 4, 6);
  }

  function drawCampfire(time) {
    const cx = W.CAMPFIRE.x, cy = W.CAMPFIRE.y;
    vctx.fillStyle = '#3a3026';
    vctx.fillRect(cx - 6, cy - 1, 12, 3);
    vctx.fillRect(cx - 1, cy - 4, 3, 8);
    vctx.fillStyle = '#52565e';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28;
      vctx.fillRect(cx + Math.cos(a) * 8 - 1, cy + Math.sin(a) * 5 - 1, 3, 2);
    }
  }

  function drawFalls(time) {
    if (!F.states.r2.active) return;
    const fx = 55.5 * TILE;
    vctx.save();
    vctx.globalCompositeOperation = 'lighter';
    for (const dx of [-10, -4, 2, 8]) {
      for (let y = 2 * TILE; y < 6 * TILE; y += 4) {
        const ph = (time * 130 + dx * 7 + y) % 24;
        vctx.fillStyle = `rgba(110,210,250,${ph < 8 ? 0.4 : 0.12})`;
        vctx.fillRect(fx + dx, y, 3, 4);
      }
    }
    vctx.restore();
  }

  // ---------- lighting ----------
  function gatherLights() {
    const L = [];
    const add = (x, y, r, col, s, flicker) => L.push({ x, y, r, col, s, flicker });
    add(P.x, P.y - 6, 58, [255, 205, 145], 0.55);
    add(W.CAMPFIRE.x, W.CAMPFIRE.y - 3, 72, [255, 165, 85], 0.95, true);
    const r1 = F.states.r1, r2 = F.states.r2, r3 = F.states.r3;
    if (r1.active) add((W.SPRING1.x + 0.5) * TILE, (W.SPRING1.y + 0.5) * TILE, 78, [120, 215, 255], 0.8);
    if (r3.active) add((W.SPRING3.x + 0.5) * TILE, (W.SPRING3.y + 0.5) * TILE, 78, [120, 215, 255], 0.8);
    if (r2.active) add(55.5 * TILE, 7 * TILE, 95, [120, 215, 255], 0.7);
    // channel lights: along filled portion + bright moving front
    for (const id of ['r1', 'r3']) {
      const s = F.states[id];
      if (!s.active) continue;
      const route = W.routes[id];
      for (let d = 56; d < s.fillFront; d += 120) {
        const p = F.pointAt(id, d);
        add(p.x, p.y, 34, [90, 195, 240], 0.35);
      }
      if (!s.complete) {
        const p = F.pointAt(id, s.fillFront);
        add(p.x, p.y, 55, [150, 230, 255], 0.9, true);
      }
    }
    if (r2.active && !r2.complete) {
      const p = F.pointAt('r2', F.states.r2.fillFront);
      add(p.x, p.y, 48, [120, 215, 255], 0.5, true);
    }
    if (F.anyComplete()) add(55.5 * TILE, 39.5 * TILE, 66, [120, 215, 255], 0.8);
    if (G.cascade > 0.05) add(55.5 * TILE, 30 * TILE, 110, [120, 200, 250], 0.7 * G.cascade);
    // structure windows
    const S = W.STRUCT;
    for (const w of TV.Structure.windows) {
      if (G.stage >= w.stage) {
        const a = G.glow[w.stage] || 0;
        add(S.px + w.x + 4, S.py + w.y + 7, 40, w.cool ? [140, 216, 255] : [255, 204, 110], 0.6 * a);
      }
    }
    if (G.stage >= 1) add(S.px + 184, S.py + 260, 80, [255, 190, 100], 0.8 * (G.glow[1] || 0), true);
    if (G.muralLit) add(48 * TILE, 44.5 * TILE, 50, [170, 200, 255], 0.7 * (G.glow[2] || 0));
    if (F.states.r3.millPowered) add(74.5 * TILE, 40.5 * TILE, 58, [255, 195, 105], 0.7, true);
    if (G.fountainRepaired) add((W.FOUNTAIN.x + 1) * TILE, (W.FOUNTAIN.y + 1) * TILE, 52, [130, 220, 255], 0.65);
    return L;
  }

  function renderLighting(camX, camY) {
    const w = G.warmth;
    const ar = 6 + 38 * w, ag = 10 + 22 * w, ab = 24 - 6 * w;
    const aa = 0.93 - 0.40 * w;
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, VW, VH);
    lctx.fillStyle = `rgba(${ar | 0},${ag | 0},${ab | 0},${aa})`;
    lctx.fillRect(0, 0, VW, VH);

    const lights = gatherLights();
    lctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const sx = l.x - camX + VW / 2, sy = l.y - camY + VH / 2;
      if (sx < -l.r || sx > VW + l.r || sy < -l.r || sy > VH + l.r || l.s <= 0) continue;
      let s = l.s;
      if (l.flicker) s *= 0.82 + 0.18 * Math.sin(G.time * 12 + l.x * 0.7);
      const g = lctx.createRadialGradient(sx, sy, 1, sx, sy, l.r);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, s)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.fillRect(sx - l.r, sy - l.r, l.r * 2, l.r * 2);
    }
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.drawImage(lightCv, 0, 0);

    // additive color tint per light
    vctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const sx = l.x - camX + VW / 2, sy = l.y - camY + VH / 2;
      if (sx < -l.r || sx > VW + l.r || sy < -l.r || sy > VH + l.r || l.s <= 0) continue;
      let s = l.s;
      if (l.flicker) s *= 0.82 + 0.18 * Math.sin(G.time * 12 + l.x * 0.7);
      const g = vctx.createRadialGradient(sx, sy, 1, sx, sy, l.r);
      g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${0.20 * s})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      vctx.fillStyle = g;
      vctx.fillRect(sx - l.r, sy - l.r, l.r * 2, l.r * 2);
    }
    vctx.globalCompositeOperation = 'source-over';
  }

  // ---------- vignette ----------
  const vignette = (function () {
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(480, 270, 240, 480, 270, 580);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,4,10,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, 960, 540);
    return cv;
  })();

  // ---------- ambient particles ----------
  let dustTimer = 0;
  function updateAmbient(dt, camX, camY) {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dustTimer = 0.12;
      spawn({
        x: camX + (Math.random() - 0.5) * VW, y: camY + (Math.random() - 0.5) * VH,
        vx: 3 + Math.random() * 5, vy: -2 + Math.random() * 4,
        life: 3 + Math.random() * 3, size: 1, color: [170, 185, 210], add: true, soft: 0.16,
      });
    }
    // campfire embers
    if (Math.random() < dt * 9) {
      spawn({
        x: W.CAMPFIRE.x + (Math.random() - 0.5) * 5, y: W.CAMPFIRE.y - 2,
        vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 14,
        life: 0.7 + Math.random() * 0.6, size: 1.5, color: [255, 170 + Math.random() * 60 | 0, 70], add: true,
      });
    }
    // flow particles along filled channels
    for (const id of ['r1', 'r3']) {
      const s = F.states[id];
      if (!s.active || s.fillFront < 24) continue;
      for (let i = 0; i < 2; i++) {
        const d = Math.random() * s.fillFront;
        const p0 = F.pointAt(id, d), p1 = F.pointAt(id, Math.min(s.fillFront, d + 12));
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const m = Math.hypot(dx, dy) || 1;
        spawn({
          x: p0.x + (Math.random() - 0.5) * 5, y: p0.y + (Math.random() - 0.5) * 5,
          vx: dx / m * 38, vy: dy / m * 38,
          life: 0.5, size: 1.5, color: [140, 225, 255], add: true,
        });
      }
    }
    // underground pulse motes
    const r2 = F.states.r2;
    if (r2.active && !r2.complete) {
      const p = F.pointAt('r2', r2.fillFront);
      spawn({
        x: p.x + (Math.random() - 0.5) * 14, y: p.y + (Math.random() - 0.5) * 8,
        vx: 0, vy: -8, life: 0.7, size: 1.5, color: [120, 215, 255], add: true,
      });
    }
    // fountain plume
    if (G.fountainRepaired && Math.random() < dt * 22) {
      spawn({
        x: (W.FOUNTAIN.x + 1) * TILE + (Math.random() - 0.5) * 3, y: (W.FOUNTAIN.y + 1) * TILE - 6,
        vx: (Math.random() - 0.5) * 14, vy: -26 - Math.random() * 14,
        life: 0.8, size: 1.5, color: [150, 225, 255], add: true, grav: 60,
      });
    }
    // garden sparkles after full restoration
    if (G.stage >= 3 && Math.random() < dt * 6) {
      spawn({
        x: (80 + Math.random() * 26) * TILE, y: (24 + Math.random() * 34) * TILE,
        vx: 0, vy: -6, life: 1.6, size: 1, color: [255, 230, 150], add: true,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = (p.soft || 0.85) * Math.min(1, p.life / (p.maxLife * 0.5));
      if (p.add) vctx.globalCompositeOperation = 'lighter';
      vctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${a})`;
      vctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      vctx.globalCompositeOperation = 'source-over';
    }
    // fireflies
    if (G.stage >= 2) {
      vctx.globalCompositeOperation = 'lighter';
      for (const f of fireflies) {
        const a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(G.time * 2.2 + f.ph));
        vctx.fillStyle = `rgba(220,255,160,${a * 0.8})`;
        vctx.fillRect(f.x, f.y, 1, 1);
        vctx.fillStyle = `rgba(220,255,160,${a * 0.18})`;
        vctx.fillRect(f.x - 2, f.y - 2, 5, 5);
      }
      vctx.globalCompositeOperation = 'source-over';
    }
  }

  function updateFireflies(dt) {
    if (G.stage < 2) return;
    for (const f of fireflies) {
      f.a += (Math.random() - 0.5) * 2.4 * dt * 8;
      f.x += Math.cos(f.a) * 9 * dt;
      f.y += Math.sin(f.a) * 9 * dt;
    }
  }

  // ---------- audio proximity ----------
  function updateAudioLevels() {
    if (!AU.ctx || G.state === 'title') return;
    const S = W.STRUCT;
    const dStruct = Math.hypot(P.x - S.cx, P.y - S.cy);
    const hum = Math.max(0, 1 - dStruct / 420) * (0.45 + 0.55 * (G.stage / 3));

    let dWater = 9999;
    const consider = (x, y) => { dWater = Math.min(dWater, Math.hypot(P.x - x, P.y - y)); };
    if (F.states.r1.active) {
      consider((W.SPRING1.x + 0.5) * TILE, (W.SPRING1.y + 0.5) * TILE);
      for (let d = 0; d < F.states.r1.fillFront; d += 100) { const q = F.pointAt('r1', d); consider(q.x, q.y); }
    }
    if (F.states.r3.active) for (let d = 0; d < F.states.r3.fillFront; d += 100) { const q = F.pointAt('r3', d); consider(q.x, q.y); }
    if (F.states.r2.active) consider(55.5 * TILE, 7 * TILE);
    if (G.cascade > 0.3) consider(S.cx, S.cy + 100);
    if (F.anyComplete()) consider(55.5 * TILE, 39.5 * TILE);
    if (G.fountainRepaired) consider((W.FOUNTAIN.x + 1) * TILE, (W.FOUNTAIN.y + 1) * TILE);
    const water = dWater > 999 ? 0 : Math.max(0, 1 - dWater / 190);

    const wind = 1 - 0.45 * G.warmth;
    AU.setLevels(wind, hum, water);
    AU.updateMusic(1 / 60, G.stage);
  }

  // ---------- title screen ----------
  function drawTitle() {
    const c = mainCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    const t = G.time;
    if (coverImg) {
      const s = Math.max(960 / coverImg.width, 540 / coverImg.height);
      c.drawImage(coverImg, (960 - coverImg.width * s) / 2, (540 - coverImg.height * s) / 2, coverImg.width * s, coverImg.height * s);
      c.fillStyle = 'rgba(4,7,16,0.55)';
      c.fillRect(0, 0, 960, 540);
    } else {
      const g = c.createLinearGradient(0, 0, 0, 540);
      g.addColorStop(0, '#070b1c'); g.addColorStop(0.6, '#0b1228'); g.addColorStop(1, '#060912');
      c.fillStyle = g; c.fillRect(0, 0, 960, 540);
      // stars
      const r = TV.mulberry32(12);
      for (let i = 0; i < 90; i++) {
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
        c.fillStyle = `rgba(210,225,255,${a * r()})`;
        c.fillRect(r() * 960, r() * 300, 2, 2);
      }
      // moon
      c.fillStyle = '#dce8f8';
      c.beginPath(); c.arc(700, 90, 34, 0, 6.29); c.fill();
      c.fillStyle = '#0b1228';
      c.beginPath(); c.arc(714, 80, 30, 0, 6.29); c.fill();
      // mountains
      c.fillStyle = '#0a0e1d';
      c.beginPath(); c.moveTo(0, 420);
      for (let x = 0; x <= 960; x += 60) c.lineTo(x, 420 - Math.abs(Math.sin(x * 0.013)) * 180 - (x % 120 ? 0 : 30));
      c.lineTo(960, 540); c.lineTo(0, 540); c.fill();
      // structure silhouette with one faint light
      c.fillStyle = '#070a14';
      c.fillRect(380, 350, 200, 190);
      c.beginPath(); c.arc(480, 350, 58, Math.PI, 0); c.fill();
      const p = 0.4 + 0.4 * Math.sin(t * 1.2);
      c.fillStyle = `rgba(120,200,255,${p * 0.5})`;
      c.fillRect(472, 392, 16, 22);
    }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, 960, 540);

    c.textAlign = 'center';
    c.fillStyle = '#e8eef8';
    c.font = '600 58px "Courier New", monospace';
    const title = 'T H E   V A L L E Y';
    c.shadowColor = 'rgba(120,200,255,0.6)'; c.shadowBlur = 24;
    c.fillText(title, 480, 230);
    c.shadowBlur = 0;
    c.font = 'italic 16px "Courier New", monospace';
    c.fillStyle = '#8fa2bf';
    c.fillText('a forgotten place, waiting to be brought back to life', 480, 270);
    const blink = 0.45 + 0.4 * Math.sin(t * 2.4);
    c.fillStyle = `rgba(220,230,245,${blink})`;
    c.font = '15px "Courier New", monospace';
    c.fillText(G.hasSave ? 'press any key to continue' : 'press any key to begin', 480, 420);
    if (G.hasSave) {
      c.fillStyle = 'rgba(140,155,180,0.7)';
      c.font = '12px "Courier New", monospace';
      c.fillText('shift+N — begin anew', 480, 448);
    }
  }

  // ---------- main loop ----------
  let last = performance.now();
  let promptShown = '';

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.time += dt;

    if (G.state === 'title') { drawTitle(); return; }

    // --- update
    P.update(dt, input);
    F.update(dt);
    updateParticles(dt);
    updateAmbient(dt, G.camX, G.camY);
    updateFireflies(dt);

    G.warmth += (G.warmthTarget - G.warmth) * Math.min(1, dt * 0.55);
    for (let i = 1; i <= 3; i++) if (G.stage >= i) G.glow[i] = Math.min(1, G.glow[i] + dt * 0.4);
    if (G.stage >= 2) G.cascade = Math.min(1, G.cascade + dt * 0.35);
    G.wheelAngle += dt * (F.states.r3.millPowered ? 2.0 : 0);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 0.5);

    if (G.endTimer > 0) {
      G.endTimer -= dt;
      if (G.endTimer <= 0) {
        G.endShown = true;
        G.state = 'end';
        ui.endcard.classList.add('show');
        save();
      }
    }

    // camera
    const lerp = Math.min(1, dt * 5);
    G.camX += (P.x - G.camX) * lerp;
    G.camY += (P.y - 8 - G.camY) * lerp;
    G.camX = Math.max(VW / 2, Math.min(W.W * TILE - VW / 2, G.camX));
    G.camY = Math.max(VH / 2, Math.min(W.H * TILE - VH / 2, G.camY));
    let shx = 0, shy = 0;
    if (G.shake > 0) {
      shx = (Math.random() - 0.5) * G.shake * 6;
      shy = (Math.random() - 0.5) * G.shake * 6;
    }

    // interaction
    const near = nearestInteractable();
    if (near) {
      const label = `[E]  ${near.label}`;
      if (promptShown !== label) { ui.prompt.textContent = label; promptShown = label; }
      ui.prompt.style.opacity = 1;
      if (interactPressed) near.act();
    } else {
      ui.prompt.style.opacity = 0;
      promptShown = '';
    }
    interactPressed = false;

    updateHUD();
    updateAudioLevels();

    // --- draw world
    const camX = G.camX + shx, camY = G.camY + shy;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.fillStyle = '#05070f';
    vctx.fillRect(0, 0, VW, VH);
    vctx.translate(Math.round(VW / 2 - camX), Math.round(VH / 2 - camY));

    const x0 = Math.max(0, Math.floor((camX - VW / 2) / TILE) - 1);
    const x1 = Math.min(W.W - 1, Math.ceil((camX + VW / 2) / TILE) + 1);
    const y0 = Math.max(0, Math.floor((camY - VH / 2) / TILE) - 1);
    const y1 = Math.min(W.H - 1, Math.ceil((camY + VH / 2) / TILE) + 2);
    const frame3 = Math.floor(G.time * 6) % 3;

    drawGround(x0, y0, x1, y1, frame3);
    drawOverlays(x0, y0, x1, y1);
    drawFalls(G.time);

    // mural panel on its wall
    vctx.drawImage(muralCv, 46 * TILE, 44 * TILE - 2);
    if (G.muralLit) {
      const p = 0.25 + 0.15 * Math.sin(G.time * 2);
      vctx.globalCompositeOperation = 'lighter';
      vctx.fillStyle = `rgba(140,180,255,${p * (G.glow[2] || 0)})`;
      vctx.fillRect(46 * TILE, 44 * TILE - 2, 64, 18);
      vctx.globalCompositeOperation = 'source-over';
    }

    // y-sorted drawables
    const drawables = [];
    const S = W.STRUCT;
    drawables.push({ y: S.py + TV.Structure.H, fn: () => {
      TV.Structure.draw(vctx, S.px, S.py, G.stage, G.glow, G.time);
      TV.Structure.drawCascade(vctx, S.px, S.py, G.time, G.cascade);
    }});
    for (const tr of W.trees) {
      if (tr.x < x0 * TILE - 16 || tr.x > x1 * TILE + 16 || tr.y < y0 * TILE - 24 || tr.y > y1 * TILE + 34) continue;
      drawables.push({ y: tr.y, fn: () => {
        const d = Math.hypot(tr.x / TILE - 55.5, tr.y / TILE - 30);
        const set = d < G.warmth * 75 ? TV.Tiles.warmTrees : TV.Tiles.trees;
        vctx.drawImage(set[tr.kind], tr.x - 13, tr.y - 30);
      }});
    }
    drawables.push({ y: (W.SPRING1.y + 1) * TILE, fn: () => drawSpring((W.SPRING1.x + 0.5) * TILE, (W.SPRING1.y + 0.5) * TILE, F.states.r1.active, G.time) });
    drawables.push({ y: (W.SPRING3.y + 1) * TILE, fn: () => drawSpring((W.SPRING3.x + 0.5) * TILE, (W.SPRING3.y + 0.5) * TILE, F.states.r3.active, G.time) });
    drawables.push({ y: 42 * TILE, fn: () => drawMill(G.time) });
    drawables.push({ y: (W.FOUNTAIN.y + 2) * TILE, fn: () => drawFountain(G.time) });
    drawables.push({ y: W.CAMPFIRE.y + 4, fn: () => drawCampfire(G.time) });
    drawables.push({ y: P.y, fn: () => P.draw(vctx) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.fn();

    drawParticles();

    // lighting overlay (viewport space)
    renderLighting(camX, camY);

    // --- upscale to screen
    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.imageSmoothingEnabled = false;
    mainCtx.drawImage(view, 0, 0, VW, VH, 0, 0, VW * SCALE, VH * SCALE);
    mainCtx.drawImage(vignette, 0, 0);
  }

  // fit canvas to window
  function resize() {
    const s = Math.min(window.innerWidth / 960, window.innerHeight / 540);
    canvas.style.width = (960 * s) + 'px';
    canvas.style.height = (540 * s) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  requestAnimationFrame(frame);
})();
