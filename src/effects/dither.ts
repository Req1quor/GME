import type { DitherParams } from '../types';

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildGrayscalePalette(size: number): [number, number, number][] {
  const palette: [number, number, number][] = [];
  for (let i = 0; i < size; i++) {
    const v = Math.round((i / (size - 1)) * 255);
    palette.push([v, v, v]);
  }
  return palette;
}

function nearestColor(
  r: number, g: number, b: number,
  palette: [number, number, number][]
): [number, number, number] {
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function clamp(v: number) { return Math.max(0, Math.min(255, v)); }

// ─── Gamma correction (sRGB ↔ linear) ────────────────────────────────────────

function srgbToLinear(b: number): number {
  b = b / 255;
  return b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
}

function linearToSrgb(b: number): number {
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;
  return clamp(Math.round(b * 255));
}

// ─── Pre/post processing ──────────────────────────────────────────────────────

function applyHueSaturation(imageData: ImageData, hueShift: number, saturation: number): ImageData {
  if (hueShift === 0 && saturation === 100) return imageData;
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  const hRad = (hueShift / 360) * 2 * Math.PI;
  const sat = saturation / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const delta = max - min;
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h /= 6;
    }
    h = (h + hRad / (2 * Math.PI)) % 1;
    if (h < 0) h += 1;
    const newS = Math.max(0, Math.min(1, s * sat));
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    if (newS === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    d[i]     = clamp(Math.round(r * 255));
    d[i + 1] = clamp(Math.round(g * 255));
    d[i + 2] = clamp(Math.round(b * 255));
  }
  return out;
}

function toMono(imageData: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return out;
}

function blendWithOriginal(processed: ImageData, original: ImageData, amount: number): ImageData {
  if (amount <= 0) return processed;
  if (amount >= 100) return original;
  const t = amount / 100;
  const out = new ImageData(new Uint8ClampedArray(processed.data), processed.width, processed.height);
  const d = out.data;
  const o = original.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp(Math.round(d[i]     * (1 - t) + o[i]     * t));
    d[i + 1] = clamp(Math.round(d[i + 1] * (1 - t) + o[i + 1] * t));
    d[i + 2] = clamp(Math.round(d[i + 2] * (1 - t) + o[i + 2] * t));
  }
  return out;
}

// ─── Bayer matrices ───────────────────────────────────────────────────────────

const BAYER2 = [[0,2],[3,1]];

const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

const BAYER8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function expandBayer(m: number[][]): number[][] {
  const n = m.length;
  const s = n * 2;
  const out: number[][] = Array.from({ length: s }, () => new Array(s).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = m[y][x];
      out[y][x]         = 4 * v;
      out[y][x + n]     = 4 * v + 2;
      out[y + n][x]     = 4 * v + 3;
      out[y + n][x + n] = 4 * v + 1;
    }
  }
  return out;
}

const BAYER16 = expandBayer(BAYER8);

// ─── Blue noise tile ─────────────────────────────────────────────────────────
// Approximated via golden-ratio LDS + Bayer16 blend. Tiles seamlessly at 64×64.
function generateBlueNoiseTile(): Uint8Array {
  const size = 64;
  const tile = new Uint8Array(size * size);
  const phi = 1.6180339887498949;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const bv = BAYER16[y % 16][x % 16] / 256;
      const lds = ((x * phi + y / phi) % 1 + 1) % 1;
      tile[i] = Math.round(((bv * 0.6 + lds * 0.4) % 1) * 255);
    }
  }
  return tile;
}
const BLUE_NOISE_TILE = generateBlueNoiseTile();

// ─── Main dispatch ────────────────────────────────────────────────────────────

