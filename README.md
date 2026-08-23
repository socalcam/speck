# SPECK

**An evolution arena in one page.** Begin as a speck with a single flagellum.
Eat, grow, divide — and each division is a chance to redesign yourself on a
19-slot hex body plan. Unlock organelles through a four-era DNA tech tree,
survive phage waves, and bond four daughters into a colony to reach
multicellularity. Around you, four NPC species carry genomes that **mutate
every generation**: the ecosystem evolves whether you act or not.

**Play:** https://claude.ai/code/artifact/8d1eea94-1861-46e6-a52f-7ef8d8c4e0dc

A fusion of: Spore / Thrive (stage arc, editor-between-generations),
Cell Lab (hex genome IS the visible body), Mitosis (bigger-absorbs-smaller),
Substrate: Emergence (self-evolving NPC ecology), Cell Command (piloting),
Cell to Singularity (era tech tree, idle chloroplast income, persistent
unlocks), Genome Guardian (toxin twin-stick + phage defense waves).

## Controls
**Mouse/keyboard:** mouse steers (distance = throttle) · WASD alternative ·
hold click/Space — fire toxin (needs a Toxin Gland) · **E** — divide & edit
genome · **T** — evolution tree · **P** pause · **M** mute.

**Controller (twin-stick):** left stick — swim · right stick — aim & fire
independently of your heading (RT fires forward) · **Y** — divide ·
**X** — tree · **A** — select · **B** — back · **Start** — pause. Menus are
driven by spatial focus navigation (d-pad or stick flicks); rumble feedback
on eat / damage / division / waves (Chrome; Firefox has no gamepad haptics).
Active stick input always has control — the DualSense touchpad doubles as an
OS mouse on Linux, so grazing it cannot steal the sticks; with everything
idle, the last-touched device wins. Press Share/F9 for a live pad inspector;
L3+R3 recalibrates a non-standard mapping. Tech unlocks persist in localStorage
across visits.

## Architecture
Zero dependencies, Canvas2D + DOM, one deterministic seeded PRNG (`?seed=N`).

```
src/genome.js    frozen shared heart: hex slots, 10 organelles, stats, mutation,
                 the one cell renderer (lead-authored, given to every agent)
src/mods.json    the four agent-built modules + review verdicts
  sim            world, motes, light cycle, cell physics, NPC AI (4 species),
                 eating, NPC division+mutation, immigration, colony win
  combat         phage waves, viruses, toxin shots, spike damage
  render         camera/zoom, dish, cells, fx, light overlay
  ui             title / hex genome editor / tech tree / HUD / death / win
src/main.js      lead-authored conductor: loop, input, hooks, eras,
                 persistence, WebAudio synth
src/build.py     genome + modules + main -> speck.html
test-game.mjs    jsdom integration: 24 assertions across the full arc
                 (boot -> eat -> divide -> tech -> era 4 -> colony WIN ->
                 endless -> death -> lineage -> NPC generations advance)
```

## Verify
```sh
npm i            # jsdom (dev only)
node test-game.mjs
```

## Provenance
Four modules implemented and adversarially reviewed by 8 parallel agents
against a frozen contract; integrated, seam-fixed, and soak-tested (3
sim-minutes: ecological boom, phage crash, an extinction, and an
immigration recovery — all emergent) by the lead. During the build, a
reviewer agent caught a bug in the orchestration itself (the review prompt
omitted the candidate code), fixed via workflow resume.

MIT
