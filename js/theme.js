// theme.js: the yin-yang button switches between night (black and gold) and day (red and white).
// The choice is saved per browser. Where the View Transitions API exists, the new theme spreads
// out from the button as a circle; otherwise it switches instantly.
// Canvases that paint with theme colours listen for the 'themechange' event on document.
'use strict';

(function () {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const current = () => (root.dataset.theme === 'light' ? 'light' : 'dark');

  function syncButton(btn) {
    const day = current() === 'light';
    btn.setAttribute('aria-pressed', String(day));
    btn.title = day ? 'Switch to night mode' : 'Switch to day mode';
    const label = btn.querySelector('.visually-hidden');
    if (label) label.textContent = 'Day mode';
  }

  function apply(theme) {
    if (theme === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode: not remembered */ }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    syncButton(btn);

    btn.addEventListener('click', () => {
      const next = current() === 'light' ? 'dark' : 'light';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      btn.classList.add('is-spinning');
      setTimeout(() => btn.classList.remove('is-spinning'), 700);

      if (!document.startViewTransition || reduced) {
        apply(next);
        syncButton(btn);
        return;
      }

      // Circle grows from the button's centre to the farthest corner
      const r = btn.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(() => { apply(next); syncButton(btn); });
      vt.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
    });

    // Heading canvases (TechText) take their colours from CSS, so ask them to re-read it
    document.addEventListener('themechange', () => {
      const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
      (window.__techText || []).forEach((t) => t.update({ accentColor: accent }));
    });
  });
})();
