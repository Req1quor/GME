import type { VisualizerParams } from '../types';
export type VizOptions = VisualizerParams;

// ─── Constants ────────────────────────────────────────────────────────────────

interface TrailCanvas { c: HTMLCanvasElement; x: CanvasRenderingContext2D }

const FLUX_N     = 520;
const VORTEX_N   = 640;
const SCAPE_ROWS = 44;
const SCAPE_COLS = 96;
const ATTR_W     = 480;
const ATTR_H     = 270;

// ─── Module state ─────────────────────────────────────────────────────────────

const state: {
  fluxP:       Float32Array | null;
  fluxTrail:   TrailCanvas  | null;
  attrX: number; attrY: number;
  attrA: number; attrB: number; attrC: number; attrD: number;
  attrTrail:   TrailCanvas | null;
  petalTrail:  TrailCanvas | null;
  vortexP:     Float32Array | null;
  vortexTrail: TrailCanvas | null;
  weaveTrail:  TrailCanvas | null;
  stormTrail:  TrailCanvas | null;
  scopeTrail:  TrailCanvas | null;
  scapeHist:   Float32Array | null;
  sgramCanvas: HTMLCanvasElement | null;
  frame:       number;
  rotation:    number;
} = {
  fluxP: null, fluxTrail: null,
  attrX: 0.1,  attrY: 0.0,
  attrA: 1.7,  attrB: 1.7,  attrC: 0.6,  attrD: 1.2,
  attrTrail: null,
  petalTrail: null,
  vortexP: null,  vortexTrail: null,
  weaveTrail:  null,
  stormTrail:  null,
  scopeTrail:  null,
  scapeHist:   null,
  sgramCanvas: null,
  frame: 0, rotation: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Interpolate opts.color (t=0) → opts.color2 (t=1), scaled by brightness */
function sampleColor(t: number, opts: VizOptions, brightness = 1.0): [number, number, number] {
  const [r1, g1, b1] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);
  return [
    Math.min(255, Math.round(lerp(r1, r2, t) * brightness)),
    Math.min(255, Math.round(lerp(g1, g2, t) * brightness)),
    Math.min(255, Math.round(lerp(b1, b2, t) * brightness)),
  ];
}

/** Three-stop gradient: bgColor → color → color2 (for heatmap / spectrogram) */
function heatColor(v: number, opts: VizOptions): [number, number, number] {
  const [r0, g0, b0] = hexRgb(opts.bgColor);
  const [r1, g1, b1] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);
  if (v <= 0.5) {
    const t = v * 2;
    return [Math.round(lerp(r0, r1, t)), Math.round(lerp(g0, g1, t)), Math.round(lerp(b0, b1, t))];
  }
  const t = (v - 0.5) * 2;
  return [Math.round(lerp(r1, r2, t)), Math.round(lerp(g1, g2, t)), Math.round(lerp(b1, b2, t))];
}

function makeTrail(w: number, h: number, bgColor: string): TrailCanvas {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bgColor;
  x.fillRect(0, 0, w, h);
  return { c, x };
}

function ensureTrail(
  current: TrailCanvas | null,
  w: number, h: number, bg: string,
): TrailCanvas {
  if (!current || current.c.width !== w || current.c.height !== h) {
    return makeTrail(w, h, bg);
  }
  return current;
}

function audioBands(freq: Uint8Array, gain: number) {
  const L = freq.length;
  const bE = Math.max(1, Math.floor(L * 0.06));
  const mE = Math.max(1, Math.floor(L * 0.38));
  let b = 0, m = 0, tr = 0;
  for (let i = 0;  i < bE; i++) b  += freq[i];
  for (let i = bE; i < mE; i++) m  += freq[i];
  for (let i = mE; i < L;  i++) tr += freq[i];
  return {
    bass:   Math.min(1, b  / (bE       * 255) * gain),
    mid:    Math.min(1, m  / ((mE - bE) * 255) * gain),
    treble: Math.min(1, tr / ((L - mE)  * 255) * gain),
  };
}

// ─── 1. BARS — classic FFT vertical bars ─────────────────────────────────────

