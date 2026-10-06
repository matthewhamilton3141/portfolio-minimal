"""Pack the ASCII album covers into one JSON file each, for the music player.

usage: python3 tools/pack_covers.py

Reads covers/<name>-light-color.txt and covers/<name>-dark-color.txt and writes
covers/<name>.json as {"light": art, "dark": art}, the same shape as the hero's ART.
The player fetches a cover only when its track loads.
"""
import json
from pathlib import Path
from embed_art import parse

covers = Path(__file__).resolve().parent.parent / 'covers'
for light in sorted(covers.glob('*-light-color.txt')):
    name = light.name.removesuffix('-light-color.txt')
    dark = covers / f'{name}-dark-color.txt'
    data = {}
    for theme, src in (('light', light), ('dark', dark)):
        art = parse(src, step=16)  # covers draw at ~5px a glyph, so a coarser palette costs nothing visible
        # parse trims blank edges; pin both themes to the source grid so the canvas keeps its size across a theme flip
        grid = (covers / f'{name}-{theme}.txt').read_text().rstrip('\n').split('\n')
        art['cols'] = max(len(l) for l in grid)
        art['rows'] += [[]] * (len(grid) - len(art['rows']))
        data[theme] = art
    out = covers / f'{name}.json'
    out.write_text(json.dumps(data, separators=(',', ':')))
    print(f'{out.name}: {out.stat().st_size // 1024} KB')
