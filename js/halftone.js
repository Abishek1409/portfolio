// Halftone sphere: a WebGL version of halftone-sphere-2026-11-10.svg that reacts to the pointer.
// The SVG is a 50 x 50 grid of dots whose radius falls off linearly from the centre: 12.8 units
// in the middle, shrinking to the 0.256 minimum from 730 units out. Those few numbers rebuild all
// 2,500 dots exactly, so the grid is generated here instead of shipping 2,500 <circle> nodes.
//
// Reaction: a lens follows the pointer. Dots under it grow, spread apart and turn from the resting
// colour to the accent colour, and the sphere's bright spot leans slightly toward the pointer.
// With no pointer the lens drifts on its own, so the sphere never sits dead.
//
// Why WebGL: filling about 1,700 circles per frame on a 2D canvas measured roughly 14 ms of GPU
// time per frame on an Intel UHD laptop GPU (a 60 fps frame is 16 ms), so the always-on drift
// alone would have eaten the page's smoothness. Here every dot is a quad in one draw call and
// the lens maths runs in the vertex shader, so a frame costs well under 1 ms and the script only
// updates a handful of numbers. Without WebGL the resting sphere is drawn once.
'use strict';

(function (root) {
  const GRID = 50;           // dots per side
  const PITCH = 29.3;        // distance between dot centres, in SVG units
  const VIEW = 1466.212;     // SVG viewBox size
  const R_MAX = 12.8;        // radius of a dot at the centre
  const R_FALL = 730;        // distance at which the radius would reach zero
  const R_MIN = 0.02;        // smallest radius, as a share of R_MAX
  const CAP = 0.46 * PITCH;  // largest radius, so neighbouring dots never merge
  const MAX_PX = 1600;       // backing store limit, in device px per side

  const DEFAULTS = {
    host: null,          // element that receives pointer events (defaults to the canvas)
    color: '',           // resting dot colour; '' reads --halftone-dot from CSS
    accent: '',          // highlighted dot colour; '' reads --halftone-accent from CSS
    restAlpha: 0.55,     // opacity of a resting dot
    lensRadius: 190,     // lens size, in SVG units
    push: 0.3,           // how far dots spread outward under the lens (share of their distance)
    grow: 8.5,           // radius added to a dot at the centre of the lens
    follow: 0.25,        // share of the pointer's offset the bright spot moves
    followMax: 110,      // furthest the bright spot may move from the centre
    idle: true,          // drift the lens when no pointer is present
    idlePresence: 0.5    // lens strength while drifting
  };

  /** Radius (SVG units) of a dot whose centre is `d` units from the sphere's bright spot. */
  function dotRadius(d) {
    return R_MAX * Math.max(R_MIN, 1 - d / R_FALL);
  }

  /** Dot centres of the SVG grid in SVG units, centred on 0. */
  function buildGrid() {
    const n = GRID * GRID;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const half = (GRID - 1) / 2;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        x[j * GRID + i] = (i - half) * PITCH;
        y[j * GRID + i] = (j - half) * PITCH;
      }
    }
    return { x, y, n };
  }

  const approach = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));

  /** Accept '#rgb', '#rrggbb' or 'rgb(a)(r, g, b...)'; returns [r, g, b] or the fallback. */
  function parseColor(value, fallback) {
    const v = String(value || '').trim();
    let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.replace(/./g, (c) => c + c);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
  }

  // Each dot is a quad. The vertex shader does what dotRadius() and the lens description above
  // say, per dot; the fragment shader draws an anti-aliased disc inside the quad.
  const VERTEX_SHADER = `
    attribute vec2 a_base;       // dot centre, SVG units
    attribute vec2 a_corner;     // -1..1 corner of this dot's quad
    uniform float u_size;        // canvas side, device px
    uniform float u_scale;       // device px per SVG unit
    uniform vec2 u_hot;          // offset of the sphere's bright spot
    uniform vec2 u_lens;         // lens centre, SVG units
    uniform float u_presence;    // lens strength 0..1
    uniform float u_invSigma2;
    uniform float u_push;
    uniform float u_grow;
    varying vec2 v_local;        // px from the dot centre
    varying float v_rpx;         // dot radius, device px
    varying float v_t;           // 0 resting colour .. 1 accent colour
    void main() {
      float r = ${R_MAX.toFixed(3)} * max(${R_MIN.toFixed(3)}, 1.0 - length(a_base - u_hot) / ${R_FALL.toFixed(1)});
      vec2 v = a_base - u_lens;
      float w = u_presence * exp(-dot(v, v) * u_invSigma2);
      vec2 p = a_base + v * (u_push * w);
      r = min(r + u_grow * w, ${CAP.toFixed(3)} * (1.0 + u_push * w));
      float rpx = r * u_scale;
      float reach = max(rpx, 0.75) + 1.0;
      vec2 pos = vec2(u_size * 0.5) + p * u_scale + a_corner * reach;
      gl_Position = vec4(pos.x / u_size * 2.0 - 1.0, 1.0 - pos.y / u_size * 2.0, 0.0, 1.0);
      v_local = a_corner * reach;
      v_rpx = rpx;
      v_t = min(1.0, w * 1.25);
    }`;

  const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_local;
    varying float v_rpx;
    varying float v_t;
    uniform vec3 u_base;
    uniform vec3 u_accent;
    uniform float u_restAlpha;
    void main() {
      // Dots under 0.75 px are drawn as a 0.75 px disc, dimmed to the area they really cover
      float disc = max(v_rpx, 0.75);
      float cover = clamp(disc - length(v_local) + 0.5, 0.0, 1.0);
      float energy = min(1.0, (v_rpx * v_rpx) / (disc * disc));
      float a = cover * energy * mix(u_restAlpha, 1.0, v_t);
      gl_FragColor = vec4(mix(u_base, u_accent, v_t) * a, a);
    }`;

  /**
   * WebGL renderer: static geometry (4 vertices per dot), a handful of uniforms per frame.
   * Returns null when WebGL is not available.
   */
  function createGLRenderer(canvas, grid, look) {
    const gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'low-power'
    });
    if (!gl) return null;

    let program = null;
    let loc = null;
    let count = 0;
    let lost = false;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }

    function init() {
      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vs || !fs) return false;
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      gl.useProgram(program);

      // 4 vertices per dot: [base.x, base.y, corner.x, corner.y], 6 indices per dot
      const n = grid.n;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const verts = new Float32Array(n * 16);
      const index = new Uint16Array(n * 6);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 4; c++) {
          const o = i * 16 + c * 4;
          verts[o] = grid.x[i];
          verts[o + 1] = grid.y[i];
          verts[o + 2] = corners[c][0];
          verts[o + 3] = corners[c][1];
        }
        const v = i * 4;
        index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
      }
      count = n * 6;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      const base = gl.getAttribLocation(program, 'a_base');
      const corner = gl.getAttribLocation(program, 'a_corner');
      gl.enableVertexAttribArray(base);
      gl.vertexAttribPointer(base, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 16, 8);

      loc = {};
      ['u_size', 'u_scale', 'u_hot', 'u_lens', 'u_presence', 'u_invSigma2', 'u_push', 'u_grow',
        'u_base', 'u_accent', 'u_restAlpha'].forEach((name) => { loc[name] = gl.getUniformLocation(program, name); });
      gl.uniform3f(loc.u_base, look.base[0] / 255, look.base[1] / 255, look.base[2] / 255);
      gl.uniform3f(loc.u_accent, look.accent[0] / 255, look.accent[1] / 255, look.accent[2] / 255);
      gl.uniform1f(loc.u_restAlpha, look.restAlpha);
      gl.uniform1f(loc.u_invSigma2, 1 / (look.lensRadius * look.lensRadius));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied output
      gl.clearColor(0, 0, 0, 0);
      return true;
    }

    if (!init()) return null;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = !init();
      if (!lost && look.onRestore) look.onRestore();
    });

    return {
      resize(side) {
        gl.viewport(0, 0, side, side);
        if (!lost) {
          gl.uniform1f(loc.u_size, side);
          gl.uniform1f(loc.u_scale, side / VIEW);
        }
      },
      draw(st) {
        if (lost) return;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_hot, st.hotX, st.hotY);
        gl.uniform2f(loc.u_lens, st.lensX, st.lensY);
        gl.uniform1f(loc.u_presence, st.presence);
        gl.uniform1f(loc.u_push, st.push);
        gl.uniform1f(loc.u_grow, st.grow);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
      }
    };
  }

  /** Fallback without WebGL: the resting sphere, painted once per resize. */
  function createStaticRenderer(canvas, grid, look) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let side = 0;
    return {
      animated: false,
      resize(next) { side = next; },
      draw() {
        const k = side / VIEW;
        const mid = side / 2;
        ctx.clearRect(0, 0, side, side);
        ctx.fillStyle = `rgba(${look.base[0]}, ${look.base[1]}, ${look.base[2]}, ${look.restAlpha})`;
        for (let n = 0; n < grid.n; n++) {
          const r = dotRadius(Math.hypot(grid.x[n], grid.y[n])) * k;
          if (r < 0.22) continue;
          ctx.beginPath();
          ctx.arc(mid + grid.x[n] * k, mid + grid.y[n] * k, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
  }

  /**
   * Mount the halftone sphere on a square <canvas>. Size comes from CSS; the picture always
   * fills the canvas. Returns { destroy() }.
   */
  function createHalftone(canvas, options) {
    const s = Object.assign({}, DEFAULTS, options);
    const host = s.host || canvas;
    const grid = buildGrid();

    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduced = !!(motionQuery && motionQuery.matches);

    const cs = getComputedStyle(canvas);
    const look = {
      base: parseColor(s.color || cs.getPropertyValue('--halftone-dot'), [224, 224, 224]),
      accent: parseColor(s.accent || cs.getPropertyValue('--halftone-accent'), [201, 164, 106]),
      restAlpha: s.restAlpha,
      lensRadius: s.lensRadius,
      onRestore: () => { resize(); }
    };
    const renderer = createGLRenderer(canvas, grid, look) || createStaticRenderer(canvas, grid, look);
    if (!renderer) return { destroy() {} };
    const animated = renderer.animated !== false;

    const pointer = { active: false, cx: 0, cy: 0 };
    const lens = { x: 0, y: 0 };
    const hot = { x: 0, y: 0 };      // offset of the sphere's bright spot from its centre
    let presence = 0;                // lens strength, 0 to 1
    let clock = 0;
    let last = 0;
    let raf = 0;
    let visible = true;
    let alive = true;
    let touching = false;

    function draw() {
      renderer.draw({
        lensX: lens.x, lensY: lens.y, presence,
        hotX: hot.x, hotY: hot.y,
        push: reduced ? 0 : s.push,
        grow: reduced ? 0 : s.grow
      });
    }

    function frame(now) {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      const drifting = s.idle && !reduced && !pointer.active;
      let tx = lens.x;
      let ty = lens.y;
      let targetPresence = 0;
      let hx = 0;
      let hy = 0;

      if (pointer.active) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
          tx = ((pointer.cx - rect.left) / rect.width - 0.5) * VIEW;
          ty = ((pointer.cy - rect.top) / rect.height - 0.5) * VIEW;
        }
        targetPresence = 1;
      } else if (drifting) {
        clock += dt;
        tx = 430 * Math.sin(clock * 0.33 + 0.6);
        ty = 380 * Math.sin(clock * 0.27 + 2.1);
        targetPresence = s.idlePresence;
      }

      if (!reduced && (pointer.active || drifting)) {
        // Bright spot leans toward the lens, never further than followMax
        const lean = pointer.active ? s.follow : s.follow * 0.6;
        hx = tx * lean;
        hy = ty * lean;
        const len = Math.hypot(hx, hy);
        if (len > s.followMax) {
          hx *= s.followMax / len;
          hy *= s.followMax / len;
        }
      }

      if (presence < 0.02 || reduced) {
        // Not showing yet: appear at the target instead of sliding in from the last position
        lens.x = tx;
        lens.y = ty;
      } else {
        const lag = pointer.active ? 0.07 : 0.45;
        lens.x = approach(lens.x, tx, dt, lag);
        lens.y = approach(lens.y, ty, dt, lag);
      }
      presence = reduced ? targetPresence : approach(presence, targetPresence, dt, targetPresence > presence ? 0.14 : 0.3);
      hot.x = reduced ? 0 : approach(hot.x, hx, dt, 0.35);
      hot.y = reduced ? 0 : approach(hot.y, hy, dt, 0.35);

      const settled = !pointer.active && !drifting && presence < 0.002 && Math.hypot(hot.x, hot.y) < 0.05;
      if (settled) {
        presence = 0;
        hot.x = 0;
        hot.y = 0;
      }
      draw();
      if (!settled && visible && alive) raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!animated || raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function resize() {
      const cssW = canvas.clientWidth;
      if (!cssW) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, MAX_PX / cssW);
      const side = Math.max(1, Math.round(cssW * dpr));
      if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side;
        canvas.height = side;
      }
      renderer.resize(side);
      draw();
      wake();
    }

    const locate = (e) => {
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onMove = (e) => {
      // A finger only counts while it is down; a mouse or pen hovers
      if (e.pointerType === 'touch' && !touching) return;
      locate(e);
      pointer.active = true;
      wake();
    };
    const onDown = (e) => {
      if (e.pointerType === 'touch') touching = true;
      locate(e);
      pointer.active = true;
      wake();
    };
    const onUp = (e) => {
      if (e.pointerType === 'touch') {
        touching = false;
        pointer.active = false;
        wake();
      }
    };
    const onLeave = (e) => {
      if (e.pointerType === 'touch') return;
      pointer.active = false;
      wake();
    };

    if (animated) {
      host.addEventListener('pointermove', onMove, { passive: true });
      host.addEventListener('pointerdown', onDown, { passive: true });
      host.addEventListener('pointerup', onUp, { passive: true });
      host.addEventListener('pointercancel', onUp, { passive: true });
      host.addEventListener('pointerleave', onLeave, { passive: true });
    }

    const onMotionChange = () => {
      reduced = !!(motionQuery && motionQuery.matches);
      wake();
      draw();
    };
    if (motionQuery) {
      if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
      else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
    }

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(canvas);
    else window.addEventListener('resize', resize);
    // Pages scrolled away from the hero should not keep a loop running
    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) wake();
        else {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      })
      : null;
    if (intersectionObserver) intersectionObserver.observe(canvas);

    resize();

    return {
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onUp);
        host.removeEventListener('pointerleave', onLeave);
        if (motionQuery) {
          if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
          else if (motionQuery.removeListener) motionQuery.removeListener(onMotionChange);
        }
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', resize);
        if (intersectionObserver) intersectionObserver.disconnect();
      }
    };
  }

  root.createHalftone = createHalftone;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GRID, PITCH, VIEW, R_MAX, R_FALL, R_MIN, dotRadius, buildGrid, parseColor };
  }
})(typeof window !== 'undefined' ? window : globalThis);
