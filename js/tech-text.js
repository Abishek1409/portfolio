// TechText: vanilla JS port of the React Bits <TechText /> component.
// A canvas wordmark whose letters turn into dashed vector outlines under the pointer,
// with a gliding selection frame, labels, blinking specks and draggable, springy letters.
'use strict';

(function (root) {
  const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const FALLOFF_STEPS = 8;
  const SPRING = 320;
  const DAMPING = 22;

  const DEFAULTS = {
    text: 'React Bits',
    fontFamily: '',        // empty: inherit the container's font
    fontWeight: 0,         // 0: inherit the container's weight
    fontSize: 0,           // 0: inherit the container's size (px); shrinks to fit either way
    letterSpacing: -0.05,  // em
    color: '#ffffff',
    accentColor: '#ffffff',
    reach: 200,
    softness: 0.7,
    dashLength: 4,
    dashGap: 2,
    strokeWidth: 1.5,
    lineStyle: 'dashed',   // 'dashed' | 'solid'
    reveal: 'letter',      // 'area' | 'letter' | 'off'
    specks: 15,
    selection: true,
    labels: true,
    draggable: true,
    sweep: true,
    speed: 1,
    align: 'center',       // 'center' | 'left' | 'auto' (follows the container's text-align)
    padX: 12               // px kept clear at the start edge when left-aligned
  };

  const approach = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));

  const hexToRgb = (hex) => {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h.slice(0, 6), 16);
    return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  const rgba = (hex, alpha) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const noise = (...values) => {
    let h = 2166136261;
    for (const value of values) {
      h = Math.imul(h ^ (value | 0), 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };

  const signed = (value) => (value > 0 ? `+${value}` : value < 0 ? `\u2212${-value}` : '0');

  /** Accept '#rgb', '#rrggbb' or 'rgb(a)(r, g, b...)' and return '#rrggbb'. */
  const toHex = (value, fallback) => {
    const v = String(value || '').trim();
    if (v.startsWith('#')) return v;
    const m = v.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
    if (!m) return fallback;
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  };

  /**
   * Mount TechText into `container` (an empty element with a size).
   * Returns { update(options), destroy() }.
   */
  function createTechText(container, options) {
    const canvas = document.createElement('canvas');
    canvas.className = 'tech-text-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.classList.add('tech-text');
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const scratch = document.createElement('canvas');
    const scratchCtx = scratch.getContext('2d');
    if (!ctx || !scratchCtx) return { update() {}, destroy() { canvas.remove(); } };

    let settings = Object.assign({}, DEFAULTS, options);
    const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    let alive = true;
    let layoutKey = '';
    let requestedFont = '';
    let word = null;
    let glyphs = [];
    let presence = 0;
    let clock = 0;
    let pulse = 0;
    let placed = false;
    let dragging = -1;
    // Values inherited from the container's computed style, refreshed on resize
    let inherited = { family: 'sans-serif', weight: 600, size: 48, color: '#ffffff', align: 'left' };

    const pointer = { x: 0, y: 0, inside: false };
    const grab = { x: 0, y: 0 };
    const lens = { x: 0, y: 0 };
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    function readInherited() {
      const cs = getComputedStyle(container);
      inherited = {
        family: cs.fontFamily || 'sans-serif',
        weight: Number(cs.fontWeight) || 600,
        size: parseFloat(cs.fontSize) || 48,
        color: toHex(cs.color, '#ffffff'),
        align: cs.textAlign === 'center' ? 'center' : 'left'
      };
    }

    // Resolved settings: explicit options win, empty ones fall back to the container's style
    const resolve = () => {
      const s = settings;
      return Object.assign({}, s, {
        fontFamily: s.fontFamily || inherited.family,
        fontWeight: s.fontWeight || inherited.weight,
        fontSize: s.fontSize || inherited.size,
        color: s.color === 'inherit' ? inherited.color : s.color,
        align: s.align === 'auto' ? inherited.align : s.align
      });
    };

    function refreshFonts() {
      layoutKey = '';
      wake();
    }

    const fontFor = (s, size) => `${s.fontWeight} ${size}px ${s.fontFamily}`;

    const setFont = (target, s, size) => {
      target.font = fontFor(s, size);
      if ('letterSpacing' in target) target.letterSpacing = `${s.letterSpacing * size}px`;
      target.textAlign = 'left';
      target.textBaseline = 'alphabetic';
    };

    const sprite = (s, view, glyph, stroke) => {
      // Generous padding: serif swashes, the dotted i/j and italic overhangs extend past the
      // measured ink box in some fonts, and a tight crop clipped them (chopped letters)
      const pad = Math.ceil(s.strokeWidth * 2 + 4 + view.size * 0.25);
      const left = glyph.box.x1 - pad;
      const top = glyph.box.y1 - pad;
      const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
      const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(w * dpr));
      image.height = Math.max(1, Math.ceil(h * dpr));
      const c = image.getContext('2d');
      if (!c) return { image, left, top };
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, s, view.size);
      if (stroke) {
        c.lineJoin = 'round';
        c.lineWidth = s.strokeWidth * 2;
        c.lineCap = 'butt';
        c.strokeStyle = s.color;
        if (s.lineStyle !== 'solid') c.setLineDash([Math.max(1, s.dashLength), Math.max(1, s.dashGap)]);
        c.strokeText(glyph.char, glyph.x, view.baseline);
        c.setLineDash([]);
        // Keep only the outer half of the stroke, so just the silhouette is traced
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        c.fillText(glyph.char, glyph.x, view.baseline);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = s.color;
        c.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image, left, top };
    };

    const ensureLayout = (s) => {
      const key = [
        s.text, s.fontFamily, s.fontWeight, s.fontSize, s.letterSpacing, s.color, s.dashLength,
        s.dashGap, s.strokeWidth, s.lineStyle, s.align, s.padX, width, height, dpr
      ].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;

      const wanted = fontFor(s, 64);
      if (document.fonts && wanted !== requestedFont) {
        requestedFont = wanted;
        document.fonts.load(wanted, s.text).then(refreshFonts, refreshFonts);
      }

      const probe = scratchCtx;
      setFont(probe, s, s.fontSize);
      let m = probe.measureText(s.text);
      const avail = s.align === 'left' ? width - s.padX * 2 : width * 0.9;
      const fit = Math.min(
        1,
        avail / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
        (height * 0.66) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1)
      );
      const size = s.fontSize * fit;
      setFont(probe, s, size);
      m = probe.measureText(s.text);
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const x = s.align === 'left'
        ? s.padX + m.actualBoundingBoxLeft
        : (width - inkWidth) / 2 + m.actualBoundingBoxLeft;
      const baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
      const next = {
        size,
        baseline,
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent
      };
      word = next;

      const chars = Array.from(s.text);
      const previous = glyphs;
      glyphs = [];
      let prefix = '';
      chars.forEach((char, i) => {
        prefix += char;
        const own = probe.measureText(char);
        const gx = x + probe.measureText(prefix).width - own.width;
        if (!char.trim()) return;
        const base = {
          char,
          x: gx,
          box: {
            x1: gx - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent
          }
        };
        const kept = previous[glyphs.length];
        glyphs.push(Object.assign({}, base, {
          offset: kept && kept.char === char ? kept.offset : { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          outline: 0,
          index: i,
          fill: sprite(s, next, base, false),
          dashes: sprite(s, next, base, true)
        }));
      });

      // Whole word rendered in one pass with real kerning: used whenever a letter is resting,
      // so overlapping serifs never get clipped at sprite edges (the "chopped letters" bug)
      const wordSprite = document.createElement('canvas');
      wordSprite.width = canvas.width;
      wordSprite.height = canvas.height;
      const wc = wordSprite.getContext('2d');
      if (wc) {
        wc.setTransform(dpr, 0, 0, dpr, 0, 0);
        setFont(wc, s, size);
        wc.fillStyle = s.color;
        wc.fillText(s.text, x, baseline);
      }
      next.sprite = wordSprite;

      dragging = -1;
      frame.index = -1;
      return next;
    };

    let wordBuf = null;

    /** Draw the solid word, punching out any letter that is outlined or dragged away. */
    const drawWord = () => {
      if (!word || !word.sprite) return;
      const busy = glyphs.filter((g) => g.outline > 0.001 || Math.hypot(g.offset.x, g.offset.y) > 0.5);
      if (!busy.length) {
        ctx.drawImage(word.sprite, 0, 0);
        return;
      }
      // Copy the word, erase the busy letters' areas, draw the rest in one go
      if (!wordBuf) wordBuf = document.createElement('canvas');
      if (wordBuf.width !== canvas.width || wordBuf.height !== canvas.height) {
        wordBuf.width = canvas.width;
        wordBuf.height = canvas.height;
      }
      const bc = wordBuf.getContext('2d');
      if (!bc) { ctx.drawImage(word.sprite, 0, 0); return; }
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = 'source-over';
      bc.clearRect(0, 0, wordBuf.width, wordBuf.height);
      bc.drawImage(word.sprite, 0, 0);
      bc.globalCompositeOperation = 'destination-out';
      for (const g of busy) {
        bc.drawImage(g.fill.image, Math.round(g.fill.left * dpr), Math.round(g.fill.top * dpr));
      }
      bc.globalCompositeOperation = 'source-over';
      ctx.drawImage(wordBuf, 0, 0);
      for (const g of busy) {
        if (g.outline < 0.999) {
          ctx.globalAlpha = 1 - g.outline;
          blit(ctx, g.fill, g.offset.x, g.offset.y, 0, 0);
        }
        if (g.outline > 0.001) {
          ctx.globalAlpha = g.outline;
          blit(ctx, g.dashes, g.offset.x, g.offset.y, 0, 0);
        }
        ctx.globalAlpha = 1;
      }
    };

    const glyphAt = (x, y) => {
      if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
      let best = -1;
      let bestDistance = Infinity;
      glyphs.forEach((glyph, i) => {
        const x1 = glyph.box.x1 + glyph.offset.x;
        const x2 = glyph.box.x2 + glyph.offset.x;
        const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      return bestDistance < 28 ? best : -1;
    };

    const falloff = (target, cx, cy, radius, strength, softness) => {
      const inner = Math.min(1, Math.max(0, 1 - softness));
      const gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      if (inner > 0.995) {
        gradient.addColorStop(0.995, `rgba(0, 0, 0, ${strength})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        return gradient;
      }
      for (let i = 0; i <= FALLOFF_STEPS; i++) {
        const t = i / FALLOFF_STEPS;
        const eased = t * t * (3 - 2 * t);
        gradient.addColorStop(inner + (1 - inner) * t, `rgba(0, 0, 0, ${strength * (1 - eased)})`);
      }
      return gradient;
    };

    const blit = (target, art, dx, dy, originX, originY) => {
      target.drawImage(
        art.image,
        Math.round((art.left + dx) * dpr - originX),
        Math.round((art.top + dy) * dpr - originY)
      );
    };

    const drawReveal = (s) => {
      const radius = s.reach * dpr;
      const cx = lens.x * dpr;
      const cy = lens.y * dpr;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, s.softness);
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';

      const x0 = Math.max(0, Math.floor(cx - radius));
      const y0 = Math.max(0, Math.floor(cy - radius));
      const x1 = Math.min(canvas.width, Math.ceil(cx + radius));
      const y1 = Math.min(canvas.height, Math.ceil(cy + radius));
      if (x1 <= x0 || y1 <= y0) return;
      const w = x1 - x0;
      const h = y1 - y0;
      if (scratch.width < w || scratch.height < h) {
        scratch.width = Math.max(scratch.width, w);
        scratch.height = Math.max(scratch.height, h);
      }
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, w, h);
      for (const glyph of glyphs) blit(scratchCtx, glyph.dashes, glyph.offset.x, glyph.offset.y, x0, y0);
      scratchCtx.globalCompositeOperation = 'destination-in';
      scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, s.softness);
      scratchCtx.fillRect(0, 0, w, h);
      scratchCtx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = presence;
      ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
      ctx.globalAlpha = 1;
    };

    const crisp = (value) => (Math.round(value * dpr) + 0.5) / dpr;

    const perimeterPoint = (distance, w, h) => {
      let d = ((distance % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
      if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
      d -= w;
      if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
      d -= h;
      if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
      d -= w;
      return [frame.x1, frame.y2 - d, -1, 0];
    };

    const drawSpecks = (s, a) => {
      const w = frame.x2 - frame.x1;
      const h = frame.y2 - frame.y1;
      if (w < 2 || h < 2) return;
      const perimeter = 2 * (w + h);
      const seed = frame.index + 1;
      const grid = 3;
      for (let k = 0; k < s.specks; k++) {
        const period = 0.5 + noise(seed, k, 11) * 1.2;
        const t = pulse / period + noise(seed, k, 17);
        const cycle = Math.floor(t);
        const life = t - cycle;
        if (life > 0.7) continue;
        const [px, py, nx, ny] = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
        const pick = noise(seed, k, cycle, 2);
        const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        const large = size >= 8;
        const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        const x = frame.x1 + Math.round((px + nx * out - frame.x1) / grid) * grid;
        const y = frame.y1 + Math.round((py + ny * out - frame.y1) / grid) * grid;
        const tone = noise(seed, k, cycle, 3);
        const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        const alpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        const left = Math.round(x - size / 2);
        const top = Math.round(y - size / 2);
        if (tone < 0.26 || (large && tone < 0.78)) {
          ctx.strokeStyle = rgba(s.accentColor, alpha);
          ctx.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) {
            ctx.fillStyle = rgba(s.accentColor, alpha);
            ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
          }
        } else {
          ctx.fillStyle = rgba(s.accentColor, alpha);
          ctx.fillRect(left, top, size, size);
        }
      }
      for (let j = 0; j < 2; j++) {
        const head = (pulse * 0.42 * s.speed + j * 0.5) * perimeter;
        for (let i = 0; i < 4; i++) {
          const [x, y] = perimeterPoint(head - i * 6, w, h);
          const size = i === 0 ? 3 : 2;
          ctx.fillStyle = rgba(s.accentColor, a * [0.95, 0.55, 0.32, 0.16][i]);
          ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
        }
      }
    };

    const drawFrame = (s) => {
      const glyph = glyphs[frame.index];
      if (!glyph || frame.alpha < 0.01) return;
      const a = frame.alpha;
      const x1 = crisp(frame.x1);
      const y1 = crisp(frame.y1);
      const x2 = crisp(frame.x2);
      const y2 = crisp(frame.y2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
      if (moved > 1) {
        const hx = (glyph.box.x1 + glyph.box.x2) / 2;
        const hy = (glyph.box.y1 + glyph.box.y2) / 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(s.accentColor, 0.45 * a);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
        ctx.fillStyle = rgba(s.accentColor, 0.7 * a);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(s.accentColor, 0.5 * a);
      ctx.stroke();
      ctx.beginPath();
      for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) {
        ctx.rect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      }
      ctx.fillStyle = rgba(s.accentColor, 0.95 * a);
      ctx.fill();

      if (s.specks > 0) {
        ctx.lineWidth = 1;
        drawSpecks(s, a);
      }

      if (!s.labels) return;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(s.accentColor, 0.62 * a);
      const label = moved > 1
        ? `${signed(Math.round(glyph.offset.x))}, ${signed(Math.round(-glyph.offset.y))}`
        : `${glyph.char}  ${Math.round(glyph.box.x2 - glyph.box.x1)} \u00d7 ${Math.round(glyph.box.y2 - glyph.box.y1)}`;
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
    };

    function tick(now) {
      raf = 0;
      const s = resolve();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const view = ensureLayout(s);
      const sweeping = s.sweep && !reducedMotion && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt * s.speed;
      pulse += dt;

      let targetX = pointer.x;
      let targetY = pointer.y;
      if (sweeping) {
        targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      const active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) {
        lens.x = targetX;
        lens.y = targetY;
      }
      if (active) {
        const lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, targetX, dt, lag);
        lens.y = approach(lens.y, targetY, dt, lag);
      }
      placed = active;
      presence = approach(presence, s.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);

      let moving = false;
      glyphs.forEach((glyph, i) => {
        if (i === dragging) {
          glyph.offset.x = approach(glyph.offset.x, pointer.x - grab.x, dt, 0.03);
          glyph.offset.y = approach(glyph.offset.y, pointer.y - grab.y, dt, 0.03);
          glyph.velocity.x = 0;
          glyph.velocity.y = 0;
          moving = true;
          return;
        }
        const { offset, velocity } = glyph;
        if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
          offset.x = 0;
          offset.y = 0;
          velocity.x = 0;
          velocity.y = 0;
          return;
        }
        velocity.x += (-SPRING * offset.x - DAMPING * velocity.x) * dt;
        velocity.y += (-SPRING * offset.y - DAMPING * velocity.y) * dt;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        moving = true;
      });

      const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0 && s.selection) {
        const glyph = glyphs[focus];
        const bx1 = glyph.box.x1 + glyph.offset.x - 6;
        const by1 = glyph.box.y1 + glyph.offset.y - 6;
        const bx2 = glyph.box.x2 + glyph.offset.x + 6;
        const by2 = glyph.box.y2 + glyph.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) {
          frame.x1 = bx1;
          frame.y1 = by1;
          frame.x2 = bx2;
          frame.y2 = by2;
        }
        const glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, bx1, dt, glide);
        frame.y1 = approach(frame.y1, by1, dt, glide);
        frame.x2 = approach(frame.x2, bx2, dt, glide);
        frame.y2 = approach(frame.y2, by2, dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && s.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach((glyph, i) => {
        const target = s.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
        glyph.outline = approach(glyph.outline, target, dt, 0.09);
        if (Math.abs(glyph.outline - target) > 0.002) moving = true;
        else glyph.outline = target;
      });

      if (s.draggable) {
        container.style.cursor = dragging >= 0 ? 'grabbing' : focus >= 0 && pointer.inside ? 'grab' : '';
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Ghost outline left at home while a letter is dragged away
      for (const glyph of glyphs) {
        const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
        if (moved > 1) {
          ctx.globalAlpha = Math.min(1, moved / 24) * 0.55;
          blit(ctx, glyph.dashes, 0, 0, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      drawWord();
      if (presence > 0.001) drawReveal(s);
      drawFrame(s);

      const settling = moving ||
        Math.abs(presence - (s.reveal === 'area' && active && dragging < 0 ? 1 : 0)) > 0.002 ||
        (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && visible && alive) {
        raf = requestAnimationFrame(tick);
      } else if (!active) {
        // The loop is stopping (idle, or scrolled off screen mid-transition). Never freeze on a
        // half-outlined frame: snap every letter home and repaint it solid.
        drawIdle();
      }
    }

    /** Clean resting state: all letters solid and at home, no frame, no reveal. */
    function drawIdle() {
      glyphs.forEach((glyph) => {
        glyph.outline = 0;
        glyph.offset.x = 0;
        glyph.offset.y = 0;
        glyph.velocity.x = 0;
        glyph.velocity.y = 0;
      });
      presence = 0;
      frame.alpha = 0;
      frame.index = -1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (word && word.sprite) ctx.drawImage(word.sprite, 0, 0);
    }

    function wake() {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function resize() {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      readInherited();
      layoutKey = '';
      wake();
    }

    const locate = (e) => {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };

    const onMove = (e) => {
      // Only a real mouse hovers; touch/pen "moves" are scrolls and left letters half-outlined
      if (e.pointerType && e.pointerType !== 'mouse' && dragging < 0) return;
      locate(e);
      pointer.inside = true;
      wake();
    };
    const onLeave = () => {
      if (dragging >= 0) return;
      pointer.inside = false;
      wake();
    };
    const onDown = (e) => {
      locate(e);
      pointer.inside = true;
      if (settings.draggable && (e.pointerType !== 'mouse' || e.button === 0)) {
        const index = glyphAt(pointer.x, pointer.y);
        if (index >= 0) {
          dragging = index;
          grab.x = pointer.x - glyphs[index].offset.x;
          grab.y = pointer.y - glyphs[index].offset.y;
          if (container.setPointerCapture) container.setPointerCapture(e.pointerId);
        }
      }
      wake();
    };
    const onUp = (e) => {
      if (dragging >= 0) {
        dragging = -1;
        if (container.releasePointerCapture) container.releasePointerCapture(e.pointerId);
        const rect = container.getBoundingClientRect();
        pointer.inside = e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom;
      }
      // Touch has no hover, and a cancel means the browser took over (scrolling):
      // release the letter so it never stays stuck as an outline
      if (e.pointerType !== 'mouse' || e.type === 'pointercancel') pointer.inside = false;
      wake();
    };

    // Scrolling moves the text out from under a still mouse without firing pointerleave,
    // which left letters stuck as outlines. Drop the hover state on scroll instead.
    const onScroll = () => {
      if (!pointer.inside || dragging >= 0) return;
      pointer.inside = false;
      wake();
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    container.addEventListener('pointermove', onMove, { passive: true });
    container.addEventListener('pointerenter', onMove, { passive: true });
    container.addEventListener('pointerdown', onDown, { passive: true });
    container.addEventListener('pointerup', onUp, { passive: true });
    container.addEventListener('pointercancel', onUp, { passive: true });
    container.addEventListener('pointerleave', onLeave, { passive: true });

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(container);
    else window.addEventListener('resize', resize);
    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) {
          // Leaving the screen: drop hover/drag and paint the resting state now
          pointer.inside = false;
          dragging = -1;
          cancelAnimationFrame(raf);
          raf = 0;
          if (word) drawIdle();
        }
        wake();
      })
      : null;
    if (intersectionObserver) intersectionObserver.observe(container);
    if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);
    resize();

    return {
      update(next) {
        settings = Object.assign({}, settings, next);
        layoutKey = '';
        wake();
      },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', resize);
        if (intersectionObserver) intersectionObserver.disconnect();
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerenter', onMove);
        container.removeEventListener('pointerdown', onDown);
        container.removeEventListener('pointerup', onUp);
        container.removeEventListener('pointercancel', onUp);
        container.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('scroll', onScroll);
        container.classList.remove('tech-text');
        canvas.remove();
      }
    };
  }

  root.createTechText = createTechText;
  root.TECH_TEXT_DEFAULTS = DEFAULTS;
})(typeof window !== 'undefined' ? window : globalThis);
