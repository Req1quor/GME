// ─── Topographic Contour Lines effect ─────────────────────────────────────────
// Quantizes the image into N luminosity bands and draws iso-contour lines
// at each band boundary — like a topographic relief map.
// Enhanced: pre-blur for smooth contours, glow, major lines, micro-noise.

export interface TopoParams {
  bands: number;              // 4–50  number of luminosity bands
  lineColor: string;          // hex
  bgColor: string;            // hex background (ignored if transparent)
  transparent: boolean;       // if true, original image shows through
  lineWidth: number;          // 0.5–4
  colorize: boolean;          // fill each band with a tinted palette color
  colorPalette: 'mono' | 'warm' | 'cool' | 'neon' | 'earth' | 'ocean' | 'sunset';
  contrast: number;           // -50 to 100
  brightness: number;         // -50 to 50
  blur: number;               // 0–8  box blur before quantization (smoother contours)
  glow: number;               // 0–20 line glow (canvas shadowBlur)
  glowColor: string;          // hex glow color (defaults to lineColor)
  majorLines: number;         // 0–10 every N-th band gets a major (thicker) line. 0 = off
  majorLineMultiplier: number;// 1.5–5 how much thicker major lines are
  noiseAmount: number;        // 0–20 micro-noise on luminance input (organic variation)
}



// Band fill palettes: [R, G, B] stops
const FILL_PALETTES: Record<string, number[][]> = {
  mono:   [[20,20,25],  [200,200,210]],
  warm:   [[20,5,5],    [80,20,0],    [200,80,20],  [255,180,60], [255,240,180]],
  cool:   [[5,5,30],    [0,40,120],   [0,100,200],  [40,200,255], [180,240,255]],
  neon:   [[10,0,30],   [80,0,180],   [180,0,200],  [255,60,0],   [255,240,0]],
  earth:  [[20,12,5],   [60,35,10],   [100,70,20],  [160,130,60], [220,200,140]],
  ocean:  [[0,8,30],    [0,30,80],    [0,80,140],   [0,140,180],  [0,210,220],  [140,240,255]],
  sunset: [[10,0,20],   [80,10,60],   [200,40,20],  [255,120,0],  [255,200,30], [255,240,180]],
};

