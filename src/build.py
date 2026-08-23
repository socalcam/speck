#!/usr/bin/env python3
import json, sys, os
D = os.path.dirname(os.path.abspath(__file__))
mods = json.load(open(os.path.join(D, 'mods.json')))
order = ['sim', 'combat', 'render', 'ui']
by = {m['slug']: m for m in mods}
parts = [open(os.path.join(D, 'genome.js')).read()]
for s in order:
    parts.append('/* ==== module: %s (%s) ==== */\n' % (s, by[s].get('verdict','?')) + by[s]['code'])
parts.append(open(os.path.join(D, 'main.js')).read())
js = '\n\n'.join(parts)
open(os.path.join(D, '..', 'speck.concat.js'), 'w').write(js)
page = open(os.path.join(D, 'shell.html')).read() + '\n<script>\n' + js + '\n</script>\n'
open(os.path.join(D, '..', 'speck.html'), 'w').write(page)
print('built: page %d bytes, js %d bytes' % (len(page), len(js)))
