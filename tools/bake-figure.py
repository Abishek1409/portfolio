"""Bake the ASCII portrait into a 3D point grid for js/story-figure-data.js.
Usage: python tools/bake-figure.py assets/hero-portrait-red-black.png js/story-figure-data.js assets/profile_photo_studio.png
(also writes two .png previews next to the output; delete them afterwards)

Each cell stores one byte: 0 = empty, otherwise (lum << 4) | depth, both 0..15 (lum >= 1).
Subject cells come from the red-black portrait (everything that is not the red disc or the
dark outside). Depth is a soft volume from the silhouette's distance transform plus a gentle
bulge at the face, so the figure turns like a bust rather than a flat card.
Disc cells (the red circle behind the figure) are stored separately as a bit mask.
"""
import base64, json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
N = 104
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
redness = r - np.maximum(g, b)

yy, xx = np.mgrid[0:H, 0:W]
cx, cy, rad = W / 2, H / 2, W / 2 - 2
inside = (xx - cx) ** 2 + (yy - cy) ** 2 < rad ** 2

# Per-cell averages
cs = H // N
def pool(a):
    a = a[:cs * N, :cs * N]
    return a.reshape(N, cs, N, cs).mean(axis=(1, 3))

# Tone comes from the studio photo (same framing, checked by correlation); the ASCII render's own
# glyph texture would band. Local contrast is boosted a little so features survive at cell size.
if len(sys.argv) > 3:
    st = np.asarray(Image.open(sys.argv[3]).convert('L').resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0
    blur = ndimage.gaussian_filter(st, W / 40)
    lum = np.clip(st + (st - blur) * 0.9, 0, 1)
c_lum = pool(lum)
c_red = pool(redness)
c_in = pool(inside.astype(np.float32))

disc = (c_in > 0.6)
# Subject: inside the circle and not dominated by red
subject = disc & (c_red < 0.06)
# Clean up: biggest component, fill holes, light open/close
subject = ndimage.binary_closing(subject, iterations=1)
subject = ndimage.binary_fill_holes(subject)
lab, n = ndimage.label(subject)
if n > 1:
    sizes = ndimage.sum(subject, lab, range(1, n + 1))
    subject = lab == (1 + int(np.argmax(sizes)))
subject = ndimage.binary_opening(subject, iterations=1)

# Depth: rounded volume from the silhouette, plus a face bulge
dist = ndimage.distance_transform_edt(subject)
vol = np.sqrt(dist / max(dist.max(), 1))
ys, xs = np.nonzero(subject)
# Face centre: roughly 38% down the subject's height, horizontally at its upper-half centre
top, bot = ys.min(), ys.max()
fy = top + (bot - top) * 0.40
upper = subject.copy(); upper[int(top + (bot - top) * 0.6):] = False
fx = np.nonzero(upper)[1].mean()
gy, gx = np.mgrid[0:N, 0:N]
bulge = np.exp(-(((gx - fx) / (N * 0.16)) ** 2 + ((gy - fy) / (N * 0.2)) ** 2))
nose = np.exp(-(((gx - fx) / (N * 0.035)) ** 2 + ((gy - (fy + N * 0.02)) / (N * 0.06)) ** 2))
depth = vol * 0.6 + bulge * 0.35 + nose * 0.12
depth = depth / depth[subject].max()

# Luminance: stretch the subject's range so the ASCII ramp gets used fully
sl = c_lum[subject]
lo, hi = np.percentile(sl, 2), np.percentile(sl, 98)
L = np.clip((c_lum - lo) / max(hi - lo, 1e-3), 0, 1)

cells = np.zeros((N, N), np.uint8)
q_l = np.clip(np.round(L * 14) + 1, 1, 15).astype(np.uint8)
q_d = np.clip(np.round(depth * 15), 0, 15).astype(np.uint8)
cells[subject] = (q_l[subject] << 4) | q_d[subject]

disc_only = disc & ~subject
bits = np.packbits(disc_only.astype(np.uint8).ravel())

js = (
    "// Generated from assets/hero-portrait-red-black.png and assets/profile_photo_studio.png by tools/bake-figure.py. Do not edit by hand.\n"
    "// cells: N*N bytes, 0 = empty, else (luminance << 4) | depth. disc: N*N bit mask (MSB first).\n"
    "window.STORY_FIGURE_DATA = " + json.dumps({
        "n": N,
        "face": [round(float(fx) / N, 3), round(float(fy) / N, 3)],
        "cells": base64.b64encode(cells.tobytes()).decode(),
        "disc": base64.b64encode(bits.tobytes()).decode(),
    }) + ";\n"
)
open(out, 'w').write(js)
print('subject cells', int(subject.sum()), 'disc cells', int(disc_only.sum()), 'face', fx, fy, 'bytes', len(js))

# Preview for checking
prev = np.zeros((N, N, 3), np.uint8)
prev[disc_only] = (120, 30, 40)
prev[subject, 0] = prev[subject, 1] = prev[subject, 2] = (L[subject] * 255).astype(np.uint8)
Image.fromarray(prev).resize((N * 4, N * 4), Image.NEAREST).save(out + '.lum.png')
dprev = (depth * subject * 255).astype(np.uint8)
Image.fromarray(dprev).resize((N * 4, N * 4), Image.NEAREST).save(out + '.depth.png')
