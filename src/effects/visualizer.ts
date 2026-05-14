import type { VisualizerParams } from '../types';
export type VizOptions = VisualizerParams;

// ─── State ────────────────────────────────────────────────────────────────────

interface TrailCanvas { c: HTMLCanvasElement; x: CanvasRenderingContext2D }

const state: {
  scopeTrail:  TrailCanvas | null;
  chromaTrail: TrailCanvas | null;
  peaks:       Float32Array | null;
  peakHold:    Float32Array | null;
  frame:       number;
} = { scopeTrail: null, chromaTrail: null, peaks: null, peakHold: null, frame: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function makeTrail(w: number, h: number, bgColor: string): TrailCanvas {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bgColor;
  x.fillRect(0, 0, w, h);
  return { c, x };
}

function ensureScopeTrail(w: number, h: number, bg: string): TrailCanvas {
  if (!state.scopeTrail || state.scopeTrail.c.width !== w || state.scopeTrail.c.height !== h) {
    state.scopeTrail = makeTrail(w, h, bg);
  }
  return state.scopeTrail;
}

function ensureChromaTrail(w: number, h: number, bg: string): TrailCanvas {
  if (!state.chromaTrail || state.chromaTrail.c.width !== w || state.chromaTrail.c.height !== h) {
    state.chromaTrail = makeTrail(w, h, bg);
  }
  return state.chromaTrail;
}

// ─── Scope ────────────────────────────────────────────────────────────────────
// Phosphor oscilloscope — waveform with afterglow trail

function renderScope(
  ctx: CanvasRenderingContext2D,
  time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const { c: tc, x } = ensureScopeTrail(w, h, opts.bgColor);
  const [br, bg, bb] = hexRgb(opts.bgColor);

  // Fade trail toward background
  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.04, opts.decay)})`;
  x.fillRect(0, 0, w, h);

  const mid = h / 2;
  if (opts.glow) { x.shadowBlur = opts.glowSize; x.shadowColor = opts.color; }
  x.strokeStyle = opts.color;
  x.lineWidth = opts.lineWidth;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.beginPath();
  const step = w / (time.length - 1);
  for (let i = 0; i < time.length; i++) {
    const px = i * step;
    const py = mid + ((time[i] / 128) - 1) * mid * opts.gain;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.stroke();
  x.shadowBlur = 0;

  // Subtle center hairline
  x.strokeStyle = opts.color;
  x.globalAlpha = 0.07;
  x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, mid); x.lineTo(w, mid); x.stroke();
  x.globalAlpha = 1;

  ctx.drawImage(tc, 0, 0);
}

// ─── Spectrum ─────────────────────────────────────────────────────────────────
// Sharp FFT bars with perceptual log mapping and peak-hold markers

function renderSpectrum(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const N = Math.min(opts.barCount, freq.length);
  const gap = 1;
  const barW = Math.max(1, Math.floor((w - gap * (N - 1)) / N));
  const [r1, g1, b1] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);

  if (!state.peaks || state.peaks.length !== N) {
    state.peaks    = new Float32Array(N);
    state.peakHold = new Float32Array(N).fill(0);
  }
  const p = state.peaks!;
  const ph = state.peakHold!;

  if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.5; ctx.shadowColor = opts.color; }

  for (let i = 0; i < N; i++) {
    const fi = Math.floor(Math.pow(i / N, 1.6) * freq.length * 0.88);
    const v  = Math.min(1, (freq[fi] / 255) * opts.gain);
    const bh = Math.max(1, Math.round(v * h));
    const bx = i * (barW + gap);
    const t  = i / Math.max(1, N - 1);
    const cr = Math.round(lerp(r1, r2, t));
    const cg = Math.round(lerp(g1, g2, t));
    const cb = Math.round(lerp(b1, b2, t));

    // Bar body (slight vertical fade)
    const grad = ctx.createLinearGradient(bx, h - bh, bx, h);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0.35)`);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, h - bh, barW, bh);

    // Peak hold
    if (v >= p[i]) { p[i] = v; ph[i] = 52; }
    else if (ph[i] > 0) { ph[i]--; }
    else { p[i] = Math.max(0, p[i] - 0.0025); }

    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.6)`;
    ctx.fillRect(bx, h - Math.round(p[i] * h) - 1, barW, 1);
  }
  ctx.shadowBlur = 0;
}

// ─── Radial ───────────────────────────────────────────────────────────────────
// Circular frequency spikes — minimal, symmetric, clean

function renderRadial(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const cx = w / 2, cy = h / 2;
  const N    = Math.min(opts.barCount, freq.length);
  const base = Math.min(w, h) * 0.18;
  const maxL = Math.min(w, h) * 0.31 * opts.gain;
  const [r1, g1, b1] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);

  // Base ring
  ctx.strokeStyle = opts.color;
  ctx.globalAlpha = 0.13;
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.arc(cx, cy, base, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.7; ctx.shadowColor = opts.color; }

  for (let i = 0; i < N; i++) {
    const fi  = Math.floor(Math.pow(i / N, 1.4) * freq.length * 0.85);
    const v   = Math.min(1, freq[fi] / 255);
    if (v < 0.025) continue;
    const len   = v * maxL;
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const cos   = Math.cos(angle), sin = Math.sin(angle);
    const x1    = cx + cos * base,       y1 = cy + sin * base;
    const x2    = cx + cos * (base + len), y2 = cy + sin * (base + len);
    const t     = i / Math.max(1, N - 1);

    ctx.strokeStyle = `rgba(${Math.round(lerp(r1,r2,t))},${Math.round(lerp(g1,g2,t))},${Math.round(lerp(b1,b2,t))},0.88)`;
    ctx.lineWidth = opts.lineWidth;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

// ─── Tunnel ───────────────────────────────────────────────────────────────────
// Expanding concentric rectangles — vortex / depth illusion

function renderTunnel(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const cx = w / 2, cy = h / 2;
  const N   = 20;

  // Bass drives expansion speed
  const bassEnd = Math.max(1, Math.floor(freq.length * 0.06));
  let bass = 0;
  for (let i = 0; i < bassEnd; i++) bass += freq[i];
  bass = (bass / bassEnd) / 255;

  const speed = 0.004 + bass * opts.gain * 0.016;
  const phase = (state.frame * speed) % 1;
  const [r1, g1, b1] = hexRgb(opts.color);
  const [r2, g2, b2] = hexRgb(opts.color2);

  if (opts.glow) { ctx.shadowBlur = opts.glowSize * 0.45; ctx.shadowColor = opts.color; }

  for (let i = 0; i < N; i++) {
    const p     = ((phase + i / N) % 1);           // 0 = center, 1 = edge
    const scale = Math.pow(p, 0.65);               // ease-out: inner rects denser
    const rw    = scale * w * 0.97;
    const rh    = scale * h * 0.97;

    const fi    = Math.floor((i / N) * freq.length * 0.75);
    const v     = Math.min(1, (freq[fi] / 255) * opts.gain);
    const alpha = (1 - p) * 0.55 * (0.15 + v * 0.85);
    if (alpha < 0.01) continue;

    ctx.strokeStyle = `rgba(${Math.round(lerp(r1,r2,p))},${Math.round(lerp(g1,g2,p))},${Math.round(lerp(b1,b2,p))},${alpha})`;
    ctx.lineWidth   = opts.lineWidth * Math.max(0.4, 1.8 - p * 1.4);
    ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
  }
  ctx.shadowBlur = 0;
}

// ─── Glitch ───────────────────────────────────────────────────────────────────
// Chromatic horizontal-slice displacement — digital corruption aesthetic

function renderGlitch(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const N        = 54;
  const stripH   = h / N;
  const maxShift = w * 0.24 * opts.gain;
  const [r1, g1, b1] = hexRgb(opts.color);

  // Ghost waveform (very faint)
  ctx.strokeStyle = `rgba(${r1},${g1},${b1},0.09)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  const mid  = h / 2;
  const step = w / (time.length - 1);
  for (let i = 0; i < time.length; i++) {
    const px = i * step;
    const py = mid + ((time[i] / 128) - 1) * mid * opts.gain;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  for (let s = 0; s < N; s++) {
    const y     = s * stripH;
    const band  = Math.floor((s / N) * freq.length * 0.8);
    const v     = freq[band] / 255;
    if (v < 0.045) continue;

    const shift  = (v - 0.5) * 2 * maxShift;
    const lineH  = Math.max(1, stripH * 0.5);
    const lineY  = y + (stripH - lineH) / 2;
    const barW   = w * Math.pow(v, 0.65) * 1.15;
    const alpha  = 0.3 + v * 0.6;
    const chroma = 7 * opts.gain;

    ctx.fillStyle = `rgba(${r1},16,40,${alpha * 0.6})`;
    ctx.fillRect(shift + chroma, lineY, barW, lineH * 0.45);

    ctx.fillStyle = `rgba(16,16,${b1},${alpha * 0.6})`;
    ctx.fillRect(shift - chroma, lineY, barW, lineH * 0.45);

    ctx.fillStyle = `rgba(${r1},${g1},${b1},${alpha})`;
    ctx.fillRect(shift, lineY, barW, lineH);

    if (v > 0.88) {
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fillRect(0, y, w, stripH);
    }
  }
}

