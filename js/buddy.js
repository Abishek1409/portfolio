// buddy.js: the little 3D companion next to the name in the hero.
// A soft cube creature drawn with toon shading and ink outlines. Its eyeballs (and, a little, its
// head) follow the pointer anywhere on the page; on phones they follow your finger. It blinks,
// gets sleepy when nothing moves for a while, wakes up surprised, and jumps and waves when clicked.
// Colours come from CSS custom properties on .hero-buddy, so it follows the day/night theme.
// A classic script that loads Three.js with dynamic import() (resolved by the import map in
// index.html): a local module file would be blocked when the page is opened from file://.
'use strict';

(async function () {
  const host = document.querySelector('.hero-buddy');
  if (!host) return;
  let THREE, RoundedBoxGeometry;
  try {
    THREE = await import('three');
    ({ RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js'));
  } catch (err) {
    host.remove();   // offline or blocked CDN: no companion
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    host.remove();   // no WebGL: the name row simply has no companion
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.15, 9.0);
  camera.lookAt(0, -0.2, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f78, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 4, 6);
  scene.add(sun);

  // Three hard tones: the illustrated, cel-shaded look
  const tones = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  tones.minFilter = tones.magFilter = THREE.NearestFilter;
  tones.needsUpdate = true;

  // ---- Materials (colours filled in by applyColors) ----
  const mat = {
    body: new THREE.MeshToonMaterial({ gradientMap: tones }),
    white: new THREE.MeshToonMaterial({ gradientMap: tones }),
    iris: new THREE.MeshBasicMaterial(),
    pupil: new THREE.MeshBasicMaterial(),
    ink: new THREE.MeshBasicMaterial(),
    tip: new THREE.MeshToonMaterial({ gradientMap: tones }),
    blush: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    outline: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  };

  function applyColors() {
    const cs = getComputedStyle(host);
    const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    mat.body.color.set(get('--buddy-body', '#c9a46a'));
    mat.white.color.set(get('--buddy-white', '#fbf8f2'));
    mat.iris.color.set(get('--buddy-iris', '#2b1d14'));
    mat.pupil.color.set(get('--buddy-ink', '#0d0a0a'));
    mat.ink.color.set(get('--buddy-ink', '#0d0a0a'));
    mat.tip.color.set(get('--buddy-tip', '#e0453c'));
    mat.blush.color.set(get('--buddy-blush', '#ff6f6f'));
    mat.outline.color.set(get('--buddy-outline', '#0d0a0a'));
  }
  applyColors();

  // Ink outline: a slightly larger copy rendered inside-out behind the mesh
  function outlined(geometry, material, thickness = 0.06) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    const hull = new THREE.Mesh(geometry, mat.outline);
    geometry.computeBoundingSphere();
    const r = geometry.boundingSphere.radius || 1;
    hull.scale.setScalar(1 + thickness / r);
    g.add(hull, mesh);
    return g;
  }

  // ---- Build the character ----
  const rig = new THREE.Group();       // floats and jumps
  const head = new THREE.Group();      // turns toward the pointer
  rig.add(head);
  scene.add(rig);

  head.add(outlined(new RoundedBoxGeometry(2.3, 1.95, 1.8, 6, 0.62), mat.body, 0.07));

  const FACE_Z = 0.9;
  const EYE_R = 0.37;
  const eyes = [-1, 1].map((side) => {
    const socket = new THREE.Group();            // fixed to the head: holds lids and the shine
    socket.position.set(side * 0.5, 0.12, FACE_Z - 0.16);
    head.add(socket);

    const ball = new THREE.Group();              // rotates to look
    socket.add(ball);
    ball.add(outlined(new THREE.SphereGeometry(EYE_R, 32, 24), mat.white, 0.035));
    const irisGeo = new THREE.SphereGeometry(EYE_R * 1.004, 32, 12, 0, Math.PI * 2, 0, 0.52);
    irisGeo.rotateX(Math.PI / 2);
    ball.add(new THREE.Mesh(irisGeo, mat.iris));
    const pupilGeo = new THREE.SphereGeometry(EYE_R * 1.008, 32, 8, 0, Math.PI * 2, 0, 0.28);
    pupilGeo.rotateX(Math.PI / 2);
    ball.add(new THREE.Mesh(pupilGeo, mat.pupil));

    // Catch-light stays put while the eye moves under it, which is what makes eyes look wet
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), mat.shine);
    shine.position.set(-0.11, 0.13, EYE_R * 0.97);
    socket.add(shine);

    // Upper lid: a hemisphere just outside the eyeball, rotated down to close
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(EYE_R * 1.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),   // covers the eye's outline too
      mat.body
    );
    lid.material.side = THREE.DoubleSide;
    socket.add(lid);

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), mat.ink);
    brow.rotation.z = Math.PI / 2;
    brow.position.set(side * 0.5, 0.68, FACE_Z + 0.02);
    head.add(brow);

    return { side, socket, ball, lid, brow, shine };
  });

  // Mouth: a smile that can open into an "o"
  const smileGeo = new THREE.TorusGeometry(0.17, 0.045, 8, 24, Math.PI);
  const mouth = new THREE.Mesh(smileGeo, mat.ink);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.36, FACE_Z + 0.03);
  head.add(mouth);
  const ohMouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 24), mat.ink);
  ohMouth.position.copy(mouth.position);
  ohMouth.visible = false;
  head.add(ohMouth);

  [-1, 1].forEach((side) => {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), mat.blush);
    cheek.position.set(side * 0.82, -0.28, FACE_Z + 0.015);
    cheek.scale.y = 0.65;
    head.add(cheek);
  });

  // Antenna on a spring
  const antenna = new THREE.Group();
  antenna.position.set(0.25, 0.97, 0);
  head.add(antenna);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 8), mat.ink);
  stalk.position.y = 0.27;
  antenna.add(stalk);
  const tip = outlined(new THREE.SphereGeometry(0.14, 16, 12), mat.tip, 0.04);
  tip.position.y = 0.6;
  antenna.add(tip);

  // Small body and floating hands
  const body = outlined(new RoundedBoxGeometry(1.35, 0.8, 1.05, 4, 0.36), mat.body, 0.06);
  body.position.y = -1.5;
  rig.add(body);
  const hands = [-1, 1].map((side) => {
    const h = outlined(new THREE.SphereGeometry(0.22, 16, 12), mat.body, 0.05);
    h.position.set(side * 1.08, -1.45, 0.35);
    rig.add(h);
    return h;
  });

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.15;
  scene.add(shadow);

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

  // Click / tap on the companion: jump, wave and look surprised
  let vy = 0, jumpY = 0, delight = 0;
  host.addEventListener('click', () => {
    if (!reduced && jumpY <= 0.001) vy = 6.2;
    delight = 1.4;
    wake();
  });

  // ---- Animation ----
  const gaze = { x: 0, y: 0 };
  let blinkT = 0, nextBlink = 1.5, t = 0, last = performance.now();
  let raf = 0, visible = true;
  let antennaAngle = 0, antennaVel = 0, prevHeadYaw = 0;

  const damp = (cur, target, dt, s) => cur + (target - cur) * (1 - Math.exp(-dt / s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;

    // Where to look: the pointer, relative to the companion on screen
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.4;
    const idle = (now - lastMove) / 1000;
    let tx, ty;
    if (pointer.active && idle < 4) {
      tx = clamp((pointer.x - cx) / (innerWidth * 0.45), -1, 1);
      ty = clamp((pointer.y - cy) / (innerHeight * 0.45), -1, 1);
    } else if (!reduced) {
      // Nobody around: glance about slowly
      tx = Math.sin(t * 0.6) * 0.6 + Math.sin(t * 1.7) * 0.15;
      ty = Math.cos(t * 0.45) * 0.25;
    } else {
      tx = 0; ty = 0;
    }
    gaze.x = damp(gaze.x, tx, dt, 0.08);
    gaze.y = damp(gaze.y, ty, dt, 0.08);

    // Head follows part of the way, eyes do the rest
    head.rotation.y = damp(head.rotation.y, gaze.x * 0.42, dt, 0.18);
    head.rotation.x = damp(head.rotation.x, gaze.y * 0.22, dt, 0.18);
    head.rotation.z = damp(head.rotation.z, -gaze.x * 0.06, dt, 0.25);

    // Pointer right on top of it: eyes cross a little
    const close = pointer.active && Math.hypot(pointer.x - cx, pointer.y - cy) < rect.width * 0.45 ? 1 : 0;
    eyes.forEach((e) => {
      // Kept moderate so the iris never rolls out of sight under the lid
      e.ball.rotation.y = gaze.x * 0.45 - e.side * close * 0.3;
      e.ball.rotation.x = gaze.y * 0.32;
    });

    // Lids: blink every few seconds; droop when sleepy; wide open when delighted
    const sleepy = !reduced && idle > 10 ? clamp((idle - 10) / 3, 0, 1) : 0;
    if (sleepy > 0.5) wasSleepy = true;
    blinkT += dt;
    let blink = 0;
    if (blinkT > nextBlink) {
      const p = (blinkT - nextBlink) / 0.16;
      blink = p < 1 ? Math.sin(p * Math.PI) : 0;
      if (p >= 1) { blinkT = 0; nextBlink = 2 + Math.random() * 3.5; }
    }
    const OPEN = -0.65, SHUT = Math.PI / 2 + 0.05;
    let lid = OPEN + (0.95 - OPEN) * sleepy * 0.75;
    lid = lid + (SHUT - lid) * blink;
    if (delight > 0) lid = OPEN - 0.25;
    eyes.forEach((e) => {
      e.lid.rotation.x = damp(e.lid.rotation.x, lid, dt, blink ? 0.02 : 0.08);
      // Brows lift when delighted, sag when sleepy
      e.brow.position.y = damp(e.brow.position.y, 0.68 + (delight > 0 ? 0.12 : 0) - sleepy * 0.06, dt, 0.1);
      e.brow.rotation.z = Math.PI / 2 + e.side * (delight > 0 ? -0.25 : sleepy * 0.15);
      e.shine.visible = e.lid.rotation.x < 0.6;
    });
    mouth.visible = delight <= 0.6;
    ohMouth.visible = !mouth.visible;

    // Float, jump with squash on landing
    if (!reduced) {
      vy -= 18 * dt;
      jumpY = Math.max(0, jumpY + vy * dt);
      if (jumpY === 0) vy = 0;
    }
    const bob = reduced ? 0 : Math.sin(t * 2) * 0.07 - sleepy * 0.08;
    rig.position.y = bob + jumpY * 0.35;
    const squash = jumpY > 0 ? 1 + clamp(vy * 0.012, -0.08, 0.08) : 1;
    rig.scale.set(2 - squash, squash, 1);
    shadow.scale.setScalar(1.05 - (rig.position.y + 0.1) * 0.25);
    mat.shadow.opacity = 0.2 - rig.position.y * 0.05;

    // Hands: idle sway, wave when delighted
    hands.forEach((h, i) => {
      const side = i ? 1 : -1;
      const wave = delight > 0 && side === 1 ? Math.sin(t * 16) * 0.25 + 0.75 : 0;
      h.position.y = -1.45 + (reduced ? 0 : Math.sin(t * 2 + i) * 0.05) + wave;
      h.position.x = side * (1.08 + wave * 0.15);
    });

    // Antenna lags behind head turns, then springs back
    const yawVel = (head.rotation.y - prevHeadYaw) / Math.max(dt, 0.001);
    prevHeadYaw = head.rotation.y;
    if (!reduced) {
      antennaVel += (-antennaAngle * 90 - antennaVel * 7 - yawVel * 4 - vy * 0.6) * dt;
      antennaAngle += antennaVel * dt;
    }
    antenna.rotation.z = clamp(antennaAngle, -0.7, 0.7);

    if (delight > 0) delight = Math.max(0, delight - dt);

    renderer.render(scene, camera);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (wasSleepy) { wasSleepy = false; delight = Math.max(delight, 0.5); } // startled awake
    if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function resize() {
    const r = host.getBoundingClientRect();
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
  document.addEventListener('themechange', () => requestAnimationFrame(() => { applyColors(); wake(); }));
  resize();
  wake();
})();
