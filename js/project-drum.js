// Project drum: the project cards wrapped around a rolling drum, drawn with WebGL.
//
// Each card is a strip of the drum's surface, so it is bent around the cylinder rather than being
// a flat panel turned on its side. Cards darken toward the drum's edge, fade out beyond it and
// smear sideways when the drum is moving fast. The card pictures are painted on a 2D canvas
// (painting, title, subtitle, label) and used as textures.
//
// createProjectDrum(canvas, items, { onLost }) returns null when WebGL 2 is not available, so the page can
// keep its plain list of projects. Otherwise it returns:
//   ready               promise: true once the card textures are uploaded, false if they failed
//   resize(w, h)        canvas size in CSS px
//   render(pos, speed)  draw with card `pos` (0 .. n-1, fractional) in front; speed in cards/s
//   hitTest(x, y)       index of the card under a viewport point, or -1
//   cardWidth()         width of the front card in CSS px
//   frame()             centre and size of the front card in CSS px
//   destroy()
'use strict';

(function (root) {
  const RADIUS = 1.35;        // drum radius, in card widths
  const GAP = 0.07;           // space between neighbouring cards, in card widths
  const SHADE = 0.85;         // how dark the drum's edge gets
  const CAMERA = 5.6;         // eye distance from the front card, in card widths (mild perspective)
  const FADE = [1.45, 1.75];  // rad round the drum over which a card fades out
  const ASPECT = 1.3;         // card height / width
  const BLUR = 0.5;           // motion blur strength
  const TEX_W = 1024;         // card texture width, px
  const SEG_X = 48;           // mesh segments across a card, enough to bend it smoothly
  const SEG_Y = 4;
  const ACCENT = '#c9a46a';

  const f = (n) => n.toFixed(4);

  const VERTEX = `#version 300 es
    in vec2 a_uv;
    uniform vec2 u_view;     // canvas size, device px
    uniform float u_card;    // front card width, device px
    uniform float u_shift;   // vertical shift of the drum, in clip space
    uniform float u_s;       // angle of this card's centre round the drum
    out vec2 v_uv;
    out float v_shade;
    out float v_fade;
    void main() {
      float phi = u_s + (a_uv.x - 0.5) / ${f(RADIUS)};
      float x = ${f(RADIUS)} * sin(phi);
      float y = (0.5 - a_uv.y) * ${f(ASPECT)};
      float z = ${f(RADIUS)} * cos(phi) - ${f(RADIUS)};
      float k = ${f(CAMERA)} / (${f(CAMERA)} - z);
      gl_Position = vec4(vec2(x, y) * k * u_card / (u_view * 0.5) + vec2(0.0, u_shift), 0.0, 1.0);
      v_uv = a_uv;
      v_shade = ${f(SHADE)} * (1.0 - max(0.0, cos(phi)));
      v_fade = 1.0 - smoothstep(${f(FADE[0])}, ${f(FADE[1])}, abs(phi));
    }`;

  const FRAGMENT = `#version 300 es
    precision highp float;
    uniform sampler2D u_tex;
    uniform float u_blur;    // sideways smear, in texture widths
    in vec2 v_uv;
    in float v_shade;
    in float v_fade;
    out vec4 o_color;
    void main() {
      vec4 c;
      if (u_blur < 0.0005) {
        c = texture(u_tex, v_uv);   // at rest: one sample, sharp
      } else {
        vec4 sum = vec4(0.0);
        float total = 0.0;
        for (int k = -3; k <= 3; k++) {
          float w = 1.0 - abs(float(k)) / 4.0;
          sum += texture(u_tex, v_uv + vec2(float(k) / 3.0 * u_blur, 0.0)) * w;
          total += w;
        }
        c = sum / total;
      }
      c.rgb *= 1.0 - v_shade;
      o_color = c * v_fade;   // premultiplied
    }`;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** Break `text` into lines no wider than `maxWidth` in the context's current font. */
  function wrap(g, text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
  }

  /** Paint one card: picture, title, subtitle, label and number, with rounded corners. */
  function paintCard(item, image, family) {
    const w = TEX_W;
    const h = Math.round(TEX_W * ASPECT);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const pad = w * 0.075;

    roundedRect(g, 0, 0, w, h, w * 0.065);
    g.save();
    g.clip();
    g.fillStyle = '#1a1a23';
    g.fillRect(0, 0, w, h);
    if (image && image.naturalWidth) {
      // Cover the card, keeping the upper part of the picture in view
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      g.drawImage(image, (w - dw) / 2, (h - dh) * 0.3, dw, dh);
    }
    // Dark veils behind the title and the bottom row keep the white text readable
    let veil = g.createLinearGradient(0, 0, 0, h * 0.36);
    veil.addColorStop(0, 'rgba(6, 6, 10, 0.68)');
    veil.addColorStop(1, 'rgba(6, 6, 10, 0)');
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h * 0.36);
    veil = g.createLinearGradient(0, h * 0.8, 0, h);
    veil.addColorStop(0, 'rgba(6, 6, 10, 0)');
    veil.addColorStop(1, 'rgba(6, 6, 10, 0.6)');
    g.fillStyle = veil;
    g.fillRect(0, h * 0.8, w, h * 0.2);
    g.restore();

    g.fillStyle = '#ffffff';
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0, 0, 0, 0.55)';
    g.shadowBlur = w * 0.012;
    const titleSize = w * 0.068;
    g.font = `700 ${titleSize}px ${family}`;
    g.fillText(item.title, pad, pad + titleSize * 0.85);
    const subSize = w * 0.043;
    g.font = `500 ${subSize}px ${family}`;
    g.fillStyle = 'rgba(255, 255, 255, 0.86)';
    wrap(g, item.subtitle || '', w - pad * 2, 2).forEach((line, n) => {
      g.fillText(line, pad, pad + titleSize * 0.85 + subSize * 1.5 * (n + 1));
    });

    const rowSize = w * 0.037;
    g.font = `600 ${rowSize}px ${family}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.fillText(item.label || '', pad, h - pad * 0.8, w - pad * 3);
    g.textAlign = 'right';
    g.fillText(item.index || '', w - pad, h - pad * 0.8);
    g.shadowBlur = 0;

    if (item.live) {
      // The project in use by a client keeps its gold ring
      g.strokeStyle = ACCENT;
      g.lineWidth = w * 0.008;
      roundedRect(g, g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth, w * 0.065);
      g.stroke();
    }
    return c;
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function createProjectDrum(canvas, items, options) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: true, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'low-power'
    });
    if (!gl) return null;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    const uniform = {};
    ['u_view', 'u_card', 'u_shift', 'u_s', 'u_tex', 'u_blur'].forEach((name) => {
      uniform[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(uniform.u_tex, 0);

    // One flat grid of (u, v) points, shared by every card; the shader bends it round the drum
    const cols = SEG_X + 1;
    const points = [];
    for (let y = 0; y <= SEG_Y; y++) for (let x = 0; x <= SEG_X; x++) points.push(x / SEG_X, y / SEG_Y);
    const index = [];
    for (let y = 0; y < SEG_Y; y++) {
      for (let x = 0; x < SEG_X; x++) {
        const a = y * cols + x;
        index.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    const textures = [];
    let cssW = 1;
    let cssH = 1;
    let dpr = 1;
    let card = { w: 100, h: 130 };
    let centreY = 0.5;
    let lastPos = 0;
    let lastSpeed = 0;
    let loaded = false;
    let alive = true;

    const upload = (source) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (anisotropy) {
        gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      }
      return tex;
    };

    const ready = (async () => {
      try {
        const family = getComputedStyle(document.body).fontFamily;
        if (document.fonts && document.fonts.load) {
          await Promise.all([
            document.fonts.load(`700 40px ${family}`), document.fonts.load(`500 40px ${family}`),
            document.fonts.load(`600 40px ${family}`)
          ]).catch(() => {});
          if (document.fonts.ready) await document.fonts.ready;
        }
        const images = await Promise.all(items.map((item) => loadImage(item.image)));
        if (!alive) return false;
        items.forEach((item, i) => textures.push(upload(paintCard(item, images[i], family))));
        loaded = true;
        return true;
      } catch (err) {
        // A picture from another origin (or a file:// page) taints the canvas and cannot be uploaded
        return false;
      }
    })();

    function resize(w, h) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const narrow = cssW < 640;
      const width = Math.min(cssW * (narrow ? 0.82 : 0.36), (cssH * (narrow ? 0.8 : 0.84)) / ASPECT);
      card = { w: width, h: width * ASPECT };
      centreY = narrow ? 0.44 : 0.47;
      if (loaded) render(lastPos, lastSpeed);
    }

    /** Draw the drum with card `pos` in front. `speed` (cards per second) sets the motion blur. */
    function render(pos, speed) {
      lastPos = pos;
      lastSpeed = speed || 0;
      if (!loaded || !alive) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniform.u_view, canvas.width, canvas.height);
      gl.uniform1f(uniform.u_card, card.w * dpr);
      gl.uniform1f(uniform.u_shift, 1 - 2 * centreY);
      gl.uniform1f(uniform.u_blur, clamp(Math.abs(lastSpeed) * BLUR * 0.012, 0, 0.06));
      const step = (1 + GAP) / RADIUS;
      // Far cards first, so nearer ones draw over them
      const order = textures.map((_, i) => i).sort((a, b) => Math.abs(b - pos) - Math.abs(a - pos));
      gl.bindVertexArray(vao);
      order.forEach((i) => {
        const s = (i - pos) * step;
        if (Math.abs(s) >= FADE[1] + 0.3) return;
        gl.bindTexture(gl.TEXTURE_2D, textures[i]);
        gl.uniform1f(uniform.u_s, s);
        gl.drawElements(gl.TRIANGLES, SEG_X * SEG_Y * 6, gl.UNSIGNED_SHORT, 0);
      });
    }

    /** A point on card `i`, (ux, vy) in 0..1 across its face, in CSS px on the canvas. */
    function project(i, ux, vy) {
      const phi = (i - lastPos) * ((1 + GAP) / RADIUS) + (ux - 0.5) / RADIUS;
      const x = RADIUS * Math.sin(phi);
      const y = (0.5 - vy) * ASPECT;
      const z = RADIUS * Math.cos(phi) - RADIUS;
      const k = CAMERA / (CAMERA - z);
      return [cssW / 2 + x * k * card.w, cssH * centreY - y * k * card.w];
    }

    function inside(poly, px, py) {
      let hit = false;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, ya] = poly[a];
        const [xb, yb] = poly[b];
        if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) hit = !hit;
      }
      return hit;
    }

    /** Index of the card under a viewport point, or -1. The nearest card wins where they overlap. */
    function hitTest(clientX, clientY) {
      if (!loaded) return -1;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const order = textures.map((_, i) => i).sort((a, b) => Math.abs(a - lastPos) - Math.abs(b - lastPos));
      for (const i of order) {
        if (Math.abs(i - lastPos) > 2.2) continue;
        const poly = [];
        for (let n = 0; n <= 16; n++) poly.push(project(i, n / 16, 0));
        poly.push(project(i, 1, 1));
        for (let n = 16; n >= 0; n--) poly.push(project(i, n / 16, 1));
        if (inside(poly, px, py)) return i;
      }
      return -1;
    }

    // If the browser takes the GPU context away, tell the page so it can fall back to the list
    const onLost = (e) => {
      e.preventDefault();
      loaded = false;
      if (options && typeof options.onLost === 'function') options.onLost();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return {
      ready,
      resize,
      render,
      hitTest,
      cardWidth: () => card.w,
      /**
       * Centre and size of the front card as it is drawn, in CSS px on the canvas. Bent round the
       * drum, the card is a little narrower on screen than its flat width.
       */
      frame: () => {
        const half = 0.5 / RADIUS;
        const edgeX = RADIUS * Math.sin(half);
        const k = CAMERA / (CAMERA - (RADIUS * Math.cos(half) - RADIUS));
        return { x: cssW / 2, y: cssH * centreY, w: 2 * edgeX * k * card.w, h: card.h };
      },
      destroy() {
        alive = false;
        canvas.removeEventListener('webglcontextlost', onLost);
      }
    };
  }

  root.createProjectDrum = createProjectDrum;
})(typeof window !== 'undefined' ? window : globalThis);
