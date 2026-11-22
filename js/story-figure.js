// story-figure.js: draws the ASCII portrait as a 3D figure on a 2D canvas.
// Every character of the portrait is a point with a depth (js/story-figure-data.js). Points are
// rotated, projected with perspective and drawn as glyphs from a pre-rendered atlas, so a frame
// is a few thousand drawImage calls and no WebGL is needed.
//
// const fig = createStoryFigure(canvas, window.STORY_FIGURE_DATA);
// fig.set({ yaw, pitch, scatter, talk, lift });   // all optional; the figure eases toward them
// fig.setColors({ ink: '#fff', disc: '#a53640' });
'use strict';

(function (root) {
  const RAMP = ' .\'`:-;=+*!?oa#%&@';   // light to dense: brighter cells get denser glyphs
  const DISC_GLYPHS = '01';
  const DEPTH = 0.2;          // how far the face stands out of the disc (in figure widths)
  const DISC_Z = -0.08;
  const PERSPECTIVE = 2.4;

  const decode = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // Small deterministic hash, so the scatter directions and glyph flicker are stable per point
  const hash = (i, k) => {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  };

  function createStoryFigure(canvas, data) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !data) return null;

    const n = data.n;
    const cells = decode(data.cells);
    const discBits = decode(data.disc);
    const points = [];

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const x = (i + 0.5) / n - 0.5;
        const y = (j + 0.5) / n - 0.5;
        const v = cells[idx];
        const isDisc = (discBits[idx >> 3] >> (7 - (idx & 7))) & 1;
        if (!v && !isDisc) continue;
        const k = points.length;
        // Scatter direction: mostly outward and toward the viewer
        const a = hash(k, 1) * Math.PI * 2;
        const r = 0.4 + hash(k, 2) * 0.8;
        const p = {
          x, y,
          z: v ? (v & 15) / 15 * DEPTH : DISC_Z,
          lum: v ? (v >> 4) : 0,
          disc: !v,
          dx: Math.cos(a) * r + x * 0.8,
          dy: Math.sin(a) * r + y * 0.8,
          dz: 0.3 + hash(k, 3) * 0.9,
          seed: hash(k, 4)
        };
        p.glyph = p.disc ? (hash(k, 5) < 0.5 ? 0 : 1)
          : Math.max(1, Math.min(RAMP.length - 1, Math.round(Math.pow(p.lum / 15, 0.75) * (RAMP.length - 1))));
        points.push(p);
      }
    }
    // Disc first, then the figure back-to-front by resting depth (good enough while it turns ±40°)
    points.sort((a, b) => (a.disc === b.disc ? a.z - b.z : a.disc ? -1 : 1));

    let W = 1, H = 1, dpr = 1, cell = 4;
    let colors = { ink: '#f2efe9', disc: '#a53640' };
    let atlas = null;     // canvas holding every glyph in both colours
    let glyphW = 0, glyphH = 0;

    const state = { yaw: 0, pitch: 0, scatter: 0, talk: 0, lift: 0 };
    const target = Object.assign({}, state);
    let raf = 0, last = 0, clock = 0, visible = true;

    function buildAtlas() {
      const size = Math.max(4, cell * 1.35);
      glyphW = Math.ceil(size * 0.75 * dpr);
      glyphH = Math.ceil(size * 1.1 * dpr);
      const cols = RAMP.length;
      atlas = document.createElement('canvas');
      atlas.width = glyphW * cols;
      atlas.height = glyphH * 2;
      const g = atlas.getContext('2d');
      g.font = `700 ${size * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = colors.ink;
      for (let c = 0; c < cols; c++) g.fillText(RAMP[c], c * glyphW + glyphW / 2, glyphH / 2);
      g.fillStyle = colors.disc;
      for (let c = 0; c < DISC_GLYPHS.length; c++) g.fillText(DISC_GLYPHS[c], c * glyphW + glyphW / 2, glyphH * 1.5);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      cell = Math.min(W, H) / 1.3 / n;
      buildAtlas();
      draw();
    }

    function draw() {
      if (!atlas) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // The canvas is 130% of the portrait box (room to turn and scatter); the figure fills the box
      const size = Math.min(W, H) * dpr / 1.3;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const breathe = Math.sin(clock * 1.3) * 0.004;
      const yaw = state.yaw + Math.sin(clock * 0.45) * 0.03;
      const pitch = state.pitch + Math.sin(clock * 0.6) * 0.015;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const sc = state.scatter;
      const talk = state.talk;
      const tick = Math.floor(clock * 14);

      for (let k = 0; k < points.length; k++) {
        const p = points[k];
        // Scatter grows with each point's own random strength, so the figure dissolves unevenly
        const s = sc * (0.35 + p.seed * 0.65);
        let x = p.x + p.dx * s;
        let y = p.y + p.dy * s + breathe - state.lift * 0.04;
        let z = p.z + p.dz * s;
        // Rotate: yaw about Y, then pitch about X
        const x1 = x * cyw + z * syw;
        const z1 = -x * syw + z * cyw;
        const y1 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const f = PERSPECTIVE / (PERSPECTIVE - z2);
        const sx = cx + x1 * f * size;
        const sy = cy + y1 * f * size;

        let glyph = p.glyph;
        let alpha;
        if (p.disc) {
          alpha = 0.7 * (1 - sc * 0.6);
          // The disc's 0/1 digits flip now and then, like the original binary render
          if (hash(k, tick) < 0.02 + talk * 0.1) glyph = 1 - glyph;
        } else {
          // Brighter cells are both denser and more opaque; faces turned away dim slightly
          // Lifted curve: mid-tones (most of the face) read bright, like a lit print
          alpha = 0.5 + Math.pow(p.lum / 15, 0.7) * 0.5;
          alpha *= 0.88 + 0.12 * Math.max(0, Math.min(1, (z2 + 0.1) / 0.3));
          // "Talking": glyphs flicker while a chapter's text is being told
          if (talk > 0 && hash(k, tick) < talk * 0.18) glyph = Math.floor(hash(k, tick + 7) * RAMP.length);
          if (glyph === 0) continue;
        }
        if (alpha <= 0.02) continue;
        ctx.globalAlpha = alpha;
        const gw = glyphW * f, gh = glyphH * f;
        ctx.drawImage(atlas, glyph * glyphW, p.disc ? glyphH : 0, glyphW, glyphH, sx - gw / 2, sy - gh / 2, gw, gh);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      clock += dt;
      let moving = false;
      for (const key in target) {
        const d = target[key] - state[key];
        if (Math.abs(d) > 1e-4) moving = true;
        state[key] += d * (1 - Math.exp(-dt / 0.12));
      }
      draw();
      // Keep idling (breathing, flicker) while on screen; the loop stops when hidden
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
      return moving;
    }

    function wake() {
      if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', wake);
    resize();
    wake();

    return {
      set(next) { Object.assign(target, next); wake(); },
      jump(next) { Object.assign(target, next); Object.assign(state, next); draw(); },
      setColors(next) { colors = Object.assign({}, colors, next); buildAtlas(); draw(); },
      resize
    };
  }

  root.createStoryFigure = createStoryFigure;
})(typeof window !== 'undefined' ? window : globalThis);
