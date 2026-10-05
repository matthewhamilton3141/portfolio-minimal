"""Turn album covers into shaded ASCII text for the music player.

usage: python3 tools/cover_ascii.py COLS image [image ...]

Writes covers/<image name>.txt next to the page. Brightness picks the character,
so the shading keeps depth instead of outlines (the same look as pixel-to-character).
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

RAMP = " .:-=+*#%@"  # light to dark on a light background; inverted below so dark areas read as dense ink


def convert(path, cols):
    img = ImageOps.exif_transpose(Image.open(path)).convert("L")
    img = ImageOps.autocontrast(img)
    rows = max(1, round(img.height / img.width * cols * 0.5))  # characters are about twice as tall as wide
    img = img.resize((cols, rows), Image.LANCZOS)
    lines = []
    for y in range(rows):
        line = ""
        for x in range(cols):
            v = img.getpixel((x, y)) / 255
            line += RAMP[min(len(RAMP) - 1, int((1 - v) * len(RAMP)))]
        lines.append(line.rstrip())
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    cols, files = int(sys.argv[1]), sys.argv[2:]
    out = Path(__file__).resolve().parent.parent / "covers"
    out.mkdir(exist_ok=True)
    for f in files:
        dest = out / (Path(f).stem + ".txt")
        dest.write_text(convert(f, cols))
        print(dest)
