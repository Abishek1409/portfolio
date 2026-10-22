// Portfolio scripts: nav, parallax, drum intro and scroll-driven projects drum
'use strict';

// Drum intro helpers (pure, no DOM access)

const DRUM_MAX_SHADE = 0.65;

/** Height of one face so `count` faces at apothem `radius` form a closed cylinder. */
function faceHeight(radius, count) {
  return 2 * radius * Math.tan(Math.PI / count);
}

/** Cubic ease-in-out for progress `t` in [0, 1]. */
function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Blur in px for progress `p`: 0 at both ends, `max` at mid-rotation. */
function blurAmount(p, max) {
  const x = Math.min(1, Math.max(0, Number(p) || 0));
  return max * Math.sin(Math.PI * x);
}

/** Shade opacity for a face at `angleDeg` from the viewer: 0 facing, max edge-on or beyond. */
function faceShade(angleDeg) {
  const facing = Math.max(0, Math.cos((angleDeg * Math.PI) / 180));
  return DRUM_MAX_SHADE * (1 - facing);
}

/** translateY in px of the trailing-edge shadow: starts at the viewport bottom, ends at the top. */
function shadowOffset(p, vh) {
  return vh * (1 - easeInOutCubic(p));
}

/**
 * Mobile nav toggle. Smooth scrolling itself is handled by CSS
 * (scroll-behavior + scroll-margin-top).
 */
function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Close the menu after choosing a section
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  // Close on Escape and return focus to the toggle
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
}

/** True when the visitor has requested reduced motion. */
function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Parallax for the About background. Moves `el` at 30% of the section's
 * offset from the viewport centre, throttled to one update per frame.
 */
function initParallax(el) {
  if (!el || prefersReducedMotion()) return;
  const section = el.parentElement;
  let ticking = false;

  const update = () => {
    ticking = false;
    const rect = section.getBoundingClientRect();
    // Skip work while the section is off screen
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
    // Layer overhangs the section by 15% on each side; never shift past that
    const max = rect.height * 0.15;
    const y = Math.max(-max, Math.min(max, offset * -0.3));
    el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/** Restrict `value` to the range [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Drum intro (DOM)

const DRUM_FACES = 8;
const DRUM_STEP = 360 / DRUM_FACES;                 // 45deg between faces
const DRUM_TURN = DRUM_STEP * (DRUM_FACES - 1);     // 315deg: ends with the transparent window face in front
const DRUM_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const DRUM_MAX_BLUR = 8;                            // px, vertical only
const DRUM_STAGGER_AT = 0.7;                        // rotation progress that starts the hero stagger
const DRUM_SKIP_MS = 250;                           // skip finishes the remaining roll in this time

/** Build the overlay: SVG blur filter, scene, cylinder with 8 faces, trailing-edge shadow. */
function createDrumOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'drum-intro';
  overlay.setAttribute('aria-hidden', 'true');

  // Y-axis-only blur (CSS blur() cannot be directional)
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', 'drum-blur');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const blur = document.createElementNS(ns, 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '0 0');
  filter.appendChild(blur);
  svg.appendChild(filter);

  const scene = document.createElement('div');
  scene.className = 'drum-scene';
  const cylinder = document.createElement('div');
  cylinder.className = 'drum-cylinder';

  const faces = [];
  for (let i = 0; i < DRUM_FACES; i++) {
    const face = document.createElement('div');
    face.className = 'drum-face';
    face.style.setProperty('--i', String(i));
    if (i === 0) {
      face.classList.add('drum-face--intro');
      const label = document.createElement('p');
      label.className = 'drum-label';
      label.textContent = 'Developer Portfolio';
      const title = document.createElement('h2');
      title.className = 'drum-title';
      title.textContent = 'Abishek T';
      face.append(label, title);
    } else {
      face.dataset.variant = String(i);
    }
    cylinder.appendChild(face);
    faces.push(face);
  }
  scene.appendChild(cylinder);

  const shadow = document.createElement('div');
  shadow.className = 'drum-shadow';

  overlay.append(svg, scene, shadow);
  return { overlay, scene, cylinder, faces, shadow, blur };
}

/** Jump to the top without smooth scrolling and leave focus at the start of the document. */
function resetScrollAndFocus() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch (err) {
    window.scrollTo(0, 0);
  }
  const body = document.body;
  body.setAttribute('tabindex', '-1');
  body.style.outline = 'none';
  body.focus({ preventScroll: true });
  body.addEventListener('blur', () => {
    body.removeAttribute('tabindex');
    body.style.outline = '';
  }, { once: true });
}

