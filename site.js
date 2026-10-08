// shared by index.html and projects.html

// theme: dark until the button picks light, then remembered. pages listen for 'themechange'.
// a switch crossfades the whole page at once (a view transition), so the colours, the art and the cover all change
// together. themechange's detail.faded tells the art it doesn't need its own sweep. browsers without view transitions,
// or with reduced motion, switch straight away
const root = document.documentElement, btn = document.getElementById('theme');
const isDark = () => root.dataset.theme !== 'light';
const applyTheme = (faded = false) => {
  root.toggleAttribute('data-dark', isDark());
  btn.textContent = isDark() ? '[淺]' : '[深]';   // the mode the click switches to
  btn.setAttribute('aria-label', isDark() ? 'switch to light mode' : 'switch to dark mode');
  dispatchEvent(new CustomEvent('themechange', { detail: { faded } }));
};
const switchTheme = change => {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change(); applyTheme(); return;
  }
  document.startViewTransition(() => { change(); applyTheme(true); });
};
try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch {}
applyTheme();
btn.onclick = () => switchTheme(() => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
});

// pages: home and projects swap in place instead of reloading (see the end of this file), so the header, with the music
// playing in it, carries on. what belongs to one page's content runs through onPage: now, and again after every swap,
// given a signal that aborts when that page is swapped out, for its listeners, timers and loops to stop on
const pageInits = [];
let pageCtl = new AbortController();
const onPage = init => { pageInits.push(init); init(pageCtl.signal); };

// 陳文飛 scroll dock: each glyph fills over a third of the page.
// click a glyph to jump to its section, drag the column to scrub.
(() => {
  const desktop = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
  // each page names its three jump targets: <body data-jumps="top,done,now">
  // (read at each jump: the dock stays across page swaps)
  const CHARS = ['陳', '文', '飛'], jumps = () => (document.body.dataset.jumps || '').split(',');

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
    const el = document.getElementById(jumps()[i]);
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
  const USER = 'matthewhamilton3141', WEEKS = 26;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // the contributions are fetched once a page load and shared by every visit to home after that
  let contributions = null;
  const fetchDays = () => {
    const today = new Date(), todayStr = iso(today);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    return fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=${today.getFullYear()}&y=${today.getFullYear() - 1}&_=${todayStr}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) throw new Error('bad response'); return r.json(); })
      .then(data => (data.contributions || [])
        .filter(d => d.date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-(WEEKS * 7)))
      .finally(() => clearTimeout(timeout));
  };

  onPage(signal => {
    const root = document.getElementById('gh-graph');
    if (!root) return;

    const render = days => {
      clearInterval(spinner);
      const total = days.reduce((n, d) => n + d.count, 0);
      // the graph starts on a sunday (row 0, like github), so it is always WEEKS columns: the height its placeholder
      // (msg) reserves. a partial first week's days drop off the front
      const first = days[0] ? new Date(days[0].date + 'T12:00:00').getDay() : 0;
      const cells = days.slice(first);
      while (cells.length % 7) cells.push(null);
      const weeks = [];
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

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
        weeks.forEach((week, w) => {
          const d = week[row], cell = document.createElement('span');
          cell.className = 'gh-cell';
          cell.style.setProperty('--i', w + row * .6);   // its place in the opening wave
          if (!d) cell.classList.add('empty');
          else {
            cell.dataset.level = d.level ?? 0;
            cell.dataset.count = d.count;
            cell.dataset.date = dayLabel(d.date);
          }
          grid.append(cell);
        });
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

      // the total leads, as plain text above the graph
      const sum = document.createElement('p');
      sum.className = 'gh-total';
      sum.textContent = `${total} contributions in the last six months`;
      root.replaceChildren(sum, months, grid, tip);

      // on opening (once a tab), the squares fade in as a wave from the oldest week to today, once the graph is in view.
      // only opacity, so the mountains' halos around them (which read their boxes) aren't thrown off
      let waved = matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { waved ||= !!sessionStorage.getItem('waved'); } catch {}
      if (!waved && 'IntersectionObserver' in window) {
        grid.classList.add('wait');
        const io = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          grid.classList.replace('wait', 'in');
          try { sessionStorage.setItem('waved', '1'); } catch {}
        }, { threshold: .3 });
        io.observe(grid);
        signal.addEventListener('abort', () => io.disconnect());
      }
    };

    // reserve: while loading, the graph's whole frame is already there (the total line, the month row and WEEKS × 7
    // empty cells), so the page doesn't shrink and then jump down when the squares arrive
    const msg = (text, reserve = false) => {
      clearInterval(spinner);
      const p = document.createElement('p');
      p.className = 'gh-total';
      p.textContent = text;
      if (!reserve) { root.replaceChildren(p); return p; }
      root.style.setProperty('--weeks', WEEKS);
      const months = document.createElement('div');
      months.className = 'gh-months';
      months.append(...Array.from({ length: WEEKS }, () => document.createElement('span')));
      const grid = document.createElement('div');
      grid.className = 'gh-cells';
      // the placeholder tiles sit where the real ones will, in the same wave order, so they fade in from place
      grid.append(...Array.from({ length: WEEKS * 7 }, (_, k) => {
        const cell = document.createElement('span');
        cell.className = 'gh-cell ph';
        cell.style.setProperty('--i', Math.floor(k / 7) + (k % 7) * .6);
        return cell;
      }));
      root.replaceChildren(p, months, grid);
      return p;
    };
    // a braille spinner while it loads; one still frame for reduced motion
    const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    let spinner = 0, frame = 0;
    const p = msg(`${SPIN[0]} loading contributions`, true);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spinner = setInterval(() => { p.textContent = `${SPIN[frame = (frame + 1) % SPIN.length]} loading contributions`; }, 80);
    }

    signal.addEventListener('abort', () => clearInterval(spinner));
    (contributions ||= fetchDays())
      .then(days => { if (!signal.aborted) render(days); })
      .catch(() => { contributions = null; if (!signal.aborted) msg('couldn’t load contributions'); });
  });
})();

