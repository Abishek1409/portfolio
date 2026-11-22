// story.js: the hero as a scroll story.
// The hero becomes several screens tall and its stage pins (CSS: .story-on). Scrolling through it:
//   0 – 8%    the intro copy steps aside and the first chapter comes in
//   8 – 97%   six chapters; each one's words appear as you scroll, while the ASCII figure turns
//             to a new pose, dissolves a little between chapters and "talks" (glyph flicker)
//   97 – 100% hold on the last chapter, then the page scrolls on
// Reduced motion or a missing canvas: nothing here runs; the chapters stay a plain list and the
// portrait stays the original image.
'use strict';

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const INTRO = 0.08;
  const OUTRO = 0.97;

  function init() {
    const hero = document.getElementById('hero');
    const canvas = document.querySelector('.hero-figure');
    const photo = document.querySelector('.hero-photo');
    const chapters = Array.from(document.querySelectorAll('.story-chapter'));
    const count = document.querySelector('.story-count');
    const fill = document.querySelector('.story-bar-fill');
    if (!hero || !canvas || !photo || !chapters.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof window.createStoryFigure !== 'function' || !window.STORY_FIGURE_DATA) return;

    const figure = window.createStoryFigure(canvas, window.STORY_FIGURE_DATA);
    if (!figure) return;

    const readColors = () => {
      const cs = getComputedStyle(photo);
      figure.setColors({
        ink: cs.getPropertyValue('--figure-ink').trim() || '#f2efe9',
        disc: cs.getPropertyValue('--figure-disc').trim() || '#a53640'
      });
    };
    readColors();
    document.addEventListener('themechange', () => requestAnimationFrame(readColors));
    photo.classList.add('has-figure');

    // Split each chapter's line into words, so they can appear one by one. The words stay in the
    // DOM as plain text, so screen readers read the full sentence.
    const words = chapters.map((ch) => {
      const line = ch.querySelector('.story-line');
      const parts = line.textContent.trim().split(/\s+/);
      line.textContent = '';
      return parts.map((w, i) => {
        const span = document.createElement('span');
        span.className = 'story-w';
        span.textContent = w;
        line.append(span);
        if (i < parts.length - 1) line.append(' ');
        return span;
      });
    });
    const poses = chapters.map((ch) => ({
      yaw: parseFloat(ch.dataset.yaw) || 0,
      pitch: parseFloat(ch.dataset.pitch) || 0
    }));

    document.documentElement.classList.add('story-on');
    hero.style.setProperty('--story-chapters', chapters.length);

    // The pointer turns the figure a little on top of its pose
    const mouse = { yaw: 0, pitch: 0 };
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mouse.yaw = (e.clientX / innerWidth - 0.5) * 0.5;
      mouse.pitch = (e.clientY / innerHeight - 0.5) * -0.25;
      schedule();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { mouse.yaw = 0; mouse.pitch = 0; schedule(); });

    let active = -2;
    let shown = chapters.map(() => -1);

    function update() {
      ticking = false;
      const total = Math.max(1, hero.offsetHeight - innerHeight);
      const s = clamp((window.scrollY - hero.offsetTop) / total, 0, 1);
      const intro = smooth(clamp(s / INTRO, 0, 1));
      hero.style.setProperty('--story-in', intro.toFixed(3));
      // Once the chapters own the space, the faded intro buttons leave the tab order
      hero.classList.toggle('is-telling', intro > 0.6);

      const n = chapters.length;
      const pos = clamp((s - INTRO) / (OUTRO - INTRO), 0, 0.9999) * n;
      const idx = Math.floor(pos);
      const local = pos - idx;
      const current = intro > 0.5 ? idx : -1;

      if (current !== active) {
        chapters.forEach((ch, i) => {
          ch.classList.toggle('is-active', i === current);
          ch.classList.toggle('is-past', current >= 0 && i < current);
          // An invisible link must not take keyboard focus
          ch.querySelectorAll('a').forEach((a) => { a.tabIndex = i === current ? 0 : -1; });
        });
        active = current;
      }

      // Words of the active chapter appear over the first 55% of its scroll span
      words.forEach((list, i) => {
        const want = i < current ? list.length
          : i === current ? Math.ceil(clamp(local / 0.55, 0, 1) * list.length)
          : 0;
        if (want === shown[i]) return;
        list.forEach((w, j) => w.classList.toggle('is-on', j < want));
        shown[i] = want;
      });

      // Pose: turn from the previous chapter's pose to this one over the first 30%
      const from = current <= 0 ? { yaw: 0, pitch: 0 } : poses[current - 1];
      const to = current < 0 ? { yaw: 0, pitch: 0 } : poses[current];
      const turn = current < 0 ? 0 : smooth(clamp(local / 0.3, 0, 1));
      // Dissolve: a short burst at each chapter change (and while the intro hands over)
      const burst = current < 0 ? Math.sin(intro * Math.PI) * 0.35
        : local < 0.18 ? (1 - local / 0.18) * 0.28 : 0;
      const talking = current >= 0 && local > 0.04 && local < 0.58 ? 0.7 : 0;

      figure.set({
        yaw: lerp(from.yaw, to.yaw, turn) + mouse.yaw,
        pitch: lerp(from.pitch, to.pitch, turn) + mouse.pitch,
        scatter: burst,
        talk: talking,
        lift: intro
      });

      if (count) count.textContent = String(Math.max(0, current + 1)).padStart(2, '0');
      if (fill) fill.style.transform = `scaleX(${clamp((s - INTRO) / (OUTRO - INTRO), 0, 1).toFixed(4)})`;
    }

    let ticking = false;
    function schedule() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    update();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
