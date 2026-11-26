// avatar.js: a stylised, animated 3D version of Abishek in the hero, in place of the portrait photo.
// Built from simple shapes in Three.js (no model file): swept-up black hair with the flick to one
// side, short beard and moustache, navy blazer over a white shirt. The eyes (and a little, the head)
// follow the pointer anywhere on the page; on phones they follow your finger. It blinks, breathes,
// gets sleepy when nothing moves for a while, and smiles with raised brows when clicked.
// The disc behind it is plain CSS (.hero-photo::before), so each theme can colour it.
// If Three.js or WebGL is unavailable, the portrait <img> inside .hero-photo simply stays.
// A classic script that loads Three.js with dynamic import() (resolved by the import map in
// index.html): a local module file would be blocked when the page is opened from file://.
'use strict';

(async function () {
  const host = document.querySelector('.hero-photo');
  if (!host) return;
  let THREE;
  try {
    THREE = await import('three');
  } catch (err) {
    return;   // offline or blocked CDN: keep the photo
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    return;   // no WebGL: keep the photo
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'hero-avatar';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  host.classList.add('has-avatar');
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', 'Animated 3D cartoon of Abishek T in a navy blazer');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, -0.3, 9.4);
  camera.lookAt(0, -0.3, 0);

  // Soft studio light: warm key from the front left, cool fill, bright rim from behind
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0x4a3a34, 1.7));
  const key = new THREE.DirectionalLight(0xfff1e2, 2.8);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfd8ff, 0.6);
  fill.position.set(4, 0, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(2, 3, -5);
  scene.add(rim);

  // ---- Palette (taken from the reference photo) ----
  const C = {
    skin: '#91603f',
    skinDark: '#6c432c',
    lip: '#5a3029',
    hair: '#151112',
    beard: '#1c1513',
    eyeWhite: '#f2ebe3',
    iris: '#3a2317',
    pupil: '#0b0706',
    blazer: '#1e2a55',
    lapel: '#18224a',
    shirt: '#f7f5f2'
  };

  // ---- Painted textures (equirectangular, so they wrap a sphere; u = 0.25 is the front) ----
  function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  // Longitude in degrees from the front, polar angle in degrees from the top -> canvas px
  const W = 1024, H = 512;
  const px = (lon) => W * 0.25 + (lon / 360) * W;
  const py = (polar) => (polar / 180) * H;

  function soft(ctx, x, y, rx, ry, color, alpha, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(0.55, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const faceTex = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = C.skin;
    ctx.fillRect(0, 0, W, H);
    // Sideburns running down into the beard
    soft(ctx, px(-74), py(100), 16, 52, C.beard, 0.85);
    soft(ctx, px(74), py(100), 16, 52, C.beard, 0.85);
    // Jaw stubble, light on the cheeks, fuller round the chin
    soft(ctx, px(-52), py(136), 46, 40, C.beard, 0.55, 0.5);
    soft(ctx, px(52), py(136), 46, 40, C.beard, 0.55, -0.5);
    soft(ctx, px(0), py(148), 66, 44, C.beard, 0.6);
    soft(ctx, px(0), py(162), 80, 36, C.beard, 0.7);
    // Soul patch under the lower lip
    soft(ctx, px(0), py(122), 14, 9, C.beard, 0.9);
    // Moustache: a thin band that droops at the corners of the mouth
    soft(ctx, px(0), py(108.5), 42, 7, C.beard, 0.95);
    soft(ctx, px(-17), py(112), 12, 10, C.beard, 0.75, 0.4);
    soft(ctx, px(17), py(112), 12, 10, C.beard, 0.75, -0.4);
  });

  const blazerTex = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = C.blazer;
    ctx.fillRect(0, 0, W, H);
    // White shirt in the V of the jacket
    const cx = px(0);
    ctx.fillStyle = C.shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 70, 0);
    ctx.lineTo(cx + 70, 0);
    ctx.lineTo(cx, py(62));
    ctx.closePath();
    ctx.fill();
    // Lapels: darker bands along both edges of the V, with a notch
    ctx.fillStyle = C.lapel;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(cx + s * 70, 0);
      ctx.lineTo(cx + s * 122, py(16));
      ctx.lineTo(cx + s * 100, py(24));
      ctx.lineTo(cx + s * 44, py(90));
      ctx.lineTo(cx, py(62));
      ctx.closePath();
      ctx.fill();
    });
    // Lapel edge highlight and a small pin
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(cx + s * 70, 0);
      ctx.lineTo(cx, py(62));
      ctx.stroke();
    });
    ctx.fillStyle = '#c9ccd6';
    ctx.beginPath();
    ctx.arc(cx + 92, py(52), 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // ---- Materials ----
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.62, metalness: 0 }, o));
  const mat = {
    face: std({ map: faceTex, roughness: 0.55 }),
    skin: std({ color: C.skin, roughness: 0.55 }),
    skinDark: std({ color: C.skinDark, roughness: 0.6 }),
    lip: std({ color: C.lip, roughness: 0.45 }),
    hair: std({ color: C.hair, roughness: 0.42 }),
    brow: std({ color: C.hair, roughness: 0.7 }),
    eyeWhite: std({ color: C.eyeWhite, roughness: 0.25 }),
    iris: std({ color: C.iris, roughness: 0.2 }),
    pupil: new THREE.MeshBasicMaterial({ color: C.pupil }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lash: new THREE.MeshBasicMaterial({ color: '#120d0c' }),
    blazer: std({ map: blazerTex, roughness: 0.8 }),
    shirt: std({ color: C.shirt, roughness: 0.7 })
  };
  const lid = std({ color: C.skin, roughness: 0.55, side: THREE.DoubleSide });

  const mesh = (geo, m, pos, scale, rot) => {
    const o = new THREE.Mesh(geo, m);
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    if (scale) o.scale.set(scale[0], scale[1], scale[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    return o;
  };
  const sphere = (seg = 32) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));

  // ---- Build the character ----
  const rig = new THREE.Group();        // breathes and nods
  scene.add(rig);

  // Shoulders and chest in the blazer
  const torso = mesh(sphere(48), mat.blazer, [0, -2.5, -0.1], [1.9, 1.1, 0.95]);
  rig.add(torso);
  // Neck
  rig.add(mesh(new THREE.CylinderGeometry(0.4, 0.46, 1.0, 24), mat.skin, [0, -1.25, 0.02]));
  // Shirt collar: a band round the neck and two points folding down
  rig.add(mesh(new THREE.CylinderGeometry(0.49, 0.53, 0.26, 24, 1, true), mat.shirt, [0, -1.55, 0.02]));
  [-1, 1].forEach((s) => {
    rig.add(mesh(new THREE.BoxGeometry(0.34, 0.22, 0.05), mat.shirt,
      [s * 0.2, -1.72, 0.42], [1, 1, 1], [-0.35, s * -0.35, s * 0.55]));
  });

  // Head turns from the top of the neck
  const neck = new THREE.Group();
  neck.position.set(0, -0.85, 0.02);
  rig.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0);
  head.scale.setScalar(1.15);
  neck.add(head);

  // Skull and face: an egg that narrows toward the chin
  const headGeo = new THREE.SphereGeometry(1, 64, 48);
  const p = headGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) {
      const k = -y;
      p.setX(i, p.getX(i) * (1 - 0.2 * k * k));
      p.setZ(i, p.getZ(i) * (1 - 0.06 * k));
    }
  }
  headGeo.computeVertexNormals();
  head.add(mesh(headGeo, mat.face, [0, 0, 0], [0.86, 1.05, 0.92]));

  // Ears
  [-1, 1].forEach((s) => {
    head.add(mesh(sphere(20), mat.skin, [s * 0.83, 0.0, -0.05], [0.1, 0.21, 0.14], [0, s * -0.3, 0]));
    head.add(mesh(sphere(12), mat.skinDark, [s * 0.87, 0.0, -0.02], [0.04, 0.12, 0.07], [0, s * -0.3, 0]));
  });

  // Nose: a broad rounded tip on a soft bridge
  head.add(mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 12), mat.skin, [0, 0.0, 0.86], [1, 1, 0.9], [-0.18, 0, 0]));
  head.add(mesh(sphere(24), mat.skin, [0, -0.15, 0.92], [0.12, 0.09, 0.095]));
  [-1, 1].forEach((s) => {
    head.add(mesh(sphere(16), mat.skin, [s * 0.11, -0.18, 0.86], [0.07, 0.06, 0.06]));
    head.add(mesh(sphere(10), mat.skinDark, [s * 0.065, -0.235, 0.92], [0.035, 0.018, 0.03]));
  });

  // Mouth: closed, with a slight smile that can widen
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.415, 0.855);
  head.add(mouth);
  const smile = mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 32, Math.PI), mat.lip, [0, 0.03, 0], [1, 0.32, 1], [0, 0, Math.PI]);
  mouth.add(smile);
  const lowerLip = mesh(sphere(20), mat.lip, [0, -0.045, -0.015], [0.12, 0.045, 0.05]);
  mouth.add(lowerLip);

  // Eyes, a little hooded like the photo
  const EYE_R = 0.145;
  const eyes = [-1, 1].map((s) => {
    const socket = new THREE.Group();
    socket.position.set(s * 0.31, 0.11, 0.74);
    head.add(socket);

    const ball = new THREE.Group();
    socket.add(ball);
    ball.add(mesh(new THREE.SphereGeometry(EYE_R, 32, 24), mat.eyeWhite));
    const irisGeo = new THREE.SphereGeometry(EYE_R * 1.006, 32, 12, 0, Math.PI * 2, 0, 0.62);
    irisGeo.rotateX(Math.PI / 2);
    ball.add(new THREE.Mesh(irisGeo, mat.iris));
    const pupilGeo = new THREE.SphereGeometry(EYE_R * 1.012, 32, 8, 0, Math.PI * 2, 0, 0.3);
    pupilGeo.rotateX(Math.PI / 2);
    ball.add(new THREE.Mesh(pupilGeo, mat.pupil));

    const shine = mesh(new THREE.SphereGeometry(0.022, 10, 8), mat.shine, [-0.04, 0.05, EYE_R * 0.98]);
    socket.add(shine);

    // Upper lid with a lash line along its edge; rotates down to blink
    const upper = new THREE.Group();
    socket.add(upper);
    upper.add(new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lid));
    const lashGeo = new THREE.TorusGeometry(EYE_R * 1.1, 0.012, 6, 32, Math.PI);
    lashGeo.rotateX(Math.PI / 2);
    upper.add(new THREE.Mesh(lashGeo, mat.lash));

    // Lower lid: fixed, just a sliver
    const lower = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.08, 32, 8, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), lid);
    lower.rotation.x = -0.35;
    socket.add(lower);

    // Thick, fairly straight brows
    const brow = mesh(new THREE.CapsuleGeometry(0.045, 0.27, 4, 10), mat.brow,
      [s * 0.31, 0.33, 0.81], [1, 1, 0.55], [0, s * -0.25, Math.PI / 2 + s * 0.08]);
    head.add(brow);

    return { s, ball, upper, brow, shine };
  });

  // Hair: a full swept-back top, short at the sides, flicking out on one side
  const hair = new THREE.Group();
  head.add(hair);
  // Close-cut cap over the back and top of the skull; tilted back so the hairline sits high
  hair.add(mesh(sphere(48), mat.hair, [0, 0.5, -0.2], [0.9, 0.7, 0.92], [-0.5, 0, 0]));
  // Pompadour: the front rises from the hairline into one big swept-back volume
  hair.add(mesh(sphere(48), mat.hair, [0.02, 0.98, 0.2], [0.8, 0.44, 0.68], [-0.75, 0, 0.05]));
  hair.add(mesh(sphere(40), mat.hair, [0.04, 1.14, -0.12], [0.78, 0.34, 0.8], [-0.2, 0, 0.04]));
  // The wave rolls to one side and ends in a flick past the temple
  hair.add(mesh(sphere(40), mat.hair, [-0.48, 0.94, 0.16], [0.46, 0.3, 0.48], [-0.55, 0.2, 0.42]));
  hair.add(mesh(sphere(32), mat.hair, [-0.82, 0.7, 0.1], [0.28, 0.13, 0.28], [0, 0.35, 0.7]));
  hair.add(mesh(sphere(24), mat.hair, [-1.02, 0.6, 0.08], [0.16, 0.055, 0.11], [0, 0.2, 0.9]));
  // Short sides above the ears
  [-1, 1].forEach((s) => {
    hair.add(mesh(sphere(24), mat.hair, [s * 0.76, 0.34, -0.12], [0.14, 0.34, 0.56]));
  });
  // A grey-white streak catching the light on the top, like the highlight in the photo
  hair.add(mesh(sphere(20), std({ color: '#3a3536', roughness: 0.3 }), [-0.12, 1.3, 0.12], [0.4, 0.06, 0.32], [-0.3, 0, 0.1]));

  // ---- Input ----
  const pointer = { x: innerWidth / 2, y: innerHeight * 0.3, active: false };
  let lastMove = performance.now();
  let wasSleepy = false;
  const onPointer = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    lastMove = performance.now();
    wake();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });

  // Click / tap: big smile, raised brows and a nod
  let delight = 0;
  host.addEventListener('click', () => { delight = 1.6; wake(); });

  // ---- Animation ----
  const gaze = { x: 0, y: 0 };
  let blinkT = 0, nextBlink = 1.5, t = 0, last = performance.now();
  let raf = 0, visible = true;
  let saccade = { x: 0, y: 0 }, nextSaccade = 0.8;

  const damp = (cur, target, dt, s) => cur + (target - cur) * (1 - Math.exp(-dt / s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;

    // Where to look: the pointer, relative to the face on screen
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.3;
    const idle = (now - lastMove) / 1000;
    let tx, ty;
    if (pointer.active && idle < 4) {
      tx = clamp((pointer.x - cx) / (innerWidth * 0.45), -1, 1);
      ty = clamp((pointer.y - cy) / (innerHeight * 0.45), -1, 1);
    } else if (!reduced) {
      // Nobody around: glance about slowly
      tx = Math.sin(t * 0.5) * 0.55 + Math.sin(t * 1.3) * 0.12;
      ty = Math.cos(t * 0.4) * 0.2;
    } else {
      tx = 0; ty = 0;
    }
    // Tiny darting eye movements make the gaze feel alive
    if (!reduced && t > nextSaccade) {
      saccade = { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.08 };
      nextSaccade = t + 0.6 + Math.random() * 1.6;
    }
    gaze.x = damp(gaze.x, tx, dt, 0.08);
    gaze.y = damp(gaze.y, ty, dt, 0.08);

    // Head follows part of the way, eyes do the rest
    const nod = delight > 0 ? Math.sin((1.6 - delight) * 9) * 0.08 * Math.min(1, delight) : 0;
    neck.rotation.y = damp(neck.rotation.y, gaze.x * 0.38, dt, 0.2);
    neck.rotation.x = damp(neck.rotation.x, gaze.y * 0.18 + nod, dt, 0.12);
    neck.rotation.z = damp(neck.rotation.z, -gaze.x * 0.05, dt, 0.3);

    eyes.forEach((e) => {
      e.ball.rotation.y = damp(e.ball.rotation.y, gaze.x * 0.5 + saccade.x, dt, 0.03);
      e.ball.rotation.x = damp(e.ball.rotation.x, gaze.y * 0.3 + saccade.y, dt, 0.03);
    });

    // Lids: blink every few seconds; droop when sleepy; wider when delighted
    const sleepy = !reduced && idle > 10 ? clamp((idle - 10) / 3, 0, 1) : 0;
    if (sleepy > 0.5) wasSleepy = true;
    blinkT += dt;
    let blink = 0;
    if (blinkT > nextBlink) {
      const q = (blinkT - nextBlink) / 0.16;
      blink = q < 1 ? Math.sin(q * Math.PI) : 0;
      if (q >= 1) { blinkT = 0; nextBlink = 2 + Math.random() * 3.5; }
    }
    const OPEN = -0.5, SHUT = Math.PI / 2 + 0.1;
    let lidAngle = OPEN + (0.9 - OPEN) * sleepy * 0.7;
    if (delight > 0) lidAngle = OPEN - 0.18;
    lidAngle = lidAngle + (SHUT - lidAngle) * blink;
    eyes.forEach((e) => {
      e.upper.rotation.x = damp(e.upper.rotation.x, lidAngle, dt, blink ? 0.02 : 0.08);
      e.brow.position.y = damp(e.brow.position.y, 0.33 + (delight > 0 ? 0.07 : 0) - sleepy * 0.03, dt, 0.1);
      e.shine.visible = e.upper.rotation.x < 0.7;
    });

    // Smile widens on delight
    const grin = delight > 0 ? Math.min(1, delight) : 0;
    smile.scale.x = damp(smile.scale.x, 1 + grin * 0.25, dt, 0.08);
    smile.scale.y = damp(smile.scale.y, 0.32 + grin * 0.45, dt, 0.08);
    lowerLip.position.y = damp(lowerLip.position.y, -0.045 - grin * 0.03, dt, 0.08);

    // Breathing
    const breath = reduced ? 0 : Math.sin(t * 1.7);
    torso.scale.y = 1.1 + breath * 0.012;
    rig.position.y = breath * 0.015 - sleepy * 0.04;

    if (delight > 0) delight = Math.max(0, delight - dt);

    renderer.render(scene, camera);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (wasSleepy) { wasSleepy = false; delight = Math.max(delight, 0.6); } // startled awake
    if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function resize() {
    const r = renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(host);
  document.addEventListener('visibilitychange', wake);
  resize();
  wake();
})();
