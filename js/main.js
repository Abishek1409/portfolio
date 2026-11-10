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

  // Follow the scroll only while the section is near the screen. Everywhere else the handler
  // would read the section's box on every scroll frame for nothing, and that read forces a
  // style recalculation each time (it showed up in the Projects section's frame profile).
  let listening = false;
  const setListening = (on) => {
    if (on === listening) return;
    listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('scroll', onScroll, { passive: true });
    window[method]('resize', onScroll);
    if (on) onScroll();
  };

  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver((entries) => {
      setListening(entries[entries.length - 1].isIntersecting);
    }, { rootMargin: '10% 0px' }).observe(section);
  } else {
    setListening(true);
  }
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

// Projects drum (see initProjectsDrum, and js/project-drum.js for the drawing)
const PD_FADE = [1.45, 1.75];    // rad: cards fade out between these angles (used by drumPlace)
const PD_STIFFNESS = 6;          // laptop: spring easing toward the scroll position (lower = softer)
const PD_SETTLE_MS = 180;        // laptop: stillness after which the drum glides on to the nearest card
const PD_SCROLL_PER_CARD = 0.6;  // laptop: stage heights of page scrolling per card
const PD_SWIPE_STEP = 1.05;      // phone: card widths of swiping per card (about one swipe)
const PD_START = -1.6;           // cards offset at roll-in start (rolls in from the side)

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
 * Projects drum. The project cards are drawn on a WebGL drum (js/project-drum.js): each card is
 * wrapped round a rolling cylinder, darker and more transparent toward its edge.
 *
 * Laptop: the section pins while the drum turns. The page scroll sets where the drum should be,
 * and a soft spring carries the drum there, so the cards glide and roll rather than following
 * the wheel in steps. When the visitor stops scrolling the drum glides on to the nearest card.
 * Only the drum does this: the script never moves the page scroll.
 *
 * Phone: the stage scrolls sideways natively, with momentum and snapping to one card, and the
 * drum is drawn at that scroll position.
 *
 * Click the front card (or press Enter on its hidden button) to open its details; click a side
 * card to roll it to the front. The original <article> cards stay in the page as the source of
 * those details and as the plain list shown without JS, WebGL or with reduced motion.
 */
