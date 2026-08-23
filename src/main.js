/* SPECK — main.js: boot, loop, input, hooks, meta-progression, audio. */
(function () {
  'use strict';
  var GEN = window.SPECK.genome, MODS = window.SPECK.modules;

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var qs = /[?&]seed=(\d+)/.exec(location.search || '');
  var seed = qs ? +qs[1] : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  function fit() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.width = Math.round(innerWidth * DPR);
    H = canvas.height = Math.round(innerHeight * DPR);
  }
  addEventListener('resize', fit); fit();

  /* ---------- audio: a tiny synth ---------- */
  var AC = null, master = null;
  function audioInit() {
    if (AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.12; master.connect(AC.destination);
    } catch (e) { AC = null; }
  }
  function tone(f0, f1, dur, type, vol, when) {
    if (!AC || G.muted) return;
    var t0 = AC.currentTime + (when || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol || 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var SFX = {
    eat:    function () { tone(520 + G.rng() * 220, 900, 0.08, 'sine', 0.25); },
    bite:   function () { tone(180, 90, 0.1, 'square', 0.2); },
    hit:    function () { tone(140, 60, 0.14, 'square', 0.35); },
    shoot:  function () { tone(880, 240, 0.09, 'sawtooth', 0.18); },
    divide: function () { tone(300, 600, 0.22, 'sine', 0.4); tone(450, 900, 0.3, 'sine', 0.3, 0.1); },
    ready:  function () { tone(660, 660, 0.12, 'sine', 0.3); tone(880, 880, 0.14, 'sine', 0.3, 0.13); },
    unlock: function () { [523, 659, 784].forEach(function (f, i) { tone(f, f, 0.18, 'triangle', 0.3, i * 0.07); }); },
    wave:   function () { tone(110, 70, 0.5, 'sawtooth', 0.4); tone(110, 70, 0.5, 'sawtooth', 0.35, 0.55); },
    clear:  function () { [392, 523, 659, 784].forEach(function (f, i) { tone(f, f, 0.2, 'sine', 0.3, i * 0.08); }); },
    bond:   function () { tone(700, 1200, 0.3, 'triangle', 0.35); },
    death:  function () { [400, 300, 200, 120].forEach(function (f, i) { tone(f, f * 0.8, 0.25, 'sine', 0.35, i * 0.14); }); },
    win:    function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, f, 0.35, 'triangle', 0.32, i * 0.12); }); }
  };

  /* ---------- state ---------- */
  var G = {
    seed: seed, rng: mulberry32(seed), tick: 0, time: 0,
    screen: 'title', paused: false, muted: false,
    dna: 0, era: 1,
    unlocked: { fla: true }, perks: {},
    world: { R: 2600, light: 1, motes: [] },
    player: null, cells: [], shots: [], viruses: [], fx: [],
    wave: { n: 0, next: 75, active: false, left: 0 },
    colonyBuds: [], cam: { x: 0, y: 0, zoom: 1 },
    input: { aimX: 0, aimY: 0, thrust: 0, fire: false },
    divideReady: false, endless: false,
    stats: { motes: 0, cellsEaten: 0, waves: 0, divisions: 0, deaths: 0, peakMass: 0, dnaEarned: 0, timeAlive: 0 },
    hooks: {}
  };

  /* ---------- persistence (meta-progression) ---------- */
  function save() {
    try { localStorage.setItem('speck-save', JSON.stringify({ unlocked: G.unlocked, perks: G.perks, muted: G.muted })); } catch (e) {}
  }
  (function load() {
    try {
      var d = JSON.parse(localStorage.getItem('speck-save') || 'null');
      if (d && d.unlocked) { G.unlocked = d.unlocked; G.perks = d.perks || {}; G.muted = !!d.muted; G.unlocked.fla = true; }
    } catch (e) {}
  })();

  /* ---------- era logic ---------- */
  var PERKS = { enz: { era: 1, dna: 8 }, buoy: { era: 2, dna: 10 }, visc: { era: 3, dna: 16 }, regen: { era: 4, dna: 20 }, potent: { era: 4, dna: 22 } };
  function eraOf(id) { return GEN.ORGANELLES[id] ? GEN.ORGANELLES[id].era : PERKS[id].era; }
  function recomputeEra() {
    var count = { 1: 0, 2: 0, 3: 0, 4: 0 }, id;
    for (id in G.unlocked) if (id !== 'fla' && G.unlocked[id]) count[eraOf(id)]++;
    for (id in G.perks) if (G.perks[id]) count[eraOf(id)]++;
    var era = 1;
    for (var e = 1; e < 4; e++) { if (count[e] >= 2) era = e + 1; else break; }
    G.era = era;
  }
  recomputeEra();

  /* ---------- hooks ---------- */
  G.hooks.fx = function (type, x, y, opts) {
    if (G.fx.length >= 120) G.fx.shift();
    var f = { type: type, x: x, y: y, t0: G.time };
    if (opts) for (var k in opts) f[k] = opts[k];
    G.fx.push(f);
  };
  G.hooks.sfx = function (name) { if (SFX[name]) SFX[name](); };
  G.hooks.divideReady = function () { SFX.ready(); };
  G.hooks.playerDeath = function () {
    if (G.screen !== 'play') return;
    G.stats.deaths++; G.colonyBuds.length = 0;
    SFX.death();
    G.screen = 'dead'; MODS.ui.show(G, 'dead');
  };
  G.hooks.win = function () {
    if (G.endless || G.screen === 'win') return;
    SFX.win();
    G.screen = 'win'; MODS.ui.show(G, 'win');
  };
  function ensurePlayer() {
    if (G.player) return;
    var g = GEN.emptyGenome(); g[13] = 'fla';
    var st = GEN.computeStats(g);
    G.player = { id: 0, species: 0, hue: 190, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
                 biomass: 26, hp: 20 + st.armor * 6, energy: 80, genome: g, gen: 0,
                 age: 0, dead: false, cool: { fire: 0, bite: 0 }, flash: 0 };
  }
  G.hooks.uiStart = function () {
    audioInit();
    ensurePlayer();               // sims that expect main to own the player
    MODS.sim.init(G);             // sims that build their own may replace it
    // reconcile: exactly one player cell, and it is G.player
    for (var i = G.cells.length - 1; i >= 0; i--)
      if (G.cells[i].species === 0 && G.cells[i] !== G.player) G.cells.splice(i, 1);
    if (G.cells.indexOf(G.player) < 0) G.cells.push(G.player);
    G.screen = 'play'; MODS.ui.show(G, 'play');
  };
  G.hooks.uiDivide = function (genome) {
    var p = G.player;
    if (!p || !genome || genome.length !== 19) return;
    for (var i = 1; i < 19; i++) if (genome[i] && !G.unlocked[genome[i]]) genome[i] = null;
    p.genome = genome;
    p.biomass = Math.max(20, p.biomass * 0.5);
    p.hp = 20 + GEN.computeStats(genome).armor * 6;
    G.dna += 8; G.stats.dnaEarned += 8; G.stats.divisions++;
    G.divideReady = false;
    SFX.divide();
    G.hooks.fx('burst', p.x, p.y, { hue: p.hue });
    var st = GEN.computeStats(genome);
    if (st.adhesin > 0 && G.colonyBuds.length < 4) {
      G.colonyBuds.push({ angle: G.rng() * 6.28, phase: G.rng() * 6.28 });
      SFX.bond();
      G.hooks.fx('bond', p.x, p.y, {});
      if (G.colonyBuds.length >= 4) { G.hooks.win(); return; }
    }
    G.screen = 'play'; MODS.ui.show(G, 'play');
  };
  G.hooks.uiBuy = function (id) {
    var cost = GEN.ORGANELLES[id] ? GEN.ORGANELLES[id].dna : (PERKS[id] ? PERKS[id].dna : 1e9);
    var already = G.unlocked[id] || G.perks[id];
    if (already || G.dna < cost || eraOf(id) > G.era) return;
    G.dna -= cost;
    if (GEN.ORGANELLES[id]) G.unlocked[id] = true; else G.perks[id] = true;
    recomputeEra(); save(); SFX.unlock();
    MODS.ui.hud(G);
  };
  G.hooks.uiRespawn = function () {
    var p = G.player;
    var a = G.rng() * 6.28, d = G.world.R * 0.55;
    p.x = Math.cos(a) * d; p.y = Math.sin(a) * d;
    p.vx = p.vy = 0; p.dead = false;
    p.biomass = Math.max(26, p.biomass * 0.4);
    p.energy = 80; p.hp = 20 + GEN.computeStats(p.genome).armor * 6;
    if (G.cells.indexOf(p) < 0) G.cells.push(p);
    G.divideReady = false;
    G.screen = 'play'; MODS.ui.show(G, 'play');
  };
  G.hooks.uiContinue = function () { G.endless = true; G.screen = 'play'; MODS.ui.show(G, 'play'); };

  /* ---------- input ---------- */
  var keys = {};
  var mouse = { x: 0, y: 0, down: false };
  canvas.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerdown', function (e) { audioInit(); mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener('pointerup', function () { mouse.down = false; });
  addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keys[e.key.toLowerCase()] = true;
    var k = e.key.toLowerCase();
    if (G.screen === 'play') {
      if (k === 'e' && G.divideReady) { G.screen = 'mutate'; MODS.ui.show(G, 'mutate'); }
      else if (k === 't') { G.screen = 'tree'; MODS.ui.show(G, 'tree'); }
      else if (k === 'p') { G.paused = !G.paused; }
    } else if (k === 'escape' || (k === 't' && G.screen === 'tree')) {
      if (G.screen === 'tree' || G.screen === 'mutate') { G.screen = 'play'; MODS.ui.show(G, 'play'); }
    }
    if (k === 'm') { G.muted = !G.muted; save(); }
  });
  addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) G.paused = true; });

  function readInput() {
    var p = G.player;
    if (!p) return;
    var cx = W / 2, cy = H / 2, z = G.cam.zoom || 1;
    var wx = G.cam.x + (mouse.x * DPR - cx) / z;
    var wy = G.cam.y + (mouse.y * DPR - cy) / z;
    var kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    var ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (kx || ky) {
      G.input.aimX = p.x + kx * 240; G.input.aimY = p.y + ky * 240;
      G.input.thrust = 1;
    } else {
      G.input.aimX = wx; G.input.aimY = wy;
      var d = Math.hypot(wx - p.x, wy - p.y);
      G.input.thrust = Math.min(1, d / (GEN.radiusOf(p.biomass) * 2.5));
    }
    G.input.fire = mouse.down || !!keys[' '];
  }

  /* ---------- loop ---------- */
  var last = performance.now(), acc = 0, DT = 1 / 60, hudT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var el = Math.min(0.12, (now - last) / 1000);
    last = now;
    if (G.screen === 'play' && !G.paused) {
      acc += el;
      var steps = 0;
      while (acc >= DT && steps < 5) {
        readInput();
        MODS.sim.update(G, DT);
        MODS.combat.update(G, DT);
        for (var i = 0; i < G.cells.length; i++) {
          var c = G.cells[i];
          if (c.flash > 0) c.flash = Math.max(0, c.flash - 3 * DT);
        }
        G.time += DT; G.tick++; G.stats.timeAlive += DT;
        if (G.player) G.stats.peakMass = Math.max(G.stats.peakMass, G.player.biomass);
        acc -= DT; steps++;
      }
      if (steps === 5) acc = 0;
    }
    MODS.render.draw(G, ctx, W, H, el);
    hudT += el;
    if (hudT > 0.1) { hudT = 0; MODS.ui.hud(G); }
  }

  /* ---------- boot ---------- */
  MODS.ui.init(G, document.getElementById('ui'));
  MODS.ui.show(G, 'title');
  requestAnimationFrame(frame);
})();
