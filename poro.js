// the poro from portfolio-review, in a strip above the footer. it follows the pointer's horizontal position
// across the page, and clicking it plays a reaction.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';

// values from portfolio-review/components/poro.tsx, with the speed raised so it reads as following the cursor
const SPEED = 3, THRESHOLD = 0.02;
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
    const destX = targetX * halfWidth;
    const dist = destX - posX, abs = Math.abs(dist);
    const busy = override === 'Poro_idle3.anm' || override === 'Death';
    play(override ? override : abs > THRESHOLD ? 'Run2' : 'Poro_idle1.anm');
    if (!busy) {
      const step = SPEED * delta;
      posX = abs <= step ? destX : posX + Math.sign(dist) * step;
      const angle = abs > THRESHOLD ? (destX > posX ? Math.PI * 0.5 : -Math.PI * 0.5) : Math.PI * 0.15;
      facing += (angle - facing) * Math.min(delta * (abs > THRESHOLD ? 8 : 4), 1);
    }
    group.position.x = posX;
    group.rotation.y = facing;
    renderer.render(scene, camera);
  });
}
