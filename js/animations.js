// animations.js — Background particles + scroll-reveal + micro-interactions
// Additive only: does not alter any existing behaviour in main.js
'use strict';

/* ─── 1. Floating Particles Canvas (hero background) ──────────────────────── */
function initParticles() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'particles-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = [
    'position:absolute',
    'inset:0',
    'width:100%',
    'height:100%',
    'pointer-events:none',
    'z-index:0',
    'opacity:0.55',
  ].join(';');
  hero.style.position = 'relative';
  hero.insertBefore(canvas, hero.firstChild);

  const ctx = canvas.getContext('2d');
  const ACCENT = [201, 164, 106];
  const MUTED  = [184, 179, 168];
  const COUNT  = 70;
  let W, H, particles;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeParticle() {
    const color = Math.random() < 0.6 ? ACCENT : MUTED;
    return {
      x: rand(0, W), y: rand(0, H),
      r: rand(1, 3.2),
      vx: rand(-0.18, 0.18), vy: rand(-0.28, -0.06),
      alpha: rand(0.15, 0.55),
      fadeDir: Math.random() < 0.5 ? 1 : -1,
      fadeSpeed: rand(0.003, 0.009),
      color,
    };
  }

  function resize() {
    W = canvas.width  = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
    if (!particles) particles = Array.from({ length: COUNT }, makeParticle);
  }

  // Only animate while the hero is on screen and the tab is visible. Otherwise this loop keeps
  // the main thread busy for the whole page while nothing it draws can be seen.
  let raf = 0;
  let heroVisible = true;

  function setRunning() {
    const want = heroVisible && !document.hidden;
    if (want && !raf) raf = requestAnimationFrame(draw);
    if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.alpha += p.fadeDir * p.fadeSpeed;
      if (p.alpha >= 0.55) { p.alpha = 0.55; p.fadeDir = -1; }
      if (p.alpha <= 0.08) { p.alpha = 0.08; p.fadeDir =  1; }
      if (p.x < -4)  p.x = W + 4;
      if (p.x > W+4) p.x = -4;
      if (p.y < -4)  { p.y = H + 4; p.x = rand(0, W); }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      const [rv, gv, bv] = p.color;
      ctx.fillStyle = `rgba(${rv},${gv},${bv},${p.alpha.toFixed(3)})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', setRunning);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      heroVisible = entries[entries.length - 1].isIntersecting;
      setRunning();
    }).observe(hero);
  }
  setRunning();
}

/* ─── 2. Scroll-reveal for sections ───────────────────────────────────────── */
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const selectors = [
    '.about-summary', '.about-block', '.skill-group',
    '.achievement-list li', '.contact-card', '.timeline-item',
  ];

  const targets = document.querySelectorAll(selectors.join(','));

  // The hidden and shown states live in a class (.rv / .rv-in, see injectStyles). Once an element
  // has finished appearing the classes are removed again, so the element's own hover, tilt and
  // transition rules apply. Leaving inline `transform: none` and a 0.7s transition behind would
  // override the card hover lift and slow the achievement tilt.
  targets.forEach((el, i) => {
    el.style.setProperty('--rv-delay', `${(i % 5) * 90}ms`);
    el.classList.add('rv');
  });

  const REVEAL_MS = 700 + 4 * 90 + 100; // transition + longest stagger + margin
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('rv-in');
      obs.unobserve(el);
      setTimeout(() => {
        el.classList.remove('rv', 'rv-in');
        el.style.removeProperty('--rv-delay');
      }, REVEAL_MS);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((el) => obs.observe(el));
}

/* ─── 3. Nav scroll-shrink ────────────────────────────────────────────────── */
function initNavShrink() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

/* ─── 4. Achievement card tilt ────────────────────────────────────────────── */
function initAchievementTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.achievement-list li').forEach((card) => {
    card.classList.add('achievement-hover');
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width  / 2) / (rect.width  / 2);
      const dy = (e.clientY - rect.top  - rect.height / 2) / (rect.height / 2);
      card.style.transform = `perspective(700px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ─── 5. Cursor glow (desktop only) ──────────────────────────────────────── */
function initCursorGlow() {
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  let mx = -200, my = -200, cx = -200, cy = -200;
  let running = false;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function step() {
    cx = lerp(cx, mx, 0.1); cy = lerp(cy, my, 0.1);
    glow.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    // Stop once the glow has caught up with the pointer; the next mouse move restarts it
    if (Math.abs(mx - cx) < 0.2 && Math.abs(my - cy) < 0.2) { running = false; return; }
    requestAnimationFrame(step);
  }
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (!running) { running = true; requestAnimationFrame(step); }
  }, { passive: true });
}

/* ─── 6. Hero photo animated ring ────────────────────────────────────────── */
function initPhotoBorder() {
  const photo = document.querySelector('.hero-photo img');
  if (!photo) return;
  photo.classList.add('photo-animated-ring');
}

/* ─── 7. Section title reveal underline ──────────────────────────────────── */
function initTitleLines() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.section-title').forEach((el) => {
    el.classList.add('title-animate');
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { el.classList.add('title-animate--in'); obs.disconnect(); }
    }, { threshold: 0.4 });
    obs.observe(el);
  });
}

/* ─── 8. Skill group: mouse-spotlight (radial glow tracks pointer) ─────────── */
function initSkillSpotlight() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.skill-group').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      card.style.setProperty('--sg-mx', `${x}%`);
      card.style.setProperty('--sg-my', `${y}%`);
      card.classList.add('sg-lit');
    });
    card.addEventListener('mouseleave', () => card.classList.remove('sg-lit'));
  });
}

