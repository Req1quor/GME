// ─── Thermal / Heatmap effect ────────────────────────────────────────────────
// Maps image luminosity to a false-color palette, simulating thermal cameras
// or scientific data visualisations.

export interface ThermalParams {
  palette: 'iron' | 'plasma' | 'thermal' | 'cool' | 'spectrum' | 'inferno' | 'rainbow' | 'greys' | 'viridis' | 'magma';
  contrast: number;          // -50 to 100
  brightness: number;        // -50 to 50
  blendOriginal: number;     // 0–100
  invert: boolean;
  noiseAmount: number;       // 0–30  thermal sensor block noise
  edgeEnhance: number;       // 0–100 Sobel thermal-gradient overlay
  edgeColor: string;         // hex
  blur: number;              // 0–6   box blur (lower thermal resolution)
  isotherms: number;         // 0–15  visible isoline count
  isothermColor: string;     // hex
  histStretch: boolean;      // auto-stretch input luminance range
}

// Each palette is defined as [R, G, B] stops, evenly distributed 0→1
const PALETTES: Record<ThermalParams['palette'], number[][]> = {
  iron: [
    [0,   0,   0],   [30,  0,   80],  [80,  0,  160],
    [160, 0,  140],  [220, 30,   0],  [255,100,   0],
    [255,200,   0],  [255,255, 180],
  ],
  plasma: [
    [13,  8, 135], [84,  2, 163], [139, 10, 165], [185, 50, 137],
    [219, 92, 104], [244,136,  73], [254,188,  43], [240,249,  33],
  ],
  thermal: [
    [0,  0,  80], [0,  60, 180], [0, 180, 200], [0,  240,  80],
    [160,240,  0], [255,200,  0], [255, 80,   0], [255,  0,   0], [255,200,200],
  ],
  cool: [
    [0,  0,  0], [0,  0,  80], [0,  30, 180], [0, 120, 255],
    [0, 220, 240], [80,255, 200], [180,255, 160], [255,255,255],
  ],
  spectrum: [
    [60,  0,180], [100, 0,220], [0,  50,255], [0, 200,200],
    [0, 240, 80], [200,255,  0], [255,200,  0], [255, 80,  0], [200,  0,  0],
  ],
  inferno: [
    [0,  0,  4], [40, 11, 84], [101, 21,110], [159, 42, 99],
    [212, 72, 66], [245,125, 21], [250,193, 39], [252,255,164],
  ],
  rainbow: [
    [148,  0, 211], [75,  0, 130], [0,   0, 255],
    [0,  128,   0], [255,255,  0], [255,127,  0], [255,  0,  0],
  ],
  greys: [
    [0, 0, 0], [255, 255, 255],
  ],
  viridis: [
    [68,  1, 84], [72, 40,120], [62, 83,161], [49,124,183],
    [38,166,173], [53,183,121], [110,206, 88], [180,222, 44], [253,231, 37],
  ],
  magma: [
    [0,  0,  4], [28, 16, 68], [79, 18,123], [129, 37,129],
    [181, 54,122], [229, 89, 104], [251,143, 96], [254,201,141], [252,253,191],
  ],
};

