import type { NoiseFieldParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function hash(x: number, y: number, seed: number): number {
  let n = x * 1619 + y * 31337 + seed * 1000003;
  n = (n ^ (n >> 13)) * 1274126177;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const xt = xf * xf * (3 - 2 * xf), yt = yf * yf * (3 - 2 * yf);
  return hash(xi,yi,seed)*(1-xt)*(1-yt) + hash(xi+1,yi,seed)*xt*(1-yt)
       + hash(xi,yi+1,seed)*(1-xt)*yt  + hash(xi+1,yi+1,seed)*xt*yt;
}

function fractalNoise(x: number, y: number, seed: number, octaves: number, persistence: number, lacunarity: number): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let o = 0; o < octaves; o++) {
    val += valueNoise(x * freq, y * freq, seed + o * 7) * amp;
    max += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return val / max;
}

function domainWarp(x: number, y: number, seed: number, scale: number, octaves: number, persistence: number, lacunarity: number): number {
  const wx = fractalNoise(x + 1.7, y + 9.2, seed, octaves, persistence, lacunarity) * scale * 2;
  const wy = fractalNoise(x + 8.3, y + 2.8, seed + 17, octaves, persistence, lacunarity) * scale * 2;
  return fractalNoise(x + wx, y + wy, seed, octaves, persistence, lacunarity);
}

function heatmap(t: number, colorA: [number,number,number], colorB: [number,number,number]): [number,number,number] {
  const r = colorA[0] + (colorB[0] - colorA[0]) * t;
  const g = colorA[1] + (colorB[1] - colorA[1]) * t;
  const b = colorA[2] + (colorB[2] - colorA[2]) * t;
  return [Math.round(r), Math.round(g), Math.round(b)];
}

const PLASMA = [[13,8,135],[94,2,165],[185,50,137],[244,136,73],[240,249,33]] as const;
function plasma(t: number): [number,number,number] {
  const fi = Math.min(t * 4, 3.9999);
  const si = Math.floor(fi); const f = fi - si;
  const a = PLASMA[si], b = PLASMA[si + 1];
  return [Math.round(a[0]+(b[0]-a[0])*f), Math.round(a[1]+(b[1]-a[1])*f), Math.round(a[2]+(b[2]-a[2])*f)];
}

export function applyNoiseField(src: ImageData, params: NoiseFieldParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(w * h * 4);
  const blend = (params.blendOriginal ?? 0) / 100;
  const scale = Math.max(0.5, params.scale ?? 4);
  const seed = params.seed ?? 42;
  const octaves = Math.max(1, Math.min(8, params.octaves ?? 4));
  const persistence = params.persistence ?? 0.5;
  const lacunarity = params.lacunarity ?? 2;
  const bf = ((params.brightness ?? 0) / 100);
  const cf = (100 + (params.contrast ?? 0)) / 100;
  const ox = params.offsetX ?? 0;
  const oy = params.offsetY ?? 0;

  const cAv = hexToRgb(params.colorA ?? '#000000');
  const cBv = hexToRgb(params.colorB ?? '#ffffff');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + ox) / w * scale;
      const ny = (y + oy) / h * scale;

      let n: number;
      if (params.noiseType === 'domain-warp') {
        n = domainWarp(nx, ny, seed, scale, octaves, persistence, lacunarity);
      } else if (params.noiseType === 'fractal') {
        n = fractalNoise(nx, ny, seed, octaves, persistence, lacunarity);
      } else {
        n = valueNoise(nx, ny, seed);
      }

      n = Math.max(0, Math.min(1, (n + bf) * cf));

      let r = 0, g = 0, b = 0;
      switch (params.colorMode) {
        case 'grayscale':
          r = g = b = Math.round(n * 255); break;
        case 'heatmap':
          [r, g, b] = heatmap(n, cAv, cBv); break;
        case 'plasma':
          [r, g, b] = plasma(n); break;
        case 'custom':
          [r, g, b] = heatmap(n, cAv, cBv); break;
        default:
          r = g = b = Math.round(n * 255);
      }

      const i = (y * w + x) * 4;
      const bm = params.blendMode ?? 'normal';
      const sr = data[i], sg = data[i+1], sb = data[i+2];

      let fr = r, fg = g, fb = b;
      if (blend > 0) {
        if (bm === 'screen') {
          fr = Math.round(255 - (255 - r) * (255 - sr) / 255);
          fg = Math.round(255 - (255 - g) * (255 - sg) / 255);
          fb = Math.round(255 - (255 - b) * (255 - sb) / 255);
        } else if (bm === 'multiply') {
          fr = Math.round(r * sr / 255);
          fg = Math.round(g * sg / 255);
          fb = Math.round(b * sb / 255);
        } else if (bm === 'overlay') {
          fr = sr < 128 ? Math.round(2*sr*r/255) : Math.round(255 - 2*(255-sr)*(255-r)/255);
          fg = sg < 128 ? Math.round(2*sg*g/255) : Math.round(255 - 2*(255-sg)*(255-g)/255);
          fb = sb < 128 ? Math.round(2*sb*b/255) : Math.round(255 - 2*(255-sb)*(255-b)/255);
        } else {
          fr = Math.round(r * (1 - blend) + sr * blend);
          fg = Math.round(g * (1 - blend) + sg * blend);
          fb = Math.round(b * (1 - blend) + sb * blend);
        }
      }

      out[i] = fr; out[i+1] = fg; out[i+2] = fb; out[i+3] = 255;
    }
  }
  return new ImageData(out, w, h);
}