/* ─── 9. Contact cards: ripple on click ──────────────────────────────────── */
function initContactRipple() {
  document.querySelectorAll('.contact-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      const rect = card.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'cc-ripple';
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top  = `${e.clientY - rect.top}px`;
      card.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });
}

/* ─── 10. Contact constellation (fills .contact-bg-canvas) ──────────────────
   Drifting gold points, joined by faint lines when close. The pointer pulls the nearest points a
   little toward it. Runs only while the Contact section is on screen. With reduced motion it draws
   one still frame. */
function initContactConstellation() {
  const host = document.querySelector('.contact-bg-canvas');
  if (!host) return;
  const section = host.closest('.contact') || host.parentElement;
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const GOLD = '201,164,106';
  let W = 0, H = 0, dpr = 1, nodes = [], linkDist = 140;
  let pointer = null;
  let raf = 0, visible = false, last = 0;

  function build() {
    const rect = host.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // About one point per 16000 px², fewer on phones
    const count = Math.max(14, Math.min(touch ? 26 : 48, Math.round((W * H) / 16000)));
    linkDist = touch ? 110 : 140;
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, // px per second
      r: 1 + Math.random() * 1.6,
    }));
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    for (const n of nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      if (pointer) {
        const dx = pointer.x - n.x, dy = pointer.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 220 * 220 && d2 > 1) {
          const f = (1 - Math.sqrt(d2) / 220) * 30 * dt;
          n.x += (dx / Math.sqrt(d2)) * f; n.y += (dy / Math.sqrt(d2)) * f;
        }
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > linkDist * linkDist) continue;
        ctx.strokeStyle = `rgba(${GOLD},${((1 - Math.sqrt(d2) / linkDist) * 0.28).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.fillStyle = `rgba(${GOLD},0.55)`;
    for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    const want = visible && !document.hidden && !still;
    if (want && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  build();
  draw(0);
  if (still) return; // one static frame is enough

  section.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  }, { passive: true });
  section.addEventListener('pointerleave', () => { pointer = null; });

  // Rebuild when the section's size changes (window resize, web fonts loading, layout shifts)
  let resizeTimer = 0;
  const onSize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const r = host.getBoundingClientRect();
      if (Math.round(r.width) === W && Math.round(r.height) === H) return;
      build(); draw(0);
    }, 150);
  };
  if ('ResizeObserver' in window) new ResizeObserver(onSize).observe(host);
  else window.addEventListener('resize', onSize, { passive: true });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(section);
  }
}

/* ─── 11. Inject dynamic CSS ─────────────────────────────────────────────── */
function injectStyles() {
  const css = `
/* ── Scroll reveal: the classes are removed once an element has appeared ── */
.rv {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
  transition-delay: var(--rv-delay, 0ms);
}
.rv.rv-in { opacity: 1; transform: none; }

/* ── Cursor glow ── */
.cursor-glow {
  position: fixed;
  top: -18rem; left: -18rem;
  width: 36rem; height: 36rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201,164,106,0.07) 0%, transparent 70%);
  pointer-events: none;
  z-index: 9999;
  will-change: transform;
}

/* ── Nav shrink on scroll ── */
.site-header.scrolled {
  background: rgba(10,10,15,0.97);
  box-shadow: 0 1px 20px rgba(0,0,0,0.5);
}

/* ── Hero photo pulse ring ── */
.photo-animated-ring {
  animation: photo-pulse 4s ease-in-out infinite;
}
@keyframes photo-pulse {
  0%,100% {
    box-shadow: 0 0 0 2px var(--accent), 0 0 28px rgba(201,164,106,0.28), 0 0 60px rgba(201,164,106,0.08);
  }
  50% {
    box-shadow: 0 0 0 3px var(--accent), 0 0 48px rgba(201,164,106,0.45), 0 0 90px rgba(201,164,106,0.15);
  }
}

/* ── Section title reveal underline ── */
.title-animate::after {
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.65s cubic-bezier(0.22,1,0.36,1);
}
.title-animate--in::after { transform: scaleX(1); }

/* ── Achievement hover ── */
.achievement-list li.achievement-hover {
  transition: transform 0.3s cubic-bezier(0.22,1,0.36,1),
              box-shadow 0.3s cubic-bezier(0.22,1,0.36,1);
}
.achievement-list li.achievement-hover:hover {
  box-shadow: -3px 0 0 var(--accent), 0 0 24px rgba(201,164,106,0.2), 0 8px 24px rgba(0,0,0,0.3);
}

/* ── Skill group spotlight ── */
.skill-group.sg-lit::after {
  opacity: 1;
  background: radial-gradient(
    circle at var(--sg-mx, 50%) var(--sg-my, 50%),
    rgba(201,164,106,0.13) 0%,
    transparent 60%
  );
}

/* ── Contact card ripple ── */
.contact-card { position: relative; }
.cc-ripple {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: rgba(201,164,106,0.35);
  transform: translate(-50%, -50%) scale(0);
  animation: cc-ripple 0.65s ease-out forwards;
  pointer-events: none;
  z-index: 10;
}
@keyframes cc-ripple {
  to { transform: translate(-50%, -50%) scale(28); opacity: 0; }
}

/* ── Reduced motion: disable photo pulse & title animate ── */
@media (prefers-reduced-motion: reduce) {
  .photo-animated-ring { animation: none; }
  .title-animate::after { transition: none; transform: scaleX(1); }
  .achievement-list li.achievement-hover { transition: none; }
  .cc-ripple { animation: none; }
}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/* ─── Bootstrap ───────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined') {
  injectStyles();
  document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initScrollReveal();
    initNavShrink();
    initAchievementTilt();
    initCursorGlow();
    initPhotoBorder();
    initTitleLines();
    initSkillSpotlight();
    initContactRipple();
    initContactConstellation();
  });
}
