// a small player on both pages: play/pause, skip back, skip forward, and a playback bar with the elapsed and total time. tracks and
// audio are the same ones on portfolio-html's notch player, served from its R2 bucket
(() => {
  const R2 = 'https://pub-ce086066003e4e1cad2011087e85618b.r2.dev/';
  const TRACKS = [
    { title: 'nights', artist: 'frank ocean', src: R2 + 'nights.mp3', cover: 'blond' },
    { title: 'who knows', artist: 'daniel caesar', src: R2 + 'whoknows.mp3', cover: 'sonofspergy' },
    { title: 'whiplash', artist: 'aespa', src: R2 + 'whiplash.mp3', cover: 'whiplash' },
    { title: 'clarity', artist: 'zedd (ft. foxes)', src: R2 + 'clarity.mp3', cover: 'clarity' },
    { title: 'japanese denim', artist: 'daniel caesar', src: R2 + 'japanesedenim.mp3', cover: 'japanesedenim' },
    { title: 'crank the bass, play the muzik', artist: 'knock2', src: R2 + 'crankthebassplaythemuzik.mp3', cover: 'nolimit' },
    { title: 'slow dancing in the dark', artist: 'joji', src: R2 + 'slowdancinginthedark.mp3', cover: 'ballads1' },
    { title: 'ochos rios', artist: 'daniel caesar', src: R2 + 'ochosrios.mp3', cover: 'neverenough' },
    { title: 'cyanide', artist: 'daniel caesar', src: R2 + 'cyanide.mp3', cover: 'casestudy' },
  ];

  const section = document.getElementById('music');
  if (section && TRACKS.length) {
    const audio = new Audio();
    audio.preload = 'metadata';   // so the length shows before the first play
    const titleEl = document.getElementById('track-title');
    const artistEl = document.getElementById('track-artist');
    const playBtn = document.getElementById('play');
    const bar = document.getElementById('bar'), fill = document.getElementById('fill');
    const curEl = document.getElementById('cur'), durEl = document.getElementById('dur');
    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
    let index = 0, seeking = false;

    const updateButton = () => { playBtn.textContent = audio.paused ? '[play]' : '[pause]'; };
    const showProgress = ratio => { fill.style.width = (ratio * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(ratio * 100)); };
    // the player is a menu under the header, opened by [♪]. it closes on the button again, escape, or a click outside;
    // the music keeps playing while it's closed
    const toggle = document.getElementById('music-toggle');
    const isOpen = () => !section.hidden;
    const setOpen = open => {
      section.hidden = !open;
      toggle.setAttribute('aria-expanded', open);
      if (open) { showCover(); cover.paint(); }   // the cover can't draw while hidden, so catch up (a theme change, say)
    };
    toggle.addEventListener('click', () => setOpen(!isOpen()));
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); } });
    addEventListener('pointerdown', e => { if (isOpen() && !section.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });

    // the album cover as ascii art (ascii.js), in colour. covers/<name>.json is fetched when its track loads,
    // with the next one prefetched, and only while the menu is open
    const cover = makeArt(section.querySelector('.cover'), null, { hover: false });
    const covers = new Map();   // name → promise of { light, dark }, or null if it failed
    const fetchCover = name => {
      if (!covers.has(name)) covers.set(name, fetch(`covers/${name}.json`)
        .then(r => { if (!r.ok) throw new Error('bad response'); return r.json(); })
        .catch(() => { covers.delete(name); return null; }));
      return covers.get(name);
    };
    let shown = null;
    const showCover = () => {
      if (!isOpen()) return;
      const name = TRACKS[index].cover;
      fetchCover(name).then(art => {
        if (!art || name !== TRACKS[index].cover || name === shown) return;   // failed, or skipped past while loading
        shown = name;
        cover.setArt(art);
        fetchCover(TRACKS[(index + 1) % TRACKS.length].cover);
      });
    };

    const load = i => {
      index = (i + TRACKS.length) % TRACKS.length;
      const t = TRACKS[index];
      audio.src = t.src;
      titleEl.textContent = t.title;
      artistEl.textContent = t.artist;
      showProgress(0);
      curEl.textContent = durEl.textContent = '0:00';
      updateButton();
      showCover();
    };
    // skipping either way plays, even from paused, like other players. prev more than 3s into a song restarts it instead
    const skip = step => {
      load(index + step);
      audio.play().catch(() => {});
    };
    const back = () => {
      if (audio.currentTime <= 3) return skip(-1);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    };

    // playback bar: click, drag or arrow keys seek
    const ratioAt = e => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    const seekTo = ratio => {
      if (!isFinite(audio.duration)) return;
      audio.currentTime = ratio * audio.duration;
      showProgress(ratio);
      curEl.textContent = fmt(audio.currentTime);
    };
    bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); seeking = true; seekTo(ratioAt(e)); });
    bar.addEventListener('pointermove', e => { if (seeking) seekTo(ratioAt(e)); });
    const endSeek = () => { seeking = false; };
    bar.addEventListener('pointerup', endSeek);
    bar.addEventListener('pointercancel', endSeek);
    bar.addEventListener('keydown', e => {
      if (!isFinite(audio.duration)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(Math.min(1, Math.max(0, audio.currentTime / audio.duration + (e.key === 'ArrowRight' ? 0.02 : -0.02))));
      }
    });
    audio.addEventListener('timeupdate', () => {
      curEl.textContent = fmt(audio.currentTime);
      if (!seeking && isFinite(audio.duration)) showProgress(audio.currentTime / audio.duration);
    });
    audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(audio.duration); });

    playBtn.addEventListener('click', () => {
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    });
    document.getElementById('prev').addEventListener('click', back);
    document.getElementById('next').addEventListener('click', () => skip(1));
    audio.addEventListener('play', updateButton);
    audio.addEventListener('pause', updateButton);
    audio.addEventListener('ended', () => skip(1));

    // the song, where it's up to and whether it's playing carry over to the other page, for this tab: saved as a page is
    // left, picked up when the next one loads. a browser that won't autoplay on arrival leaves it paused at the same spot
    const save = () => {
      try { sessionStorage.setItem('music', JSON.stringify({ index, time: audio.currentTime, playing: !audio.paused })); } catch {}
    };
    const restore = () => {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem('music')); } catch {}
      if (!s) return false;
      if (s.index !== index || !audio.src) load(s.index);
      const resume = () => { audio.currentTime = s.time || 0; if (s.playing) audio.play().catch(() => {}); };
      if (audio.readyState >= 1) resume(); else audio.addEventListener('loadedmetadata', resume, { once: true });
      return true;
    };
    addEventListener('pagehide', save);
    addEventListener('pageshow', e => { if (e.persisted) restore(); });   // back/forward: the page comes back as it was left
    if (!restore()) load(0);
  }
})();