function renderBars(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, w, h);

  const N    = Math.min(opts.barCount, freq.length);
  const barW = w / N;
  const padX = Math.max(0.5, barW * 0.08);
  const fW   = Math.max(1, barW - padX * 2);

  for (let i = 0; i < N; i++) {
    const fi  = Math.floor(Math.pow(i / N, 1.5) * freq.length * 0.88);
    const v   = Math.min(1, (freq[fi] / 255) * opts.gain);
    if (v < 0.004) continue;
    const barH = v * h * 0.94;
    const bx   = i * barW + padX;
    const by   = h - barH;
    const [r, g, b] = sampleColor(i / N, opts, 0.7 + v * 0.55);

    if (opts.glow && v > 0.35) {
      ctx.shadowBlur  = opts.glowSize * v * 0.6;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(bx | 0, by | 0, fW | 0, Math.max(1, barH) | 0);
    ctx.shadowBlur = 0;
    // Peak cap
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.fillRect(bx | 0, (by - 2) | 0, fW | 0, 2);
  }
  ctx.shadowBlur = 0;
}

// ─── 2. SCOPE — oscilloscope waveform ────────────────────────────────────────

function renderScope(
  ctx: CanvasRenderingContext2D,
  _freq: Uint8Array, time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  state.scopeTrail = ensureTrail(state.scopeTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.scopeTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.18, opts.decay * 1.8)})`;
  x.fillRect(0, 0, w, h);

  const N   = time.length;
  const cy  = h / 2;
  const amp = h * 0.44;

  // Stable trigger: find zero-crossing
  let st = 0;
  for (let i = 1; i < N - 1; i++) {
    if (time[i - 1] < 128 && time[i] >= 128) { st = i; break; }
  }
  const drawLen = Math.min(N - st, Math.floor(N * 0.92));

  const [r,  g,  b ] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);

  if (opts.glow) { x.shadowBlur = opts.glowSize * 0.35; x.shadowColor = opts.color; }
  x.strokeStyle = `rgb(${r},${g},${b})`;
  x.lineWidth   = opts.lineWidth;
  x.lineCap     = 'round';
  x.lineJoin    = 'round';
  x.beginPath();
  for (let i = 0; i < drawLen; i++) {
    const px = (i / drawLen) * w;
    const py = cy - ((time[st + i] - 128) / 128) * amp;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.stroke();

  // Thin echo in color2
  x.shadowBlur  = 0;
  x.strokeStyle = `rgba(${r2},${g2},${b2},0.38)`;
  x.lineWidth   = opts.lineWidth * 0.5;
  x.beginPath();
  for (let i = 0; i < drawLen; i++) {
    const px = (i / drawLen) * w;
    const py = cy - ((time[st + i] - 128) / 128) * amp * 1.12;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.stroke();
  x.shadowBlur = 0;
  ctx.drawImage(tc, 0, 0);
}

// ─── 3. SPECTROGRAM — scrolling 2-D frequency heatmap ────────────────────────

function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  if (!state.sgramCanvas || state.sgramCanvas.width !== w || state.sgramCanvas.height !== h) {
    state.sgramCanvas = document.createElement('canvas');
    state.sgramCanvas.width = w; state.sgramCanvas.height = h;
    const sx = state.sgramCanvas.getContext('2d')!;
    sx.fillStyle = opts.bgColor;
    sx.fillRect(0, 0, w, h);
  }
  const sg = state.sgramCanvas;
  const sx = sg.getContext('2d')!;

  // Shift existing image 1 px to the left
  sx.drawImage(sg, -1, 0);
  sx.clearRect(w - 1, 0, 1, h);

  // Paint new column at the right edge
  const N = freq.length;
  for (let i = 0; i < h; i++) {
    const fi  = Math.floor((1 - i / h) * N * 0.88);
    const v   = Math.min(1, (freq[fi] / 255) * opts.gain);
    if (v < 0.012) continue;
    const [r, g, b] = heatColor(v, opts);
    sx.fillStyle = `rgb(${r},${g},${b})`;
    sx.fillRect(w - 1, i, 1, 1);
  }
  ctx.drawImage(sg, 0, 0);
}

// ─── 4. RINGS — concentric frequency rings ────────────────────────────────────

function renderRings(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const BANDS = 12;
  const minR  = Math.min(w, h) * 0.04;
  const maxR  = Math.min(w, h) * 0.46;
  const { bass } = audioBands(freq, opts.gain);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = BANDS - 1; i >= 0; i--) {
    const fi  = Math.floor(Math.pow(i / BANDS, 1.4) * freq.length * 0.85);
    const v   = Math.min(1, (freq[fi] / 255) * opts.gain);
    const t   = i / (BANDS - 1);
    const [r, g, b] = sampleColor(t, opts, 0.55 + v * 0.65);
    const baseR = minR + t * (maxR - minR);
    const pulse = 1 + Math.sin(state.frame * 0.06 + i * 0.8) * bass * 0.18;
    const radius = baseR * pulse + v * (maxR - baseR) * 0.45;

    if (opts.glow) {
      ctx.shadowBlur  = opts.glowSize * v * 0.55;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + v * 0.65})`;
    ctx.lineWidth   = opts.lineWidth * (0.5 + v * 1.8);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ─── 5. MIRROR — symmetric waveform ──────────────────────────────────────────

