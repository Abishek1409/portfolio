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
  const ACCENT  = [201, 164, 106];   // --accent RGB
  const MUTED   = [184, 179, 168];   // --muted  RGB
  const COUNT   = 70;

  let W, H, particles;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeParticle() {
    const r = [ACCENT, MUTED][Math.random() < 0.6 ? 0 : 1];
    return {
      x: rand(0, W),
      y: rand(0, H),
      r: rand(1, 3.2),
      vx: rand(-0.18, 0.18),
      vy: rand(-0.28, -0.06),
      alpha: rand(0.15, 0.55),
      fadeDir: Math.random() < 0.5 ? 1 : -1,
      fadeSpeed: rand(0.003, 0.009),
      color: r,
    };
  }

  function resize() {
    W = canvas.width  = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
    if (!particles) {
      particles = Array.from({ length: COUNT }, makeParticle);
    }
  }

  let raf;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      // Drift
      p.x += p.vx;
      p.y += p.vy;
      // Fade breathe
      p.alpha += p.fadeDir * p.fadeSpeed;
      if (p.alpha >= 0.55) { p.alpha = 0.55; p.fadeDir = -1; }
      if (p.alpha <= 0.08) { p.alpha = 0.08; p.fadeDir =  1; }
      // Wrap edges
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
  draw();
}

/* ─── 2. Scroll-reveal for sections ───────────────────────────────────────── */
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Elements that get a fade-up reveal
  const selectors = [
    '.about-summary',
    '.about-block',
    '.skill-group',
    '.achievement-list li',
    '.contact-list li',
    '.timeline-item',
  ];

  const targets = document.querySelectorAll(selectors.join(','));

  // Apply initial hidden state
  targets.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition =
      'opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)';
    // Slight stagger within the same parent
    el.style.transitionDelay = `${(i % 6) * 80}ms`;
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.style.opacity = '1';
      el.style.transform = 'none';
      obs.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((el) => obs.observe(el));
}

/* ─── 3. Nav scroll-shrink ────────────────────────────────────────────────── */
function initNavShrink() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let last = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    last = y;
  }, { passive: true });
}

/* ─── 4. Skill chip shimmer on hover ──────────────────────────────────────── */
// Pure CSS handles most of this via the stylesheet injection below; JS just
// adds the class so the effect is opt-in (no layout change without JS).
function initChipGlow() {
  document.querySelectorAll('.chips li').forEach((chip) => {
    chip.classList.add('chip-glow');
  });
}

/* ─── 5. Contact card tilt ────────────────────────────────────────────────── */
function initContactTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.contact-list li').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `perspective(600px) rotateY(${dx * 5}deg) rotateX(${-dy * 5}deg) translateY(-3px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* ─── 6. Achievement card tilt + glow ─────────────────────────────────────── */
function initAchievementTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.achievement-list li').forEach((card) => {
    card.classList.add('achievement-hover');
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `perspective(700px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* ─── 7. Cursor glow (desktop only) ──────────────────────────────────────── */
function initCursorGlow() {
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  let mx = -200, my = -200;
  let cx = -200, cy = -200;
  let raf;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function step() {
    cx = lerp(cx, mx, 0.1);
    cy = lerp(cy, my, 0.1);
    glow.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    raf = requestAnimationFrame(step);
  }
  step();
}

/* ─── 8. Hero photo animated ring ────────────────────────────────────────── */
function initPhotoBorder() {
  const photo = document.querySelector('.hero-photo img');
  if (!photo) return;
  photo.classList.add('photo-animated-ring');
}

/* ─── 9. Section title reveal line ───────────────────────────────────────── */
function initTitleLines() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('.section-title').forEach((el) => {
    el.classList.add('title-animate');
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        el.classList.add('title-animate--in');
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
  });
}

/* ─── 10. Inject dynamic CSS ─────────────────────────────────────────────── */
function injectStyles() {
  const css = `
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
  transition: opacity 0.4s;
}

