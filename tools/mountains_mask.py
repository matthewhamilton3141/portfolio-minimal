"""Cut the sky and clouds out of the background mountain photo, for site.js's dotted mountains.

The photo is squashed vertically first (SQUASH), so everything after works on the compressed image and the page's
dots sample it evenly. Clouds are smooth and rock is textured, so the ridge in each column is the first row (from the top) where the local
texture stays high. Everything below the ridge is kept, everything above becomes transparent, with a soft edge.
Clouds hide the top of the left massif, so left of SEAM the photo and its mask come from PATCH instead: a copy of the
same photo with the clouds painted out and the sky plain white, so its sky is just the near-white area joined to the
top edge (snow is never that bright).
Writes a small RGBA image per theme, which the page dithers into dots. RGB is each dot's colour, and alpha is how
dense the dots are there (the sky mask times the tone), so the page just reads it off:
  images/mountains-dark.webp   light dots on black: bright snow and lit rock get the most dots, in the photo's colours
  images/mountains-light.webp  dark dots on white: dark rock gets the most dots, in deepened colours that show on white

    python3 tools/mountains_mask.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'mountains-src/torres-del-paine-panorama.png'
SQUASH = 1           # the photo is squashed to this share of its height first (the panorama is already wide and low)
THRESH, RUN = .035, 12   # texture that counts as rock, and how many rows of it in a row mark the ridge
INSET = 6   # rows to pull the edge down by, since the texture blur spreads a little onto the cloud above
PATCH = 'mountains-src/patagonia.jpg'
FIT = (.7864, 5.09, 4.9)   # PATCH onto SRC: scale, then x and y offset in SRC px (matched by feature points)
SEAM, BLEND = 562, 40      # SRC px: PATCH is used left of the valley at SEAM, fading over BLEND
WHITE = .94          # every channel of PATCH above this counts as sky (the brightest snow is about .91)
PATCH_INSET = 3      # px to pull PATCH's edge in by, so the jpeg's pale fringe around the ridge doesn't become dots

src = Image.open(SRC).convert('RGB')
aspect = src.height / src.width * SQUASH
WORK = (1000, round(1000 * aspect))   # analysis size
SIZE = (960, round(960 * aspect))     # output size: more pixels than dots, so the page samples it sharply
im = np.asarray(src.resize(WORK, Image.LANCZOS), dtype=np.float64) / 255
lum = im[..., 0] * .299 + im[..., 1] * .587 + im[..., 2] * .114
hp = lum - ndi.gaussian_filter(lum, 2)
tex = np.sqrt(ndi.gaussian_filter(hp ** 2, 4))

rock = tex > THRESH
# a row counts once RUN rows starting there are mostly rock
run = ndi.uniform_filter1d(rock.astype(float), RUN, axis=0, origin=-(RUN // 2)) > .8
h, w = rock.shape
ridge = np.array([np.argmax(run[:, x]) if run[:, x].any() else h for x in range(w)], dtype=float)
ridge = ndi.median_filter(ridge, 9) + INSET   # drop single-column spikes from cloud wisps

rows = np.arange(h)[:, None]
mask = np.clip((rows - ridge[None, :]) / 6 + .5, 0, 1)   # 6px feather at the ridge
mask = ndi.gaussian_filter(mask, 1.5)

# PATCH, moved onto SRC's pixels. its alpha marks where it covers SRC (it falls a few px short of the edges)
k, dx, dy = FIT
patch = Image.open(PATCH).convert('RGBA').transform(src.size, Image.AFFINE, (1 / k, 0, -dx / k, 0, 1 / k, -dy / k),
                                                    Image.BICUBIC, fillcolor=(0, 0, 0, 0))
patch = np.asarray(patch.resize(WORK, Image.LANCZOS), dtype=np.float64) / 255
# the uncovered rows above PATCH count as white too, so its sky still reaches the top edge (SRC is used there anyway)
covered = patch[..., 3] > .5
above = rows < covered.argmax(axis=0)[None, :]
labels, _ = ndi.label((patch[..., :3].min(axis=2) > WHITE) | above)
sky = np.isin(labels, np.setdiff1d(labels[0], 0))   # the white areas touching the top edge
patch_mask = ndi.gaussian_filter(ndi.binary_erosion(~sky, iterations=PATCH_INSET).astype(float), 1.5)

cols = np.arange(w) * src.width / w
use = (np.clip((SEAM - cols) / BLEND + .5, 0, 1)[None, :] * patch[..., 3])[..., None]
im = im * (1 - use) + patch[..., :3] * use
lum = im[..., 0] * .299 + im[..., 1] * .587 + im[..., 2] * .114
mask = mask * (1 - use[..., 0]) + patch_mask * use[..., 0]

if os.environ.get('MASK_PREVIEW'):   # MASK_PREVIEW=out.png also saves the photo over magenta where it's cut out
    Image.fromarray((np.dstack([im, mask]) * 255).round().astype(np.uint8)).save(os.environ['MASK_PREVIEW'])

def saturate(rgb, k):
    grey = rgb.mean(axis=2, keepdims=True)
    return np.clip(grey + (rgb - grey) * k, 0, 1)

def stretch(tone):
    # spread the mountain's tones over the full range (2nd to 98th percentile inside the mask), so a dim photo still
    # gets its densest dots on its brightest rock
    lo, hi = np.percentile(tone[mask > .5], [2, 98])
    return np.clip((tone - lo) / (hi - lo), 0, 1)

def define(tone, amount=1.4, radius=3):
    # local contrast (an unsharp mask), so ridgelines, rock faces and snow edges read as dots instead of blurring
    return np.clip(tone + amount * (tone - ndi.gaussian_filter(tone, radius)), 0, 1)

def hue(rgb, level, white=0):
    # keep each pixel's hue but set its brightness: the photo is dusk-dark, and a dot in its true colour vanishes on a
    # dark page. level scales the brightest channel; white mixes towards white for a lighter tint
    peak = np.maximum(rgb.max(axis=2, keepdims=True), 1e-3)
    return np.clip(rgb / peak * level * (1 - white) + white, 0, 1)

THEMES = {
    'dark': (hue(saturate(im, 1.3), .95, .2), define(stretch(lum) ** .9)),
    # the photo is mostly dark rock, so inverted it would be dense almost everywhere: a steep curve keeps the dense
    # dots for the darkest rock and opens up the rest, so the shapes read on white
    'light': (hue(saturate(im, 2.8), .5), define(stretch(1 - lum) ** 2, 1.8)),
}
for theme, (colour, tone) in THEMES.items():
    out_path = f'images/mountains-{theme}.webp'
    rgba = np.dstack([colour, mask * tone])
    out = Image.fromarray((rgba * 255).round().astype(np.uint8)).resize(SIZE, Image.LANCZOS)
    out.save(out_path, quality=85, alpha_quality=70, method=6)   # alpha is tone, so it can be lossy too
    print(out_path, out.size)
