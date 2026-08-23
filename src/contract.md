You are implementing ONE module of SPECK, a browser game: an evolution arena where
you pilot a single cell — eat, grow, divide, edit your genome on a hex body plan,
unlock organelles through a DNA tech tree, survive phage waves, and win by bonding
4 colony daughters. NPC species carry genomes that MUTATE on division: the
ecosystem evolves. Canvas 2D + DOM. Zero dependencies. All modules are
concatenated on one page.

## Namespace (HARD RULE)
window.SPECK = window.SPECK || { modules:{} };
window.SPECK.modules.<yourname> = { ...exports };
No other global identifiers. Everything else inside an IIFE closure. 'use strict'.
Never call Math.random — use G.rng() (seeded). No eval, no libraries, no assets.

## The genome module (ALREADY WRITTEN — available as window.SPECK.genome)
Full source appended at the bottom. API:
  GEN.SLOTS=19, GEN.POS[19] {x,y} unit hex offsets (slot0=nucleus), GEN.OUT[19] outward angles,
  GEN.ORGANELLES = {fla,vac,cil,sen,chl,mit,mem,spk,tox,adh} each {name,era,dna,mass,color,desc,stats}
  GEN.computeStats(genome) -> {thrust,turn,cap,vision,armor,dmg,photo,mito,shot,adhesin,drag,mass}
  GEN.genomeCost(genome), GEN.radiusOf(biomass), GEN.emptyGenome(), 
  GEN.mutate(genome,rng,poolIds?) -> new genome,
  GEN.drawCell(ctx,x,y,angle,r,genome,hue,t,opts{alpha,flash,ghost}) — THE cell renderer; use it everywhere a cell appears.
Genome = length-19 array of organelle id strings or null (slot 0 ignored/nucleus).

## Shared state G (created by main.js; you mutate in place)
G = {
  seed, rng()->[0,1), tick, time (s), screen ('title'|'play'|'mutate'|'tree'|'dead'|'win'),
  paused, muted, dna (float; display floor), era (1..4),
  unlocked: {orgId:true,...}   // starts {fla:true}
  perks: {enz,buoy,visc,regen,potent -> true if bought},
  world: { R: 2600, light: 0..1, motes: [{x,y,vx,vy,e}] },
  player: Cell (ALSO present in G.cells),
  cells: [Cell...],            // cap 64 incl player
  shots: [{x,y,vx,vy,dmg,ttl,from (cell id), hostile:bool}],   // cap 80
  viruses: [{x,y,vx,vy,hp,tid (target cell id)}],              // cap 40
  fx: [{type,x,y,t0,hue,...}], // render consumes
  wave: { n:0, next: 75, active:false, left:0 },
  colonyBuds: [{angle,phase}], // 4 = win
  cam: {x,y,zoom},
  input: { aimX, aimY (world coords), thrust:0..1, fire:bool },
  divideReady: bool,
  stats: {motes:0,cellsEaten:0,waves:0,divisions:0,deaths:0,peakMass:0,dnaEarned:0,timeAlive:0},
  hooks: { playerDeath(), win(), fx(type,x,y,opts), sfx(name), divideReady() },
}
Cell = { id (int), species (0=player,1..4), hue (deg), x,y,vx,vy,angle,
         biomass, hp, energy (0..100), genome, gen, age, dead:false,
         cool:{fire:0,bite:0}, flash:0 (damage flash 0..1, decays) }
Radius ALWAYS = GEN.radiusOf(biomass). maxhp = 20 + stats.armor*6.
Species hues: player 190, S1 Grazer 95, S2 Sunspinner 55, S3 Lancer 0, S4 Spitter 285.

## Physics & economy (exact numbers — shared truth)
accel = stats.thrust*8/Math.sqrt(stats.mass); drag factor per second = 0.6+stats.drag (v *= Math.max(0,1-drag*dt) style).
Turning: rotate cell.angle toward desired at stats.turn rad/s. Thrust along angle * input.thrust (NPC AI sets own desire).
Metabolism: energy -= (1.1 + 0.02*stats.mass + 2.2*thrustUse)*dt.
Mote eaten (overlap r): biomass+=2, energy+=14*(G.perks.enz?1.3:1), G.dna+=0.25, stats.motes++ (player only for dna/stats).
Photo: energy += stats.photo*2.2*G.world.light*dt; player chl also G.dna += 0.02*nChl*light*dt.
Mito: if energy<30 && biomass>12: biomass-=0.5*stats.mito*dt; energy+=4*stats.mito*dt.
Starvation: energy<=0 -> hp -= 2.5*dt. Perk regen: hp += 1.2*dt (to maxhp). Perk visc: maxhp*1.25.
Eating cells: A eats B if rA > rB*1.22 && dist < rA*0.85: transfer 14 biomass/s A<-B, B dies at biomass<3.
Player eats NPC death: dna += 3 (small, r<26) else 6; stats.cellsEaten++.
Spikes: on cell-cell contact, each deals stats.dmg dps to the other (flash target).
Death (any cell): scatter biomass as ~biomass/3 motes around corpse; fx('die'). Player death -> hooks.playerDeath() (main handles respawn).
Division ready (player): biomass >= stats.cap -> G.divideReady=true, hooks.divideReady() once.
NPC divide at own cap: split into two at 0.48 biomass each; ONE child genome = GEN.mutate(...); child gen+1. Respect 64-cell cap (skip division at cap).
Dish boundary: soft push back inside R (force grows past R*0.96). Nothing exists outside R.

