/* SPECK — sim.js: the living dish. World init/update, motes & upwellings,
 * light cycle, all cell physics/AI/eating/energy, NPC division+mutation,
 * deaths, immigration, colony-bud win check.
 * Loop caps: cells<=64, motes 240 (death-scatter slack to 260), O(n^2) pair
 * pass <=64*64, mote-eat pass <=260*64 — fine for 60fps on an iGPU laptop. */
window.SPECK = window.SPECK || { modules: {} };
window.SPECK.modules.sim = (function () {
  'use strict';
  var GEN = window.SPECK.genome;
  var TAU = Math.PI * 2;
  var nextId = 1;
  var up = [];          // 3 slow-moving nutrient upwellings
  var moteT = 0;        // mote respawn accumulator

  var HUES = [190, 95, 55, 0, 285]; // player, Grazer, Sunspinner, Lancer, Spitter

  function baseGenome(sp) {
    var g = GEN.emptyGenome();
    if (sp === 0) { g[13] = 'fla'; }                                        // player: rear tail
    else if (sp === 1) { g[13] = 'fla'; g[12] = 'fla'; g[4] = 'cil'; }      // Grazer
    else if (sp === 2) { g[2] = 'chl'; g[5] = 'chl'; g[1] = 'vac'; }        // Sunspinner
    else if (sp === 3) { g[13] = 'fla'; g[14] = 'fla'; g[7] = 'spk'; g[8] = 'spk'; } // Lancer
    else { g[13] = 'fla'; g[1] = 'tox'; g[7] = 'sen'; }                     // Spitter
    return g;
  }

  function makeCell(G, sp, x, y, genome, biomass, gen) {
    var st = GEN.computeStats(genome);
    return { id: nextId++, species: sp, hue: HUES[sp], x: x, y: y, vx: 0, vy: 0,
             angle: G.rng() * TAU, biomass: biomass, hp: 20 + st.armor * 6,
             energy: 70 + G.rng() * 20, genome: genome, gen: gen || 0, age: 0,
             dead: false, cool: { fire: 0, bite: 0 }, flash: 0,
             wt: 0, wa: 0, eatR: 0, lastEater: null };
  }

  function spawnMote(G) {
    var u = up[(G.rng() * up.length) | 0];
    var a = G.rng() * TAU, d = 300 * G.rng() * G.rng(); // clustered near upwelling
    var x = u.x + Math.cos(a) * d, y = u.y + Math.sin(a) * d;
    var dd = Math.hypot(x, y), R = G.world.R;
    if (dd > R * 0.97) { x *= R * 0.9 / dd; y *= R * 0.9 / dd; }
    G.world.motes.push({ x: x, y: y, vx: (G.rng() - 0.5) * 10, vy: (G.rng() - 0.5) * 10, e: 1 });
  }

  function init(G) {
    nextId = 1; moteT = 0;
    G.cells.length = 0; G.world.motes.length = 0; up.length = 0;
    var R = G.world.R, i, a, d;
    for (i = 0; i < 3; i++) {
      a = G.rng() * TAU; d = R * (0.15 + 0.55 * G.rng());
      up.push({ x: Math.cos(a) * d, y: Math.sin(a) * d,
                vx: (G.rng() - 0.5) * 14, vy: (G.rng() - 0.5) * 14 });
    }
    for (i = 0; i < 240; i++) spawnMote(G);
    var p = makeCell(G, 0, 0, 0, baseGenome(0), 26, 0);
    p.angle = 0; p.energy = 80;
    G.player = p; G.cells.push(p);
    var counts = [0, 10, 8, 5, 4], mass = [0, 20, 22, 26, 22];
    for (var sp = 1; sp <= 4; sp++) {
      for (i = 0; i < counts[sp]; i++) {
        a = G.rng() * TAU; d = 500 + G.rng() * (R * 0.88 - 500); // away from player spawn
        G.cells.push(makeCell(G, sp, Math.cos(a) * d, Math.sin(a) * d,
                              baseGenome(sp), mass[sp] + G.rng() * 8, 0));
      }
    }
  }

  function angNorm(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  function maxhpOf(G, c, st) {
    return (20 + st.armor * 6) * (c.species === 0 && G.perks.visc ? 1.25 : 1);
  }

  // ---------- NPC AI: returns {x,y,t} aim point + thrust 0..1 ----------
  function npcAI(G, c, s, r, cells, rad, dt) {
    var R = G.world.R, i, dx, dy, d2, best, bd;
    c.wt -= dt;
    if (c.wt <= 0) { c.wt = 0.8 + 1.6 * G.rng(); c.wa = G.rng() * TAU; }
    var ax = c.x + Math.cos(c.wa) * 140, ay = c.y + Math.sin(c.wa) * 140, thr = 0.35;
    var sensor = 260 + s.vision * 400, sen2 = sensor * sensor;

    // nearest bigger threat (r > 1.25x ours) within sensor
    var thx = 0, thy = 0, thd = 1e9;
    for (i = 0; i < cells.length; i++) {
      var o = cells[i];
      if (o === c || o.dead) continue;
      dx = o.x - c.x; dy = o.y - c.y; d2 = dx * dx + dy * dy;
      if (d2 < sen2 && rad[i] > r * 1.25 && d2 < thd) { thd = d2; thx = dx; thy = dy; }
    }
    function nearestMote() {
      var m = G.world.motes, b = null; bd = sen2;
      for (var k = 0; k < m.length; k++) {
        dx = m[k].x - c.x; dy = m[k].y - c.y; d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; b = m[k]; }
      }
      return b;
    }
    if (c.species === 1) {              // Grazer: graze motes, flee big cells
      var m = nearestMote();
      if (m) { ax = m.x; ay = m.y; thr = 0.85; }
      if (thd < sen2 * 0.64) { ax = c.x - thx; ay = c.y - thy; thr = 1; }
    } else if (c.species === 2) {       // Sunspinner: drift to center light, weak flee
      ax = c.x * 0.4; ay = c.y * 0.4; thr = 0.2;
      if (thd < 260 * 260) { ax = c.x - thx; ay = c.y - thy; thr = 0.55; }
    } else if (c.species === 3) {       // Lancer: hunt smaller cells, else motes
      best = -1; bd = sen2;
      for (i = 0; i < cells.length; i++) {
        var t = cells[i];
        if (t === c || t.dead || rad[i] >= r * 0.8) continue;
        dx = t.x - c.x; dy = t.y - c.y; d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best >= 0) { ax = cells[best].x; ay = cells[best].y; thr = 1; }
      else { var m3 = nearestMote(); if (m3) { ax = m3.x; ay = m3.y; thr = 0.7; } }
    } else if (c.species === 4) {       // Spitter: keep 240-360px, strafe (combat fires)
      best = -1; bd = sen2;
      for (i = 0; i < cells.length; i++) {
        var t4 = cells[i];
        if (t4 === c || t4.dead || rad[i] >= r) continue;
        dx = t4.x - c.x; dy = t4.y - c.y; d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best >= 0) {
        var tx = cells[best].x - c.x, ty = cells[best].y - c.y, td = Math.sqrt(bd) || 1;
        if (td < 240) { ax = c.x - tx; ay = c.y - ty; thr = 0.9; }
        else if (td > 360) { ax = cells[best].x; ay = cells[best].y; thr = 0.8; }
        else {
          var side = (c.id & 1) ? 1 : -1;
          ax = c.x - ty / td * 200 * side; ay = c.y + tx / td * 200 * side; thr = 0.7;
        }
      } else { var m4 = nearestMote(); if (m4) { ax = m4.x; ay = m4.y; thr = 0.6; } }
    }
    // dish-edge avoidance overrides
    var d0 = Math.hypot(c.x, c.y);
    if (d0 > R * 0.85) { ax = c.x * 0.5; ay = c.y * 0.5; thr = Math.max(thr, 0.7); }
    return { x: ax, y: ay, t: thr };
  }

  function scatterMotes(G, c) {
    var n = Math.max(1, Math.round(c.biomass / 3)), r = GEN.radiusOf(c.biomass);
    for (var i = 0; i < n && G.world.motes.length < 260; i++) {
      var a = G.rng() * TAU, d = r * (0.3 + G.rng());
      G.world.motes.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d,
                           vx: Math.cos(a) * 30 * G.rng(), vy: Math.sin(a) * 30 * G.rng(), e: 1 });
    }
  }

  function update(G, dt) {
    var R = G.world.R, i, j, dx, dy, d2, dd;
    // light cycle (eased sine)
    var l = 0.5 + 0.5 * Math.sin(G.time * 0.05);
    G.world.light = l * l * (3 - 2 * l);
    // upwellings drift slowly, turn back near the rim
    for (i = 0; i < up.length; i++) {
      var u = up[i];
      u.x += u.vx * dt; u.y += u.vy * dt;
      dd = Math.hypot(u.x, u.y);
      if (dd > R * 0.8) {
        var sp0 = Math.hypot(u.vx, u.vy) || 10;
        u.vx = -u.x / dd * sp0; u.vy = -u.y / dd * sp0;
      }
    }
    // motes drift; respawn toward cap 240
    var motes = G.world.motes;
    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      dd = m.x * m.x + m.y * m.y;
      if (dd > R * R * 0.96) { m.vx = -m.vx; m.vy = -m.vy; }
    }
    moteT += dt;
    while (moteT > 1 / 14) { moteT -= 1 / 14; if (motes.length < 240) spawnMote(G); }

    var cells = G.cells, n = cells.length;
    var st = new Array(n), rad = new Array(n);
    for (i = 0; i < n; i++) { st[i] = GEN.computeStats(cells[i].genome); rad[i] = GEN.radiusOf(cells[i].biomass); }

    // ---------- movement + metabolism ----------
    for (i = 0; i < n; i++) {
      var c = cells[i], s = st[i];
      var aim, thr;
      if (c.species === 0) { aim = { x: G.input.aimX, y: G.input.aimY }; thr = G.input.thrust || 0; }
      else { var d1 = npcAI(G, c, s, rad[i], cells, rad, dt); aim = d1; thr = d1.t; }
      var want = Math.atan2(aim.y - c.y, aim.x - c.x);
      var da = angNorm(want - c.angle);
      var mt = s.turn * dt;
      c.angle += Math.max(-mt, Math.min(mt, da));
      var accel = s.thrust * 8 / Math.sqrt(s.mass) * thr;
      c.vx += Math.cos(c.angle) * accel * dt;
      c.vy += Math.sin(c.angle) * accel * dt;
      var dragF = 0.6 + s.drag - (c.species === 0 && G.perks.buoy ? 0.1 : 0);
      var dk = Math.max(0, 1 - dragF * dt);
      c.vx *= dk; c.vy *= dk;
      c.x += c.vx * dt; c.y += c.vy * dt;
      // soft dish boundary, hard clamp at R
      dd = Math.hypot(c.x, c.y);
      if (dd > R * 0.96) {
        var push = (dd - R * 0.96) * 3;
        c.vx -= c.x / dd * push * dt; c.vy -= c.y / dd * push * dt;
        if (dd > R) { c.x *= R / dd; c.y *= R / dd; }
      }
      c.age += dt;
      // energy
      c.energy -= (1.1 + 0.02 * s.mass + 2.2 * thr) * dt;
      if (s.photo > 0) {
        c.energy += s.photo * 2.2 * G.world.light * dt;
        if (c.species === 0) {
          var nChl = 0;
          for (j = 1; j < 19; j++) if (c.genome[j] === 'chl') nChl++;
          var tr = 0.02 * nChl * G.world.light * dt;
          G.dna += tr; G.stats.dnaEarned += tr;
        }
      }
      if (c.energy < 30 && c.biomass > 12 && s.mito > 0) {
        c.biomass -= 0.5 * s.mito * dt; c.energy += 4 * s.mito * dt;
      }
      if (c.energy <= 0) { c.energy = 0; c.hp -= 2.5 * dt; }
      if (c.energy > 100) c.energy = 100;
      if (c.species === 0 && G.perks.regen) c.hp = Math.min(maxhpOf(G, c, s), c.hp + 1.2 * dt);
    }

    // ---------- mote eating (overlap r) ----------
    for (i = motes.length - 1; i >= 0; i--) {
      var mo = motes[i];
      for (j = 0; j < n; j++) {
        var ce = cells[j];
        if (ce.dead) continue;
        dx = mo.x - ce.x; dy = mo.y - ce.y;
        if (dx * dx + dy * dy < rad[j] * rad[j]) {
          ce.biomass += 2;
          ce.energy = Math.min(100, ce.energy + 14 * (ce.species === 0 && G.perks.enz ? 1.3 : 1));
          if (ce.species === 0) {
            G.dna += 0.25; G.stats.dnaEarned += 0.25; G.stats.motes++;
            G.hooks.fx('eat', mo.x, mo.y, { hue: ce.hue });
            G.hooks.sfx('eat');
          }
          motes[i] = motes[motes.length - 1]; motes.pop();
          break;
        }
      }
    }

    // ---------- cell-cell: engulf + spikes ----------
    for (i = 0; i < n; i++) {
      var A = cells[i];
      if (A.dead) continue;
      for (j = i + 1; j < n; j++) {
        var B = cells[j];
        if (B.dead) continue;
        dx = B.x - A.x; dy = B.y - A.y; d2 = dx * dx + dy * dy;
        var rA = rad[i], rB = rad[j];
        if (d2 > (rA + rB) * (rA + rB)) continue;
        dd = Math.sqrt(d2);
        // spikes: contact damage both ways
        if (st[i].dmg > 0) { if (B.flash <= 0) G.hooks.fx('hit', B.x, B.y, { hue: A.hue }); B.hp -= st[i].dmg * dt; B.flash = 1; }
        if (st[j].dmg > 0) { if (A.flash <= 0) G.hooks.fx('hit', A.x, A.y, { hue: B.hue }); A.hp -= st[j].dmg * dt; A.flash = 1; }
        // engulf: big eats small
        var eater = null, prey = null, pi = -1;
        if (rA > rB * 1.22 && dd < rA * 0.85) { eater = A; prey = B; pi = j; }
        else if (rB > rA * 1.22 && dd < rB * 0.85) { eater = B; prey = A; pi = i; }
        if (eater) {
          if (!prey.eatR) prey.eatR = rad[pi];
          prey.lastEater = eater;
          var t2 = Math.min(14 * dt, prey.biomass);
          prey.biomass -= t2; eater.biomass += t2;
          prey.flash = 1;
        }
      }
    }

    // ---------- deaths ----------
    for (i = n - 1; i >= 0; i--) {
      var dc = cells[i];
      if (dc.hp <= 0 || dc.biomass < 3) {
        dc.dead = true;
        scatterMotes(G, dc);
        G.hooks.fx('die', dc.x, dc.y, { hue: dc.hue });
        if (dc.species !== 0 && dc.lastEater === G.player && !G.player.dead) {
          var gain = (dc.eatR || GEN.radiusOf(dc.biomass)) < 26 ? 3 : 6;
          G.dna += gain; G.stats.dnaEarned += gain; G.stats.cellsEaten++;
          G.hooks.sfx('bite');
        }
        cells.splice(i, 1);
        if (dc === G.player) G.hooks.playerDeath();
      }
    }

    // ---------- NPC division (mutation!) + player divide-ready ----------
    for (i = cells.length - 1; i >= 0; i--) {
      var pc = cells[i];
      if (pc.dead) continue;
      var ps = GEN.computeStats(pc.genome);
      if (pc.species === 0) {
        if (!G.divideReady && pc.biomass >= ps.cap) { G.divideReady = true; G.hooks.divideReady(); }
        continue;
      }
      if (pc.biomass >= ps.cap && cells.length < 64) {
        var half = pc.biomass * 0.48;
        pc.biomass = half;
        var kid = makeCell(G, pc.species, pc.x + Math.cos(pc.angle + Math.PI) * 8,
                           pc.y + Math.sin(pc.angle + Math.PI) * 8,
                           GEN.mutate(pc.genome, G.rng), half, pc.gen + 1);
        kid.energy = pc.energy;
        kid.vx = -pc.vx; kid.vy = -pc.vy;
        cells.push(kid);
        G.hooks.fx('eat', pc.x, pc.y, { hue: pc.hue });
      }
    }

    // ---------- immigration for extinct species ----------
    var alive = [0, 0, 0, 0, 0];
    for (i = 0; i < cells.length; i++) alive[cells[i].species]++;
    for (var sp2 = 1; sp2 <= 4; sp2++) {
      if (!alive[sp2] && cells.length < 64 && G.rng() < 0.004 * dt) {
        var ia = G.rng() * TAU;
        cells.push(makeCell(G, sp2, Math.cos(ia) * R * 0.93, Math.sin(ia) * R * 0.93,
                            baseGenome(sp2), 22 + G.rng() * 8, 0));
      }
    }

    // ---------- colony buds orbit + win ----------
    for (i = 0; i < G.colonyBuds.length; i++) {
      G.colonyBuds[i].angle += (0.7 + 0.08 * i) * dt;
      G.colonyBuds[i].phase += dt;
    }
    if (G.colonyBuds.length >= 4) G.hooks.win();
  }

  return { init: init, update: update };
})();
