// a small player: play/pause, skip back, skip forward, and a playback bar with the elapsed and total time. tracks and
// audio are the same ones on portfolio-html's notch player, served from its R2 bucket
const R2 = 'https://pub-ce086066003e4e1cad2011087e85618b.r2.dev/';
const TRACKS = [
  { title: 'nights', artist: 'frank ocean', src: R2 + 'nights.mp3' },
  { title: 'who knows', artist: 'daniel caesar', src: R2 + 'whoknows.mp3' },
  { title: 'whiplash', artist: 'aespa', src: R2 + 'whiplash.mp3' },
  { title: 'clarity', artist: 'zedd (ft. foxes)', src: R2 + 'clarity.mp3' },
  { title: 'japanese denim', artist: 'daniel caesar', src: R2 + 'japanesedenim.mp3' },
  { title: 'crank the bass, play the muzik', artist: 'knock2', src: R2 + 'crankthebassplaythemuzik.mp3' },
  { title: 'slow dancing in the dark', artist: 'joji', src: R2 + 'slowdancinginthedark.mp3' },
  { title: 'ochos rios', artist: 'daniel caesar', src: R2 + 'ochosrios.mp3' },
  { title: 'cyanide', artist: 'daniel caesar', src: R2 + 'cyanide.mp3' },
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
  const load = i => {
    index = (i + TRACKS.length) % TRACKS.length;
    const t = TRACKS[index];
    audio.src = t.src;
    titleEl.textContent = t.title;
    artistEl.textContent = t.artist;
    showProgress(0);
    curEl.textContent = durEl.textContent = '0:00';
    updateButton();
  };
  const skip = step => {
    const wasPlaying = !audio.paused;
    load(index + step);
    if (wasPlaying) audio.play().catch(() => {});
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
  document.getElementById('prev').addEventListener('click', () => skip(-1));
  document.getElementById('next').addEventListener('click', () => skip(1));
  audio.addEventListener('play', updateButton);
  audio.addEventListener('pause', updateButton);
  audio.addEventListener('ended', () => skip(1));

  load(0);
  section.querySelector('.player').hidden = false;
}