function renderMirror(
  ctx: CanvasRenderingContext2D,
  _freq: Uint8Array, time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, w, h);

  const cy = h / 2;
  const N  = time.length;
  const amp = h * 0.46;

  let st = 0;
  for (let i = 1; i < N - 1; i++) {
    if (time[i - 1] < 128 && time[i] >= 128) { st = i; break; }
  }
  const drawLen = Math.min(N - st, Math.floor(N * 0.92));

  for (const flip of [-1, 1] as const) {
    const [r, g, b] = sampleColor(flip === 1 ? 0 : 1, opts, 0.85);
    if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.3; ctx.shadowColor = `rgb(${r},${g},${b})`; }
    ctx.strokeStyle = `rgba(${r},${g},${b},0.88)`;
    ctx.lineWidth   = opts.lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    for (let i = 0; i < drawLen; i++) {
      const px = (i / drawLen) * w;
      const py = cy + flip * ((time[st + i] - 128) / 128) * amp;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // Center line
  const [r, g, b] = sampleColor(0.5, opts, 0.35);
  ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`;
  ctx.lineWidth   = 0.5;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
}

// ─── 6. STORM — radial frequency burst ───────────────────────────────────────

function renderStorm(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  state.stormTrail = ensureTrail(state.stormTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.stormTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass }     = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.07, opts.decay * 0.9)})`;
  x.fillRect(0, 0, w, h);

  const cx   = w / 2, cy = h / 2;
  const N    = Math.min(opts.barCount, freq.length);
  const minR = Math.min(w, h) * 0.06;
  const maxL = Math.min(w, h) * 0.44;

  x.globalCompositeOperation = 'lighter';
  x.lineCap = 'round';

  for (let i = 0; i < N; i++) {
    const fi = Math.floor(Math.pow(i / N, 1.5) * freq.length * 0.88);
    const v  = Math.min(1, (freq[fi] / 255) * opts.gain);
    if (v < 0.015) continue;

    const [r, g, b] = sampleColor(i / N, opts, 0.6 + v * 0.6);
    const len       = minR + v * maxL * (1 + bass * 0.4);
    const a1        = (i / N) * 2 * Math.PI;

    x.strokeStyle = `rgba(${r},${g},${b},${0.55 + v * 0.45})`;
    x.lineWidth   = opts.lineWidth * (0.4 + v * 1.6);
    if (opts.glow && v > 0.4) {
      x.shadowBlur  = opts.glowSize * v * 0.4;
      x.shadowColor = `rgb(${r},${g},${b})`;
    }
    for (const angle of [a1, a1 + Math.PI]) {
      x.beginPath();
      x.moveTo(cx + Math.cos(angle) * minR, cy + Math.sin(angle) * minR);
      x.lineTo(cx + Math.cos(angle) * len,  cy + Math.sin(angle) * len);
      x.stroke();
    }
    x.shadowBlur = 0;
  }

  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(tc, 0, 0);
}

// ─── 7. FLUX — organic flow-field particles ───────────────────────────────────