export function applyDither(imageData: ImageData, params: DitherParams): ImageData {
  const {
    algo, paletteSize, palette: hexPalette,
    intensity = 1, bias = 0.5,
    gammaCorrect = false,
    blendOriginal: blendAmt = 0,
    hueShift = 0, saturation = 100,
    monoMode = false,
  } = params;

  const original = imageData;
  let data = monoMode ? toMono(imageData) : imageData;

  const palette: [number, number, number][] =
    hexPalette.length >= 2
      ? hexPalette.map(hexToRgb)
      : buildGrayscalePalette(Math.max(2, paletteSize));

  let result: ImageData;
  switch (algo) {
    // ── Error diffusion — classic ──
    case 'floyd-steinberg': result = floydSteinberg(data, palette, intensity, bias, gammaCorrect); break;
    case 'atkinson':        result = atkinson(data, palette, intensity, bias, gammaCorrect); break;
    case 'jarvis':          result = jarvis(data, palette, intensity, bias, gammaCorrect); break;
    case 'stucki':          result = stucki(data, palette, intensity, bias, gammaCorrect); break;
    case 'sierra':          result = sierra(data, palette, intensity, bias, gammaCorrect); break;
    case 'sierra-lite':     result = sierraLite(data, palette, intensity, bias, gammaCorrect); break;
    case 'simple2d':        result = simple2d(data, palette, intensity, bias, gammaCorrect); break;
    // ── Error diffusion — extended ──
    case 'burkes':          result = burkes(data, palette, intensity, bias, gammaCorrect); break;
    case 'sierra-2row':     result = sierra2Row(data, palette, intensity, bias, gammaCorrect); break;
    case 'fake-floyd':      result = fakeFloyd(data, palette, intensity, bias, gammaCorrect); break;
    case 'shiau-fan-1':     result = shiauFan1(data, palette, intensity, bias, gammaCorrect); break;
    case 'shiau-fan-2':     result = shiauFan2(data, palette, intensity, bias, gammaCorrect); break;
    case 'shiau-fan-3':     result = shiauFan3(data, palette, intensity, bias, gammaCorrect); break;
    case 'stevenson-arce':  result = stevensonArce(data, palette, intensity, bias, gammaCorrect); break;
    case 'diagonal-diffusion': result = diagonalDiffusion(data, palette, intensity, bias, gammaCorrect); break;
    // ── Ordered — Bayer ──
    case 'bayer2':   result = bayer(data, palette, BAYER2,  2,  4,   intensity, bias); break;
    case 'bayer3':   result = bayer(data, palette, BAYER3,  3,  9,   intensity, bias); break;
    case 'bayer4':   result = bayer(data, palette, BAYER4,  4,  16,  intensity, bias); break;
    case 'bayer8':   result = bayer(data, palette, BAYER8,  8,  64,  intensity, bias); break;
    case 'bayer16':  result = bayer(data, palette, BAYER16, 16, 256, intensity, bias); break;
    case 'bayer32':  result = bayer(data, palette, BAYER32, 32, 1024, intensity, bias); break;
    // ── Ordered — Clustered dot ──
    case 'clustered-4': result = bayer(data, palette, CLUSTERED_4, 4,  16, intensity, bias); break;
    case 'clustered-6': result = bayer(data, palette, CLUSTERED_6, 6,  36, intensity, bias); break;
    case 'clustered-8': result = bayer(data, palette, CLUSTERED_8, 8,  64, intensity, bias); break;
    // ── Ordered — Dispersed ──
    case 'dispersed-2x2': result = bayer(data, palette, DISPERSED_2, 2,  4,  intensity, bias); break;
    case 'dispersed-4x4': result = bayer(data, palette, DISPERSED_4, 4,  16, intensity, bias); break;
    // ── Ordered — Special ──
    case 'interleaved-gradient': result = interleavedGradient(data, palette, intensity, bias); break;
    case 'void-dispersed':       result = voidDispersed(data, palette, intensity, bias); break;
    case 'ulichney-bd':    result = bayer(data, palette, ULICHNEY_BD, 8,  64, intensity, bias); break;
    case 'white-point-c':  result = bayer(data, palette, WHITE_POINT_C, 4, 16, intensity, bias); break;
    case 'white-point-b':  result = bayer(data, palette, WHITE_POINT_B, 4, 16, intensity, bias); break;
    // ── Pattern ──
    case 'pattern-2x2': result = bayer(data, palette, PATTERN_2X2, 2, 4,   intensity, bias); break;
    case 'pattern-3x3': result = bayer(data, palette, PATTERN_3X3, 3, 9,   intensity, bias); break;
    case 'pattern-4x4': result = bayer(data, palette, PATTERN_4X4, 4, 16,  intensity, bias); break;
    case 'pattern-5x2': result = bayer(data, palette, PATTERN_5X2, 5, 10,  intensity, bias); break;
    // ── Noise / Analog ──
    case 'random':    result = randomDither(data, palette, intensity, bias); break;
    case 'bluenoise': result = blueNoise(data, palette, intensity, bias); break;
    case 'halftone':  result = halftone(data, palette, intensity); break;
    // ── Special ──
    case 'threshold': result = threshold(data, palette, bias); break;
    case 'hilbert':   result = hilbertDither(data, palette, intensity, bias, gammaCorrect); break;
    default:          result = floydSteinberg(data, palette, intensity, bias, gammaCorrect);
  }

  if (hueShift !== 0 || saturation !== 100) result = applyHueSaturation(result, hueShift, saturation);
  if (blendAmt > 0) result = blendWithOriginal(result, original, blendAmt);

  return result;
}

