import type { VizMode } from '../types';

export interface VizOptions {
  mode: VizMode;
  barCount: number;
  color: string;
  color2: string;
  bgColor: string;
  gradient: boolean;
  symmetric: boolean;
  smooth: number;
  lineWidth: number;
  glow: boolean;
  glowSize: number;
  fill: boolean;
  scale: number;
}

// Persistent render state (smoothed freq data + spectrogram scroll buffer)
const state: {
  smoothed: Float32Array | null;
  spectroCanvas: HTMLCanvasElement | null;
  spectroCtx: CanvasRenderingContext2D | null;
} = { smoothed: null, spectroCanvas: null, spectroCtx: null };

// Persistent offscreen canvas for all modes
let vizCanvas: HTMLCanvasElement | null = null;
function getVizCanvas() {
  if (!vizCanvas) vizCanvas = document.createElement('canvas');
  return vizCanvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function makeLinearGradient(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  c1: string, c2: string
): CanvasGradient {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, c2);
  g.addColorStop(1, c1);
  return g;
}

// ─── Bars ─────────────────────────────────────────────────────────────────────

function renderBars(
  ctx: CanvasRenderingContext2D,
  freq: Float32Array,
  w: number, h: number,
  opts: VizOptions
) {
  const count = Math.min(opts.barCount, freq.length);
  const gap = Math.max(1, Math.floor(w / count * 0.15));
  const barW = Math.max(1, (w - gap * count) / count);
  const halfH = opts.symmetric ? h / 2 : h;

  for (let i = 0; i < count; i++) {
    const v = Math.min(1, (freq[i] / 255) * opts.scale);
    const barH = v * halfH;
    const x = i * (barW + gap);
    const y = opts.symmetric ? halfH - barH : h - barH;

    ctx.fillStyle = opts.gradient
      ? makeLinearGradient(ctx, x, y + barH, x, y, opts.color, opts.color2)
      : opts.color;

    ctx.fillRect(x, y, barW, barH);
    if (opts.symmetric) ctx.fillRect(x, halfH, barW, barH);
  }
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

function renderWaveform(
  ctx: CanvasRenderingContext2D,
  time: Uint8Array,
  w: number, h: number,
  opts: VizOptions
) {
  const mid = h / 2;
  ctx.strokeStyle = opts.gradient
    ? makeLinearGradient(ctx, 0, 0, w, 0, opts.color, opts.color2)
    : opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const step = w / (time.length - 1);
  for (let i = 0; i < time.length; i++) {
    const x = i * step;
    const y = mid + ((time[i] / 128) - 1) * mid * opts.scale;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (opts.fill) {
    ctx.lineTo(w, mid);
    ctx.lineTo(0, mid);
    ctx.closePath();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = opts.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ─── Radial ───────────────────────────────────────────────────────────────────

function renderRadial(
  ctx: CanvasRenderingContext2D,
  freq: Float32Array,
  w: number, h: number,
  opts: VizOptions
) {
  const cx = w / 2;
  const cy = h / 2;
  const baseR = Math.min(w, h) * 0.25;
  const count = Math.min(opts.barCount, freq.length);

  // Base ring
  ctx.beginPath();
  ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
  ctx.strokeStyle = opts.color;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const v = Math.min(1, (freq[i] / 255) * opts.scale);
    const len = v * baseR;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = cx + cos * baseR;
    const y1 = cy + sin * baseR;
    const x2 = cx + cos * (baseR + len);
    const y2 = cy + sin * (baseR + len);

    ctx.strokeStyle = opts.gradient
      ? makeLinearGradient(ctx, x1, y1, x2, y2, opts.color, opts.color2)
      : opts.color;
    ctx.lineWidth = opts.lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// ─── Spectrogram ──────────────────────────────────────────────────────────────

function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  freq: Float32Array,
  w: number, h: number,
  opts: VizOptions
) {
  // Lazy-init the scrolling spectrogram canvas
  if (!state.spectroCanvas || state.spectroCanvas.width !== w || state.spectroCanvas.height !== h) {
    state.spectroCanvas = document.createElement('canvas');
    state.spectroCanvas.width = w;
    state.spectroCanvas.height = h;
    state.spectroCtx = state.spectroCanvas.getContext('2d')!;
    state.spectroCtx.fillStyle = opts.bgColor;
    state.spectroCtx.fillRect(0, 0, w, h);
  }
  const sc = state.spectroCtx!;

  // Scroll left by 1px
  sc.drawImage(state.spectroCanvas, -1, 0);
  sc.fillStyle = opts.bgColor;
  sc.fillRect(w - 1, 0, 1, h);

  // Draw new rightmost column
  const [r1, g1, b1] = hexToRgb(opts.color);
  const [r2, g2, b2] = hexToRgb(opts.color2);
  for (let y = 0; y < h; y++) {
    const fi = Math.floor((1 - y / h) * (freq.length - 1));
    const v = Math.min(1, (freq[fi] / 255) * opts.scale);
    if (v < 0.01) continue;
    sc.fillStyle = `rgba(${Math.round(r1 * v + r2 * (1 - v))},${Math.round(g1 * v + g2 * (1 - v))},${Math.round(b1 * v + b2 * (1 - v))},${v})`;
    sc.fillRect(w - 1, y, 1, 1);
  }

  ctx.drawImage(state.spectroCanvas, 0, 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function renderVisualizer(
  analyser: AnalyserNode,
  width: number,
  height: number,
  opts: VizOptions
): ImageData {
  const canvas = getVizCanvas();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!;

  // Dynamic fftSize based on barCount
  const desiredFft = Math.pow(2, Math.ceil(Math.log2(opts.barCount * 4)));
  analyser.fftSize = Math.max(32, Math.min(32768, desiredFft));
  const bufLen = analyser.frequencyBinCount;

  const freqData = new Uint8Array(bufLen);
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  // EMA smoothing
  if (!state.smoothed || state.smoothed.length !== bufLen) {
    state.smoothed = new Float32Array(bufLen);
  }
  for (let i = 0; i < bufLen; i++) {
    state.smoothed[i] = state.smoothed[i] * opts.smooth + freqData[i] * (1 - opts.smooth);
  }

  // Background
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, width, height);

  // Glow
  if (opts.glow) {
    ctx.shadowBlur = opts.glowSize;
    ctx.shadowColor = opts.color;
  } else {
    ctx.shadowBlur = 0;
  }

  switch (opts.mode) {
    case 'bars':        renderBars(ctx, state.smoothed, width, height, opts);       break;
    case 'waveform':    renderWaveform(ctx, timeData, width, height, opts);          break;
    case 'radial':      renderRadial(ctx, state.smoothed, width, height, opts);     break;
    case 'spectrogram': renderSpectrogram(ctx, state.smoothed, width, height, opts); break;
  }

  ctx.shadowBlur = 0;
  return ctx.getImageData(0, 0, width, height);
}

export function resetVisualizerState() {
  state.smoothed = null;
  state.spectroCanvas = null;
  state.spectroCtx = null;
}
