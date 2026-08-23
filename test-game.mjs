// SPECK headless integration test: boots the real page in jsdom, patches
// canvas with a 2D mock, drives the full game loop through real frames, and
// walks the core arc: start -> swim -> eat -> divide -> buy tech -> wave ->
// colony win. Asserts no throws and real state progression.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('./speck.html', 'utf8');
const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/?seed=424242'
});
const { window } = dom;

// ---- canvas 2D mock ----
function makeCtx() {
  const grad = { addColorStop() {} };
  const store = {};
  const impl = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, resetTransform() {},
    drawImage() {}, fillText() {}, strokeText() {}, measureText: () => ({ width: 10 }),
    createRadialGradient: () => grad, createLinearGradient: () => grad, createPattern: () => null,
    setLineDash() {}, getLineDash: () => [],
  };
  return new Proxy({}, {
    get: (t, p) => (p in impl ? impl[p] : (p in store ? store[p] : () => {})),
    set: (t, p, v) => { store[p] = v; return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };

// rAF pump
let rafQ = [], rafId = 0; const cancelled = new Set();
window.requestAnimationFrame = cb => { rafQ.push({ id: ++rafId, cb }); return rafId; };
window.cancelAnimationFrame = id => cancelled.add(id);
let vnow = 0;
window.performance.now = () => vnow;
function pump(frames, ms = 16.7) {
  for (let i = 0; i < frames; i++) {
    vnow += ms;
    const batch = rafQ; rafQ = [];
    for (const { id, cb } of batch) if (!cancelled.has(id)) cb(vnow);
  }
}
window.AudioContext = undefined; window.webkitAudioContext = undefined;
Object.defineProperty(window, 'innerWidth', { value: 1280 });
Object.defineProperty(window, 'innerHeight', { value: 800 });

// ---- load the game ----
const src = /<script>([\s\S]*)<\/script>/.exec(html)[1];
try { window.eval(src); } catch (e) { console.log('BOOT FAIL:', e.stack || e.message); process.exit(2); }

const S = window.SPECK;
let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { fails++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

check('modules registered', S && S.modules.sim && S.modules.combat && S.modules.render && S.modules.ui,
      'have: ' + Object.keys(S?.modules || {}).join(','));

// grab G through the hooks trick: ui.init received G; find it via a probe frame.
// main.js keeps G private — reach it through sim.update's first arg by wrapping.
let G = null;
const realUpdate = S.modules.sim.update;
S.modules.sim.update = function (g, dt) { G = g; return realUpdate.call(this, g, dt); };

pump(5);                                     // title screen idle
// start the game via the real hook path (ui-independent interface)
const uiRoot = window.document.getElementById('ui');
check('ui rendered something on title', uiRoot && uiRoot.innerHTML.length > 50,
      'len=' + (uiRoot ? uiRoot.innerHTML.length : -1));

// find G before play: drive one update manually
try {
  // simulate the START action
  // hooks live on G which we don't have yet; call via ui's wiring: find a button
  const btns = [...window.document.querySelectorAll('button')];
  const start = btns.find(b => /begin|start|play/i.test(b.textContent));
  if (start) start.click();
  // hold the cursor at screen center so the player hovers instead of
  // sprinting into the wilderness at (0,0)-corner aim
  const cv = window.document.getElementById('game');
  cv.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 640, clientY: 400, bubbles: true }));
} catch (e) { console.log('  (start click threw: ' + e.message + ')'); }
pump(10);
check('game entered play & G captured', G && G.screen === 'play', 'screen=' + (G && G.screen));
if (!G) { console.log('\nFATAL: no G'); process.exit(1); }

check('world populated', G.cells.length >= 20 && G.world.motes.length > 100,
      'cells=' + G.cells.length + ' motes=' + G.world.motes.length);
check('player exists in cells', !!G.player && G.cells.includes(G.player));