## Module list (yours is marked in your task)
- sim: world init+update — motes (drift, spawn to cap 240, cluster near 3 slow-moving nutrient upwellings), light cycle (light = 0.5+0.5*sin(time*0.05) eased), ALL cell physics/AI/eating/energy/division/mutation/death, colony bud win check (buds orbit player; 4 -> hooks.win()), player movement from G.input. Exports: {init(G), update(G,dt)}.
  NPC AI (sensor range ~ 260+vision*400): Grazer: seek nearest mote, flee cells >1.25x its r. Sunspinner: slow drift toward dish-center light, flee threats weakly. Lancer: hunt nearest cell <0.8x its r (incl player), else motes. Spitter: keep 240-360px from nearest smaller cell and set desire to strafe (combat module fires its gland). All: mild wander noise, avoid dish edge.
  Starting NPC populations (seeded placement, away from player spawn at dish center): 10 Grazers (genome fla,fla,cil), 8 Sunspinners (chl,chl,vac), 5 Lancers (fla,fla,spk,spk), 4 Spitters (fla,tox,sen). Place organelles in sensible slots (outer-ring rear for fla, etc.). Extinct species: 0.004/s chance immigrant at edge.
- combat: wave scheduling (interval 75 - 4*wave.n s, min 45; count 4+2*n phages spawn at rim aimed at the 3 largest cells with player bias), virus AI (speed 95 homing, retarget on target death), virus contact dmg 7/s to cells, shots (speed 320, ttl 1.6, dmg 12 * (G.perks.potent?1.5:1)), player fire: if stats.shot>0 && G.input.fire, cooldown 0.55/(1+0.25*(stats.shot-1)) toward aim; Spitter NPCs with tox fire at nearest smaller cell (hostile shots hurt player: dmg to any cell that isn't the shooter). Shots kill viruses (hp 8+wave.n). Spike contact kills viruses at stats.dmg dps. Wave cleared (all spawned dead) -> G.dna += 10+2*n, stats.waves++, fx+sfx. Exports: {update(G,dt)}.
- render: full-canvas draw each frame. Camera: follow player (lerp 4/s), zoom so player diameter ~ 17% of min(W,H), scaled by 1/stats.vision... more vision => smaller player on screen; lerp zoom 2/s; when dead follow corpse site. Draw: deep-water bg (radial gradient #061018->#02050a), dish rim (glowing circle R), nutrient shimmer (faint drifting dots from seeded positions — decorative), motes (2px glow dots, additive), colony buds (mini player-genome cells orbiting), all cells GEN.drawCell (skip offscreen; NPC alpha 1), viruses (spiky icosa-ish wisps, hue 320), shots (glow streaks), fx system (consume G.fx: 'eat' sparkle, 'die' burst of fading dots, 'hit' flash ring, 'bond' golden ring pulse, 'wave' rim ripple), light cycle: global overlay rgba(4,8,18, (1-light)*0.35), subtle vignette. Keep 60fps: cap fx 120, batch by composite mode. Exports: {draw(G,ctx,W,H,dt)}.
- ui: everything DOM inside the #ui div (position:fixed inset:0, pointer-events:none; interactive children re-enable). Own <style> injected once (dark museum-lab aesthetic: bg #0b0c10 panels, ink #d5d9e0, accent per-era; fonts: system-ui stack fine). Screens: title (name SPECK, tagline, CLICK TO BEGIN — button calls hooks.uiStart()), mutate (hex editor: SVG-or-DOM hex grid of 19 slots; click slot -> palette popover of unlocked organelles + Remove; live canvas preview 220px using GEN.drawCell with current edit genome; shows derived stats deltas (thrust/turn/cap/armor/etc.) vs current; CONFIRM DIVISION button -> hooks.uiDivide(editedGenome); genome starts as copy of player's), tree (4 era columns: era names 'Primordial Soup','Age of Light','Predation','Threshold of Many'; nodes = organelle unlocks (cost GEN.ORGANELLES[id].dna) + perks: enz 8 'Enzymes: +30% mote energy' era1, buoy 10 '-0.1 drag' era2, visc 16 '+25% max HP' era3, regen 20 'Regeneration' era4, potent 22 'Potent toxin +50%' era4; buy -> hooks.uiBuy(id) (main validates & deducts); locked if dna short or era not reached; era reached when >=2 purchases in previous era; CLOSE button), dead (stats table + 'CONTINUE LINEAGE' -> hooks.uiRespawn()), win ('MULTICELLULARITY' + stats + 'KEEP SWIMMING' -> hooks.uiContinue()). HUD (during play): top-left 3 slim bars (biomass->cap w/ pulsing DIVIDE READY state, energy, hp), top-right: DNA count, era name, colony pips 0..4, wave countdown when <=10s / 'PHAGE WAVE' banner while active; bottom hint line: contextual ('E — divide' when ready, 'T — evolution tree', 'hold click — fire' if tox). Exports: {init(G,root), show(G,name), hud(G)} — main calls hud(G) ~10Hz; show() toggles screens; register DOM handlers to G.hooks.uiXxx (main provides). Keyboard hints only; actual key handling is main's.
## Main.js (already being written by the lead — DO NOT write it) wires: input, loop (fixed dt 1/60), pause, hooks, respawn/continue logic, persistence, audio. Assume it exists and calls you exactly as stated.

## Style
Vivid-on-dark bioluminescent look. The dish is dark water; everything that lives, glows.
Performance target: 2019 Intel iGPU laptop at 60fps. State your loop caps in comments.
Module ≤ ~420 lines. Return ONLY the module source, no fences, no prose.
