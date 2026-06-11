import type { ThresholdEffectParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lum(r: number, g: number, b: number) { return 0.299 * r + 0.587 * g + 0.114 * b; }

function adaptiveMean(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, radius: number): number {
  let sum = 0, cnt = 0;
  const r = Math.round(radius);
  for (let dy = -r; dy <= r; dy++) {
    const ny = Math.max(0, Math.min(h - 1, y + dy));
    for (let dx = -r; dx <= r; dx++) {
      const nx = Math.max(0, Math.min(w - 1, x + dx));
      const i = (ny * w + nx) * 4;
      sum += lum(data[i], data[i + 1], data[i + 2]);
      cnt++;
    }
  }
  return sum / cnt;
}

export function applyThresholdEffect(src: ImageData, params: ThresholdEffectParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(w * h * 4);
  const blend = (params.blendOriginal ?? 0) / 100;

  const [aR, aG, aB] = hexToRgb(params.colorA ?? '#000000');
  const [bR, bG, bB] = hexToRgb(params.colorB ?? '#ffffff');
  const [cR2, cG2, cB2] = hexToRgb(params.colorC ?? '#888888');

  const thr = params.threshold ?? 128;
  const levels = Math.max(2, Math.min(8, params.levels ?? 3));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = lum(data[i], data[i + 1], data[i + 2]);
      let r = 0, g = 0, b = 0;

      switch (params.mode) {
        case 'binary': {
          const v = l >= thr ? 1 : 0;
          const vv = params.invert ? 1 - v : v;
          r = vv ? bR : aR; g = vv ? bG : aG; b = vv ? bB : aB;
          break;
        }
        case 'adaptive': {
          const mean = adaptiveMean(data, x, y, w, h, params.adaptiveRadius ?? 10);
          const offset = params.adaptiveOffset ?? 10;
          const v = l > mean - offset ? 1 : 0;
          const vv = params.invert ? 1 - v : v;
          r = vv ? bR : aR; g = vv ? bG : aG; b = vv ? bB : aB;
          break;
        }
        case 'multi': {
          const step = 255 / levels;
          const band = Math.floor(l / step);
          const t = band / (levels - 1);
          if (params.invert ? t < 0.5 : t < 0.33) { r = aR; g = aG; b = aB; }
          else if (t < 0.67)                        { r = cR2; g = cG2; b = cB2; }
          else                                       { r = bR; g = bG; b = bB; }
          break;
        }
        case 'duotone': {
          const t = l / 255;
          const tt = params.invert ? 1 - t : t;
          r = Math.round(aR + (bR - aR) * tt);
          g = Math.round(aG + (bG - aG) * tt);
          b = Math.round(aB + (bB - aB) * tt);
          break;
        }
      }

      if (blend > 0) {
        r = Math.round(r * (1 - blend) + data[i]     * blend);
        g = Math.round(g * (1 - blend) + data[i + 1] * blend);
        b = Math.round(b * (1 - blend) + data[i + 2] * blend);
      }

      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
    }
  }
  return new ImageData(out, w, h);
}
