// avatar.js: Abishek's cartoon portrait in the hero, brought to life. The picture
// (assets/avatar-cartoon.webp) is a still image with its eyes and brows redrawn as live SVG on top:
//  - the eyes follow the pointer anywhere on the page (on phones, your finger), and cross a little
//    when the pointer is right on the face; pupils widen when you hover the portrait
//  - it blinks every few seconds, now and then twice
//  - the whole portrait tilts toward the pointer in 3D and breathes gently
//  - expressions (assets/avatar-happy|sad|angry.webp) fade in over the face:
//      happy  when clicked, or while the pointer is on the hero buttons
//      angry  when clicked several times in a row
//      sad    while the pointer is off the page; coming back, it looks surprised
//  - hovering the portrait lifts its brows and widens its pupils
// The brows sit on their own layers (assets/brow-l.png, brow-r.png) with skin filled in behind.
// Everything is drawn in the picture's own pixels (an 896 x 896 viewBox), so it scales with the box.
// If the picture can't load, the portrait photo inside .hero-photo simply stays.
'use strict';

(function () {
  const host = document.querySelector('.hero-photo');
  if (!host) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG = 'http://www.w3.org/2000/svg';

  // ---- Measurements, in the picture's pixels ----
  // Each eye: corners a and b, control points of the upper and lower lid curves, the iris centre,
  // and colours sampled from the picture (the left eye sits in shadow, the right in light).
  const EYES = [
    { a: [325, 360], b: [403, 368], up: [360, 324], lo: [368, 388], iris: [372, 362],
      white: ['#c9bfb9', '#8d827d'], lid: ['#4a271c', '#74402b'] },
    { a: [488, 370], b: [571, 362], up: [530, 324], lo: [528, 388], iris: [525, 362],
      white: ['#fbefd9', '#b99c85'], lid: ['#6e3a26', '#93533a'] }
  ];
  const IRIS_R = 18.5, PUPIL_R = 8;
  const TRAVEL = { x: 11, y: 5 };           // how far the iris may move inside the eye
  const LID_SHUT = 37;                      // lid travel that closes the eye
  const BROWS = [
    { href: 'assets/brow-l.png', x: 310, y: 291, w: 102, h: 43 },
    { href: 'assets/brow-r.png', x: 482, y: 292, w: 96, h: 36 }
  ];

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const upperCurve = (e) => `M${e.a} Q${e.up} ${e.b}`;
  const almond = (e) => `${upperCurve(e)} Q${e.lo} ${e.a} Z`;

  // ---- Build ----
  const wrap = document.createElement('div');
  wrap.className = 'avatar2d';
  wrap.setAttribute('aria-hidden', 'true');
  const tilt = document.createElement('div');
  tilt.className = 'avatar2d-tilt';
  wrap.appendChild(tilt);
  const svg = el('svg', { viewBox: '0 0 896 896', class: 'avatar2d-svg' });
  tilt.appendChild(svg);
  const defs = el('defs', {}, svg);

  const img = el('image', { href: 'assets/avatar-cartoon.webp', x: 0, y: 0, width: 896, height: 896 }, svg);

  // Brows
  const brows = BROWS.map((b) => {
    const g = el('g', {}, svg);
    el('image', { href: b.href, x: b.x, y: b.y, width: b.w, height: b.h }, g);
    return g;
  });

  // Iris gradient, shared
  const irisGrad = el('radialGradient', { id: 'av-iris', cx: '50%', cy: '50%', r: '50%' }, defs);
  [['0%', '#0d0605'], ['42%', '#1d0f0a'], ['72%', '#4b2a1b'], ['92%', '#2a160e'], ['100%', '#0f0806']]
    .forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, irisGrad));
  // Shadow the upper lid casts on the eyeball
  const lidShadow = el('linearGradient', { id: 'av-lidshadow', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  [['0%', 'rgba(20,8,4,0.55)'], ['45%', 'rgba(20,8,4,0)']]
    .forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, lidShadow));

  const eyes = EYES.map((e, i) => {
    const clip = el('clipPath', { id: `av-eye-${i}` }, defs);
    el('path', { d: almond(e) }, clip);
    const whiteGrad = el('radialGradient', { id: `av-white-${i}`, cx: '50%', cy: '55%', r: '60%' }, defs);
    el('stop', { offset: '0%', 'stop-color': e.white[0] }, whiteGrad);
    el('stop', { offset: '100%', 'stop-color': e.white[1] }, whiteGrad);
    const lidGrad = el('linearGradient', { id: `av-lid-${i}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': e.lid[0] }, lidGrad);
    el('stop', { offset: '100%', 'stop-color': e.lid[1] }, lidGrad);

    const g = el('g', { 'clip-path': `url(#av-eye-${i})` }, svg);
    const minY = Math.min(e.up[1], e.a[1], e.b[1]) - 4, maxY = Math.max(e.lo[1], e.a[1], e.b[1]) + 4;
    const minX = Math.min(e.a[0], e.b[0]) - 4, maxX = Math.max(e.a[0], e.b[0]) + 4;
    el('rect', { x: minX, y: minY, width: maxX - minX, height: maxY - minY, fill: `url(#av-white-${i})` }, g);

    const iris = el('g', {}, g);
    const [ix, iy] = e.iris;
    el('circle', { cx: ix, cy: iy, r: IRIS_R, fill: 'url(#av-iris)' }, iris);
    const pupil = el('circle', { cx: ix, cy: iy, r: PUPIL_R, fill: '#050202' }, iris);
    el('circle', { cx: ix + 7, cy: iy - 7, r: 5.2, fill: '#fff', opacity: 0.95 }, iris);
    el('circle', { cx: ix - 6, cy: iy + 6, r: 2, fill: '#fff', opacity: 0.6 }, iris);

    el('rect', { x: minX, y: minY, width: maxX - minX, height: maxY - minY, fill: 'url(#av-lidshadow)' }, g);

    // Upper lid: skin above a copy of the upper curve, with the lash line along it; slides down
    const lid = el('g', {}, g);
    el('path', { d: `${upperCurve(e)} L${e.b[0] + 6},${minY - 60} L${e.a[0] - 6},${minY - 60} Z`, fill: `url(#av-lid-${i})` }, lid);
    el('path', { d: upperCurve(e), fill: 'none', stroke: '#160c09', 'stroke-width': 5, 'stroke-linecap': 'round' }, lid);

    return { e, iris, pupil, lid, close: 0 };
  });

  // Expression pictures cover the whole live face while they show
  const FACES = ['happy', 'sad', 'angry'];
  const faces = {};
  FACES.forEach((name) => {
    faces[name] = { node: el('image', { href: `assets/avatar-${name}.webp`, x: 0, y: 0, width: 896, height: 896, opacity: 0 }, svg), o: 0 };
  });

  // Swap in once the picture is ready
  img.addEventListener('error', () => wrap.remove());
  img.addEventListener('load', () => {
    host.classList.add('has-avatar');
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', 'Cartoon portrait of Abishek T whose eyes follow the pointer');
  });
  host.appendChild(wrap);

  // ---- Input ----
  const pointer = { x: innerWidth / 2, y: innerHeight * 0.3, active: false };
  let lastMove = performance.now();
  let hovering = false;
  const onPointer = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    lastMove = performance.now();
    wake();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  host.addEventListener('pointerenter', () => { hovering = true; });
  host.addEventListener('pointerleave', () => { hovering = false; });

  // Live reactions drawn with the eyes and brows (surprise) and the whole portrait (hop)
  let reaction = null, reactT = 0;
  function react(kind) {
    reaction = kind;
    reactT = 0;
    wake();
  }

  // Expressions: one of the pictures shown for a while
  let face = null, faceUntil = 0;
  function showFace(name, seconds) {
    face = name;
    faceUntil = performance.now() + seconds * 1000;
    wake();
  }

  // Click: a happy hop. Several clicks in quick succession: angry.
  const clicks = [];
  host.addEventListener('click', () => {
    const now = performance.now();
    clicks.push(now);
    while (clicks.length && now - clicks[0] > 1600) clicks.shift();
    if (clicks.length >= 4) { showFace('angry', 2.6); clicks.length = 0; }
    else if (face !== 'angry') { showFace('happy', 1.6); react('hop'); }
  });

  // Pointer on the hero buttons: happy
  let onButton = false;
  document.querySelectorAll('.hero-ctas a').forEach((a) => {
    a.addEventListener('pointerenter', () => { onButton = true; wake(); });
    a.addEventListener('pointerleave', () => { onButton = false; wake(); });
  });

  // Pointer leaves the page: sad. Back again: surprised to see you.
  let offPage = false;
  document.documentElement.addEventListener('pointerleave', () => { offPage = true; wake(); });
  document.addEventListener('pointerenter', () => { if (offPage) { offPage = false; react('surprise'); } });
  window.addEventListener('pointermove', () => { if (offPage) { offPage = false; react('surprise'); } }, { passive: true });

  // ---- Animation ----
  const gaze = { x: 0, y: 0 };
  const tiltNow = { x: 0, y: 0 };
  const browNow = [0, 0];
  let pupilScale = 1;
  let t = 0, last = performance.now(), raf = 0, visible = true;
  let blinkT = 0, nextBlink = 1.2, blinkTwice = false;

  const damp = (cur, target, dt, s) => cur + (target - cur) * (1 - Math.exp(-dt / s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const bump = (p) => (p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI));   // 0 -> 1 -> 0

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;

    // Where to look: the pointer, relative to the face on screen
    const rect = host.getBoundingClientRect();
    const fx = rect.left + rect.width * 0.5;
    const fy = rect.top + rect.height * 0.4;
    const idle = (now - lastMove) / 1000;
    let tx, ty;
    if (pointer.active && idle < 5) {
      tx = clamp((pointer.x - fx) / (innerWidth * 0.35), -1, 1);
      ty = clamp((pointer.y - fy) / (innerHeight * 0.35), -1, 1);
    } else if (!reduced) {
      // Nobody around: glance about
      tx = Math.sin(t * 0.5) * 0.6 + Math.sin(t * 1.7) * 0.15;
      ty = Math.cos(t * 0.37) * 0.3;
    } else {
      tx = 0; ty = 0;
    }
    gaze.x = damp(gaze.x, tx, dt, 0.06);
    gaze.y = damp(gaze.y, ty, dt, 0.06);
    // Pointer right on the face: eyes cross a little
    const near = pointer.active && Math.hypot(pointer.x - fx, pointer.y - fy) < rect.width * 0.18 ? 1 : 0;

    // Reactions
    let surprise = 0, hop = 0;
    if (reaction) {
      reactT += dt;
      if (reaction === 'surprise') { surprise = bump(reactT / 1.1); hop = bump(reactT / 0.45); }
      if (reaction === 'hop') hop = bump(reactT / 0.4);
      if (reactT > 1.2) reaction = null;
    }

    // Which expression shows: a timed one (click, clicks), else the page state
    if (face && now > faceUntil) face = null;
    const want = face || (offPage ? 'sad' : onButton ? 'happy' : null);
    FACES.forEach((name) => {
      const f = faces[name];
      f.o = damp(f.o, want === name ? 1 : 0, dt, 0.07);
      if (f.o < 0.002) f.o = 0;
      f.node.setAttribute('opacity', f.o.toFixed(3));
    });

    // Blink every few seconds, sometimes twice
    let blink = 0;
    if (!reduced) {
      blinkT += dt;
      if (blinkT > nextBlink) {
        const p = (blinkT - nextBlink) / 0.17;
        blink = bump(p);
        if (p >= 1) {
          if (!blinkTwice && Math.random() < 0.2) { blinkTwice = true; nextBlink = blinkT + 0.08; }
          else { blinkTwice = false; blinkT = 0; nextBlink = 2.2 + Math.random() * 3.5; }
        }
      }
    }

    // Eyes
    eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      const dx = clamp(gaze.x * TRAVEL.x - side * near * 3, -TRAVEL.x, TRAVEL.x);
      const dy = clamp(gaze.y * TRAVEL.y, -TRAVEL.y, TRAVEL.y);
      eye.iris.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
      const close = clamp(blink - surprise * 0.2, 0, 1);
      eye.close = damp(eye.close, close, dt, blink ? 0.012 : 0.07);
      eye.lid.setAttribute('transform', `translate(0 ${(eye.close * LID_SHUT).toFixed(2)})`);
    });
    pupilScale = damp(pupilScale, hovering ? 1.22 : surprise ? 0.75 : 1, dt, 0.15);
    eyes.forEach((eye) => eye.pupil.setAttribute('r', (PUPIL_R * pupilScale).toFixed(2)));

    // Brows: up when surprised, a little when hovered
    brows.forEach((b, i) => {
      const lift = surprise * 12 + (hovering ? 3 : 0);
      browNow[i] = damp(browNow[i], lift, dt, 0.06);
      b.setAttribute('transform', `translate(0 ${(-browNow[i]).toFixed(2)})`);
    });

    // Whole portrait: tilts toward the pointer, breathes, hops
    tiltNow.x = damp(tiltNow.x, gaze.x, dt, 0.25);
    tiltNow.y = damp(tiltNow.y, gaze.y, dt, 0.25);
    const breath = reduced ? 0 : Math.sin(t * 1.6);
    const ry = tiltNow.x * 7;
    const rx = -tiltNow.y * 5;
    const rz = tiltNow.x * 1.2;
    const lift = -hop * 3 + breath * 0.25;
    tilt.style.transform =
      `translateY(${lift.toFixed(2)}%) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${rz.toFixed(2)}deg) scale(${(1 + breath * 0.004).toFixed(4)})`;

    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(host);
  document.addEventListener('visibilitychange', wake);
  wake();
})();