function lerpColor(stops: number[][], t: number): [number, number, number] {
  const n = stops.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

export function applyThermal(src: ImageData, p: ThermalParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od = out.data;
  const stops     = PALETTES[p.palette] ?? PALETTES.iron;
  const brightF   = (p.brightness ?? 0) / 100;
  const contrastF = ((p.contrast ?? 0) + 100) / 100;
  const blend     = (p.blendOriginal ?? 0) / 100;
  const noiseF    = (p.noiseAmount ?? 0) / 100;

  // ── 1. Build luminance map ──
  let lum = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    lum[i >> 2] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }

  // ── 2. Histogram stretch ──
  if (p.histStretch) {
    let mn = 1, mx = 0;
    for (let j = 0; j < lum.length; j++) {
      if (lum[j] < mn) mn = lum[j];
      if (lum[j] > mx) mx = lum[j];
    }
    const range = mx - mn || 1;
    for (let j = 0; j < lum.length; j++) lum[j] = (lum[j] - mn) / range;
  }

  // ── 3. Brightness / contrast ──
  for (let j = 0; j < lum.length; j++) {
    let l = lum[j] + brightF;
    l = (l - 0.5) * contrastF + 0.5;
    lum[j] = Math.max(0, Math.min(1, l));
  }

  // ── 4. Box blur (thermal sensor lower spatial resolution) ──
  const blurR = Math.round(p.blur ?? 0);
  if (blurR > 0) {
    const tmp = new Float32Array(lum.length);
    // Horizontal
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dx = -blurR; dx <= blurR; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) { s += lum[y * w + nx]; c++; }
        }
        tmp[y * w + x] = s / c;
      }
    }
    // Vertical
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0, c = 0;
        for (let dy = -blurR; dy <= blurR; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h) { s += tmp[ny * w + x]; c++; }
        }
        lum[y * w + x] = s / c;
      }
    }
  }

  // ── 5. Invert ──
  if (p.invert) {
    for (let j = 0; j < lum.length; j++) lum[j] = 1 - lum[j];
  }

  // ── 6. Sobel edge map ──
  const edgeF = (p.edgeEnhance ?? 0) / 100;
  const edges = edgeF > 0 ? new Float32Array(lum.length) : null;
  if (edges) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = (
          -lum[(y-1)*w+(x-1)] - 2*lum[y*w+(x-1)] - lum[(y+1)*w+(x-1)]
          +lum[(y-1)*w+(x+1)] + 2*lum[y*w+(x+1)] + lum[(y+1)*w+(x+1)]
        );
        const gy = (
          -lum[(y-1)*w+(x-1)] - 2*lum[(y-1)*w+x] - lum[(y-1)*w+(x+1)]
          +lum[(y+1)*w+(x-1)] + 2*lum[(y+1)*w+x] + lum[(y+1)*w+(x+1)]
        );
        edges[y * w + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 4);
      }
    }
  }

  // ── 7. Isotherm lines ──
  const numIso = Math.round(p.isotherms ?? 0);
  const isoMap = numIso > 0 ? new Uint8Array(lum.length) : null;
  if (isoMap) {
    const step = 1 / (numIso + 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const band = Math.floor(lum[idx] / step);
        const isEdge = (
          (x + 1 < w && Math.floor(lum[idx + 1] / step) !== band) ||
          (y + 1 < h && Math.floor(lum[(y + 1) * w + x] / step) !== band)
        );
        if (isEdge) isoMap[idx] = 1;
      }
    }
  }

  // Parse overlay colors
  const hexToRgb = (hex: string): [number, number, number] => {
    const v = parseInt((hex ?? '#ffffff').replace('#', ''), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  };
  const [er, eg, eb] = hexToRgb(p.edgeColor ?? '#ffffff');
  const [ir, ig, ib] = hexToRgb(p.isothermColor ?? '#aaffee');

  // ── 8. PCG hash for block noise ──
  const pcg = (v: number) => {
    let x = (v * 747796405 + 2891336453) >>> 0;
    x = (((x >>> 28) ^ x) * 277803737) >>> 0;
    return ((x >>> 22) ^ x) >>> 0;
  };

  // ── 9. Render ──
  for (let j = 0; j < w * h; j++) {
    const i = j * 4;
    let l = lum[j];

    // Thermal block noise (2×2 px clusters, characteristic of IRFPA sensors)
    if (noiseF > 0) {
      const bx = (j % w) >> 1;
      const by = Math.floor(j / w) >> 1;
      const hash = pcg(bx * 1973 + by * 9277 + 12345);
      const n = ((hash & 0xffff) / 0xffff) * 2 - 1;
      l = Math.max(0, Math.min(1, l + n * noiseF * 0.18));
    }

    const [cr, cg, cb] = lerpColor(stops, Math.max(0, Math.min(1, l)));
    let fr = cr, fg = cg, fb = cb;

    // Edge overlay
    if (edges && edgeF > 0) {
      const e = edges[j] * edgeF;
      fr = fr * (1 - e) + er * e;
      fg = fg * (1 - e) + eg * e;
      fb = fb * (1 - e) + eb * e;
    }

    // Isotherm overlay (hard override)
    if (isoMap && isoMap[j]) {
      fr = ir; fg = ig; fb = ib;
    }

    const sr = data[i], sg = data[i + 1], sb = data[i + 2];
    od[i]     = Math.round(fr + (sr - fr) * blend);
    od[i + 1] = Math.round(fg + (sg - fg) * blend);
    od[i + 2] = Math.round(fb + (sb - fb) * blend);
    od[i + 3] = data[i + 3];
  }
  return out;
}