// ─── Error diffusion engine ───────────────────────────────────────────────────

type KernelEntry = [dx: number, dy: number, weight: number, divisor: number];

function errorDiffuse(
  imageData: ImageData,
  palette: [number, number, number][],
  kernel: KernelEntry[],
  intensity: number,
  bias: number,
  gammaCorrect: boolean
): ImageData {
  const { width, height } = imageData;
  const n = width * height;
  const src = imageData.data;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);

  // Load & optionally linearize
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (gammaCorrect) {
      r[i] = srgbToLinear(src[j]);
      g[i] = srgbToLinear(src[j + 1]);
      b[i] = srgbToLinear(src[j + 2]);
    } else {
      r[i] = src[j]; g[i] = src[j + 1]; b[i] = src[j + 2];
    }
  }

  // Bias shift
  if (bias !== 0.5) {
    const shift = gammaCorrect ? (bias - 0.5) * 0.4 : (bias - 0.5) * 100;
    for (let i = 0; i < n; i++) { r[i] += shift; g[i] += shift; b[i] += shift; }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const qr = r[i], qg = g[i], qb = b[i];

      // Find nearest palette color
      let best = palette[0], bestDist = Infinity;
      for (const c of palette) {
        let cr = c[0] as number, cg = c[1] as number, cb = c[2] as number;
        if (gammaCorrect) { cr = srgbToLinear(cr); cg = srgbToLinear(cg); cb = srgbToLinear(cb); }
        const dist = (qr - cr) ** 2 + (qg - cg) ** 2 + (qb - cb) ** 2;
        if (dist < bestDist) { bestDist = dist; best = c; }
      }

      let nr = best[0] as number, ng = best[1] as number, nb2 = best[2] as number;
      if (gammaCorrect) { nr = srgbToLinear(nr); ng = srgbToLinear(ng); nb2 = srgbToLinear(nb2); }

      r[i] = nr; g[i] = ng; b[i] = nb2;
      const er = (qr - nr) * intensity;
      const eg = (qg - ng) * intensity;
      const eb = (qb - nb2) * intensity;

      for (const [dx, dy, w, div] of kernel) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const j = ny * width + nx;
        const f = w / div;
        r[j] += er * f; g[j] += eg * f; b[j] += eb * f;
      }
    }
  }

  const out = new ImageData(new Uint8ClampedArray(src.length), width, height);
  const od = out.data;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    od[j]     = gammaCorrect ? linearToSrgb(r[i]) : clamp(Math.round(r[i]));
    od[j + 1] = gammaCorrect ? linearToSrgb(g[i]) : clamp(Math.round(g[i]));
    od[j + 2] = gammaCorrect ? linearToSrgb(b[i]) : clamp(Math.round(b[i]));
    od[j + 3] = src[j + 3];
  }
  return out;
}

// ─── Error diffusion algorithms ───────────────────────────────────────────────

