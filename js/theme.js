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

  const announce = (theme) => document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  function apply(theme, quiet) {
    if (theme === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode: not remembered */ }
    if (!quiet) announce(theme);
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

  // Everything about a burn that doesn't change while it runs: when each point catches fire,
  // sampled along rays from the button, and which ray each cell of the effects field sits on.
  // This is the costly part, so it is worked out ahead of time (see prepareSoon) rather than on
  // the click, which would hold up the start.
  function prepare(originX, originY, w, h) {
    const gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
    const noise = makeNoise((Math.random() * 1e6) | 0);
    const maxD = Math.hypot(Math.max(originX, w - originX), Math.max(originY, h - originY));
    // Noise worked out once on a coarse grid; the rays read it back with bilinear lookups
    const NG = 8, nw = Math.ceil(w / NG) + 2, nh = Math.ceil(h / NG) + 2;
    const grid = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) grid[y * nw + x] = noise(x * NG / 140, y * NG / 140);
    const noiseAt = (px, py) => {
      const gx = Math.min(nw - 1.001, Math.max(0, px / NG)), gy = Math.min(nh - 1.001, Math.max(0, py / NG));
      const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * nw + x0;
      const top = grid[i] + (grid[i + 1] - grid[i]) * fx;
      const bot = grid[i + nw] + (grid[i + nw + 1] - grid[i + nw]) * fx;
      return top + (bot - top) * fy;
    };
    const fireAt = (x, y) => (Math.hypot(x - originX, y - originY) / maxD) * 0.8 + noiseAt(x, y) * 0.24;

    // On each ray, the fire has reached the first point whose time has come
    const RAYS = 540, STEP = 5;
    const n = Math.ceil((maxD * 1.05) / STEP) + 1;
    const rays = [];
    let tMin = Infinity, tMax = -Infinity;
    for (let k = 0; k < RAYS; k++) {
      const ang = (k / RAYS) * Math.PI * 2, cx = Math.cos(ang), cy = Math.sin(ang);
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = fireAt(originX + cx * i * STEP, originY + cy * i * STEP);
        arr[i] = t;
        if (t < tMin) tMin = t;
        const x = originX + cx * i * STEP, y = originY + cy * i * STEP;
        if (x >= 0 && y >= 0 && x <= w && y <= h && t > tMax) tMax = t;
      }
      rays.push({ cx, cy, arr });
    }
    // Rescale so the button catches at 0 and the last on-screen point at 1: no dead time
    const span = tMax - tMin || 1;
    rays.forEach((ray) => { for (let i = 0; i < n; i++) ray.arr[i] = (ray.arr[i] - tMin) / span; });

    return mapCells({ originX, originY, w, h, gw, gh, maxD, RAYS, STEP, rays });
  }

  // Which ray each cell of the effects field sits on, and how far it is from the button. Cheap,
  // so a prepared burn can be moved to wherever the button is now (the noise is random anyway).
  function mapCells(f) {
    const { gw, gh, RAYS, originX, originY } = f;
    const cellD = f.cellD || new Float32Array(gw * gh), cellRay = f.cellRay || new Uint16Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const dx = x * CELL + CELL / 2 - originX, dy = y * CELL + CELL / 2 - originY;
        cellD[y * gw + x] = Math.hypot(dx, dy);
        cellRay[y * gw + x] = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * RAYS) % RAYS;
      }
    }
    f.cellD = cellD; f.cellRay = cellRay;
    return f;
  }

  function burn(field, update) {
    const { originX, originY, w, h, gw, gh, maxD, RAYS, STEP, cellD, cellRay } = field;
    const raySamples = field.rays;
    const front = new Float32Array(RAYS);         // radius of the burnt area on each ray, px
    const smoothFront = new Float32Array(RAYS);

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
    let progress = 0;
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
      if (P > 0 && P < 1.02) {
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
            // Catches at once, spreads fast, slows as it reaches the far corner
            progress = 0.015 + 1.02 * (1 - Math.pow(1 - u, 1.6));
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

    // Keep a burn ready for the next click, worked out when the browser is idle
    let field = null;
    // An always-animating page may never be idle, so don't wait more than a moment
    const idle = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 800 })
      : (fn) => setTimeout(fn, 200);
    // The prepared burn, lit at the button's current spot (it may have moved since, e.g. while
    // the page intro was still sliding the header in), or null if the window has changed size
    function fresh() {
      if (!field || field.w !== innerWidth || field.h !== innerHeight) return null;
      const r = btn.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (Math.abs(field.originX - x) > 1 || Math.abs(field.originY - y) > 1) {
        field.originX = x; field.originY = y;
        mapCells(field);
      }
      return field;
    }
    function prepareSoon() {
      idle(() => {
        if (fresh()) return;
        const r = btn.getBoundingClientRect();
        field = prepare(r.left + r.width / 2, r.top + r.height / 2, innerWidth, innerHeight);
      });
    }
    if (document.readyState === 'complete') prepareSoon();
    else window.addEventListener('load', prepareSoon);
    let resizeTimer = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(prepareSoon, 300); });

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
      // The button lights up at once, while the browser takes its snapshot of the page
      btn.classList.add('is-lit');
      setTimeout(() => btn.classList.remove('is-lit'), 900);
      const r = btn.getBoundingClientRect();
      const ready = fresh() || prepare(r.left + r.width / 2, r.top + r.height / 2, innerWidth, innerHeight);
      field = null;                               // each burn gets a new shape
      const fire = burn(ready, (clip) => root.style.setProperty('--burn-clip', clip));
      root.classList.add('is-burning');
      // Swap the theme without telling the canvases yet: their redraw would hold up the snapshot.
      // The new page under the fire is live, so they recolour as soon as the burn is under way.
      const vt = document.startViewTransition(() => {
        apply(next, true);
        syncButton(btn);
        document.body.appendChild(fire.canvas);
      });
      let told = false;
      const tell = () => { if (!told) { told = true; announce(next); } };
      const done = () => {
        tell();
        fire.canvas.remove();
        root.classList.remove('is-burning');
        root.style.removeProperty('--burn-clip');
        busy = false;
        prepareSoon();
      };
      vt.ready.then(() => {
        const running = fire.start();
        requestAnimationFrame(tell);
        return running;
      }).then(() => vt.skipTransition && vt.skipTransition(), done);
      vt.finished.then(done, done);
    });

    // Heading canvases (TechText) take their colours from CSS, so ask them to re-read it
    document.addEventListener('themechange', () => {
      const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
      (window.__techText || []).forEach((t) => t.update({ accentColor: accent }));
    });
  });
})();