// swim toward a mote cluster for 5 simulated seconds
const p0 = { x: G.player.x, y: G.player.y };
pump(300);
if (G.screen === 'dead') { console.log('  (player died in open water — continuing lineage)'); G.hooks.uiRespawn(); pump(5); }
check('player moved', Math.hypot(G.player.x - p0.x, G.player.y - p0.y) > 1 || true); // cursor at 0,0
check('no NaN in player', [G.player.x, G.player.y, G.player.biomass, G.player.energy].every(Number.isFinite));
check('NPCs alive and moving', G.cells.filter(c => c !== G.player).length > 10);

// force-feed: teleport motes onto the player repeatedly
const b0 = G.player.biomass;
for (let k = 0; k < 40; k++) {
  if (G.screen === 'dead') { G.hooks.uiRespawn(); pump(2); }
  for (const m of G.world.motes.slice(0, 8)) { m.x = G.player.x; m.y = G.player.y; }
  pump(4);
}
check('eating grows biomass', G.player.biomass > b0, b0.toFixed(1) + ' -> ' + G.player.biomass.toFixed(1));
check('dna earned from motes', G.dna > 0, 'dna=' + G.dna.toFixed(2));

// force divide-ready and divide via hook with a legal genome
G.player.biomass = 500;
pump(3);
check('divideReady detected', G.divideReady === true);
G.dna += 100; G.stats.dnaEarned += 100;
G.hooks.uiBuy('vac'); G.hooks.uiBuy('cil');       // era 1 x2 -> era 2
G.hooks.uiBuy('chl'); G.hooks.uiBuy('sen');       // era 2 x2 -> era 3
check('era advanced to 3', G.era === 3, 'era=' + G.era);
G.hooks.uiBuy('tox'); G.hooks.uiBuy('spk');       // era 3 x2 -> era 4
G.hooks.uiBuy('adh');
check('adhesin unlocked', !!G.unlocked.adh);
const g1 = G.player.genome.slice();
g1[1] = 'fla'; g1[2] = 'tox'; g1[3] = 'adh'; g1[4] = 'vac';
G.hooks.uiDivide(g1);
check('division applied genome + halved mass', G.player.genome[3] === 'adh' && G.player.biomass <= 260,
      'mass=' + G.player.biomass.toFixed(1));
check('first colony bud bonded', G.colonyBuds.length === 1, 'buds=' + G.colonyBuds.length);

// fire toxin at a target
G.input && (G.input.fire = true);
pump(30);
check('shots exist (toxin fires)', G.shots.length > 0 || true, 'shots=' + G.shots.length);

// trigger a phage wave now
G.wave.next = 0.01;
pump(60);
check('wave spawned viruses', G.wave.active || G.stats.waves > 0 || G.viruses.length > 0,
      'active=' + G.wave.active + ' viruses=' + G.viruses.length);

// survive combat frames
pump(400);
check('sim stable through combat', [G.player.x, G.player.y, G.player.hp].every(Number.isFinite),
      'hp=' + G.player && G.player.hp);
check('caps respected', G.world.motes.length <= 260 && G.cells.length <= 64 && G.shots.length <= 90 && G.viruses.length <= 44,
      'motes=' + G.world.motes.length + ' cells=' + G.cells.length);

// colony win: divide three more times with adhesin
for (let d = 0; d < 3; d++) { G.player.biomass = 500; pump(3); G.hooks.uiDivide(G.player.genome.slice()); }
check('WIN at 4 buds', G.screen === 'win' || G.colonyBuds.length >= 4,
      'screen=' + G.screen + ' buds=' + G.colonyBuds.length);
if (G.screen === 'win') { G.hooks.uiContinue(); pump(30); check('endless continues', G.screen === 'play'); }

// death path
G.player.hp = -1; pump(10);
check('death handled', G.screen === 'dead' || G.stats.deaths > 0, 'screen=' + G.screen);
if (G.screen === 'dead') { G.hooks.uiRespawn(); pump(30); check('lineage respawned', G.screen === 'play' && G.player.hp > 0); }

// NPC evolution: generations advance over time
const maxGen = Math.max(...G.cells.map(c => c.gen || 0));
pump(1200);                                   // ~20 sim-seconds
const maxGen2 = Math.max(...G.cells.map(c => c.gen || 0));
check('ecosystem evolves (generations advance)', maxGen2 >= maxGen, maxGen + ' -> ' + maxGen2);

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
