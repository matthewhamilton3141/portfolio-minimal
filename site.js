// shared by index.html and projects.html

// theme: follows the system until clicked, then remembers. pages listen for 'themechange'.
const root = document.documentElement, btn = document.getElementById('theme');
const isDark = () => root.dataset.theme
  ? root.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches;
const applyTheme = () => {
  root.toggleAttribute('data-dark', isDark());
  btn.textContent = isDark() ? '[淺]' : '[深]';   // the mode the click switches to
  btn.setAttribute('aria-label', isDark() ? 'switch to light mode' : 'switch to dark mode');
  dispatchEvent(new Event('themechange'));
};
matchMedia('(prefers-color-scheme: dark)').onchange = applyTheme;
try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch {}
applyTheme();
btn.onclick = () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  applyTheme();
};

// 陳文飛 scroll dock: each glyph fills over a third of the page.
// click a glyph to jump to its section, drag the column to scrub.
(() => {
  const desktop = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
  // each page names its three jump targets: <body data-jumps="top,done,now">
  const CHARS = ['陳', '文', '飛'], JUMPS = (document.body.dataset.jumps || '').split(',');

  const dock = document.createElement('div');
  dock.className = 'namefill-dock';
  const col = document.createElement('div');
  col.className = 'namefill';
  col.hidden = true;
  col.tabIndex = 0;
  col.setAttribute('role', 'slider');
  col.setAttribute('aria-label', '陳文飛, place on the page');
  col.setAttribute('aria-valuemin', '0');
  col.setAttribute('aria-valuemax', '100');
  const fills = CHARS.map((ch, i) => {
    const glyph = document.createElement('i');
    glyph.className = 'namefill-glyph';
    glyph.dataset.i = i;
    glyph.textContent = ch;
    const fill = document.createElement('b');
    fill.textContent = ch;
    glyph.appendChild(fill);
    col.appendChild(glyph);
    return fill;
  });
  dock.appendChild(col);
  document.body.appendChild(dock);

  const maxScroll = () => document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = () => maxScroll() > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll())) : 0;

  const easeTo = (top, duration = 900) => {
    const start = scrollY, dist = Math.min(top, maxScroll()) - start;
    if (Math.abs(dist) < 2) return;
    const t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = now => {
      const p = Math.min((now - t0) / duration, 1);
      scrollTo(0, start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const jump = i => {
    const el = document.getElementById(JUMPS[i]);
    easeTo(el ? el.getBoundingClientRect().top + scrollY - 40 : (i / 2) * maxScroll());
  };

  const sync = () => {
    if (!desktop.matches || maxScroll() <= 8) { col.hidden = true; return; }
    col.hidden = false;
    const p = progress();
    col.setAttribute('aria-valuenow', Math.round(p * 100));
    col.setAttribute('aria-valuetext', CHARS[Math.min(2, Math.floor(p * 3 - 1e-6))] || CHARS[0]);
    fills.forEach((fill, i) => {
      const local = Math.min(1, Math.max(0, p * 3 - i));
      fill.style.clipPath = `inset(0 0 ${((1 - local) * 100).toFixed(2)}% 0)`;
    });
  };
  let ticking = false;
  const requestSync = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; sync(); });
  };

  let winding = false, didDrag = false, startY = 0, startScroll = 0;
  col.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    winding = true; didDrag = false;
    startY = e.clientY; startScroll = scrollY;
    col.setPointerCapture(e.pointerId);
    col.focus({ preventScroll: true });
  });
  col.addEventListener('pointermove', e => {
    if (!winding) return;
    if (Math.abs(e.clientY - startY) > 5) didDrag = true;
    scrollTo(0, startScroll + ((e.clientY - startY) / 240) * maxScroll());
  });
  col.addEventListener('pointerup', e => {
    const glyph = e.target.closest('.namefill-glyph');
    if (winding && !didDrag && glyph) jump(+glyph.dataset.i);
    winding = didDrag = false;
  });
  col.addEventListener('pointercancel', () => { winding = didDrag = false; });
  col.addEventListener('keydown', e => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    jump(Math.min(2, Math.max(0, Math.round(progress() * 2) + d)));
  });

  addEventListener('scroll', requestSync, { passive: true });
  addEventListener('resize', requestSync);
  desktop.addEventListener('change', requestSync);
  new ResizeObserver(requestSync).observe(document.documentElement);
  sync();
})();



// github contribution graph: ink tints at each level, so it follows the monochrome theme
(() => {
  const root = document.getElementById('gh-graph');
  if (!root) return;
  const USER = 'matthewhamilton3141', WEEKS = 26;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const title = (count, date) => {
    const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (count === 0) return `no contributions on ${label}`;
    return `${count} contribution${count === 1 ? '' : 's'} on ${label}`;
  };

  const render = days => {
    // pad the first week so each day lands on its weekday row (sun = 0), like github
    const lead = days[0] ? new Date(days[0].date + 'T12:00:00').getDay() : 0;
    const cells = [...Array(lead).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const total = days.reduce((n, d) => n + d.count, 0);

    root.textContent = '';
    root.style.setProperty('--weeks', weeks.length);

    const months = document.createElement('div');
    months.className = 'gh-months';
    let last = -1;
    for (const week of weeks) {
      const day = week.find(Boolean), span = document.createElement('span');
      if (day) {
        const m = new Date(day.date + 'T12:00:00').getMonth();
        if (m !== last) { span.textContent = MONTHS[m]; last = m; }
      }
      months.append(span);
    }

    const grid = document.createElement('div');
    grid.className = 'gh-cells';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', `${total} contributions in the last six months`);
    for (let row = 0; row < 7; row++) {
      for (const week of weeks) {
        const d = week[row], cell = document.createElement('span');
        cell.className = 'gh-cell';
        if (!d) cell.classList.add('empty');
        else {
          cell.dataset.level = d.level ?? 0;
          cell.title = title(d.count, d.date);
        }
        grid.append(cell);
      }
    }

    const sum = document.createElement('p');
    sum.className = 'gh-total';
    sum.textContent = `${total} contributions in the last six months`;
    root.append(months, grid, sum);
  };

  const msg = text => {
    const p = document.createElement('p');
    p.className = 'gh-total';
    p.textContent = text;
    root.replaceChildren(p);
  };

  msg('loading contributions…');
  const today = new Date(), todayStr = iso(today);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=${today.getFullYear()}&y=${today.getFullYear() - 1}&_=${todayStr}`, {
    cache: 'no-store',
    signal: ctrl.signal,
  })
    .then(r => { if (!r.ok) throw new Error('bad response'); return r.json(); })
    .then(data => {
      const days = (data.contributions || [])
        .filter(d => d.date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-(WEEKS * 7));
      render(days);
    })
    .catch(() => msg('couldn’t load contributions'))
    .finally(() => clearTimeout(timeout));
})();

// "back to top" links scroll explicitly rather than relying on the #top anchor
document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', location.pathname + location.search);
}));