function renderFlux(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  if (!state.fluxP) {
    state.fluxP = new Float32Array(FLUX_N * 4);
    for (let i = 0; i < FLUX_N; i++) {
      state.fluxP[i * 4]     = Math.random() * w;
      state.fluxP[i * 4 + 1] = Math.random() * h;
    }
  }
  state.fluxTrail = ensureTrail(state.fluxTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.fluxTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass } = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.025, opts.decay * 0.55)})`;
  x.fillRect(0, 0, w, h);

  const t = state.frame * 0.016;
  const p = state.fluxP;
  x.globalCompositeOperation = 'lighter';
  x.lineCap = 'round';

  for (let i = 0; i < FLUX_N; i++) {
    const ii    = i * 4;
    const px    = p[ii], py = p[ii + 1];
    const nx    = px / w, ny = py / h;
    const fi    = Math.min(freq.length - 1, Math.floor(nx * freq.length * 0.8));
    const fAmp  = freq[fi] / 255;

    const angle =
      Math.sin(nx * 4.2 + ny * 2.8 + t + bass * 1.8) * 1.9 +
      Math.cos(nx * 2.1 - ny * 3.6 + t * 0.73 + fAmp * 2.1) +
      bass * 0.9;

    const speed = (1.3 + bass * 3.8 + fAmp * 1.6) * opts.gain;
    const npx   = px + Math.cos(angle) * speed;
    const npy   = py + Math.sin(angle) * speed;
    p[ii]     = ((npx % w) + w) % w;
    p[ii + 1] = ((npy % h) + h) % h;
    if (Math.abs(npx - px) > w * 0.4 || Math.abs(npy - py) > h * 0.4) continue;

    const tColor     = ((angle / (2 * Math.PI)) + 0.5 + fAmp * 0.3) % 1.0;
    const brightness = 0.4 + fAmp * 0.4 + bass * 0.25;
    const [r, g, b]  = sampleColor(tColor, opts, brightness);

    x.strokeStyle = `rgba(${r},${g},${b},${0.5 + fAmp * 0.38})`;
    x.lineWidth   = opts.lineWidth * (0.45 + fAmp * 0.8);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(npx, npy);
    x.stroke();
  }

  x.globalCompositeOperation = 'source-over';
  if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.2; ctx.shadowColor = opts.color; }
  ctx.drawImage(tc, 0, 0);
  ctx.shadowBlur = 0;
}

// ─── 8. VORTEX — orbital particle vortex ─────────────────────────────────────

function renderVortex(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  if (!state.vortexP || state.vortexP.length !== VORTEX_N * 3) {
    state.vortexP = new Float32Array(VORTEX_N * 3);
    for (let i = 0; i < VORTEX_N; i++) {
      state.vortexP[i * 3]     = Math.random() * 2 * Math.PI;
      state.vortexP[i * 3 + 1] = 0.07 + Math.random() * 0.88;
      state.vortexP[i * 3 + 2] = 0.005 + Math.random() * 0.022;
    }
  }
  state.vortexTrail = ensureTrail(state.vortexTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.vortexTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass, treble } = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.05, opts.decay)})`;
  x.fillRect(0, 0, w, h);

  const cx   = w / 2, cy = h / 2;
  const maxR = Math.min(w, h) * 0.47;
  const p    = state.vortexP;

  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < VORTEX_N; i++) {
    const ii    = i * 3;
    const angle = p[ii], rNorm = p[ii + 1], spd = p[ii + 2];
    p[ii] = (angle + spd * (1 + treble * 3.2)) % (2 * Math.PI);

    const pulse = 1 + Math.sin(state.frame * 0.048 + angle * 2) * bass * 0.38;
    const r_    = rNorm * maxR * pulse;
    const pxc   = cx + Math.cos(angle) * r_;
    const pyc   = cy + Math.sin(angle) * r_;

    const fi    = Math.min(freq.length - 1, Math.floor(Math.pow(rNorm, 1.4) * freq.length * 0.88));
    const fAmp  = freq[fi] / 255;

    const [r, g, b] = sampleColor(rNorm, opts, 0.35 + rNorm * 0.28 + fAmp * 0.45);
    const dotR      = Math.max(0.6, opts.lineWidth * (0.7 + fAmp * 1.5) * (1 + bass * 0.75));

    if (opts.glow && fAmp > 0.45) { x.shadowBlur = opts.glowSize * fAmp * 0.38; x.shadowColor = opts.color2; }
    x.fillStyle = `rgba(${r},${g},${b},${0.46 + fAmp * 0.42})`;
    x.fillRect((pxc - dotR) | 0, (pyc - dotR) | 0, (dotR * 2 + 1) | 0, (dotR * 2 + 1) | 0);
    x.shadowBlur = 0;
  }
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(tc, 0, 0);
}