// "back to top" links scroll explicitly rather than relying on the #top anchor
onPage(() => document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', location.pathname + location.search);
})));

// mountains behind the page (a torres del paine panorama, sky cut out by tools/mountains_mask.py), drawn in pixel-to-character's
// "dots" style: the photo is sampled on an even lattice of round dots and dithered with an 8×8 bayer matrix. each
// theme has its own export, whose alpha is the dot density and whose colour is the dot's colour. it's shown whole,
// centred on the bottom edge, stretched sideways to WIDTH of the window, its sides fading out, and is rebuilt on
// resize and theme change. dots clear away around text that sits over them (see halos below)
(() => {
  const canvas = document.createElement('canvas');
  canvas.className = 'mountains';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const S = 2.8;   // dot spacing in css px
  // dot radius and strength per theme: small dark dots on white read as pale grey, so light mode gets bigger, full-strength ones
  const R = { dark: .24 * S, light: .3 * S }, ALPHA = { dark: .75, light: 1 };
  const COLOUR = true;   // false draws every dot in the text colour
  const SCALE = .7;      // sets the height: as tall as the photo would be at this share of the window's width
  const WIDTH = .95;     // the photo's actual width, as a share of the window's (wider than SCALE stretches it sideways)
  const FADE = .12;      // how much of the photo's width each side fades over
  // the cursor lights the 8px blocks it passes over, like the hero art (ascii.js): each block's dots turn more vivid, then
  // fade back block by block. GLOW_R px around the pointer; GLOW_FADE lost per frame; at full glow, GLOW_SAT × the
  // saturation; LEVELS steps between, so lit dots still share fills
  const BLK = 8, GLOW_R = 52, GLOW_FADE = .01, GLOW_SAT = 1.6, LEVELS = 4;
  const tint = (fill, amount) => {
    const [r, g, b] = fill.match(/\d+/g).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return fill;   // greys stay grey
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = Math.min(1, d / (1 - Math.abs(2 * l - 1)) * (1 + (GLOW_SAT - 1) * amount));
    return `hsl(${h * 60} ${s * 100}% ${l * 100}%)`;
  };

  // 8×8 bayer thresholds, as in pixel-to-character's dot glyphs
  const BAYER = (() => {
    let b = [[0]];
    for (let size = 1; size < 8; size *= 2) {
      const n = [];
      for (let y = 0; y < size * 2; y++) {
        n.push([]);
        for (let x = 0; x < size * 2; x++) n[y].push(4 * b[y % size][x % size] + [0, 2, 3, 1][(y < size ? 0 : 2) + (x < size ? 0 : 1)]);
      }
      b = n;
    }
    return b.map(row => row.map(v => (v + .5) / 64));
  })();

  // each theme's export, loaded when first needed. peak: the first row with mountain in it, as a share of the height
  const images = {};
  const load = theme => images[theme] ||= new Promise(done => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      g.drawImage(img, 0, 0);
      const a = g.getImageData(0, 0, c.width, c.height).data;
      let k = 3;
      // scans row by row, so the first hit is in the top row with mountain. alpha is tone too, so even faint dots count
      while (k < a.length && a[k] <= 12) k += 4;
      done({ img, peak: Math.floor((k >> 2) / c.width) / c.height });
    };
    img.onerror = () => done(null);
    img.src = `images/mountains-${theme}.webp?v=10`;   // bump after re-running tools/mountains_mask.py
  });
  const sample = document.createElement('canvas'), sctx = sample.getContext('2d', { willReadFrequently: true });

  // text over the mountains gets a halo where the dots dissolve, so it stays readable. dots are dithered, so lowering
  // their density near the words thins them out gradually, and a fixed per-dot jitter makes the edge fuzzy. the halos
  // follow the words as the page scrolls, easing in and out
  // px around each line where the dots are fully cleared, then how far they take to come back. NOISE: the share of
  // clearance each dot can give back, by its jitter, so cleared areas keep a few stray dots instead of a hard block
  const PAD = 0, FALL = 5, NOISE = .6;
  const TAU = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 90;   // easing time constant, ms
  // on opening (once a tab), the mountains fill in from the base up to the peaks: a front rises through the lattice and
  // each dot's tone ramps up behind it, so the bayer dither brings the dots in as it passes. RISE ms; SOFT is how much of
  // the height the front's edge spans. reduced motion skips it
  const RISE = 1600, SOFT = .35;
  let rise = 0;   // when the rise started, while it's running
  let risen = !TAU;
  try { risen ||= !!sessionStorage.getItem('risen'); sessionStorage.setItem('risen', '1'); } catch {}
  // non-text things that also get a halo. the github graph clears square by square, so the hidden cells where its
  // first and last weeks are short stay dotted instead of leaving blank corners. the projects' svg buttons are icons
  // with no text, so their boxes get the halo too
  const KEEP = '.art, .gh-cell:not(.empty), .hl, img.ico, .proj-link', BTN_MARGIN = 0;   // px of dot-free space past each button's edge

  let dots = null;   // the sampled lattice: { gw, gh, H, tone, key, fills, jit, rad, alpha }
  let cur = null, target = null, raf = 0, last = 0, dirty = true;
  let pointer = null, moved = false;   // the mouse, in window coordinates; moved: it has moved since the last frame

  const build = async () => {
    const theme = document.documentElement.hasAttribute('data-dark') ? 'dark' : 'light';
    const art = await load(theme);
    if (!art || theme !== (document.documentElement.hasAttribute('data-dark') ? 'dark' : 'light')) return;
    const { img, peak } = art;
    const dpr = devicePixelRatio || 1, W = canvas.clientWidth;
    // the canvas runs from just above the highest peak down to the bottom edge, where the photo ends
    const gw = Math.ceil(W / S), iw = Math.round(gw * WIDTH), ih = gw * SCALE * img.naturalHeight / img.naturalWidth;   // in dots
    const H = Math.round((ih * (1 - peak) + 2) * S);
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sample the photo once per dot: scale it to the lattice, centred, with the peak two dots below the top
    const gh = Math.ceil(H / S), x0 = Math.round((gw - iw) / 2);
    sample.width = gw; sample.height = gh;
    sctx.clearRect(0, 0, gw, gh);
    sctx.drawImage(img, x0, 2 - peak * ih, iw, ih);
    const side = i => { const f = Math.min(i - x0, x0 + iw - i) / (iw * FADE); return f >= 1 ? 1 : f <= 0 ? 0 : f * f * (3 - 2 * f); };
    const px = sctx.getImageData(0, 0, gw, gh).data;
    const ink = getComputedStyle(document.body).color;

    // each dot's tone and colour (4 bits a channel, so colours share fills), and its jitter for the halo's fuzzy edge
    const n = gw * gh, tone = new Float32Array(n), key = new Uint16Array(n).fill(65535), jit = new Float32Array(n);
    const bw = Math.ceil(W / BLK), bh = Math.ceil(H / BLK);   // the glow grid: one value per 8px block
    const fills = [], index = new Map();
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = j * gw + i, k = c * 4, a = px[k + 3] / 255 * side(i);
      if (a < .05) continue;
      const fill = COLOUR ? `rgb(${px[k] | 15},${px[k + 1] | 15},${px[k + 2] | 15})` : ink;
      if (!index.has(fill)) { index.set(fill, fills.length); fills.push(fill); }
      tone[c] = a; key[c] = index.get(fill);
      jit[c] = (Math.imul(c, 2654435761) >>> 0) / 4294967296 * .6;
    }
    const lit = Array.from({ length: LEVELS }, (_, L) => fills.map(f => tint(f, (L + 1) / LEVELS)));
    dots = { gw, gh, W, H, tone, key, fills, lit, bw, glow: new Float32Array(bw * bh), jit, rad: R[theme], alpha: ALPHA[theme] };
    cur = new Float32Array(n); target = new Float32Array(n);
    dirty = true;
    halos(); cur.set(target);   // start settled, so a load or theme flip doesn't animate the halos in
    if (!risen) { risen = true; rise = performance.now(); }   // the first build, once the photo has loaded
    render();
    if (rise && !raf) raf = requestAnimationFrame(frame);
  };

  // the text and boxes to keep clear: every visible text line on the page, plus KEEP. they're measured in page
  // coordinates, so a scroll only shifts them, and measured again only when the page changes (see remeasure). the
  // scroll dock is fixed to the window, so its glyphs are kept in window coordinates (fixed)
  let measured = null;
  const rects = () => {
    if (measured) return measured;
    const out = [], y = scrollY, walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: t => t.data.trim() && !t.parentElement.closest('script, style, header, [hidden]') ? 1 : 2,
    });
    const add = (r, fixed, m = 0) =>
      out.push({ left: r.left - m, right: r.right + m, top: r.top - m + (fixed ? 0 : y), bottom: r.bottom + m + (fixed ? 0 : y), width: r.width + 2 * m, fixed });
    const range = document.createRange();
    for (let t; (t = walk.nextNode());) {
      range.selectNodeContents(t);
      const fixed = !!t.parentElement.closest('.namefill-dock');
      for (const r of range.getClientRects()) add(r, fixed);
    }
    for (const el of document.querySelectorAll(KEEP)) {
      if (el.closest('header')) continue;
      // the svg buttons get a little dot-free space past their edges, so the icons don't sit against the dots
      add(el.getBoundingClientRect(), false, el.matches('.proj-link') ? BTN_MARGIN : 0);
    }
    return measured = out;
  };

  // the halo map: 1 where dots should be gone, fading to 0 FALL px past each padded box
  const halos = () => {
    const { gw, gh, H, jit } = dots, top = innerHeight - H, reach = PAD + FALL;
    target.fill(0);
    for (const r of rects()) {
      const y = r.fixed ? 0 : scrollY;
      if (!r.width || r.bottom - y < top - reach || r.top - y > innerHeight + reach) continue;
      const l = r.left, rt = r.right, t = r.top - y - top, b = r.bottom - y - top;
      const i0 = Math.max(0, Math.floor((l - reach) / S)), i1 = Math.min(gw - 1, Math.ceil((rt + reach) / S));
      const j0 = Math.max(0, Math.floor((t - reach) / S)), j1 = Math.min(gh - 1, Math.ceil((b + reach) / S));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (i + .5) * S, y = (j + .5) * S;
        const dx = Math.max(l - x, 0, x - rt), dy = Math.max(t - y, 0, y - b), d = Math.hypot(dx, dy);
        const f = d <= PAD ? 1 : d >= reach ? 0 : 1 - (d - PAD) / FALL;
        const c = j * gw + i, v = f * f * (3 - 2 * f);
        if (v > target[c]) target[c] = v;
      }
    }
    // the clearance is eased by each dot's jitter (0 to 1 after dividing by its max), so some dots survive inside it
    for (let c = 0; c < target.length; c++) target[c] *= 1 - NOISE * jit[c] / .6;
    dirty = false;
  };

  const render = () => {
    const { gw, gh, W, H, tone, key, fills, lit, bw, glow, jit, rad, alpha } = dots, bh = glow.length / bw;
    const paths = fills.map(() => new Path2D());
    const glowing = new Map();   // level × 65536 + fill → path, for the dots the cursor has lit
    // the rise: how far up each row the front has reached (eased out), as a share of the row's tone
    const t = rise ? Math.min(1, (performance.now() - rise) / RISE) : 1, front = (1 - (1 - t) ** 3) * (1 + SOFT);
    const up = rise ? Float32Array.from({ length: gh }, (_, j) => Math.min(1, Math.max(0, (front - 1 + (j + .5) / gh) / SOFT))) : null;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = j * gw + i;
      if (key[c] === 65535 || tone[c] * (up ? up[j] : 1) - cur[c] * (1 + jit[c]) <= BAYER[j % 8][i % 8]) continue;
      const x = (i + .5) * S, y = (j + .5) * S;
      const b = Math.min(bh - 1, y / BLK | 0) * bw + Math.min(bw - 1, x / BLK | 0), L = Math.ceil(glow[b] * LEVELS);
      let p = paths[key[c]];
      if (L) {
        const id = L * 65536 + key[c];
        if (!glowing.has(id)) glowing.set(id, new Path2D());
        p = glowing.get(id);
      }
      p.moveTo(x + rad, y);
      p.arc(x, y, rad, 0, Math.PI * 2);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = alpha;
    paths.forEach((p, k) => { ctx.fillStyle = fills[k]; ctx.fill(p); });
    // lit dots also lose dark mode's translucency as they glow
    for (const [id, p] of glowing) {
      const L = id >> 16;
      ctx.globalAlpha = alpha + (1 - alpha) * L / LEVELS;
      ctx.fillStyle = lit[L - 1][id & 65535];
      ctx.fill(p);
    }
    ctx.globalAlpha = 1;
  };

  // ease the clearance towards the halo map, redrawing each frame until it settles
  const frame = now => {
    raf = 0;
    if (!dots) return;
    if (dirty) halos();
    const k = TAU ? 1 - Math.exp(-(now - (last || now - 16)) / TAU) : 1;
    last = now;
    let moving = false;
    for (let c = 0; c < cur.length; c++) {
      const d = target[c] - cur[c];
      if (d > .01 || d < -.01) { cur[c] += d * k; moving = true; } else cur[c] = target[c];
    }
    // glow: everything fades a step, then the dots around a pointer that has moved light up fully
    const { H, bw, glow } = dots, bh = glow.length / bw;
    for (let c = 0; c < glow.length; c++) if (glow[c]) { glow[c] = Math.max(0, glow[c] - GLOW_FADE); moving = true; }
    if (pointer && moved) {
      const px = pointer.x, py = pointer.y - (innerHeight - H);
      const j0 = Math.max(0, Math.floor((py - GLOW_R) / BLK)), j1 = Math.min(bh - 1, Math.floor((py + GLOW_R) / BLK));
      const i0 = Math.max(0, Math.floor((px - GLOW_R) / BLK)), i1 = Math.min(bw - 1, Math.floor((px + GLOW_R) / BLK));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = (i + .5) * BLK - px, dy = (j + .5) * BLK - py;
        if (dx * dx + dy * dy < GLOW_R * GLOW_R) { glow[j * bw + i] = 1; moving = true; }
      }
    }
    moved = false;
    if (rise) { if (now - rise >= RISE) rise = 0; moving = true; }   // one more frame after it ends draws them whole
    render();
    if (moving || dirty) raf = requestAnimationFrame(frame); else last = 0;
  };
  const kick = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };
  const remeasure = () => { measured = null; kick(); };

  addEventListener('scroll', kick, { passive: true });
  // the canvas sits behind everything and ignores the pointer, so follow the mouse on the window. touch has no hover
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY }; moved = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer = null; });
  // text that appears, hides or moves later (the github graph and its tooltip, fonts loading, a page swap, anything that
  // changes the page's size) is measured again. the header is skipped: it never sits over the mountains, and the
  // player's clock in it ticks several times a second. so is the scroll dock, which redraws on every scroll
  const skip = n => (n.nodeType === 1 ? n : n.parentElement)?.closest('header, .namefill-dock');
  new MutationObserver(list => { if (list.some(m => !skip(m.target))) remeasure(); })
    .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  new ResizeObserver(remeasure).observe(document.body);
  document.fonts?.ready.then(remeasure);
  addEventListener('resize', () => { measured = null; build(); });
  addEventListener('themechange', build);
  build();
})();

