/* SPECK — genome.js: the shared heart. Hex body plan, organelle definitions,
 * stat derivation, NPC mutation, and the one true cell renderer.
 * FROZEN CONTRACT: every module receives this exact source. */
window.SPECK = window.SPECK || { modules: {} };
window.SPECK.genome = (function () {
  'use strict';
  // 19 hex slots, pointy-top axial coords: slot 0 = nucleus (fixed), 1-6 inner
  // ring, 7-18 outer ring.
  var AX = [[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1],
            [2,0],[1,1],[0,2],[-1,2],[-2,2],[-2,1],[-2,0],[-1,-1],[0,-2],[1,-2],[2,-2],[2,-1]];
  var SQ3 = Math.sqrt(3);
  var POS = AX.map(function (a) { return { x: SQ3 * (a[0] + a[1] / 2), y: 1.5 * a[1] }; });
  var OUT = POS.map(function (p, i) { return i === 0 ? 0 : Math.atan2(p.y, p.x); });
  var MAXP = 2 * SQ3; // radial extent of the outer ring

  var ORGANELLES = {
    fla: { name: 'Flagellum',    era: 1, dna: 0,  mass: 2, color: '#8fd8ff',
           desc: 'A whipping tail. More flagella, more thrust.',           stats: { thrust: 26 } },
    vac: { name: 'Vacuole',      era: 1, dna: 4,  mass: 2, color: '#59c2ff',
           desc: 'Storage bubble. Grow bigger before dividing.',           stats: { cap: 30 } },
    cil: { name: 'Cilia',        era: 1, dna: 6,  mass: 1, color: '#a8f0e8',
           desc: 'Fine hairs. Sharper turns, a little push.',              stats: { turn: 2.2, thrust: 6 } },
    sen: { name: 'Sensor',       era: 2, dna: 8,  mass: 1, color: '#e8e4d8',
           desc: 'A primitive eye. See farther.',                          stats: { vision: 0.16 } },
    chl: { name: 'Chloroplast',  era: 2, dna: 10, mass: 3, color: '#7ce27a',
           desc: 'Drink the light. Passive energy and a DNA trickle.',     stats: { photo: 2.1 } },
    mit: { name: 'Mitochondria', era: 2, dna: 12, mass: 2, color: '#ffb45c',
           desc: 'Burn biomass into energy when starving.',                stats: { mito: 1.6 } },
    mem: { name: 'Membrane',     era: 3, dna: 12, mass: 3, color: '#7aa2f7',
           desc: 'Armor plating. Tough but heavy.',                        stats: { armor: 5, drag: 0.05 } },
    spk: { name: 'Spike',        era: 3, dna: 14, mass: 2, color: '#ff6f5c',
           desc: 'Contact weapon. Hurts everything you touch.',            stats: { dmg: 8, armor: 1 } },
    tox: { name: 'Toxin Gland',  era: 3, dna: 18, mass: 3, color: '#c95bff',
           desc: 'Ranged weapon. Fire bolts at your cursor.',              stats: { shot: 1 } },
    adh: { name: 'Adhesin',      era: 4, dna: 25, mass: 2, color: '#ffd166',
           desc: 'Colony bond. Keep four daughters attached to win.',      stats: { adhesin: 1 } }
  };

  var BASE = { thrust: 18, turn: 2.4, cap: 60, vision: 1, armor: 0, dmg: 0,
               photo: 0, mito: 0.6, shot: 0, adhesin: 0, drag: 0, mass: 10 };

  function computeStats(g) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var i = 1; i < 19; i++) {
      var o = g[i] && ORGANELLES[g[i]];
      if (!o) continue;
      s.mass += o.mass;
      for (var st in o.stats) s[st] += o.stats[st];
    }
    return s;
  }
  function genomeCost(g) {          // biomass price of the body plan
    var m = 0;
    for (var i = 1; i < 19; i++) if (g[i] && ORGANELLES[g[i]]) m += ORGANELLES[g[i]].mass;
    return m;
  }
  function radiusOf(biomass) { return 10 + Math.sqrt(Math.max(0, biomass)) * 2.2; }

  function emptyGenome() { var g = new Array(19); for (var i = 0; i < 19; i++) g[i] = null; return g; }

  // NPC evolution: add, remove, or swap one organelle drawn from `pool`.
  function mutate(g, rng, pool) {
    var ng = g.slice();
    var ids = pool || Object.keys(ORGANELLES);
    var roll = rng();
    var empt = [], full = [];
    for (var i = 1; i < 19; i++) (ng[i] ? full : empt).push(i);
    if ((roll < 0.5 && empt.length) || !full.length) {
      ng[empt[(rng() * empt.length) | 0]] = ids[(rng() * ids.length) | 0];
    } else if (roll < 0.75 && full.length > 1) {
      ng[full[(rng() * full.length) | 0]] = null;
    } else if (full.length) {
      ng[full[(rng() * full.length) | 0]] = ids[(rng() * ids.length) | 0];
    }
    return ng;
  }

  // The one true cell renderer. Draws membrane, interior, nucleus, and every
  // organelle at its hex slot. angle rotates the whole body.
  // opts: {alpha, flash (0..1 damage flash), ghost (editor preview)}
  function drawCell(ctx, x, y, angle, r, g, hue, t, opts) {
    opts = opts || {};
    var st = computeStats(g);
    var scale = (0.72 * r) / MAXP;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;

    // membrane: wobbly blob
    var N = 26;
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var a = (i / N) * Math.PI * 2;
      var wob = Math.sin(a * 3 + t * 2.1) * 0.035 + Math.sin(a * 5 - t * 1.3) * 0.02;
      var rr = r * (1 + wob);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    var grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, 'hsla(' + hue + ',55%,30%,0.95)');
    grad.addColorStop(0.75, 'hsla(' + hue + ',60%,17%,0.92)');
    grad.addColorStop(1, 'hsla(' + hue + ',65%,12%,0.9)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r * 0.05) + st.armor * 0.35;
    ctx.strokeStyle = opts.flash ? 'rgba(255,120,120,' + (0.4 + 0.6 * opts.flash) + ')'
                                 : 'hsla(' + hue + ',70%,60%,0.85)';
    ctx.stroke();

    // organelles
    for (var s = 1; s < 19; s++) {
      var id = g[s];
      if (!id || !ORGANELLES[id]) continue;
      var p = POS[s], px = p.x * scale, py = p.y * scale;
      var oa = OUT[s], col = ORGANELLES[id].color;
      var u = Math.max(2.2, r * 0.11);
      ctx.save();
      ctx.translate(px, py);
      if (id === 'fla') {
        ctx.rotate(oa);
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u * 0.35);
        ctx.beginPath(); ctx.moveTo(0, 0);
        var L = r * 0.85;
        for (var q = 1; q <= 8; q++) {
          var f = q / 8;
          ctx.lineTo((r - px * 0 + L * f) * 0.55 + u, Math.sin(f * 5 + t * 7 + s) * u * (0.5 + f));
        }
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, u * 0.55, 0, 7); ctx.fill();
      } else if (id === 'spk') {
        ctx.rotate(oa);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(r * 0.36, 0); ctx.lineTo(0, u * 0.7); ctx.lineTo(0, -u * 0.7);
        ctx.closePath(); ctx.fill();
      } else if (id === 'chl') {
        ctx.fillStyle = col;
        for (var c2 = 0; c2 < 3; c2++) {
          ctx.beginPath();
          ctx.ellipse((c2 - 1) * u * 0.5, 0, u * 0.42, u * 0.72, 0.5, 0, 7);
          ctx.fill();
        }
      } else if (id === 'mit') {
        ctx.rotate(0.6);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, u * 1.05, u * 0.6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(40,20,5,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-u * 0.6, -u * 0.25); ctx.lineTo(-u * 0.2, u * 0.25);
        ctx.moveTo(0, -u * 0.3); ctx.lineTo(u * 0.35, u * 0.25);
        ctx.stroke();
      } else if (id === 'vac') {
        ctx.fillStyle = 'rgba(120,200,255,0.28)';
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, u * 1.05, 0, 7); ctx.fill(); ctx.stroke();
      } else if (id === 'sen') {
        ctx.fillStyle = '#0a0c12';
        ctx.beginPath(); ctx.arc(0, 0, u * 0.8, 0, 7); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(Math.cos(oa) * u * 0.3, Math.sin(oa) * u * 0.3, u * 0.42, 0, 7); ctx.fill();
      } else if (id === 'tox') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, u * 0.9, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, u * 0.35 * (1 + 0.3 * Math.sin(t * 5 + s)), 0, 7); ctx.fill();
      } else if (id === 'mem') {
        ctx.rotate(oa);
        ctx.strokeStyle = col; ctx.lineWidth = u * 0.5;
        ctx.beginPath(); ctx.arc(-px * 0, 0, r * 0.9 - Math.hypot(px, py), -0.7, 0.7); ctx.stroke();
      } else if (id === 'adh') {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u * 0.3);
        ctx.beginPath(); ctx.arc(0, 0, u * 0.9, 0, 7); ctx.stroke();
        ctx.fillStyle = col;
        for (var h2 = 0; h2 < 4; h2++) {
          var ha = h2 * Math.PI / 2 + t;
          ctx.beginPath(); ctx.arc(Math.cos(ha) * u * 0.9, Math.sin(ha) * u * 0.9, u * 0.22, 0, 7); ctx.fill();
        }
      } else if (id === 'cil') {
        ctx.rotate(oa);
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        for (var q2 = -2; q2 <= 2; q2++) {
          ctx.beginPath();
          ctx.moveTo(u * 0.3, q2 * u * 0.35);
          ctx.lineTo(u * (1 + 0.25 * Math.sin(t * 9 + q2)), q2 * u * 0.4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // nucleus
    ctx.fillStyle = 'hsla(' + hue + ',35%,8%,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, Math.max(3, r * 0.2), 0, 7); ctx.fill();
    ctx.strokeStyle = 'hsla(' + hue + ',60%,45%,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  return { SLOTS: 19, POS: POS, OUT: OUT, MAXP: MAXP, ORGANELLES: ORGANELLES,
           computeStats: computeStats, genomeCost: genomeCost, radiusOf: radiusOf,
           emptyGenome: emptyGenome, mutate: mutate, drawCell: drawCell };
})();