// ─── 9. ATTRACTOR — Clifford strange attractor ────────────────────────────────

function renderAttractor(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  if (!state.attrTrail) {
    state.attrTrail = makeTrail(ATTR_W, ATTR_H, opts.bgColor);
    state.attrX = 0.1; state.attrY = 0.0;
  }
  const { c: tc, x } = state.attrTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass, mid, treble } = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},0.028)`;
  x.fillRect(0, 0, ATTR_W, ATTR_H);

  const t_    = state.frame * 0.00055;
  state.attrA = 1.7 + Math.sin(t_ * 1.9  + bass   * 0.7) * 0.52;
  state.attrB = 1.7 + Math.cos(t_ * 1.4  + mid    * 0.5) * 0.48;
  state.attrC = 0.6 + Math.sin(t_ * 0.85 + treble * 0.4) * 0.38;
  state.attrD = 1.2 + Math.cos(t_ * 1.1)                 * 0.32;
  const { attrA: a, attrB: bA, attrC: cA, attrD: dA } = state;

  const tColor    = Math.sin(state.frame * 0.004 + bass * Math.PI) * 0.5 + 0.5;
  const [cr, cg, cb] = sampleColor(tColor, opts, 1.2);

  x.globalCompositeOperation = 'lighter';
  x.fillStyle = `rgb(${cr},${cg},${cb})`;
  let cx_ = state.attrX, cy_ = state.attrY;
  for (let i = 0; i < 4200; i++) {
    const nx_ = Math.sin(a * cy_)  + cA * Math.cos(a * cx_);
    const ny_ = Math.sin(bA * cx_) + dA * Math.cos(bA * cy_);
    cx_ = nx_; cy_ = ny_;
    const sx = ((cx_ + 2.8) / 5.6 * ATTR_W) | 0;
    const sy = ((cy_ + 2.8) / 5.6 * ATTR_H) | 0;
    if (sx >= 0 && sx < ATTR_W && sy >= 0 && sy < ATTR_H) x.fillRect(sx, sy, 1, 1);
  }
  state.attrX = cx_; state.attrY = cy_;

  x.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.35; ctx.shadowColor = opts.color; }
  ctx.drawImage(tc, 0, 0, w, h);
  ctx.shadowBlur = 0;
}

// ─── 10. PETALS — polar mandala ───────────────────────────────────────────────

function renderPetals(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  state.petalTrail = ensureTrail(state.petalTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.petalTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass } = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},0.007)`;
  x.fillRect(0, 0, w, h);

  const cx     = w / 2, cy = h / 2;
  const N      = Math.min(opts.barCount, freq.length);
  const N_FOLD = 6;
  const baseR  = Math.min(w, h) * 0.065;
  const maxL   = Math.min(w, h) * 0.42 * opts.gain;
  const slice  = (2 * Math.PI) / N_FOLD;
  state.rotation += 0.0018 + bass * 0.009;

  const spikes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const fi  = Math.floor(Math.pow(i / N, 1.22) * freq.length * 0.87);
    spikes[i] = Math.min(1, (freq[fi] / 255) * opts.gain);
  }

  x.globalCompositeOperation = 'lighter';
  x.lineCap  = 'round';
  x.lineJoin = 'round';

  for (let fold = 0; fold < N_FOLD; fold++) {
    const [cr, cg, cb] = sampleColor(fold / N_FOLD, opts, 0.8);
    const alpha = 0.10 + bass * 0.22;
    for (const mirror of [1, -1] as const) {
      x.save();
      x.translate(cx, cy);
      x.rotate(fold * slice + state.rotation);
      x.scale(1, mirror);
      if (opts.glow) {
        x.shadowBlur  = opts.glowSize * 0.38 * (0.4 + bass);
        x.shadowColor = `rgb(${cr},${cg},${cb})`;
      }
      x.beginPath();
      x.moveTo(baseR, 0);
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * slice * 0.5;
        x.lineTo(Math.cos(angle) * (baseR + spikes[i] * maxL), Math.sin(angle) * (baseR + spikes[i] * maxL));
      }
      for (let i = N - 1; i >= 0; i--) {
        const angle = (i / N) * slice * 0.5;
        x.lineTo(Math.cos(angle) * baseR, Math.sin(angle) * baseR);
      }
      x.closePath();
      x.fillStyle   = `rgba(${cr},${cg},${cb},${alpha})`;
      x.strokeStyle = `rgba(${cr},${cg},${cb},${alpha * 3.2})`;
      x.lineWidth   = opts.lineWidth;
      x.fill(); x.stroke();
      x.shadowBlur = 0;
      x.restore();
    }
  }
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(tc, 0, 0);
}