const FS_KERNEL: KernelEntry[] = [[ 1,0,7,16],[-1,1,3,16],[0,1,5,16],[1,1,1,16]];
function floydSteinberg(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, FS_KERNEL, int, bias, g);
}

const ATKINSON_KERNEL: KernelEntry[] = [[1,0,1,8],[2,0,1,8],[-1,1,1,8],[0,1,1,8],[1,1,1,8],[0,2,1,8]];
function atkinson(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, ATKINSON_KERNEL, int, bias, g);
}

const JARVIS_KERNEL: KernelEntry[] = [
  [1,0,7,48],[2,0,5,48],
  [-2,1,3,48],[-1,1,5,48],[0,1,7,48],[1,1,5,48],[2,1,3,48],
  [-2,2,1,48],[-1,2,3,48],[0,2,5,48],[1,2,3,48],[2,2,1,48],
];
function jarvis(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, JARVIS_KERNEL, int, bias, g);
}

const STUCKI_KERNEL: KernelEntry[] = [
  [1,0,8,42],[2,0,4,42],
  [-2,1,2,42],[-1,1,4,42],[0,1,8,42],[1,1,4,42],[2,1,2,42],
  [-2,2,1,42],[-1,2,2,42],[0,2,4,42],[1,2,2,42],[2,2,1,42],
];
function stucki(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, STUCKI_KERNEL, int, bias, g);
}

const SIERRA_KERNEL: KernelEntry[] = [
  [1,0,5,32],[2,0,3,32],
  [-2,1,2,32],[-1,1,4,32],[0,1,5,32],[1,1,4,32],[2,1,2,32],
  [-1,2,2,32],[0,2,3,32],[1,2,2,32],
];
function sierra(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SIERRA_KERNEL, int, bias, g);
}

const SIERRA_LITE_KERNEL: KernelEntry[] = [[1,0,2,4],[-1,1,1,4],[0,1,1,4]];
function sierraLite(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SIERRA_LITE_KERNEL, int, bias, g);
}

const SIMPLE2D_KERNEL: KernelEntry[] = [[1,0,1,2],[0,1,1,2]];
function simple2d(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SIMPLE2D_KERNEL, int, bias, g);
}

// ─── Extended error diffusion kernels ────────────────────────────────────────

// Burkes (1988): front-heavy, no third row → fast & sharp
const BURKES_KERNEL: KernelEntry[] = [
  [1,0,8,32],[2,0,4,32],
  [-2,1,2,32],[-1,1,4,32],[0,1,8,32],[1,1,4,32],[2,1,2,32],
];
function burkes(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, BURKES_KERNEL, int, bias, g);
}

// Sierra 2-Row: 2-row version of Sierra, lighter than full Sierra
const SIERRA2_KERNEL: KernelEntry[] = [
  [1,0,4,16],[2,0,3,16],
  [-2,1,1,16],[-1,1,2,16],[0,1,3,16],[1,1,2,16],[2,1,1,16],
];
function sierra2Row(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SIERRA2_KERNEL, int, bias, g);
}

// Fake Floyd-Steinberg: simplified, faster approximation
const FAKE_FLOYD_KERNEL: KernelEntry[] = [[1,0,3,8],[0,1,3,8],[1,1,2,8]];
function fakeFloyd(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, FAKE_FLOYD_KERNEL, int, bias, g);
}

// Shiau-Fan variants (1996) — asymmetric 1-row-ahead kernels
// v1: right-heavy, gradual left tail
const SHIAU_FAN_1_KERNEL: KernelEntry[] = [
  [1,0,4,8],[-1,1,1,8],[0,1,1,8],[1,1,2,8],
];
// v2: extra left extension
const SHIAU_FAN_2_KERNEL: KernelEntry[] = [
  [1,0,8,16],[-2,1,1,16],[-1,1,1,16],[0,1,2,16],[1,1,4,16],
];
// v3: right extension
const SHIAU_FAN_3_KERNEL: KernelEntry[] = [
  [1,0,8,16],[-1,1,4,16],[0,1,2,16],[1,1,1,16],[2,1,1,16],
];
function shiauFan1(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SHIAU_FAN_1_KERNEL, int, bias, g);
}
function shiauFan2(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SHIAU_FAN_2_KERNEL, int, bias, g);
}
function shiauFan3(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, SHIAU_FAN_3_KERNEL, int, bias, g);
}