/**
 * Drum intro: a cylinder rolls away on the X axis and reveals the hero.
 * Returns { play, skip }. `play` is ignored while a run is in progress.
 */
function initDrumIntro(options) {
  const root = document.documentElement;
  const replayBtn = options && options.replayBtn;
  let isPlaying = false;
  let skipCurrent = null;

  function play() {
    if (isPlaying) return;
    isPlaying = true;

    let drum = null;
    let skipBtn = null;
    let animation = null;
    let duration = 0;
    let viewH = 0;
    let rafId = 0;
    let resizeId = 0;
    let safetyId = 0;
    let done = false;
    let skipped = false;
    let staggered = false;

    const startStagger = () => {
      if (staggered) return;
      staggered = true;
      root.classList.add('is-staggered');
    };

    /** Size the drum from the live viewport height so face 0 exactly fills the screen. */
    function layout() {
      viewH = window.innerHeight;
      const radius = viewH / (2 * Math.tan(Math.PI / DRUM_FACES));
      drum.radius = radius;
      drum.overlay.style.setProperty('--drum-r', `${radius.toFixed(2)}px`);
      drum.overlay.style.setProperty('--drum-face-h', `${faceHeight(radius, DRUM_FACES).toFixed(2)}px`);
    }

    /** Per-frame lighting, blur, shadow and stagger trigger from the eased rotation progress. */
    function update() {
      const timing = animation.effect.getComputedTiming();
      const e = clamp(Number(timing.progress) || 0, 0, 1);
      const theta = DRUM_TURN * e;

      drum.faces.forEach((face, i) => {
        // Face angle relative to the viewer, normalised to [-180, 180)
        const a = ((((i * DRUM_STEP - theta) + 180) % 360) + 360) % 360 - 180;
        face.style.setProperty('--shade', faceShade(a).toFixed(3));
      });

      const blurPx = blurAmount(e, DRUM_MAX_BLUR);
      drum.blur.setAttribute('stdDeviation', `0 ${blurPx.toFixed(2)}`);
      drum.scene.style.setProperty('--drum-filter', blurPx > 0.1 ? 'url(#drum-blur)' : 'none');

      // Trailing edge = top edge of the transparent window face (face 7), projected with the
      // scene perspective. It starts at the viewport bottom and rises to the top.
      const winDeg = (DRUM_FACES - 1) * DRUM_STEP - theta;           // window face angle to viewer
      const winNorm = ((((winDeg + 180) % 360) + 360) % 360) - 180;
      const aw = (winDeg * Math.PI) / 180;
      const r = drum.radius;
      const half = viewH / 2;                                         // face height equals viewport height
      const yRaw = half * Math.cos(aw) - r * Math.sin(aw);            // bottom edge of the window face
      const zRaw = half * Math.sin(aw) + r * Math.cos(aw) - r;
      const edgeY = half + (yRaw * 3 * r) / (3 * r - zRaw);
      // Only cast while the window face is on the front half; sits above the edge, dark at the edge
      const visible = winNorm >= 0 && winNorm < 90;
      drum.shadow.style.transform = `translate3d(0, calc(${edgeY.toFixed(1)}px - 100%), 0) scaleY(-1)`;
      drum.shadow.style.opacity = !visible ? '0' : e < 0.85 ? '1' : clamp((1 - e) / 0.15, 0, 1).toFixed(3);

      if (e >= DRUM_STAGGER_AT) startStagger();
    }

    function tick() {
      if (done) return;
      update();
      rafId = requestAnimationFrame(tick);
    }

    function onResize() {
      if (resizeId || done) return;
      resizeId = requestAnimationFrame(() => {
        resizeId = 0;
        if (!done && drum) layout();
      });
    }

    /** Speed the roll up so the remaining rotation completes within DRUM_SKIP_MS. */
    function skip() {
      if (done || skipped) return; // a second press must not slow the roll down again
      skipped = true;
      if (!animation) { finish(); return; }
      const remaining = Math.max(0, duration - (Number(animation.currentTime) || 0));
      animation.updatePlaybackRate(Math.max(1, remaining / DRUM_SKIP_MS));
    }

    function onKey(e) {
      if (e.key === 'Escape' && skipCurrent) skipCurrent();
    }

    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(resizeId);
      clearTimeout(safetyId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      try { if (animation) animation.cancel(); } catch (err) { /* already finished */ }
      if (drum) {
        drum.cylinder.classList.remove('is-animating');
        drum.shadow.classList.remove('is-animating');
        drum.overlay.hidden = true;
        drum.overlay.remove();
      }
      if (skipBtn) skipBtn.remove();
      startStagger();
      root.classList.remove('is-intro');
      resetScrollAndFocus();
      skipCurrent = null;
      isPlaying = false;
    }

    try {
      root.classList.remove('is-staggered');
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch (err) {
        window.scrollTo(0, 0);
      }
      root.classList.add('is-intro');
      drum = createDrumOverlay();
      document.body.appendChild(drum.overlay);
      document.addEventListener('keydown', onKey);

      if (prefersReducedMotion()) {
        // Overlay cross-fade only; hero uses opacity-only stagger
        skipCurrent = finish;
        drum.overlay.addEventListener('transitionend', (e) => {
          if (e.target === drum.overlay) finish();
        });
        safetyId = setTimeout(finish, 800);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (done) return;
          drum.overlay.classList.add('is-fading');
          startStagger();
        }));
        return;
      }

      skipCurrent = skip;
      duration = window.innerWidth < 1024 ? 2200 : 2600;
      layout();

      skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'drum-skip';
      skipBtn.textContent = 'Skip intro';
      skipBtn.addEventListener('click', skip);
      document.body.appendChild(skipBtn);

      drum.cylinder.classList.add('is-animating');
      drum.shadow.classList.add('is-animating');
      animation = drum.cylinder.animate(
        [{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${-DRUM_TURN}deg)` }],
        { duration, easing: DRUM_EASING, fill: 'forwards' }
      );
      animation.onfinish = finish;
      window.addEventListener('resize', onResize);
      safetyId = setTimeout(finish, duration + 1500);
      update();
      rafId = requestAnimationFrame(tick);
    } catch (err) {
      // Never leave the hero hidden behind a broken intro
      finish();
    }
  }

  if (replayBtn) replayBtn.addEventListener('click', play);

  return { play, skip: () => { if (skipCurrent) skipCurrent(); } };
}

// Projects drum reveal

const REVEAL_MS = 1100;
const REVEAL_SAMPLES = 10;

/**
 * Drum-roll one element about the X axis with the intro's easing and lighting.
 * The element is treated as one face of an 8-face drum: it rotates about an axis one
 * apothem behind its plane, from `rotateX(from)` to `rotateX(to)`, rising from below like
 * the intro's incoming faces. Brightness follows `faceShade`. Uses fill 'forwards'; the
 * caller cancels the animation when done so no transform is left behind.
 */
function drumReveal(el, options) {
  const o = options || {};
  const from = o.from === undefined ? -80 : o.from;
  const to = o.to === undefined ? 0 : o.to;
  // Apothem of an 8-face drum whose face is as tall as the element
  const radius = Math.max(200, el.offsetHeight / (2 * Math.tan(Math.PI / DRUM_FACES)));
  const frames = [];
  for (let i = 0; i <= REVEAL_SAMPLES; i++) {
    const t = i / REVEAL_SAMPLES;
    const angle = from + (to - from) * t;
    frames.push({
      offset: t,
      transform: `perspective(1400px) translateZ(${-radius.toFixed(1)}px) rotateX(${angle.toFixed(2)}deg) translateZ(${radius.toFixed(1)}px)`,
      filter: `brightness(${(1 - faceShade(angle)).toFixed(3)})`,
      opacity: Math.min(1, t * 3)
    });
  }
  return el.animate(frames, { duration: o.duration || REVEAL_MS, easing: DRUM_EASING, fill: 'forwards' });
}

// Horizontal drum carousel (cards wrap around a vertical axis, like a rolling drum seen side-on)
const PD_RADIUS = 2;             // drum radius as a multiple of card width (two neighbours visible per side)
const PD_GAP = 0.22;             // spacing between cards as a fraction of card width
const PD_SHADE = 0.85;           // max edge darkness
const PD_FADE = [1.45, 1.75];    // rad: cards fade out between these angles
const PD_STIFFNESS = 6;          // spring easing toward the scroll target (lower = softer)
const PD_SCROLL_PER_CARD = 0.6;  // stage heights of scrolling per card
const PD_START = -1.6;           // cards offset at roll-in start (rolls in from the left)
const PD_SNAP_DELAY = 140;       // ms after scrolling stops before settling on the nearest card

/** Card index position (0 .. count-1) for `scrolled` px into a pinned track of `distance` px. */
function drumAngle(scrolled, distance, count) {
  if (!(distance > 0) || !(count > 1)) return 0;
  return clamp(scrolled / distance, 0, 1) * (count - 1);
}

/**
 * Placement of a card `offset` cards away from the front on a drum of `radius` card widths.
 * Returns x/z in card widths, rotation in rad, edge shade and fade (0..1).
 */
function drumPlace(offset, radius, gap, shade) {
  const s = offset * ((1 + gap) / radius);
  const a = Math.abs(s);
  const fade = 1 - clamp((a - PD_FADE[0]) / (PD_FADE[1] - PD_FADE[0]), 0, 1);
  return {
    x: radius * Math.sin(s),
    z: radius * Math.cos(s) - radius,
    ry: s,
    shade: shade * (1 - Math.max(0, Math.cos(s))),
    fade
  };
}

/**
 * Projects drum: the cards sit side by side on the surface of a drum that turns about its
 * vertical axis, so they roll in horizontally. Scrolling drives the target card; a spring
 * eases the drum toward it and settles on the nearest card when scrolling stops. The section pins
 * while the drum turns, then scrolls on. On first view the drum rolls in from the side.
 * Without JS, WAAPI or with reduced motion, the cards stay a plain vertical list.
 */
function initProjectsDrum() {
  const section = document.getElementById('projects');
  const track = section && section.querySelector('.stack');
  const heading = section && section.querySelector('.projects-reveal');
  const cards = track ? Array.from(track.querySelectorAll('.project-card')) : [];
  const header = document.querySelector('.site-header');
  if (!heading || cards.length < 2 || prefersReducedMotion() ||
      typeof heading.animate !== 'function' || typeof IntersectionObserver !== 'function') return;

  const count = cards.length;

  // No filter on the drum: a filter flattens preserve-3d, which made the cards snap flat
  const stage = document.createElement('div');
  stage.className = 'pd-stage';
  const drum = document.createElement('div');
  drum.className = 'pd-drum';
  cards.forEach((card) => drum.appendChild(card));
  stage.append(drum);
  track.appendChild(stage);
  section.classList.add('pd-on', 'pd-pending');

  let navH = 0;
  let stageH = 0;
  let distance = 0;
  let cardW = 0;
  let current = 0;      // rendered card position (spring)
  let target = 0;       // card position from scroll
  let reveal = PD_START; // extra offset while rolling in
  let rafId = 0;
  let last = 0;

  // Phones and tablets: no scroll pinning; the drum turns with horizontal swipes
  const mobileMQ = window.matchMedia('(max-width: 1023.98px), (pointer: coarse)');
  let swipeMode = mobileMQ.matches;

  function layout() {
    navH = header ? header.offsetHeight : 0;
    section.classList.toggle('pd-swipe', swipeMode);
    stageH = stage.clientHeight;
    cardW = cards[0].offsetWidth;
    stage.style.perspective = `${Math.round(cardW * PD_RADIUS * 3)}px`;
    if (swipeMode) {
      distance = 0;
      track.style.height = '';
      return;
    }
    distance = (count - 1) * stageH * PD_SCROLL_PER_CARD;
    track.style.height = `${Math.round(stageH + distance)}px`;
    target = drumAngle(navH - track.getBoundingClientRect().top, distance, count);
  }

  function render() {
    const pos = current + reveal;
    cards.forEach((card, i) => {
      const p = drumPlace(i - pos, PD_RADIUS, PD_GAP, PD_SHADE);
      card.style.transform =
        `translate(-50%, -50%) translate3d(${(p.x * cardW).toFixed(1)}px, 0, ${(p.z * cardW).toFixed(1)}px) rotateY(${p.ry.toFixed(4)}rad)`;
      card.style.opacity = p.fade.toFixed(3);
      card.style.visibility = p.fade > 0.001 ? '' : 'hidden';
      card.style.setProperty('--shade', p.shade.toFixed(3));
      // Front card is interactive; visible neighbours can be clicked to bring them to the front
      const front = Math.abs(i - pos) < 0.5;
      card.classList.toggle('is-front', front);
      card.style.pointerEvents = Math.abs(i - pos) < 1.6 ? '' : 'none';
    });
  }

  /** Spring the drum toward the scroll target. */
  function tick(now) {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    current += (target - current) * (1 - Math.exp(-PD_STIFFNESS * dt));
    if (Math.abs(target - current) < 0.0005) current = target;
    render();
    syncDots();
    if (current !== target || revealing) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
      last = 0;
    }
  }

  const wake = () => { if (!rafId) rafId = requestAnimationFrame(tick); };

  /** Scroll offset (px from page top) at which card `i` is in front. */
  const cardScrollTop = (i) =>
    track.getBoundingClientRect().top + window.scrollY - navH + i * stageH * PD_SCROLL_PER_CARD;

  // When scrolling stops between two cards, glide to the nearest one instead of resting half-turned
  let snapId = 0;
  let snapping = false;
  function snap() {
    snapId = 0;
    const scrolled = navH - track.getBoundingClientRect().top;
    if (scrolled <= 0 || scrolled >= distance) return; // not pinned: leave the page alone
    const pos = drumAngle(scrolled, distance, count);
    const nearest = Math.round(pos);
    if (Math.abs(pos - nearest) < 0.01) return;
    snapping = true;
    try {
      window.scrollTo({ top: cardScrollTop(nearest), left: 0, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, cardScrollTop(nearest));
    }
    target = nearest;
    wake();
  }

  const onScroll = () => {
    if (swipeMode) return; // page scroll never turns the drum on mobile
    target = drumAngle(navH - track.getBoundingClientRect().top, distance, count);
    wake();
    clearTimeout(snapId);
    // Smooth-scroll events from the snap itself must not re-arm it
    if (snapping) {
      // Once the glide ends, re-check in case the visitor scrolled again during it
      snapId = setTimeout(() => { snapping = false; snap(); }, PD_SNAP_DELAY);
      return;
    }
    snapId = setTimeout(snap, PD_SNAP_DELAY);
  };
  const onResize = () => { layout(); render(); wake(); };

  let revealing = false;

  /** Roll the heading (rotateX -80deg to 0) and the drum (from the side) in once. */
  function playReveal() {
    let done = false;
    let anim = null;
    const t0 = performance.now();

    const finish = () => {
      if (done) return;
      done = true;
      revealing = false;
      reveal = 0;
      try { if (anim) anim.cancel(); } catch (err) { /* already cancelled */ }
      section.classList.remove('pd-pending');
      render();
      wake();
    };

    try {
      revealing = true;
      section.classList.remove('pd-pending');
      anim = drumReveal(heading, { from: -80, to: 0 });
      const step = (now) => {
        if (done) return;
        const p = clamp((now - t0) / REVEAL_MS, 0, 1);
        reveal = PD_START * (1 - easeInOutCubic(p));
        if (p >= 1) { finish(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      wake();
      setTimeout(finish, REVEAL_MS + 1500);
    } catch (err) {
      // Never leave the drum hidden
      finish();
    }
  }

  /** Scroll so card `i` is in front; `smooth` lets the drum spring there visibly. */
  function goTo(i, smooth) {
    if (swipeMode) {
      // No page scrolling on mobile: just turn the drum
      target = clamp(i, 0, count - 1);
      if (!smooth) { current = target; render(); }
      syncDots();
      wake();
      return;
    }
    const top = cardScrollTop(i);
    if (smooth) snapping = true;
    try {
      window.scrollTo({ top, left: 0, behavior: smooth ? 'smooth' : 'instant' });
    } catch (err) {
      window.scrollTo(0, top);
    }
    target = i;
    if (!smooth) { current = i; render(); }
    wake();
  }

  // Clicking a side card rolls it to the front instead of following its link
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.project-card');
    if (!card || card.classList.contains('is-front')) return;
    e.preventDefault();
    goTo(cards.indexOf(card), true);
  });

  // Keyboard users: focusing a link on a card that is not in front turns the drum to it
  track.addEventListener('focusin', (e) => {
    const card = e.target.closest('.project-card');
    if (card && !card.classList.contains('is-front')) goTo(cards.indexOf(card), false);
  });

  // ----- Mobile: horizontal swipe instead of the scroll-pinned drum -----
  let drag = null;
  let suppressClick = false;

  stage.addEventListener('pointerdown', (e) => {
    if (!swipeMode || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { x: e.clientX, y: e.clientY, start: target, active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      // Decide the gesture: sideways drives the drum, vertical leaves the page scrolling
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.active = true;
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 8) {
        drag = null;
        return;
      } else {
        return;
      }
    }
    const step = cardW * (1 + PD_GAP);
    // Follow the finger 1:1, with a little rubber-band past the first and last card
    target = clamp(drag.start - dx / step, -0.35, count - 1 + 0.35);
    current = target;
    const dt = Math.max(1, e.timeStamp - drag.lastT) / 1000;
    drag.v = 0.8 * drag.v + 0.2 * (-(e.clientX - drag.lastX) / step / dt); // cards per second
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    render();
  });

  const endDrag = () => {
    if (!drag) return;
    if (drag.active) {
      // Flick: project the release velocity, then settle on the nearest card
      target = clamp(Math.round(current + clamp(drag.v * 0.25, -1, 1)), 0, count - 1);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 50);
      wake();
    }
    drag = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Pager dots: show where you are and jump to any project
  const dots = document.createElement('div');
  dots.className = 'pd-dots';
  const dotButtons = cards.map((card, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pd-dot';
    const title = card.querySelector('h3');
    b.setAttribute('aria-label', `Show project ${i + 1}${title ? `: ${title.textContent.trim()}` : ''}`);
    b.addEventListener('click', () => goTo(i, true));
    dots.appendChild(b);
    return b;
  });
  track.appendChild(dots);
  const syncDots = () => {
    const active = clamp(Math.round(target), 0, count - 1);
    dotButtons.forEach((b, i) => b.setAttribute('aria-current', i === active ? 'true' : 'false'));
  };

  const onModeChange = () => {
    swipeMode = mobileMQ.matches;
    layout();
    if (swipeMode) target = clamp(Math.round(current), 0, count - 1);
    current = target;
    render();
    syncDots();
  };
  if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onModeChange);
  else if (mobileMQ.addListener) mobileMQ.addListener(onModeChange);

  layout();
  current = target;
  render();
  syncDots();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    playReveal();
  }, { rootMargin: '0px 0px -20% 0px', threshold: 0.2 });
  observer.observe(stage);
}

/**
 * TechText headings: each single-line heading keeps its real text (visually hidden, so screen
 * readers, search and copy still work) and gets a canvas wordmark drawn by createTechText.
 * Font, weight, size, colour and alignment are inherited from the heading's own CSS.
 * Multi-line text (paragraphs, project titles) stays as normal text so it remains readable.
 */
const TECH_TEXT_TARGETS = [
  // [selector, extra options]
  ['.hero-name', { sweep: true, reach: 160 }],
  ['.section-title', { sweep: false }]
  // Small sub-headings (About, Skills) stay plain text: at that size, over the artwork,
  // the dashed outline reads as broken letters
];

function initTechText() {
  if (typeof window.createTechText !== 'function') return [];
  const instances = [];
  TECH_TEXT_TARGETS.forEach(([selector, extra]) => {
    document.querySelectorAll(selector).forEach((el) => {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text || el.classList.contains('tt-on')) return;
      const label = document.createElement('span');
      label.className = 'tt-sr';
      label.textContent = text;
      const host = document.createElement('span');
      host.className = 'tt-host';
      host.setAttribute('aria-hidden', 'true');
      el.textContent = '';
      el.append(label, host);
      el.classList.add('tt-on');
      instances.push(window.createTechText(host, Object.assign({
        text,
        color: 'inherit',
        accentColor: '#c9a46a',
        letterSpacing: -0.01,
        align: 'auto',
        padX: 0,
        dashLength: 4,
        dashGap: 2,
        reveal: 'letter',
        specks: 15
      }, extra)));
    });
  });
  return instances;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initTechText();
    // Runs once per load; anchor navigation never re-triggers it. Replay is the footer button.
    initDrumIntro({ replayBtn: document.querySelector('.replay-btn') }).play();
    initNav();
    initParallax(document.querySelector('.about-bg'));
    initProjectsDrum();
  });
}

// Expose pure helpers for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clamp, drumAngle, drumPlace,
    faceHeight, easeInOutCubic, blurAmount, faceShade, shadowOffset
  };
}
