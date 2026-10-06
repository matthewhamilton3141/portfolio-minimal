// ascii art on a canvas, shared by the hero and the player's cover. art is { light, dark }, each a pixel-to-character
// export packed as { cols, colors, rows: [[x, colour index, text], ...] } (tools/embed_art.py, tools/pack_covers.py).
// each theme's art is rendered once into an offscreen canvas (per width), so a theme flip is a single image copy,
// not ~20k text draws.
// muted by default (half the saturation). the cursor brings each 8px block it moves onto up to full colour until
// every block is full, then mutes them again until every block is muted. full colour fades back to muted block by block
// once you leave. with { hover: false } the art is shown in full colour and the cursor does nothing (the player's cover).
// { signal } stops it when that signal aborts (the hero, when the page is swapped out).
// reveal() brings the art in block by block: each block is blank, flickers glyphs from the art's own alphabet,
// then settles. a theme flip sweeps the new art in top to bottom
function makeArt(canvas, src, { hover = true, signal } = {}) {
  const B = 8, R = 52, FADE = 0.01;
  const NOISE = 150, FLICKER = 60;   // ms a block shows noise before it settles; ms between noise shuffles
  const root = document.documentElement, ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let cache = {}, muted = {}, noise = {}, cacheW = 0, pos = null, raf = 0, lit = false;
  let fade = null, gw = 0, under = new Set();   // fade: per-block full-colour amount, 0 = muted
  // two passes, each must reach 100% before the next: colour every block, then revert every block
  let phase = 1, seen = null, seenCount = 0;   // phase 1: cursor colours, phase 0: cursor reverts; seen: blocks touched this pass
  let reveal = null;   // { order, ms, start, t }: t is each block's settle time in ms, built once the block grid is known
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d');
  const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');

  // the exports' colours are true to the source but muted next to the page, so push each one's saturation up (greys stay
  // grey). SAT is full colour, MUTED the resting state under hover. worked out once per palette and amount
  const SAT = 1.6, MUTED = .5;
  const vivid = (hex, sat) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return hex;
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = Math.min(1, d / (1 - Math.abs(2 * l - 1)) * sat);
    return `hsl(${h * 60} ${s * 100}% ${l * 100}%)`;
  };
  const palettes = {};
  const colours = (art, sat) => {
    const m = palettes[sat] ||= new WeakMap();
    if (!m.has(art)) m.set(art, art.colors.map(hex => vivid(hex, sat)));
    return m.get(art);
  };

  // pool: the art's own characters. with it, every glyph is swapped for a random one, which makes the noise layer
  const render = (art, w, dpr, ink, pool, sat = SAT) => {
    const pal = colours(art, sat);
    const off = document.createElement('canvas'), c = off.getContext('2d');
    c.font = '10px ui-monospace, Menlo, monospace';
    const fs = 10 * (w / art.cols) / c.measureText('M').width, cw = w / art.cols;
    off.width = Math.round(w * dpr); off.height = Math.round(fs * art.rows.length * dpr);
    off.cell = [cw * dpr, fs * dpr];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.font = fs + 'px ui-monospace, Menlo, monospace';
    c.textBaseline = 'top';
    // the export's weight: a stroke over each glyph, its width a share of the font size
    if (art.stroke) { c.lineWidth = art.stroke * fs; c.lineJoin = 'round'; }
    const scramble = t => t.replace(/\S/g, () => pool[Math.random() * pool.length | 0]);
    art.rows.forEach((runs, y) => {
      for (const [x, k, t] of runs) {
        const s = pool ? scramble(t) : t;
        c.fillStyle = c.strokeStyle = ink || pal[k];
        c.fillText(s, x * cw, y * fs);
        if (art.stroke) c.strokeText(s, x * cw, y * fs);
      }
    });
    return off;
  };
  const pool = art => [...new Set(art.rows.flatMap(runs => runs.map(r => r[2])).join('').replace(/\s/g, ''))];

  // the cursor colours the blocks it moves onto, or reverts them, depending on the pass. ones it was already over don't count again
  const flipUnder = () => {
    const now = new Set();
    for (let gy = Math.floor((pos.y - R) / B); gy <= Math.floor((pos.y + R) / B); gy++) {
      for (let gx = Math.floor((pos.x - R) / B); gx <= Math.floor((pos.x + R) / B); gx++) {
        if (gx < 0 || gy < 0 || gx >= gw || gy >= Math.ceil(fade.length / gw)) continue;
        const dx = gx * B + B / 2 - pos.x, dy = gy * B + B / 2 - pos.y;
        if (dx * dx + dy * dy >= R * R) continue;
        const i = gy * gw + gx;
        now.add(i);
        if (under.has(i)) continue;   // only blocks the cursor has just moved onto
        if (!seen[i]) { seen[i] = 1; seenCount++; }
        fade[i] = phase;
      }
    }
    under = now;
    if (seenCount === fade.length) {   // pass complete: snap the whole picture to its new state at once, so no blocks are mid-stroke
      fade.fill(phase);
      phase ^= 1; seen.fill(0); seenCount = 0;
    }
  };

  // draws img onto the canvas through a mask of 8px blocks; amount(i) is how much of block i shows (0 to 1)
  const through = (img, amount, dpr, dx = 0, dy = 0) => {
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = '#000';
    for (let i = 0; i < fade.length; i++) {
      const a = amount(i);
      if (!(a > 0)) continue;
      mctx.globalAlpha = a;
      mctx.fillRect((i % gw) * B * dpr, ((i / gw) | 0) * B * dpr, B * dpr, B * dpr);
    }
    mctx.globalAlpha = 1;
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(img, dx, dy);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(mask, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  };

  const paint = () => {
    const w = canvas.clientWidth, dpr = devicePixelRatio || 1;
    if (!src || !w) return;   // nothing loaded yet, or hidden (the player below 1200px)
    if (w !== cacheW) { cache = {}; muted = {}; noise = {}; cacheW = w; }
    const theme = root.hasAttribute('data-dark') ? 'dark' : 'light', art = src[theme];
    const ink = getComputedStyle(canvas).color;
    const plain = muted[theme] ||= render(art, w, dpr, null, null, MUTED);
    const colour = cache[theme] ||= render(art, w, dpr);
    if (canvas.width !== plain.width || canvas.height !== plain.height) {
      canvas.width = plain.width; canvas.height = plain.height;
      canvas.style.height = plain.height / dpr + 'px';
    }
    if (mask.width !== plain.width || mask.height !== plain.height) {
      mask.width = tmp.width = plain.width; mask.height = tmp.height = plain.height;
    }
    const cols = Math.ceil(w / B), rows = Math.ceil(plain.height / dpr / B);
    if (!fade || gw !== cols || fade.length !== cols * rows) {
      gw = cols;
      fade = new Float32Array(cols * rows);
      seen = new Uint8Array(fade.length); seenCount = 0;
      under = new Set();
      if (reveal) reveal.t = null;
    }
    if (reveal && !reveal.t) {
      // random: blocks settle in any order. sweep: row by row, with a little jitter so the edge isn't a ruled line
      const { order, ms } = reveal;
      reveal.t = Float32Array.from(fade, (_, i) => order === 'sweep'
        ? NOISE + ((i / gw | 0) / Math.max(1, rows - 1)) * (ms - NOISE - 60) + Math.random() * 60
        : NOISE + Math.random() * (ms - NOISE));
    }
    const now = reveal ? performance.now() - reveal.start : 0;
    if (reveal && now >= reveal.ms) reveal = null;
    if (pos) flipUnder();
    lit = fade.some(a => a > 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const base = hover ? plain : colour;   // what a settled block shows before any hovering
    if (!reveal) ctx.drawImage(base, 0, 0);
    else {
      // settled blocks show the art, blocks about to settle show noise (nudged a cell or two each flicker), the rest stay blank
      const T = reveal.t, scrambled = noise[theme] ||= render(art, w, dpr, ink, pool(art));
      const k = Math.floor(performance.now() / FLICKER);
      through(base, i => now >= T[i], dpr);
      through(scrambled, i => now >= T[i] - NOISE && now < T[i], dpr,
        Math.round(((k * 7) % 5 - 2) * scrambled.cell[0]), Math.round(((k * 3) % 3 - 1) * scrambled.cell[1]));
    }
    if (lit) through(colour, reveal ? i => now >= reveal.t[i] ? fade[i] : 0 : i => fade[i], dpr);
    if (reveal) kick();

    // warm the other theme's colour art in idle time so the first flip is quicker too (noise needs that theme's ink,
    // which isn't known until it's applied)
    const other = theme === 'dark' ? 'light' : 'dark', s = src;
    if (!cache[other]) (window.requestIdleCallback || setTimeout)(() => {
      if (cacheW === w && src === s) cache[other] ||= render(s[other], w, dpr);
    });
  };
  // repaint while the cursor is over the art, any block is still coloured, or a reveal is running; then stop
  const frame = () => {
    raf = 0;
    if (signal?.aborted) return;
    if (fade) for (let i = 0; i < fade.length; i++) fade[i] = Math.max(0, fade[i] - FADE);
    paint();
    if ((pos || lit || reveal) && fade && canvas.clientWidth && !raf) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const start = (order, ms) => {
    if (still.matches) return;
    reveal = { order, ms, start: performance.now(), t: null };
  };

  // a touch has no hover, so it only moves the cursor while it's down: a tap colours the blocks under it, and lifting clears it
  const track = e => {
    const r = canvas.getBoundingClientRect();
    pos = { x: e.clientX - r.left, y: e.clientY - r.top };
    kick();
  };
  // lifting leaves the mark for a moment, so a quick tap is visible before it fades
  const clear = () => { pos = null; under = new Set(); kick(); };
  const lift = e => { if (e.pointerType !== 'mouse') setTimeout(clear, 600); };
  if (hover) {
    canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') track(e); });
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') clear(); });
  }
  addEventListener('resize', paint, { signal });
  // under the page's crossfade the new art just appears in the new snapshot; otherwise it sweeps in
  addEventListener('themechange', e => { if (!e.detail?.faded) start('sweep', 350); paint(); }, { signal });
  paint();

  return {
    paint,
    reveal: (order, ms) => { start(order, ms); paint(); },
    // a new picture (the next track's cover) resolves in from noise
    // the hover state starts over too: the last picture's coloured blocks and pass don't carry onto the new one
    setArt: next => {
      src = next; cache = {}; muted = {}; noise = {};
      fade = null; phase = 1; under = new Set();
      start('random', 400); paint();
    },
  };
}