function lerpPaletteColor(stops: number[][], t: number): [number, number, number] {
  const n = stops.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function pcgHash(v: number): number {
  let x = (v * 747796405 + 2891336453) >>> 0;
  x = (((x >>> 28) ^ x) * 277803737) >>> 0;
  return ((x >>> 22) ^ x) >>> 0;
}

export function applyTopo(src: ImageData, p: TopoParams): ImageData {
  const { width, height, data } = src;

  // ── Build luminosity map ──
  let lum = new Float32Array(width * height);
  const brightnessF = (p.brightness ?? 0) / 100;
  const contrastF   = ((p.contrast ?? 0) + 100) / 100;
  for (let i = 0; i < data.length; i += 4) {
    let l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    l += brightnessF;
    l  = (l - 0.5) * contrastF + 0.5;
    lum[i >> 2] = Math.max(0, Math.min(1, l));
  }

  // ── Micro-noise (organic terrain variation) ──
  const noiseF = (p.noiseAmount ?? 0) / 100;
  if (noiseF > 0) {
    for (let j = 0; j < lum.length; j++) {
      const x = j % width, y = Math.floor(j / width);
      const h = pcgHash(x * 1973 + y * 9277 + 77777);
      const n = ((h & 0xffff) / 0xffff) * 2 - 1;
      lum[j] = Math.max(0, Math.min(1, lum[j] + n * noiseF * 0.07));
    }
  }

  // ── Box blur (smooth contours — important for organic-looking topo lines) ──
  const blurR = Math.round(p.blur ?? 0);
  if (blurR > 0) {
    const tmp = new Float32Array(lum.length);
    // Horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0, c = 0;
        for (let dx = -blurR; dx <= blurR; dx++) {
          const nx = x + dx; if (nx < 0 || nx >= width) continue;
          s += lum[y * width + nx]; c++;
        }
        tmp[y * width + x] = s / c;
      }
    }
    // Vertical
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let s = 0, c = 0;
        for (let dy = -blurR; dy <= blurR; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= height) continue;
          s += tmp[ny * width + x]; c++;
        }
        lum[y * width + x] = s / c;
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const bands      = Math.max(2, p.bands);
  const fillStops  = FILL_PALETTES[p.colorPalette] ?? FILL_PALETTES.mono;
  const [lr, lg, lb] = hexToRgb(p.lineColor ?? '#ffffff');
  const glowPx     = p.glow ?? 0;
  const glowHex    = p.glowColor ?? p.lineColor ?? '#ffffff';
  const majorN     = p.majorLines ?? 0;
  const majorMult  = p.majorLineMultiplier ?? 2;

  // ── Fill bands ──
  if (!p.transparent) {
    if (p.colorize) {
      const bandImg = new ImageData(width, height);
      for (let j = 0; j < lum.length; j++) {
        const band = Math.min(bands - 1, Math.floor(lum[j] * bands));
        const t    = band / (bands - 1);
        const [fr, fg, fb] = lerpPaletteColor(fillStops, t);
        const pi = j * 4;
        bandImg.data[pi]     = Math.round(fr);
        bandImg.data[pi + 1] = Math.round(fg);
        bandImg.data[pi + 2] = Math.round(fb);
        bandImg.data[pi + 3] = 255;
      }
      ctx.putImageData(bandImg, 0, 0);
    } else {
      ctx.fillStyle = p.bgColor ?? '#000000';
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.putImageData(src, 0, 0);
  }

  // ── Draw contour lines ──
  // Group bands: for each band 0..bands-1 draw the boundary between band and band+1
  // Detect transitions horizontally and vertically, group into runs

  const drawContourRun = (band: number, runs: Array<{ x1: number; y1: number; x2: number; y2: number }>) => {
    const t       = band / (bands - 1);
    const isMajor = majorN > 0 && (band % majorN === 0);
    const lw      = p.lineWidth * (isMajor ? majorMult : 1);

    if (glowPx > 0) {
      ctx.shadowBlur  = glowPx * (isMajor ? 1.5 : 1);
      ctx.shadowColor = glowHex;
    }

    let lineR = lr, lineG = lg, lineB = lb;
    if (p.colorize) {
      // Make contour lines slightly brighter than the band fill
      const [fr, fg, fb] = lerpPaletteColor(fillStops, t);
      lineR = Math.min(255, Math.round(fr * 1.8));
      lineG = Math.min(255, Math.round(fg * 1.8));
      lineB = Math.min(255, Math.round(fb * 1.8));
    }

    ctx.strokeStyle = `rgb(${lineR},${lineG},${lineB})`;
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'round';

    for (const r of runs) {
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
    }
  };

  // Collect horizontal runs per band
  const hRuns: Map<number, Array<{ x1: number; y1: number; x2: number; y2: number }>> = new Map();
  for (let y = 0; y < height; y++) {
    let inLine = false, lineStartX = 0, lineBand = 0;
    for (let x = 1; x < width; x++) {
      const pb2 = Math.floor(lum[y * width + (x - 1)] * bands);
      const cb2 = Math.floor(lum[y * width + x] * bands);
      const isEdge = pb2 !== cb2;
      if (isEdge && !inLine) {
        inLine = true; lineStartX = x; lineBand = Math.min(pb2, cb2);
      } else if (!isEdge && inLine) {
        if (!hRuns.has(lineBand)) hRuns.set(lineBand, []);
        hRuns.get(lineBand)!.push({ x1: lineStartX, y1: y, x2: x, y2: y });
        inLine = false;
      }
    }
  }

  // Collect vertical runs per band
  const vRuns: Map<number, Array<{ x1: number; y1: number; x2: number; y2: number }>> = new Map();
  for (let x = 0; x < width; x++) {
    let inLine = false, lineStartY = 0, lineBand = 0;
    for (let y = 1; y < height; y++) {
      const pb2 = Math.floor(lum[(y - 1) * width + x] * bands);
      const cb2 = Math.floor(lum[y       * width + x] * bands);
      const isEdge = pb2 !== cb2;
      if (isEdge && !inLine) {
        inLine = true; lineStartY = y; lineBand = Math.min(pb2, cb2);
      } else if (!isEdge && inLine) {
        if (!vRuns.has(lineBand)) vRuns.set(lineBand, []);
        vRuns.get(lineBand)!.push({ x1: x, y1: lineStartY, x2: x, y2: y });
        inLine = false;
      }
    }
  }

  // Draw all runs, minor lines first, then major lines on top
  const allBands = Array.from(new Set([...hRuns.keys(), ...vRuns.keys()])).sort((a, b) => a - b);
  for (const band of allBands) {
    const runs = [...(hRuns.get(band) ?? []), ...(vRuns.get(band) ?? [])];
    if (runs.length > 0) drawContourRun(band, runs);
  }

  return ctx.getImageData(0, 0, width, height);
}