// ─── Chroma ───────────────────────────────────────────────────────────────────
// RGB-split XY vector scope with afterglow (Lissajous + chromatic aberration)

function renderChroma(
  ctx: CanvasRenderingContext2D,
  time: Uint8Array,
  w: number, h: number,
  opts: VizOptions,
): void {
  const { c: tc, x } = ensureChromaTrail(w, h, opts.bgColor);
  const [br, bg, bb] = hexRgb(opts.bgColor);

  // Fade trail
  x.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.04, opts.decay)})`;
  x.fillRect(0, 0, w, h);

  const cx  = w / 2, cy = h / 2;
  const maxR = Math.min(w, h) * 0.42 * opts.gain;
  const N    = time.length;
  const off  = Math.max(1, Math.floor(N / 4));

  x.lineWidth = opts.lineWidth;
  x.lineJoin  = 'round';
  x.lineCap   = 'round';

  // Three color channels with slight phase offsets
  const channels: [number, number, number, number][] = [
    [220, 20,  80,  4],   // crimson
    [20,  200, 120, 0],   // cyan-green
    [40,  80,  255, -4],  // electric blue
  ];

  for (const [cr, cg, cb, phOff] of channels) {
    if (opts.glow) { x.shadowBlur = opts.glowSize * 0.4; x.shadowColor = `rgb(${cr},${cg},${cb})`; }
    x.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
    x.beginPath();
    for (let i = 0; i < N - off; i++) {
      const xi = time[(i + phOff + N) % N];
      const yi = time[(i + off + phOff + N) % N];
      const px = cx + ((xi / 128) - 1) * maxR;
      const py = cy + ((yi / 128) - 1) * maxR;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
  }
  x.shadowBlur = 0;

  // Crosshairs (barely visible)
  x.strokeStyle = opts.color;
  x.globalAlpha = 0.06;
  x.lineWidth   = 1;
  x.beginPath(); x.moveTo(cx, 0);  x.lineTo(cx, h);  x.stroke();
  x.beginPath(); x.moveTo(0, cy);  x.lineTo(w, cy);  x.stroke();
  x.globalAlpha = 1;

  ctx.drawImage(tc, 0, 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

let vizCanvas: HTMLCanvasElement | null = null;
function getVizCanvas() {
  if (!vizCanvas) vizCanvas = document.createElement('canvas');
  return vizCanvas;
}

/**
 * Render one visualizer frame to an offscreen canvas.
 * Use ctx.drawImage(result, 0, 0) for the fast path (no pixel readback).
 */
export function drawVisualizerFrame(
  analyser: AnalyserNode,
  width: number,
  height: number,
  opts: VizOptions,
): HTMLCanvasElement {
  const canvas = getVizCanvas();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width  = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!;

  // Tune analyser resolution to barCount
  const desiredFft = Math.pow(2, Math.ceil(Math.log2(Math.max(opts.barCount, 32) * 4)));
  analyser.fftSize = Math.max(64, Math.min(32768, desiredFft));

  const bufLen = analyser.frequencyBinCount;
  const freq   = new Uint8Array(bufLen);
  const time   = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(time);

  // Clear canvas with background color
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.shadowBlur = 0;

  switch (opts.mode) {
    case 'scope':    renderScope(ctx, time, width, height, opts);                break;
    case 'spectrum': renderSpectrum(ctx, freq, width, height, opts);             break;
    case 'radial':   renderRadial(ctx, freq, width, height, opts);               break;
    case 'tunnel':   renderTunnel(ctx, freq, width, height, opts);               break;
    case 'glitch':   renderGlitch(ctx, freq, time, width, height, opts);         break;
    case 'chroma':   renderChroma(ctx, time, width, height, opts);               break;
  }

  state.frame++;
  ctx.shadowBlur = 0;
  return canvas;
}

/** Returns ImageData for the effect processing pipeline. */
export function renderVisualizer(
  analyser: AnalyserNode,
  width: number,
  height: number,
  opts: VizOptions,
): ImageData {
  const canvas = drawVisualizerFrame(analyser, width, height, opts);
  return canvas.getContext('2d')!.getImageData(0, 0, width, height);
}

export function resetVisualizerState(): void {
  state.scopeTrail  = null;
  state.chromaTrail = null;
  state.peaks       = null;
  state.peakHold    = null;
  state.frame       = 0;
}