function initProjectsDrum() {
  const section = document.getElementById('projects');
  const track = section && section.querySelector('.stack');
  const heading = section && section.querySelector('.projects-reveal');
  const cards = track ? Array.from(track.querySelectorAll('.project-card')) : [];
  const header = document.querySelector('.site-header');
  if (!heading || cards.length < 2 || prefersReducedMotion() || typeof window.createProjectDrum !== 'function' ||
      typeof heading.animate !== 'function' || typeof IntersectionObserver !== 'function') return;

  const count = cards.length;

  // What each card shows: "Name – Subtitle" split into a title and a line under it, the first
  // technologies (or the client note) bottom left, and its number bottom right.
  const items = cards.map((card, i) => {
    const full = card.querySelector('h3').textContent.trim();
    const [name, ...rest] = full.split(/\s+\u2013\s+/);
    const live = card.classList.contains('project-card--live');
    const tech = Array.from(card.querySelectorAll('.project-tech li')).map((li) => li.textContent.trim());
    return {
      title: name,
      subtitle: rest.join(' \u2013 '),
      label: live ? 'In use by a client' : tech.slice(0, 3).join(' \u00b7 '),
      index: String(i + 1).padStart(2, '0'),
      image: card.dataset.image || '',
      live
    };
  });

  let stage = null;
  const canvas = document.createElement('canvas');
  canvas.className = 'pd-drum';
  canvas.setAttribute('aria-hidden', 'true');
  const drum = window.createProjectDrum(canvas, items, { onLost: () => teardown() });
  if (!drum) return;

  // The list stays hidden while the textures load, and comes back if the drum cannot start
  section.classList.add('pd-loading');
  drum.ready.then((ok) => {
    section.classList.remove('pd-loading');
    if (ok) start();
    else drum.destroy();
  });
  return;

  function teardown() {
    drum.destroy();
    if (stage) stage.remove();
    section.classList.remove('pd-on', 'pd-pending', 'pd-swipe', 'pd-loading');
    track.style.height = '';
  }

  function start() {
    // Structure: stage (clips; scrolls sideways on a phone) > rail (as wide as the sideways travel)
    // > canvas, details panel and one snap point per card (phone). The rail adds no box on a laptop.
    stage = document.createElement('div');
    stage.className = 'pd-stage';
    const rail = document.createElement('div');
    rail.className = 'pd-rail';
    const detail = document.createElement('div');
    detail.className = 'pd-detail';
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-modal', 'false');
    const snaps = cards.map(() => {
      const snap = document.createElement('span');
      snap.className = 'pd-snap';
      snap.setAttribute('aria-hidden', 'true');
      return snap;
    });
    rail.append(canvas, detail, ...snaps);

    // One hidden button per card: keyboard and screen reader access to the drum
    const controls = document.createElement('div');
    controls.className = 'pd-controls';
    const buttons = items.map((item, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${item.title}${item.subtitle ? `: ${item.subtitle}` : ''}. Project ${i + 1} of ${count}. Show details`;
      button.addEventListener('focus', () => { if (frontIndex() !== i) goTo(i, false); });
      button.addEventListener('click', () => { goTo(i, false); openDetail(i); });
      controls.appendChild(button);
      return button;
    });

    stage.append(rail, controls);
    track.appendChild(stage);
    section.classList.add('pd-on', 'pd-pending');

    // ----- Geometry, position and state -----
    const mobileMQ = window.matchMedia('(max-width: 1023.98px), (pointer: coarse)');
    let swipeMode = mobileMQ.matches;     // phones and tablets: sideways swiping instead of pinning
    let navH = 0;
    let stageW = 0;
    let stageH = 0;
    let step = 0;                         // phone: px of sideways travel per card
    let distance = 0;                     // laptop: px of page scroll while the section is pinned
    let pos = 0;                          // card position the drum is drawn at
    let current = 0;                      // laptop: the spring's position
    let target = 0;                       // laptop: where the spring is heading
    let last = 0;                         // time of the previous frame
    let prevRaw = 0;                      // phone: previous scroll position, for the speed
    let speed = 0;                        // cards per second, for the motion blur
    let reveal = PD_START;                // roll-in offset
    let revealing = false;
    let rafId = 0;
    let lastScroll = 0;                   // laptop: time of the latest page scroll
    let settleTimer = 0;
    let detailIndex = -1;

    const frontIndex = () => clamp(Math.round(pos), 0, count - 1);

    /** Card position (0 .. count-1) the scroll position asks for. */
    function readPos() {
      if (swipeMode) return step > 0 ? clamp(stage.scrollLeft / step, 0, count - 1) : 0;
      return drumAngle(navH - track.getBoundingClientRect().top, distance, count);
    }

    /** Page scroll offset at which card `i` is in front (laptop). */
    const cardScrollTop = (i) =>
      track.getBoundingClientRect().top + window.scrollY - navH + (i / (count - 1)) * distance;

    /** One frame: read the scroll position, move the spring (laptop), draw. */
    function frame(now) {
      rafId = 0;
      const t = typeof now === 'number' ? now : performance.now();
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      const raw = readPos();
      const box = stage.getBoundingClientRect();
      if (!revealing && (box.bottom < 0 || box.top > window.innerHeight)) {
        // Off screen: keep the state in step with the scroll, draw nothing
        current = target = prevRaw = pos = raw;
        speed = 0;
        last = 0;
        return;
      }
      let moving = false;
      if (swipeMode) {
        speed = (raw - prevRaw) / dt;
        prevRaw = raw;
        pos = raw;
        moving = Math.abs(speed) > 0.02;
      } else {
        // Once the visitor has stopped scrolling the drum glides on to the nearest card. Only the
        // drum does: the page scroll position stays exactly where the visitor left it.
        target = t - lastScroll > PD_SETTLE_MS ? Math.round(raw) : raw;
        const before = current;
        current += (target - current) * (1 - Math.exp(-PD_STIFFNESS * dt));
        if (Math.abs(target - current) < 0.0005) current = target;
        speed = (current - before) / dt;
        pos = current;
        moving = current !== target;
      }
      if (!moving) speed = 0; // sharp as soon as it has stopped
      drum.render(pos + reveal, speed);
      if (detailIndex >= 0 && frontIndex() !== detailIndex) closeDetail(false);
      if (moving || revealing) schedule();
      else last = 0;
    }

    const schedule = () => { if (!rafId) rafId = requestAnimationFrame(frame); };

    function layout() {
      navH = header ? header.offsetHeight : 0;
      section.classList.toggle('pd-swipe', swipeMode);
      stageW = stage.clientWidth;
      stageH = stage.clientHeight;
      if (swipeMode) {
        canvas.style.width = `${stageW}px`;
        track.style.height = '';
        distance = 0;
      } else {
        canvas.style.width = '';
        distance = (count - 1) * stageH * PD_SCROLL_PER_CARD;
        track.style.height = `${Math.round(stageH + distance)}px`;
      }
      drum.resize(stageW, stageH);
      if (swipeMode) {
        step = Math.max(1, Math.round(drum.cardWidth() * PD_SWIPE_STEP));
        rail.style.width = `${stageW + (count - 1) * step}px`;
        snaps.forEach((snap, i) => {
          snap.style.left = `${i * step}px`;
          snap.style.width = `${step}px`;
        });
      } else {
        step = 0;
        rail.style.width = '';
      }
      if (detailIndex >= 0) placeDetail();
    }

    const onResize = () => { layout(); frame(); };
    const onPageScroll = () => {
      if (swipeMode) return;
      lastScroll = performance.now();
      // Wake up again once the scroll has been still long enough for the drum to settle
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, PD_SETTLE_MS + 30);
      schedule();
    };
    const onStageScroll = () => { if (swipeMode) schedule(); };

    // ----- Details panel -----
    function placeDetail() {
      const f = drum.frame();
      const shiftX = swipeMode ? stage.scrollLeft : 0;
      detail.style.width = `${Math.round(f.w)}px`;
      detail.style.height = `${Math.round(f.h)}px`;
      detail.style.left = `${Math.round(shiftX + f.x - f.w / 2)}px`;
      detail.style.top = `${Math.round(f.y - f.h / 2)}px`;
    }

    function openDetail(i) {
      const source = cards[i];
      detailIndex = i;
      detail.textContent = '';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'pd-back-btn';
      back.textContent = '\u21ba Back';
      back.setAttribute('aria-label', `Hide details for ${items[i].title}`);
      back.addEventListener('click', () => closeDetail(true));
      const title = source.querySelector('h3').cloneNode(true);
      title.removeAttribute('id');
      title.className = 'pd-detail-title';
      detail.setAttribute('aria-label', `${items[i].title} details`);
      detail.append(back, title);
      Array.from(source.children)
        .filter((el) => el.matches('.project-badge, .project-desc, .project-tech, .project-links, .project-link'))
        .forEach((el) => detail.appendChild(el.cloneNode(true)));
      placeDetail();
      detail.classList.add('is-open');
      // A phone's sideways scroll is locked while the panel is open, so the card stays put
      if (swipeMode) stage.style.overflowX = 'hidden';
      detail.animate(
        [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 450, easing: DRUM_EASING }
      );
      back.focus({ preventScroll: true });
    }

    function closeDetail(returnFocus) {
      if (detailIndex < 0) return;
      const i = detailIndex;
      detailIndex = -1;
      detail.classList.remove('is-open');
      detail.textContent = '';
      stage.style.overflowX = '';
      if (returnFocus) buttons[i].focus({ preventScroll: true });
    }

    // ----- Roll-in on first view -----
    function playReveal() {
      let done = false;
      const t0 = performance.now();
      const finish = () => {
        if (done) return;
        done = true;
        revealing = false;
        reveal = 0;
        try { if (headingAnim) headingAnim.cancel(); } catch (err) { /* already cancelled */ }
        section.classList.remove('pd-pending');
        frame();
      };
      let headingAnim = null;
      try {
        revealing = true;
        section.classList.remove('pd-pending');
        headingAnim = drumReveal(heading, { from: -80, to: 0 });
        stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
        const stepReveal = (now) => {
          if (done) return;
          const p = clamp((now - t0) / REVEAL_MS, 0, 1);
          reveal = PD_START * (1 - easeInOutCubic(p));
          frame(now);
          if (p >= 1) { finish(); return; }
          requestAnimationFrame(stepReveal);
        };
        requestAnimationFrame(stepReveal);
        setTimeout(finish, REVEAL_MS + 1500);
      } catch (err) {
        // Never leave the drum hidden
        finish();
      }
    }

    // ----- Navigation and input -----
    /** Scroll so card `i` is in front. The drum follows the scroll; nothing else moves it. */
    function goTo(i, smooth) {
      const behavior = smooth ? 'smooth' : 'instant';
      try {
        if (swipeMode) stage.scrollTo({ left: i * step, top: 0, behavior });
        else window.scrollTo({ top: cardScrollTop(i), left: 0, behavior });
      } catch (err) {
        if (swipeMode) stage.scrollLeft = i * step;
        else window.scrollTo(0, cardScrollTop(i));
      }
      lastScroll = performance.now();
      schedule();
    }

    // Click the front card to open its details, a side card to roll it forward, anywhere else to
    // close the panel. The cards are pixels, so the click is matched to a card by its position.
    stage.addEventListener('click', (e) => {
      // The path is fixed when the click starts, so it still names the panel after Back has emptied it
      const path = e.composedPath();
      if (path.includes(detail) || path.includes(controls)) return;
      const i = drum.hitTest(e.clientX, e.clientY);
      if (detailIndex >= 0) closeDetail(false);
      if (i < 0) return;
      if (i === frontIndex()) openDetail(i);
      else goTo(i, true);
    });

    stage.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && detailIndex >= 0) closeDetail(true);
    });

    // A pointer over a card shows the pointer cursor (mouse only)
    let hover = null;
    let hoverRaf = 0;
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      hover = { x: e.clientX, y: e.clientY, panel: !!e.target.closest('.pd-detail') };
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        stage.style.cursor = hover && !hover.panel && drum.hitTest(hover.x, hover.y) >= 0 ? 'pointer' : '';
      });
    });
    stage.addEventListener('pointerleave', () => { hover = null; stage.style.cursor = ''; });

    const onModeChange = () => {
      closeDetail(false);
      swipeMode = mobileMQ.matches;
      stage.scrollLeft = 0;
      layout();
      current = target = prevRaw = readPos();
      frame();
    };
    if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onModeChange);
    else if (mobileMQ.addListener) mobileMQ.addListener(onModeChange);

    layout();
    current = target = prevRaw = readPos();
    frame();
    window.addEventListener('scroll', onPageScroll, { passive: true });
    stage.addEventListener('scroll', onStageScroll, { passive: true });
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
  // Touch screens have no hover, so the effect only ever showed up as broken letters there.
  // Keep the real headings on those devices.
  if (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) return [];
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

/**
 * Halftone sphere behind the hero photo (see js/halftone.js). Pointer events are read from the
 * whole hero, so the dots react wherever the pointer is over it, including over the photo.
 */
function initHalftone() {
  const canvas = document.querySelector('.hero-halftone');
  const hero = document.getElementById('hero');
  if (!canvas || !hero || typeof window.createHalftone !== 'function') return null;
  return window.createHalftone(canvas, { host: hero });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // TechText on the hero name and section titles (mouse devices only; touch keeps plain text)
    initTechText();
    initHalftone();
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
