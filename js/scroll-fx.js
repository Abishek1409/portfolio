// scroll-fx.js: smooth (inertial) scrolling and scroll-linked effects.
//   1. Lenis smooth scrolling on mouse/trackpad (native touch scrolling is left alone)
//   2. Progress bar under the nav
//   3. Hero parallax: writes --hero-p (0..1) on the hero; the CSS turns it into motion
//   4. Marquee band: each row slides sideways with the scroll position
// Everything is skipped with prefers-reduced-motion. Effects only move transform/opacity.
'use strict';

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ─── 1. Lenis smooth scroll ─────────────────────────────────────────── */
  function initSmoothScroll() {
    if (reduced || typeof window.Lenis !== 'function') return null;

    let lenis;
    try {
      lenis = new window.Lenis({
        lerp: 0.085,           // lower = floatier; 0.085 feels smooth without lagging behind the wheel
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,      // phones keep their own native momentum
        // Let inner scrollers (project details panel, the swipe drum) scroll on their own
        prevent: (node) => !!(node.closest && node.closest('.pd-detail, .pd-swipe .pd-stage, .nav-links.is-open'))
      });
    } catch (err) {
      return null;
    }

    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);

    // The intro locks the page (html.is-intro). Lenis scrolls programmatically, which ignores
    // overflow:hidden, so it has to be paused for as long as that class is on.
    const syncIntro = () => {
      if (root.classList.contains('is-intro')) lenis.stop();
      else lenis.start();
    };
    new MutationObserver(syncIntro).observe(root, { attributes: true, attributeFilter: ['class'] });
    syncIntro();

    // In-page links glide with Lenis, landing just below the fixed nav
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const navH = (document.querySelector('.site-header') || {}).offsetHeight || 0;
      lenis.scrollTo(id === '#hero' ? 0 : target, {
        offset: id === '#hero' ? 0 : -navH,
        duration: 1.2,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        onComplete: () => {
          // Keep keyboard focus and the URL in step with where the page landed
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
          if (history.replaceState) history.replaceState(null, '', id);
        }
      });
    });

    window.__lenis = lenis;
    return lenis;
  }

  /* ─── 2–4. Scroll-linked effects, all driven by one rAF-throttled listener ─ */
  function initScrollEffects() {
    const header = document.querySelector('.site-header');
    const hero = document.getElementById('hero');
    const rows = Array.from(document.querySelectorAll('.marquee-row'));
    const marquee = document.querySelector('.marquee');

    let bar = null;
    if (header) {
      bar = document.createElement('div');
      bar.className = 'scroll-progress';
      bar.setAttribute('aria-hidden', 'true');
      header.appendChild(bar);
    }

    // Marquee geometry: each row holds two identical halves, so sliding by one half loops seamlessly
    let halves = [];
    let marqueeTop = 0;
    const measure = () => {
      halves = rows.map((row) => (row.firstElementChild ? row.firstElementChild.offsetWidth : 0));
      marqueeTop = marquee ? marquee.getBoundingClientRect().top + window.scrollY : 0;
    };

    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);

      if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, y / max)).toFixed(4)})`;

      if (hero && !reduced) {
        const h = hero.offsetHeight || window.innerHeight;
        const p = Math.min(1, Math.max(0, y / h));
        hero.style.setProperty('--hero-p', p.toFixed(4));
      }

      if (!reduced) {
        // Offset relative to when the band enters the screen, so it starts in the same place
        const rel = y - (marqueeTop - window.innerHeight);
        rows.forEach((row, i) => {
          const half = halves[i];
          if (!half) return;
          const speed = parseFloat(row.dataset.speed) || 0.3;
          let x = (rel * speed) % half;
          if (x > 0) x -= half;   // always keep the row covering the band's left edge
          row.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        });
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { measure(); onScroll(); }, { passive: true });
    window.addEventListener('load', () => { measure(); onScroll(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); onScroll(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSmoothScroll();
    initScrollEffects();
  });
})();
