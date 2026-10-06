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
    clearInterval(spinner);
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

    // the total leads, as plain text above the graph
    const sum = document.createElement('p');
    sum.className = 'gh-total';
    sum.textContent = `${total} contributions in the last six months`;
    root.replaceChildren(sum, months, grid, tip);
  };

  const msg = text => {
    clearInterval(spinner);
    const p = document.createElement('p');
    p.className = 'gh-total';
    p.textContent = text;
    root.replaceChildren(p);
    return p;
  };
  // a braille spinner while it loads; one still frame for reduced motion
  const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  let spinner = 0, frame = 0;
  const p = msg(`${SPIN[0]} loading contributions`);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    spinner = setInterval(() => { p.textContent = `${SPIN[frame = (frame + 1) % SPIN.length]} loading contributions`; }, 80);
  }
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
  // the cursor lights the dots it passes over, like the hero art (ascii.js): each turns more vivid and grows, then fades
  // back over a second or two. GLOW_R px around the pointer; GLOW_FADE lost per frame; at full glow, GLOW_SAT × the
  // saturation and GROW more radius; LEVELS steps between, so lit dots still share fills
  const GLOW_R = 52, GLOW_FADE = .01, GLOW_SAT = 1.6, GROW = .35, LEVELS = 4;
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
    img.src = `images/mountains-${theme}.webp?v=8`;   // bump after re-running tools/mountains_mask.py
  });
  const sample = document.createElement('canvas'), sctx = sample.getContext('2d', { willReadFrequently: true });

  // text over the mountains gets a halo where the dots dissolve, so it stays readable. dots are dithered, so lowering
  // their density near the words thins them out gradually, and a fixed per-dot jitter makes the edge fuzzy. the halos
  // follow the words as the page scrolls, easing in and out
  const PAD = 0, FALL = 5;   // px around each line where the dots are fully cleared, then how far they take to come back
  const TAU = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 90;   // easing time constant, ms
  // non-text things that also get a halo. the github graph clears square by square, so the hidden cells where its
  // first and last weeks are short stay dotted instead of leaving blank corners
  const KEEP = '.art, .gh-cell:not(.empty), .hl, img.ico';

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
    dots = { gw, gh, W, H, tone, key, fills, lit, glow: new Float32Array(n), jit, rad: R[theme], alpha: ALPHA[theme] };
    cur = new Float32Array(n); target = new Float32Array(n);
    dirty = true;
    halos(); cur.set(target);   // start settled, so a load or theme flip doesn't animate the halos in
    render();
  };

  // the text and boxes to keep clear: every visible text line on the page, plus KEEP
  const rects = () => {
    const out = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: t => t.data.trim() && !t.parentElement.closest('script, style, header, [hidden]') ? 1 : 2,
    });
    const range = document.createRange();
    for (let t; (t = walk.nextNode());) { range.selectNodeContents(t); out.push(...range.getClientRects()); }
    for (const el of document.querySelectorAll(KEEP)) if (!el.closest('header')) out.push(el.getBoundingClientRect());
    return out;
  };

  // the halo map: 1 where dots should be gone, fading to 0 FALL px past each padded box
  const halos = () => {
    const { gw, gh, H } = dots, top = innerHeight - H, reach = PAD + FALL;
    target.fill(0);
    for (const r of rects()) {
      if (!r.width || r.bottom < top - reach || r.top > innerHeight + reach) continue;
      const l = r.left, rt = r.right, t = r.top - top, b = r.bottom - top;
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
    dirty = false;
  };

  const render = () => {
    const { gw, gh, W, H, tone, key, fills, lit, glow, jit, rad, alpha } = dots;
    const paths = fills.map(() => new Path2D());
    const glowing = new Map();   // level × 65536 + fill → path, for the dots the cursor has lit
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = j * gw + i;
      if (key[c] === 65535 || tone[c] - cur[c] * (1 + jit[c]) <= BAYER[j % 8][i % 8]) continue;
      const x = (i + .5) * S, y = (j + .5) * S, L = Math.ceil(glow[c] * LEVELS);
      let p = paths[key[c]], r = rad;
      if (L) {
        const id = L * 65536 + key[c];
        if (!glowing.has(id)) glowing.set(id, new Path2D());
        p = glowing.get(id); r = rad * (1 + GROW * L / LEVELS);
      }
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
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
    const { gw, gh, H, glow } = dots;
    for (let c = 0; c < glow.length; c++) if (glow[c]) { glow[c] = Math.max(0, glow[c] - GLOW_FADE); moving = true; }
    if (pointer && moved) {
      const px = pointer.x, py = pointer.y - (innerHeight - H);
      const j0 = Math.max(0, Math.floor((py - GLOW_R) / S)), j1 = Math.min(gh - 1, Math.floor((py + GLOW_R) / S));
      const i0 = Math.max(0, Math.floor((px - GLOW_R) / S)), i1 = Math.min(gw - 1, Math.floor((px + GLOW_R) / S));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = (i + .5) * S - px, dy = (j + .5) * S - py;
        if (dx * dx + dy * dy < GLOW_R * GLOW_R) { glow[j * gw + i] = 1; moving = true; }
      }
    }
    moved = false;
    render();
    if (moving || dirty) raf = requestAnimationFrame(frame); else last = 0;
  };
  const kick = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener('scroll', kick, { passive: true });
  // the canvas sits behind everything and ignores the pointer, so follow the mouse on the window. touch has no hover
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY }; moved = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer = null; });
  // text that appears or moves later (the github graph, fonts loading) moves the halos too. the header is skipped: it
  // never sits over the mountains, and the player's clock in it ticks several times a second
  const inHeader = n => (n.nodeType === 1 ? n : n.parentElement)?.closest('header');
  new MutationObserver(list => { if (list.some(m => !inHeader(m.target))) kick(); })
    .observe(document.body, { subtree: true, childList: true, characterData: true });
  document.fonts?.ready.then(kick);
  addEventListener('resize', build);
  addEventListener('themechange', build);
  build();
})();

