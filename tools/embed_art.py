"""Embed pixel-to-character HTML exports into index.html as canvas data.

usage: python3 tools/embed_art.py light-export.html [dark-export.html]

With one export, both themes use it. With two, the page swaps to the
dark export in dark mode (export them at the same columns so the
canvas keeps its size).
"""
import html, json, re, sys
from pathlib import Path

q = lambda v, step=6: min(255, (v // step) * step + step // 2)  # light quantise: fewer colours, longer runs


def parse(path, step=6):
    text = Path(path).read_text()
    m = re.search(r'<pre([^>]*)>(.*)</pre>', text, re.S)
    pre = m.group(2) if m else text  # a bare file of span lines (covers/*-color.txt) has no <pre>
    # the export's weight is a text stroke, in em (weight × 0.12)
    stroke = re.search(r'-webkit-text-stroke:\s*([\d.]+)em', m.group(1)) if m else None
    pal, rows = {}, []
    for line in pre.split('\n'):
        runs = []
        for col, txt in re.findall(r'<span style="color:#([0-9a-f]{6})">(.*?)</span>', line):
            txt = html.unescape(txt)
            c = '%02x%02x%02x' % tuple(q(int(col[i:i + 2], 16), step) for i in (0, 2, 4))
            k = -1 if not txt.strip() else pal.setdefault(c, len(pal))
            if runs and runs[-1][0] == k:
                runs[-1][1] += txt
            else:
                runs.append([k, txt])
        if runs and runs[-1][0] == -1:
            runs.pop()
        rows.append(runs)
    while rows and not rows[-1]:
        rows.pop()

    cols, out = 0, []
    for runs in rows:
        x, r2 = 0, []
        for k, t in runs:
            if k != -1:
                r2.append([x, k, t])
            x += len(t)
        cols = max(cols, x)
        out.append(r2)
    print(f'{path}: {len(out)} rows x {cols} cols, {len(pal)} colours')
    art = {'cols': cols, 'colors': ['#' + c for c in pal], 'rows': out}
    if stroke and float(stroke.group(1)):
        art['stroke'] = float(stroke.group(1))
    return art


dump = lambda o: json.dumps(o, separators=(',', ':'))


if __name__ == '__main__':
    light = parse(sys.argv[1])
    if len(sys.argv) > 2:
        data = '{"light":' + dump(light) + ',"dark":' + dump(parse(sys.argv[2])) + '}'
    else:  # one export for both themes; don't ship it twice
        data = '(a => ({ light: a, dark: a }))(' + dump(light) + ')'

    page = Path(__file__).resolve().parent.parent / 'index.html'
    s = page.read_text()
    s, n = re.subn(r'    const ART = .*?;\n', lambda m: '    const ART = ' + data + ';\n', s, count=1, flags=re.S)
    assert n == 1, 'ART line not found in index.html'
    page.write_text(s)
    print(f'embedded {len(data) // 1024} KB')
