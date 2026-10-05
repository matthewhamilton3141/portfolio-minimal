// the poro from portfolio-review, in a strip above the footer. it follows the pointer's horizontal position
// across the page, and clicking it plays a reaction.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';

// values from portfolio-review/components/poro.tsx, with the speed raised so it reads as following the cursor
// SPEED caps how fast it can travel (world units per second). FOLLOW is how quickly it eases toward the pointer:
// it starts and stops gradually instead of moving at a constant rate
const SPEED = 2.5, FOLLOW = 4;
const SNAP = 0.01, RUN_SPEED = 0.4;   // SNAP: gap (world units) that counts as arrived. RUN_SPEED: slower than this
                                      // (units/s) and the poro is treated as standing still
const IDLE3_MS = 2500, DEATH_MS = 4000;
const HALF = 1.55;   // half the strip's height in world units. the camera is orthographic, so the figure keeps
                     // its shape and size wherever it moves (a perspective camera stretches it at the edges)

const stage = document.getElementById('poro');
const probe = document.createElement('canvas');
if (!(probe.getContext('webgl') || probe.getContext('experimental-webgl'))) {
  stage.remove();
} else {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 10);
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3, 5, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-2, 2, -2); scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);

  const resize = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    renderer.setPixelRatio(devicePixelRatio || 1);
    renderer.setSize(W, H);
    const halfW = HALF * (W / H);
    Object.assign(camera, { left: -halfW, right: halfW, top: HALF, bottom: -HALF });
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  let mixer, actions = {}, current = null, posX = 0, facing = Math.PI * 0.15, targetX = 0;
  let restCenterX = 0;   // where the figure's middle sits, in group space, when it's standing still and facing forward-ish
  let reach = 0;         // how far the figure extends either side of posX at any facing, so it can be kept inside the strip
  let override = null, reacting = false, nextClick = 'Poro_idle3.anm', overrideTimer = 0;

  const play = name => {
    if (current === name || !actions[name]) return;
    if (current && actions[current]) actions[current].fadeOut(0.3);
    const next = actions[name];
    next.reset().fadeIn(0.3);
    if (['Death', 'HappyLick', 'Jump', 'Eat'].includes(name)) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    current = name;
  };

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
  new GLTFLoader().setDRACOLoader(draco).load('models/poro.glb', gltf => {
    group.add(gltf.scene);
    mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    // sample the animations the component plays, through their length, so the fit covers the tallest and widest
    // pose they reach. (jump and idle4 move the root far off the body, so they're left out of the fit)
    const bounds = new THREE.Box3(), steps = 16;
    for (const name of ['Poro_idle1.anm', 'Run2', 'Float', 'Poro_idle3.anm', 'Death']) {
      const clip = gltf.animations.find(c => c.name === name);
      if (!clip) continue;
      Object.values(actions).forEach(a => a.stop());
      actions[name].play();
      for (let i = 0; i <= steps; i++) {
        mixer.setTime(clip.duration * i / steps);
        bounds.expandByObject(gltf.scene, true);
      }
    }
    Object.values(actions).forEach(a => a.stop());
    // the model's units don't match the original's scale, so scale it to the strip: its tallest pose is 3.6 of the
    // strip's 3.1 world units (the fit is measured in model units, so this sets it visually), and it's at most 80%
    // of the visible width. it stands on the bottom edge
    const size = bounds.getSize(new THREE.Vector3());
    const k = Math.min(3.6 / size.y, (1.6 * camera.right) / size.x);
    gltf.scene.scale.setScalar(k);
    gltf.scene.position.set(-((bounds.min.x + bounds.max.x) / 2) * k, -HALF - bounds.min.y * k, 0);
    play('Poro_idle1.anm');
    // the model's origin isn't its visual middle (the tongue and jaw reach forward, and the body is turned by `facing`),
    // so measure the standing pose as it's actually drawn and line up its middle with posX
    group.position.set(0, 0, 0);
    group.rotation.y = facing;
    group.updateMatrixWorld(true);
    const rest = new THREE.Box3().setFromObject(group, true);
    restCenterX = (rest.min.x + rest.max.x) / 2;
    // it turns while running, so bound it by the widest any pose can get at any facing: the fit box's corner
    // furthest from the turning axis, plus the shift that centres the standing pose
    const radius = Math.hypot(size.x * k / 2, Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * k);
    reach = radius + Math.abs(restCenterX);
  }, undefined, err => console.error(err));

  // the strip is short, so follow the pointer's horizontal position anywhere on the page
  addEventListener('pointermove', e => {
    if (reacting) return;
    const r = stage.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
  });
  document.documentElement.addEventListener('pointerleave', () => { targetX = 0; });

  stage.addEventListener('click', () => {
    if (reacting || !mixer) return;
    const anim = nextClick;
    nextClick = anim === 'Poro_idle3.anm' ? 'Death' : 'Poro_idle3.anm';
    reacting = true; override = anim;
    clearTimeout(overrideTimer);
    overrideTimer = setTimeout(() => { reacting = false; override = null; }, anim === 'Death' ? DEATH_MS : IDLE3_MS);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(delta);
    const halfWidth = camera.right;
    // stop short of the edges by the figure's reach so none of it slides out of view
    const limit = Math.max(0, halfWidth - reach);
    const destX = Math.max(-limit, Math.min(limit, targetX * halfWidth));
    const dist = destX - posX;
    const busy = override === 'Poro_idle3.anm' || override === 'Death';
    const prevX = posX;
    if (!busy) {
      // ease a fraction of the remaining distance each frame, then clamp to the speed cap
      const ease = dist * (1 - Math.exp(-FOLLOW * delta));
      const maxStep = SPEED * delta;
      posX += Math.max(-maxStep, Math.min(maxStep, ease));
      // land exactly once the remaining gap is invisible, so the easing tail doesn't keep it running in place
      if (Math.abs(destX - posX) < SNAP) posX = destX;
    }
    // run and turn off the actual movement this frame, not the leftover distance, so the legs stop when it stops
    const speed = Math.abs(posX - prevX) / Math.max(delta, 1e-4);
    const moving = speed > RUN_SPEED;
    play(override ? override : moving ? 'Run2' : 'Poro_idle1.anm');
    if (!busy) {
      const angle = moving ? (posX < destX ? Math.PI * 0.5 : -Math.PI * 0.5) : Math.PI * 0.15;
      facing += (angle - facing) * Math.min(delta * (moving ? 8 : 4), 1);
    }
    group.position.x = posX - restCenterX;
    group.rotation.y = facing;
    renderer.render(scene, camera);
  });
}
