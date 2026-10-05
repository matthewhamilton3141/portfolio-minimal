"""Embed pixel-to-character HTML exports into index.html as canvas data.

usage: python3 tools/embed_art.py light-export.html [dark-export.html]

With one export, both themes use it. With two, the page swaps to the
dark export in dark mode (export them at the same columns so the
canvas keeps its size).
"""
import html, json, re, sys
from pathlib import Path

q = lambda v: min(255, (v // 6) * 6 + 3)  # light quantise: fewer colours, longer runs


def parse(path):
    pre = re.search(r'<pre[^>]*>(.*)</pre>', Path(path).read_text(), re.S).group(1)
    pal, rows = {}, []
    for line in pre.split('\n'):
        runs = []
        for col, txt in re.findall(r'<span style="color:#([0-9a-f]{6})">(.*?)</span>', line):
            txt = html.unescape(txt)
            c = '%02x%02x%02x' % tuple(q(int(col[i:i + 2], 16)) for i in (0, 2, 4))
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
    return {'cols': cols, 'colors': ['#' + c for c in pal], 'rows': out}


dump = lambda o: json.dumps(o, separators=(',', ':'))
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
