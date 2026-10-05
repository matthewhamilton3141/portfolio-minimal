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

  // one motion at a time: a jump, a flick's coast, or nothing. grabbing or wheeling cancels it
  let motion = 0;
  const stop = () => { motion++; col.classList.remove('spinning'); };
  const easeTo = (top, duration = 900) => {
    stop();
    const start = scrollY, dist = Math.min(top, maxScroll()) - start, id = motion;
    if (Math.abs(dist) < 2) return;
    const t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = now => {
      if (id !== motion) return;
      const p = Math.min((now - t0) / duration, 1);
      scrollTo(0, start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // a flicked wheel keeps spinning and slows down by friction, v in page px per ms
  const coast = v => {
    stop();
    if (Math.abs(v) < .05 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = motion;
    let last = performance.now(), y = scrollY;
    col.classList.add('spinning');
    const step = now => {
      if (id !== motion) return;
      const dt = Math.min(now - last, 32);
      last = now;
      y = Math.min(maxScroll(), Math.max(0, y + v * dt));
      scrollTo(0, y);
      v *= Math.pow(.94, dt / 16);
      if (Math.abs(v) > .02 && y > 0 && y < maxScroll()) requestAnimationFrame(step);
      else col.classList.remove('spinning');
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

  // grab the wheel and turn it: dragging the column's own height moves through the whole page, so the
  // fill edge stays near the pointer. let go mid-drag and it keeps spinning
  let winding = false, didDrag = false, startY = 0, startScroll = 0, samples = [];
  const ratio = () => maxScroll() / col.offsetHeight;
  col.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    stop();
    winding = true; didDrag = false;
    startY = e.clientY; startScroll = scrollY;
    samples = [{ t: e.timeStamp, y: e.clientY }];
    col.setPointerCapture(e.pointerId);
    col.classList.add('grabbing');
    col.focus({ preventScroll: true });
  });
  col.addEventListener('pointermove', e => {
    if (!winding) return;
    if (Math.abs(e.clientY - startY) > 5) didDrag = true;
    samples.push({ t: e.timeStamp, y: e.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 80) samples.shift();
    scrollTo(0, startScroll + (e.clientY - startY) * ratio());
  });
  const release = e => {
    if (!winding) return;
    winding = false;
    col.classList.remove('grabbing');
    if (!didDrag) {
      const glyph = e.type === 'pointerup' && e.target.closest('.namefill-glyph');
      if (glyph) jump(+glyph.dataset.i);
      return;
    }
    didDrag = false;
    const a = samples[0], b = samples[samples.length - 1];
    // a pointer that stopped before letting go has no spin left
    if (e.timeStamp - b.t < 60 && b.t > a.t) coast(((b.y - a.y) / (b.t - a.t)) * ratio());
  };
  col.addEventListener('pointerup', release);
  col.addEventListener('pointercancel', release);
  addEventListener('wheel', stop, { passive: true });
  col.addEventListener('keydown', e => {
    const step = innerHeight * .4;
    const keys = {
      ArrowDown: () => easeTo(scrollY + step, 300), ArrowUp: () => easeTo(Math.max(0, scrollY - step), 300),
      ArrowRight: () => jump(Math.min(2, Math.round(progress() * 2) + 1)),
      ArrowLeft: () => jump(Math.max(0, Math.round(progress() * 2) - 1)),
      Home: () => jump(0), End: () => easeTo(maxScroll()),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
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
  const dayLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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
          cell.dataset.count = d.count;
          cell.dataset.date = dayLabel(d.date);
        }
        grid.append(cell);
      }
    }

    // one shared tooltip: its text is the day's count and date, and it sits centered above the pointer
    const tip = document.createElement('div');
    tip.className = 'gh-tip';
    tip.hidden = true;
    let hovered = null;
    const fill = cell => {
      const n = Number(cell.dataset.count);
      tip.textContent = n === 0
        ? `no contributions on ${cell.dataset.date}`
        : `${n} contribution${n === 1 ? '' : 's'} on ${cell.dataset.date}`;
    };
    const place = x => {
      const half = tip.offsetWidth / 2;
      const left = x - root.getBoundingClientRect().left;
      tip.style.left = `${Math.min(Math.max(left, half), root.clientWidth - half)}px`;
    };
    const show = (cell, x) => {
      if (cell !== hovered) {
        hovered = cell;
        fill(cell);
        tip.style.top = `${cell.offsetTop}px`;
        tip.hidden = false;
      }
      place(x);
    };
    const hide = () => { hovered = null; tip.hidden = true; };
    grid.addEventListener('pointermove', e => {
      const cell = e.target.closest('.gh-cell[data-date]');
      if (cell) show(cell, e.clientX); else hide();
    });
    grid.addEventListener('pointerleave', hide);

    // the total leads, as a highlighted phrase in running text, like the intro line on the page
    const sum = document.createElement('p');
    sum.className = 'gh-total';
    const count = document.createElement('span');
    count.className = 'hl';
    count.textContent = total;
    sum.append(count, ` contributions in the last six months`);
    root.replaceChildren(sum, months, grid, tip);
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