/* ── Nav shrink on scroll ── */
.site-header.scrolled {
  --nav-h: 3.25rem;
  background: rgba(10,10,15,0.95);
  transition: background 0.35s, --nav-h 0.35s;
}

/* ── Chip glow hover ── */
.chips li.chip-glow {
  position: relative;
  transition: color 0.25s, border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  cursor: default;
  overflow: hidden;
}
.chips li.chip-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, transparent 30%, rgba(201,164,106,0.18) 50%, transparent 70%);
  transform: translateX(-100%);
  transition: transform 0.45s ease;
}
.chips li.chip-glow:hover::before {
  transform: translateX(100%);
}
.chips li.chip-glow:hover {
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 10px rgba(201,164,106,0.25);
  transform: translateY(-2px);
}

/* ── Achievement hover ── */
.achievement-list li.achievement-hover {
  transition: transform 0.3s cubic-bezier(0.22,1,0.36,1),
              box-shadow 0.3s cubic-bezier(0.22,1,0.36,1);
}
.achievement-list li.achievement-hover:hover {
  box-shadow:
    -3px 0 0 var(--accent),
    0 0 24px rgba(201,164,106,0.2),
    0 8px 24px rgba(0,0,0,0.3);
}

/* ── Contact card transition ── */
.contact-list li {
  transition: transform 0.3s cubic-bezier(0.22,1,0.36,1),
              box-shadow 0.3s cubic-bezier(0.22,1,0.36,1);
  will-change: transform;
}
.contact-list li:hover {
  box-shadow: 0 0 20px rgba(201,164,106,0.15), 0 8px 24px rgba(0,0,0,0.3);
}

/* ── Hero photo animated ring ── */
@keyframes ring-spin {
  to { --ring-angle: 360deg; }
}
@property --ring-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.photo-animated-ring {
  animation: none; /* Fallback; real animation via box-shadow pulse below */
  box-shadow:
    0 0 0 2px var(--accent),
    0 0 36px rgba(201,164,106,0.28),
    0 0 80px rgba(201,164,106,0.08);
  animation: photo-pulse 4s ease-in-out infinite;
}
@keyframes photo-pulse {
  0%,100% {
    box-shadow:
      0 0 0 2px var(--accent),
      0 0 28px rgba(201,164,106,0.28),
      0 0 60px rgba(201,164,106,0.08);
  }
  50% {
    box-shadow:
      0 0 0 3px var(--accent),
      0 0 48px rgba(201,164,106,0.45),
      0 0 90px rgba(201,164,106,0.15);
  }
}

/* ── Section title reveal underline ── */
.title-animate::after {
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.65s cubic-bezier(0.22,1,0.36,1);
}
.title-animate--in::after {
  transform: scaleX(1);
}

/* ── Skill group card hover lift ── */
.skill-group {
  transition: transform 0.3s cubic-bezier(0.22,1,0.36,1),
              box-shadow 0.3s cubic-bezier(0.22,1,0.36,1);
}
.skill-group:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(201,164,106,0.12), 0 2px 8px rgba(0,0,0,0.25);
}

/* ── Floating orbiting accent dots (hero) ── */
@keyframes orbit-1 {
  from { transform: rotate(0deg) translateX(14px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(14px) rotate(-360deg); }
}
@keyframes orbit-2 {
  from { transform: rotate(120deg) translateX(10px) rotate(-120deg); }
  to   { transform: rotate(480deg) translateX(10px) rotate(-480deg); }
}

/* ── Reduced motion: disable photo pulse & chip shimmer ── */
@media (prefers-reduced-motion: reduce) {
  .photo-animated-ring { animation: none; }
  .chips li.chip-glow::before { transition: none; }
  .achievement-list li.achievement-hover { transition: none; }
  .contact-list li { transition: none; }
  .title-animate::after { transition: none; transform: scaleX(1); }
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
    initChipGlow();
    initContactTilt();
    initAchievementTilt();
    initCursorGlow();
    initPhotoBorder();
    initTitleLines();
  });
}

