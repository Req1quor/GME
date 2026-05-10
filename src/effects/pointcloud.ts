// ─── Point Cloud effect ───────────────────────────────────────────────────────
// Samples the image on a regular (or jittered) grid and renders each sample
// as a configurable shape whose size is driven by luminosity.
// Supports 5 shapes, 5 color modes, glow, connect lines, and size noise.

export interface PointCloudParams {
  gridSize: number;         // 3–40  px spacing
  minDotSize: number;       // 0.5–5
  maxDotSize: number;       // 1–20
  jitter: number;           // 0–1   random offset per dot
  colorMode: 'original' | 'mono' | 'accent' | 'luminance' | 'heatmap';
  accentColor: string;      // hex
  bgColor: string;          // hex
  invert: boolean;          // invert luminosity → size relationship
  seed: number;
  shape: 'circle' | 'square' | 'cross' | 'ring' | 'diamond';
  glow: number;             // 0–20  shadowBlur px
  opacity: number;          // 10–100 dot opacity (%)
  sizeNoise: number;        // 0–1   random size variation independent of luminosity
  connectLines: boolean;    // connect grid neighbours with lines
  connectThreshold: number; // 1–3   grid multiplier (max distance in grid cells)
  connectOpacity: number;   // 0–100 line opacity
}

function pcgHash(v: number): number {
  let x = (v * 747796405 + 2891336453) >>> 0;
  x = (((x >>> 28) ^ x) * 277803737) >>> 0;
  return ((x >>> 22) ^ x) >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

// Thermal false-color for 'heatmap' colorMode
function lumToHeatmap(t: number): [number, number, number] {
  const stops = [[0,0,4],[40,11,84],[159,42,99],[212,72,66],[245,125,21],[252,255,164]];
  const n = stops.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: PointCloudParams['shape'],
  cx: number, cy: number, r: number
) {
  if (r < 0.3) return;
  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'square':
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'cross': {
      const t = Math.max(0.5, r * 0.35);
      ctx.fillRect(cx - r, cy - t, r * 2, t * 2);
      ctx.fillRect(cx - t, cy - r, t * 2, r * 2);
      break;
    }
    case 'ring':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, Math.max(0.3, r * 0.45), 0, Math.PI * 2, true);
      ctx.fill();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(cx,     cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx,     cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

export function applyPointCloud(src: ImageData, p: PointCloudParams): ImageData {
  const { width, height, data } = src;

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = p.bgColor ?? '#000000';
  ctx.fillRect(0, 0, width, height);

  const grid     = Math.max(2, p.gridSize);
  const minDot   = p.minDotSize;
  const maxDot   = p.maxDotSize;
  const jitter   = p.jitter * grid * 0.45;
  const [ar, ag, ab] = hexToRgb(p.accentColor ?? '#a855f7');
  const glowPx   = p.glow ?? 0;
  const opacF    = (p.opacity ?? 100) / 100;
  const sizeNF   = p.sizeNoise ?? 0;
  const shape    = p.shape ?? 'circle';
  const connectT = p.connectThreshold ?? 1.5;
  const connectO = (p.connectOpacity ?? 50) / 100;

  ctx.globalAlpha = opacF;

  if (glowPx > 0) {
    ctx.shadowBlur  = glowPx;
    ctx.shadowColor = p.accentColor ?? '#ffffff';
  }

  // Store dots for connect-line pass
  const dots: Array<{ px: number; py: number; r: number; fillR: number; fillG: number; fillB: number }> = [];

  let seedCounter = p.seed;

  for (let gy = 0; gy <= height; gy += grid) {
    for (let gx = 0; gx <= width; gx += grid) {
      const h1 = pcgHash(seedCounter++);
      const h2 = pcgHash(seedCounter++);
      const h3 = pcgHash(seedCounter++);
      const jx = ((h1 & 0xFFFF) / 0xFFFF - 0.5) * 2 * jitter;
      const jy = ((h2 & 0xFFFF) / 0xFFFF - 0.5) * 2 * jitter;

      const sx = Math.max(0, Math.min(width  - 1, Math.round(gx + jx)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(gy + jy)));

      const pi = (sy * width + sx) * 4;
      const r = data[pi], g = data[pi + 1], b = data[pi + 2];
      let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (p.invert) lum = 1 - lum;

      // Size noise
      const sNoise = sizeNF > 0 ? ((h3 & 0xFFFF) / 0xFFFF) * sizeNF : 0;
      const radius = minDot + (lum * (1 - sNoise) + sNoise * (h3 & 0xFF) / 255) * (maxDot - minDot);
      if (radius < 0.25) continue;

      let fillR = r, fillG = g, fillB = b;
      if (p.colorMode === 'mono') {
        const v = Math.round(lum * 255);
        fillR = v; fillG = v; fillB = v;
      } else if (p.colorMode === 'accent') {
        fillR = Math.round(ar * lum + ar * 0.08);
        fillG = Math.round(ag * lum + ag * 0.08);
        fillB = Math.round(ab * lum + ab * 0.08);
      } else if (p.colorMode === 'luminance') {
        // Gradient: bg color at 0 → accent at 1
        const [br, bg2, bb] = hexToRgb(p.bgColor ?? '#000000');
        fillR = Math.round(br + (ar - br) * lum);
        fillG = Math.round(bg2 + (ag - bg2) * lum);
        fillB = Math.round(bb + (ab - bb) * lum);
      } else if (p.colorMode === 'heatmap') {
        const [hr, hg, hb] = lumToHeatmap(lum);
        fillR = Math.round(hr); fillG = Math.round(hg); fillB = Math.round(hb);
      }

      ctx.fillStyle = `rgb(${fillR},${fillG},${fillB})`;
      drawShape(ctx, shape, gx + jx, gy + jy, radius);

      if (p.connectLines) {
        dots.push({ px: gx + jx, py: gy + jy, r: radius, fillR, fillG, fillB });
      }
    }
  }

  // ── Connect-line pass ──
  if (p.connectLines && dots.length > 1) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = opacF * connectO;
    const maxDist = grid * connectT;
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].px - dots[j].px;
        const dy = dots[i].py - dots[j].py;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDist) continue;
        const fade = 1 - d / maxDist;
        ctx.strokeStyle = `rgba(${dots[i].fillR},${dots[i].fillG},${dots[i].fillB},${fade})`;
        ctx.lineWidth   = 0.5;
        ctx.beginPath();
        ctx.moveTo(dots[i].px, dots[i].py);
        ctx.lineTo(dots[j].px, dots[j].py);
        ctx.stroke();
      }
    }
  }

  return ctx.getImageData(0, 0, width, height);
}