// ─── 11. SCAPE — 3-D perspective FFT waterfall ────────────────────────────────

function renderScape(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  if (!state.scapeHist) state.scapeHist = new Float32Array(SCAPE_ROWS * SCAPE_COLS);

  const N = SCAPE_COLS;
  state.scapeHist.copyWithin(N, 0, (SCAPE_ROWS - 1) * N);
  for (let i = 0; i < N; i++) {
    const fi = Math.floor(Math.pow(i / N, 1.6) * freq.length * 0.88);
    state.scapeHist[i] = Math.min(1, (freq[fi] / 255) * opts.gain);
  }

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.22, maxBarH = h * 0.70;
  for (let rr = SCAPE_ROWS - 1; rr >= 0; rr--) {
    const depth   = 1 - rr / (SCAPE_ROWS - 1);
    const recede  = horizon + (h - horizon) * (1 - depth);
    const hSpan   = w * (0.12 + depth * 0.88);
    const hOff    = (w - hSpan) * 0.5;
    const heightS = 0.08 + depth * 0.92;
    const alpha   = 0.12 + depth * 0.88;
    const barStep = hSpan / N;

    const [cr, cg, cb] = sampleColor(depth, opts, 1.0);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    for (let col = 0; col < N; col++) {
      const v = state.scapeHist[rr * N + col];
      if (v < 0.012) continue;
      const bh = v * maxBarH * heightS;
      ctx.fillRect((hOff + col * barStep) | 0, (recede - bh) | 0, Math.max(1, barStep * 0.86) | 0, bh | 0);
    }
    if (rr % 8 === 0) {
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha * 0.12})`;
      ctx.lineWidth   = 0.5;
      ctx.beginPath(); ctx.moveTo(hOff, recede); ctx.lineTo(hOff + hSpan, recede); ctx.stroke();
    }
  }
  if (opts.glow) {
    ctx.shadowBlur  = opts.glowSize * 0.8;
    ctx.shadowColor = opts.color2;
    const [fr, fg, fb] = hexRgb(opts.color2);
    ctx.fillStyle = `rgba(${fr},${fg},${fb},0.55)`;
    for (let col = 0; col < N; col++) {
      const v = state.scapeHist[col];
      if (v < 0.04) continue;
      ctx.fillRect((col * (w / N)) | 0, (h - v * maxBarH - 1) | 0, Math.max(1, w / N * 0.86) | 0, 2);
    }
    ctx.shadowBlur = 0;
  }
}

// ─── 12. WEAVE — multi-ribbon bezier interference ─────────────────────────────

function renderWeave(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array, _time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  state.weaveTrail = ensureTrail(state.weaveTrail, w, h, opts.bgColor);
  const { c: tc, x } = state.weaveTrail;
  const [br, bg, bb] = hexRgb(opts.bgColor);
  const { bass } = audioBands(freq, opts.gain);

  x.fillStyle = `rgba(${br},${bg},${bb},0.11)`;
  x.fillRect(0, 0, w, h);

  const LINES = 18, SEGS = 10;
  const t_ = state.frame * 0.013;

  x.globalCompositeOperation = 'lighter';
  x.lineCap  = 'round';
  x.lineJoin = 'round';

  for (let line = 0; line < LINES; line++) {
    const tLine = line / (LINES - 1);
    const fi    = Math.floor(Math.pow(tLine, 1.35) * freq.length * 0.9);
    const amp   = Math.min(1, (freq[fi] / 255) * opts.gain);
    const [cr, cg, cb] = sampleColor(tLine, opts, 0.28 + amp * 0.72);

    if (opts.glow) { x.shadowBlur = opts.glowSize * 0.28 * amp; x.shadowColor = `rgb(${cr},${cg},${cb})`; }
    x.strokeStyle = `rgba(${cr},${cg},${cb},${0.22 + amp * 0.62})`;
    x.lineWidth   = opts.lineWidth * (0.45 + amp * 1.65);
    x.beginPath();
    for (let s = 0; s <= SEGS; s++) {
      const xf      = s / SEGS;
      const baseY   = tLine * h;
      const fSample = Math.min(freq.length - 1, Math.floor(xf * freq.length * 0.8));
      const lFreq   = freq[fSample] / 255;
      const disp    =
        lFreq * opts.gain * h * 0.20 * Math.sin(xf * Math.PI * (2.2 + line * 0.45) + t_ + line * 0.7) +
        Math.sin(t_ * 1.15 + xf * 5.5 + line * 1.9) * h * 0.038 * (1 + bass * 1.2);
      const px = xf * w, py = baseY + disp;
      if (s === 0) { x.moveTo(px, py); }
      else { x.quadraticCurveTo((s - 1) / SEGS * w, py - disp * 0.15, (((s - 1) / SEGS + xf) * 0.5) * w, py); }
    }
    x.stroke();
    x.shadowBlur = 0;
  }
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(tc, 0, 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

let vizCanvas: HTMLCanvasElement | null = null;
function getVizCanvas() {
  if (!vizCanvas) vizCanvas = document.createElement('canvas');
  return vizCanvas;
}

export function drawVisualizerFrame(
  analyser: AnalyserNode,
  width: number,
  height: number,
  opts: VizOptions,
): HTMLCanvasElement {
  const canvas = getVizCanvas();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!;

  const desiredFft = Math.pow(2, Math.ceil(Math.log2(Math.max(opts.barCount, 32) * 4)));
  analyser.fftSize = Math.max(64, Math.min(32768, desiredFft));

  const freq = new Uint8Array(analyser.frequencyBinCount);
  const time = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(time);

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.shadowBlur = 0;

  switch (opts.mode) {
    case 'bars':        renderBars(ctx, freq, time, width, height, opts);        break;
    case 'scope':       renderScope(ctx, freq, time, width, height, opts);       break;
    case 'spectrogram': renderSpectrogram(ctx, freq, time, width, height, opts); break;
    case 'rings':       renderRings(ctx, freq, time, width, height, opts);       break;
    case 'mirror':      renderMirror(ctx, freq, time, width, height, opts);      break;
    case 'storm':       renderStorm(ctx, freq, time, width, height, opts);       break;
    case 'flux':        renderFlux(ctx, freq, time, width, height, opts);        break;
    case 'vortex':      renderVortex(ctx, freq, time, width, height, opts);      break;
    case 'attractor':   renderAttractor(ctx, freq, time, width, height, opts);   break;
    case 'petals':      renderPetals(ctx, freq, time, width, height, opts);      break;
    case 'scape':       renderScape(ctx, freq, time, width, height, opts);       break;
    case 'weave':       renderWeave(ctx, freq, time, width, height, opts);       break;
  }

  state.frame++;
  ctx.shadowBlur = 0;
  return canvas;
}

export function renderVisualizer(
  analyser: AnalyserNode, width: number, height: number, opts: VizOptions,
): ImageData {
  const canvas = drawVisualizerFrame(analyser, width, height, opts);
  return canvas.getContext('2d')!.getImageData(0, 0, width, height);
}

export function resetVisualizerState(): void {
  state.fluxP       = null; state.fluxTrail   = null;
  state.attrX = 0.1; state.attrY = 0.0;
  state.attrA = 1.7; state.attrB = 1.7; state.attrC = 0.6; state.attrD = 1.2;
  state.attrTrail   = null;
  state.petalTrail  = null;
  state.vortexP     = null; state.vortexTrail = null;
  state.weaveTrail  = null;
  state.stormTrail  = null;
  state.scopeTrail  = null;
  state.scapeHist   = null;
  state.sgramCanvas = null;
  state.frame       = 0;
  state.rotation    = 0;
}