// Stevenson-Arce (1987): large 3-row kernel, smooth gradients at cost of time
const STEVENSON_ARCE_KERNEL: KernelEntry[] = [
  [2,0,32,200],
  [-3,1,12,200],[-1,1,26,200],[1,1,30,200],[3,1,16,200],
  [-3,2,12,200],[-1,2,12,200],[1,2,26,200],[3,2,12,200],
  [-3,3,4,200],[-1,3,12,200],[1,3,4,200],
];
function stevensonArce(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, STEVENSON_ARCE_KERNEL, int, bias, g);
}

// Diagonal Dither: diffuses error diagonally → fabric/textile-like texture
const DIAGONAL_KERNEL: KernelEntry[] = [
  [1,0,1,4],[2,0,1,4],[-1,1,1,4],[0,1,1,4],
];
function diagonalDiffusion(i: ImageData, p: [number,number,number][], int: number, bias: number, g: boolean) {
  return errorDiffuse(i, p, DIAGONAL_KERNEL, int, bias, g);
}

// ─── Bayer (ordered) ─────────────────────────────────────────────────────────

function bayer(
  imageData: ImageData, palette: [number,number,number][],
  matrix: number[][], size: number, maxVal: number,
  intensity: number, bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = (matrix[y % size][x % size] / maxVal - bias) * 128 * intensity;
      const [nr, ng, nb] = nearestColor(clamp(d[i]+t), clamp(d[i+1]+t), clamp(d[i+2]+t), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Random (white noise) ─────────────────────────────────────────────────────

function randomDither(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number, bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  let seed = 42;
  const rand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 0xffffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = (rand() - bias) * 128 * intensity;
      const [nr, ng, nb] = nearestColor(clamp(d[i]+t), clamp(d[i+1]+t), clamp(d[i+2]+t), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Blue noise ───────────────────────────────────────────────────────────────

function blueNoise(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number, bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  const sz = 64;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const noiseVal = BLUE_NOISE_TILE[(y % sz) * sz + (x % sz)];
      const t = (noiseVal / 255 - bias) * 128 * intensity;
      const [nr, ng, nb] = nearestColor(clamp(d[i]+t), clamp(d[i+1]+t), clamp(d[i+2]+t), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Halftone ─────────────────────────────────────────────────────────────────

function halftone(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number
): ImageData {
  const { width, height } = imageData;
  const cellSize = Math.max(3, Math.round(6 * intensity));
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const px = Math.min(col * cellSize + dx, width - 1);
          const py = Math.min(row * cellSize + dy, height - 1);
          const j = (py * width + px) * 4;
          sumR += imageData.data[j]; sumG += imageData.data[j+1]; sumB += imageData.data[j+2];
          count++;
        }
      }
      const avgR = sumR/count, avgG = sumG/count, avgB = sumB/count;
      const lum = (0.299*avgR + 0.587*avgG + 0.114*avgB) / 255;
      const [nr, ng, nb] = nearestColor(avgR, avgG, avgB, palette);
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;
      const radius = (cellSize / 2) * lum;
      if (radius > 0.5) {
        ctx.fillStyle = `rgb(${nr},${ng},${nb})`;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return ctx.getImageData(0, 0, width, height);
}

// ─── New ordered dither matrices ──────────────────────────────────────────────

// Bayer 3×3 (non-power-of-2 variant)
const BAYER3 = [[0,7,3],[6,5,2],[4,1,8]];

// Bayer 32×32: double-expand from Bayer 16
const BAYER32 = expandBayer(BAYER16);

// Clustered dot matrices — pixels turn on from center outward (halftone-style)
function makeClusteredMatrix(n: number): number[][] {
  const cx = (n - 1) / 2, cy = (n - 1) / 2;
  const px: Array<{ d: number; y: number; x: number }> = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      px.push({ d: (x - cx) ** 2 + (y - cy) ** 2, y, x });
  px.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  px.forEach(({ x, y }, i) => { m[y][x] = i; });
  return m;
}
const CLUSTERED_4 = makeClusteredMatrix(4);   // max 16
const CLUSTERED_6 = makeClusteredMatrix(6);   // max 36
const CLUSTERED_8 = makeClusteredMatrix(8);   // max 64

// Dispersed 2×2 — simple two-level dispersion
const DISPERSED_2 = [[0,2],[3,1]];  // same as BAYER2, max=4

// Dispersed 4×4 — alternative dispersed pattern (different stepping from Bayer)
const DISPERSED_4: number[][] = [
  [ 0, 12,  3, 15],
  [ 8,  4, 11,  7],
  [ 2, 14,  1, 13],
  [10,  6,  9,  5],
];

// Ulichney void-and-cluster approximation (8×8 blue-noise-like dispersed)
const ULICHNEY_BD: number[][] = [
  [24, 10, 62, 38, 20,  6, 54, 44],
  [48, 32,  2, 16, 60, 42, 26, 12],
  [56,  8, 50, 28, 52, 18, 36,  4],
  [14, 46, 22, 40,  0, 58, 46, 30],
  [20, 34, 60, 54, 14, 48, 22, 56],
  [40, 28,  6, 18, 34, 10, 62, 38],
  [52, 44, 16, 48, 26, 44,  2, 24],
  [ 4, 58,  8, 30, 42,  6, 52, 16],
];

// White-point central: dots start from corner → different texture from clustered
const WHITE_POINT_C: number[][] = [
  [ 0, 12,  4, 16],
  [ 8,  2, 14,  6],
  [ 1, 13,  3, 15],
  [ 9,  5, 11,  7],
];

// White-point balanced: evenly balanced threshold matrix
const WHITE_POINT_B: number[][] = [
  [ 6,  2, 10,  4],
  [14,  8, 15, 11],
  [ 1,  9,  3,  7],
  [13,  5, 12,  0],
];

// Pattern dither matrices (ordered patterns, different aesthetic from Bayer)
const PATTERN_2X2 = [[0,2],[3,1]];   // max 4

const PATTERN_3X3: number[][] = [   // max 9 — diagonal lines
  [6, 2, 4],
  [0, 8, 7],
  [3, 5, 1],
];

const PATTERN_4X4: number[][] = [   // max 16 — diamond pattern
  [ 0,  4,  8, 12],
  [ 5,  9, 13,  1],
  [10, 14,  2,  6],
  [15,  3,  7, 11],
];

const PATTERN_5X2: number[][] = [   // 5×2 horizontal bands
  [0, 2, 4, 6, 8],
  [1, 3, 5, 7, 9],
];

// ─── Interleaved Gradient Noise (Jimenez 2014) ────────────────────────────────
// Perceptually smooth, low-frequency noise — great for real-time rendering look

function interleavedGradient(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number, bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = 0.06711056 * x + 0.00583715 * y;
      const noiseVal = (52.9829189 * (v - Math.floor(v))) % 1;
      const t = (noiseVal - bias) * 128 * intensity;
      const [nr, ng, nb] = nearestColor(clamp(d[i]+t), clamp(d[i+1]+t), clamp(d[i+2]+t), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Void Dispersed Dots ──────────────────────────────────────────────────────
// Multi-scale blue-noise style: blends 4 different Bayer scales

function voidDispersed(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number, bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Blend multiple Bayer scales for void-and-cluster approximation
      const b2 = BAYER2[y % 2][x % 2] / 4;
      const b4 = BAYER4[y % 4][x % 4] / 16;
      const b8 = BAYER8[y % 8][x % 8] / 64;
      const b16 = BAYER16[y % 16][x % 16] / 256;
      const noiseVal = b2 * 0.1 + b4 * 0.2 + b8 * 0.3 + b16 * 0.4;
      const t = (noiseVal - bias) * 128 * intensity;
      const [nr, ng, nb] = nearestColor(clamp(d[i]+t), clamp(d[i+1]+t), clamp(d[i+2]+t), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Threshold Dither ────────────────────────────────────────────────────────
// Simplest possible dither: hard snap to nearest palette color, no diffusion

function threshold(
  imageData: ImageData, palette: [number,number,number][],
  bias: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  const shift = (bias - 0.5) * 100;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [nr, ng, nb] = nearestColor(
        clamp(d[i] + shift), clamp(d[i+1] + shift), clamp(d[i+2] + shift), palette);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  return out;
}

// ─── Hilbert Curve Dither ────────────────────────────────────────────────────
// Error diffusion along a Hilbert space-filling curve → minimal anisotropy

function hilbertXY(n: number, d: number): [number, number] {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < n; s <<= 1) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx; y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

function hilbertDither(
  imageData: ImageData, palette: [number,number,number][],
  intensity: number, bias: number, gammaCorrect: boolean
): ImageData {
  const { width, height } = imageData;
  // Find smallest power-of-2 ≥ max(width, height)
  let n = 1;
  while (n < Math.max(width, height)) n <<= 1;
  const total = n * n;

  // Build ordered list of (x, y) in Hilbert order, filtered to image bounds
  const order: Array<[number, number]> = [];
  for (let d = 0; d < total; d++) {
    const [x, y] = hilbertXY(n, d);
    if (x < width && y < height) order.push([x, y]);
  }

  const src = imageData.data;
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    if (gammaCorrect) {
      r[i] = srgbToLinear(src[j]);
      g[i] = srgbToLinear(src[j + 1]);
      b[i] = srgbToLinear(src[j + 2]);
    } else {
      r[i] = src[j]; g[i] = src[j + 1]; b[i] = src[j + 2];
    }
  }

  if (bias !== 0.5) {
    const shift = gammaCorrect ? (bias - 0.5) * 0.4 : (bias - 0.5) * 100;
    for (let i = 0; i < r.length; i++) { r[i] += shift; g[i] += shift; b[i] += shift; }
  }

  for (let k = 0; k < order.length; k++) {
    const [x, y] = order[k];
    const i = y * width + x;
    const qr = r[i], qg = g[i], qb = b[i];

    let best = palette[0], bestDist = Infinity;
    for (const c of palette) {
      let cr = c[0] as number, cg = c[1] as number, cb = c[2] as number;
      if (gammaCorrect) { cr = srgbToLinear(cr); cg = srgbToLinear(cg); cb = srgbToLinear(cb); }
      const dist = (qr - cr) ** 2 + (qg - cg) ** 2 + (qb - cb) ** 2;
      if (dist < bestDist) { bestDist = dist; best = c; }
    }

    let nr = best[0] as number, ng = best[1] as number, nb2 = best[2] as number;
    if (gammaCorrect) { nr = srgbToLinear(nr); ng = srgbToLinear(ng); nb2 = srgbToLinear(nb2); }
    r[i] = nr; g[i] = ng; b[i] = nb2;

    const er = (qr - nr) * intensity;
    const eg = (qg - ng) * intensity;
    const eb = (qb - nb2) * intensity;

    // Diffuse to next pixel in curve (1D), and partially to following pixel
    if (k + 1 < order.length) {
      const [nx, ny] = order[k + 1];
      const j = ny * width + nx;
      r[j] += er * 0.75; g[j] += eg * 0.75; b[j] += eb * 0.75;
    }
    if (k + 2 < order.length) {
      const [nx2, ny2] = order[k + 2];
      const j2 = ny2 * width + nx2;
      r[j2] += er * 0.25; g[j2] += eg * 0.25; b[j2] += eb * 0.25;
    }
  }

  const out = new ImageData(new Uint8ClampedArray(src.length), width, height);
  const od = out.data;
  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    od[j]     = gammaCorrect ? linearToSrgb(r[i]) : clamp(Math.round(r[i]));
    od[j + 1] = gammaCorrect ? linearToSrgb(g[i]) : clamp(Math.round(g[i]));
    od[j + 2] = gammaCorrect ? linearToSrgb(b[i]) : clamp(Math.round(b[i]));
    od[j + 3] = src[j + 3];
  }
  return out;
}
