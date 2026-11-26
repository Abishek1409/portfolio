// theme.js: the yin-yang button switches between night (black and gold) and day (red and white).
// The choice is saved per browser. Switching burns the old theme away like a sheet of paper lit at
// the button: a ragged, glowing edge spreads across the screen, charring the page just ahead of it
// and throwing up sparks, and the new theme shows through the hole.
// How: the View Transitions API holds a snapshot of the old page under the new one. A clip-path on
// the new page (the burnt outline, traced along rays from the button each frame) lets it show only
// where the fire has passed, and a canvas with its own view-transition-name draws the embers, char
// and sparks above both. (An image mask would have to load each frame; a path applies at once.)
// Where View Transitions aren't available, or motion is reduced, the theme switches instantly.
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

  // ---- Burn ----
  const BURN_MS = 1300;
  const CELL = 6;                 // burn field resolution, in CSS px per cell

  // Smooth value noise, a few octaves: gives the burn front its ragged, organic edge
  function makeNoise(seed) {
    const hash = (x, y) => {
      let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = (t) => t * t * (3 - 2 * t);
    const value = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = smooth(x - xi), yf = smooth(y - yi);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y) => value(x, y) * 0.55 + value(x * 2.1, y * 2.1) * 0.3 + value(x * 4.3, y * 4.3) * 0.15;
  }

  function burn(originX, originY, update) {
    const w = innerWidth, h = innerHeight;
    const gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);

    // When each point catches fire, 0..1: mostly distance from the button, roughened by noise
    const noise = makeNoise((Math.random() * 1e6) | 0);
    const maxD = Math.hypot(Math.max(originX, w - originX), Math.max(originY, h - originY));
    const fireAt = (x, y) => (Math.hypot(x - originX, y - originY) / maxD) * 0.8 + noise(x / 140, y / 140) * 0.24;

    // The burnt area is traced along rays from the button: on each ray, the fire has reached the
    // first point whose time has come. Sample every ray once up front.
    const RAYS = 720, STEP = 4;
    const reach = maxD * 1.05;
    const raySamples = [];
    for (let k = 0; k < RAYS; k++) {
      const ang = (k / RAYS) * Math.PI * 2, cx = Math.cos(ang), cy = Math.sin(ang);
      const n = Math.ceil(reach / STEP) + 1;
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = fireAt(originX + cx * i * STEP, originY + cy * i * STEP);
      raySamples.push({ cx, cy, arr });
    }
    const front = new Float32Array(RAYS);         // radius of the burnt area on each ray, px
    const smoothFront = new Float32Array(RAYS);

    // Each cell of the small effects field: its distance from the button and its ray
    const cellD = new Float32Array(gw * gh), cellRay = new Uint16Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const dx = x * CELL + CELL / 2 - originX, dy = y * CELL + CELL / 2 - originY;
        cellD[y * gw + x] = Math.hypot(dx, dy);
        cellRay[y * gw + x] = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * RAYS) % RAYS;
      }
    }

    // Embers and char, drawn small and scaled up soft
    const fxSmall = document.createElement('canvas');
    fxSmall.width = gw; fxSmall.height = gh;
    const sctx = fxSmall.getContext('2d');
    const fxData = sctx.createImageData(gw, gh);

    // A smaller copy for the glow: scaled up soft, it stands in for a (costly) blur filter
    const glow = document.createElement('canvas');
    glow.width = Math.ceil(gw / 3); glow.height = Math.ceil(gh / 3);
    const gctx = glow.getContext('2d');

    // The canvas shown above the transition, at half resolution (CSS stretches it to the screen)
    const SCALE = 0.5;
    const fx = document.createElement('canvas');
    fx.className = 'burn-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.width = Math.ceil(w * SCALE); fx.height = Math.ceil(h * SCALE);
    const ctx = fx.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const sparks = [];
    let progress = -0.06;
    const EMBER = maxD * 0.05, CHAR = maxD * 0.035;

    function paint(dt) {
      const P = progress;
      // Where the front is on each ray
      for (let k = 0; k < RAYS; k++) {
        const arr = raySamples[k].arr;
        let i = 0;
        while (i < arr.length && arr[i] < P) i++;
        front[k] = i * STEP;
      }
      for (let k = 0; k < RAYS; k++) {
        smoothFront[k] = (front[(k + RAYS - 1) % RAYS] + front[k] * 2 + front[(k + 1) % RAYS]) / 4;
      }
      // The new page shows inside that outline
      let d = '';
      for (let k = 0; k < RAYS; k++) {
        const r = smoothFront[k], ray = raySamples[k];
        d += (k ? 'L' : 'M') + (originX + ray.cx * r).toFixed(1) + ' ' + (originY + ray.cy * r).toFixed(1);
      }
      update(`path('${d}Z')`);

      // Embers just behind the front (glowing), char just ahead of it (dark)
      const fd = fxData.data;
      for (let i = 0; i < cellD.length; i++) {
        const e = cellD[i] - smoothFront[cellRay[i]];
        const j = i * 4;
        if (e < 0 && e > -EMBER) {
          const k = 1 + e / EMBER;
          fd[j] = 255; fd[j + 1] = 120 + 120 * k * k; fd[j + 2] = 40 * k * k * k; fd[j + 3] = 235 * k;
        } else if (e >= 0 && e < CHAR) {
          const k = 1 - e / CHAR;
          fd[j] = 40 + 60 * k; fd[j + 1] = 14 + 10 * k; fd[j + 2] = 6; fd[j + 3] = 220 * k;
        } else {
          fd[j + 3] = 0;
        }
      }
      // Sparks fly off the front now and then
      if (P > 0 && P < 1.05) {
        for (let n = 0; n < 4 && sparks.length < 260; n++) {
          const k = (Math.random() * RAYS) | 0, r = smoothFront[k], ray = raySamples[k];
          const x = originX + ray.cx * r, y = originY + ray.cy * r;
          if (r <= 0 || x < 0 || y < 0 || x > w || y > h) continue;
          sparks.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 120, life: 0, max: 0.5 + Math.random() * 0.8, r: 0.8 + Math.random() * 1.8 });
        }
      }

      sctx.putImageData(fxData, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fxSmall, 0, 0, w, h);
      // Bloom: a much smaller copy scaled back up is soft, added on top so the edge glows
      gctx.clearRect(0, 0, glow.width, glow.height);
      gctx.drawImage(fxSmall, 0, 0, glow.width, glow.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow, 0, 0, w, h);

      for (let s = sparks.length - 1; s >= 0; s--) {
        const p = sparks[s];
        p.life += dt;
        if (p.life > p.max) { sparks.splice(s, 1); continue; }
        p.vy -= 30 * dt;                       // hot air carries them up
        p.vx += (Math.random() - 0.5) * 80 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        ctx.fillStyle = `rgba(255, ${170 + 70 * k | 0}, ${60 * k | 0}, ${k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    return {
      canvas: fx,
      start() {
        const t0 = performance.now();
        let last = t0;
        return new Promise((resolve) => {
          function frame(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const u = Math.min(1, (now - t0) / BURN_MS);
            progress = -0.06 + 1.2 * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2) ** 0.85;
            paint(dt);
            if (u < 1 || sparks.length) requestAnimationFrame(frame);
            else resolve();
          }
          paint(0);
          requestAnimationFrame(frame);
        });
      }
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    syncButton(btn);

    let busy = false;
    btn.addEventListener('click', () => {
      if (busy) return;
      const next = current() === 'light' ? 'dark' : 'light';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      btn.classList.add('is-spinning');
      setTimeout(() => btn.classList.remove('is-spinning'), 700);

      if (!document.startViewTransition || reduced) {
        apply(next);
        syncButton(btn);
        return;
      }

      busy = true;
      const r = btn.getBoundingClientRect();
      const fire = burn(r.left + r.width / 2, r.top + r.height / 2, (clip) => {
        root.style.setProperty('--burn-clip', clip);
      });
      root.classList.add('is-burning');
      const vt = document.startViewTransition(() => {
        apply(next);
        syncButton(btn);
        document.body.appendChild(fire.canvas);
      });
      const done = () => {
        fire.canvas.remove();
        root.classList.remove('is-burning');
        root.style.removeProperty('--burn-clip');
        busy = false;
      };
      vt.ready.then(() => fire.start()).then(() => vt.skipTransition && vt.skipTransition(), done);
      vt.finished.then(done, done);
    });

    // Heading canvases (TechText) take their colours from CSS, so ask them to re-read it
    document.addEventListener('themechange', () => {
      const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
      (window.__techText || []).forEach((t) => t.update({ accentColor: accent }));
    });
  });
})();