// links between the site's own pages swap the page in place instead of loading it, so the header stays and the music
// doesn't cut out. the new page's html is fetched (on hover, ahead of the click), and everything but the header is
// taken from it: its title, styles and jump targets, the header's title and links, and the content and footer under
// the header. then the page parts (onPage) run again, and so do the new page's own scripts: inline ones each visit (in a
// block, so a second visit's consts don't clash with the first's), and external ones only if this tab hasn't loaded them
(() => {
  const page = url => {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin || !/\/(index\.html|projects\.html)?$/.test(u.pathname)) return null;
    return u.pathname.replace(/\/$/, '/index.html');
  };
  let here = page(location.href);
  const fetched = new Map();   // page → promise of its html
  const get = path => {
    if (!fetched.has(path)) fetched.set(path, fetch(path).then(r => { if (!r.ok) throw new Error('bad response'); return r.text(); })
      .catch(e => { fetched.delete(path); throw e; }));
    return fetched.get(path);
  };

  const swap = html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    pageCtl.abort();
    pageCtl = new AbortController();

    document.title = doc.title;
    document.head.querySelectorAll('style').forEach(el => el.remove());
    document.head.append(...doc.head.querySelectorAll('style'));
    const desc = doc.head.querySelector('meta[name="description"]');
    if (desc) document.head.querySelector('meta[name="description"]')?.setAttribute('content', desc.content);
    document.body.dataset.jumps = doc.body.dataset.jumps || '';

    const header = document.querySelector('main > header'), next = doc.querySelector('main > header');
    header.querySelector('h1').replaceWith(next.querySelector('h1'));
    const nav = header.querySelector('nav');
    nav.querySelectorAll('a').forEach(a => a.remove());
    nav.prepend(...next.querySelectorAll('nav a'));

    const main = document.querySelector('main');
    [...main.children].forEach(el => { if (el !== header) el.remove(); });
    main.append(...[...doc.querySelector('main').children].filter(el => el.tagName !== 'HEADER'));
    document.querySelector('body > footer')?.remove();
    const footer = doc.querySelector('body > footer');
    if (footer) main.after(footer);

    pageInits.forEach(init => init(pageCtl.signal));
    const loaded = new Set([...document.scripts].filter(el => el.src).map(el => new URL(el.src).pathname));
    for (const old of doc.querySelectorAll('body script')) {
      if (old.type === 'importmap') continue;
      const src = old.getAttribute('src');
      if (src && loaded.has(new URL(src, location.href).pathname)) continue;
      const run = document.createElement('script');
      if (old.type) run.type = old.type;
      if (src) run.src = src;
      else run.textContent = `{\n${old.textContent}\n}`;
      document.body.append(run);
      if (!src) run.remove();   // inline ones have run by now
    }
  };

  const go = async (url, { push = true, y = 0 } = {}) => {
    const path = page(url);
    let html;
    try { html = await get(path); } catch { location.href = url; return; }
    if (push) {
      history.replaceState({ y: scrollY }, '');   // where to come back to
      history.pushState({ y: 0 }, '', url);
      history.scrollRestoration = 'manual';   // the swap puts the scroll back itself
    }
    here = path;
    const show = () => { swap(html); scrollTo(0, y); };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(show);
    else show();
  };

  addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    const path = page(a.href);
    if (!path || new URL(a.href).hash) return;
    e.preventDefault();
    if (path === here) scrollTo({ top: 0, behavior: 'smooth' });
    else go(a.href);
  });
  // fetch a page as soon as the pointer is on its link
  addEventListener('pointerover', e => {
    const a = e.target.closest?.('a[href]'), path = a && page(a.href);
    if (path && path !== here) get(path).catch(() => {});
  });
  addEventListener('popstate', e => {
    const path = page(location.href);
    if (path && path !== here) go(location.href, { push: false, y: e.state?.y || 0 });
  });
})();
