import type { ContourParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#ffffff').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const idx = (x: number, y: number, w: number, h: number) =>
  (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4;

function gaussBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  if (radius < 1) return data;
  const out = new Uint8ClampedArray(data);
  const r = Math.round(radius);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, rg = 0, rb = 0; let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const i2 = idx(x, y + dy, w, h);
        rr += data[i2]; rg += data[i2 + 1]; rb += data[i2 + 2]; cnt++;
      }
      const i2 = (y * w + x) * 4;
      out[i2] = rr / cnt; out[i2 + 1] = rg / cnt; out[i2 + 2] = rb / cnt;
    }
  }
  return out;
}

export function applyContour(src: ImageData, params: ContourParams): ImageData {
  const { width: w, height: h, data } = src;
  let sd = params.smooth ? gaussBlur(data, w, h, params.smoothRadius ?? 1) : data;

  const thr = (params.threshold ?? 50) / 255;
  const [lr, lg, lb] = hexToRgb(params.lineColor ?? '#ffffff');
  const [br, bg, bb] = hexToRgb(params.bgColor ?? '#000000');
  const [cAr, cAg, cAb] = hexToRgb(params.colorA ?? '#00ffcc');
  const [cBr, cBg, cBb] = hexToRgb(params.colorB ?? '#ff0088');
  const blend = (params.blendOriginal ?? 0) / 100;

  const edges = new Float32Array(w * h);
  const angles = new Float32Array(w * h);

  // Sobel / Laplacian
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const get = (dx: number, dy: number) => lum(sd, idx(x + dx, y + dy, w, h));

      let mag = 0, ang = 0;
      if (params.mode === 'laplacian') {
        const c = get(0,0);
        mag = Math.abs(-c * 4 + get(1,0) + get(-1,0) + get(0,1) + get(0,-1)) / 255;
      } else { // sobel (default) or canny
        const gx = -get(-1,-1) - 2*get(-1,0) - get(-1,1) + get(1,-1) + 2*get(1,0) + get(1,1);
        const gy = -get(-1,-1) - 2*get(0,-1) - get(1,-1) + get(-1,1) + 2*get(0,1) + get(1,1);
        mag = Math.sqrt(gx * gx + gy * gy) / (4 * 255);
        ang = Math.atan2(gy, gx);
      }
      edges[i] = mag;
      angles[i] = ang;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const i4 = i * 4;
      let mag = edges[i];
      if (params.invertEdges) mag = 1 - mag;
      const isEdge = mag > thr;

      let rr: number, rg: number, rb: number;
      if (isEdge) {
        if (params.colorize) {
          const t = (angles[i] + Math.PI) / (2 * Math.PI);
          rr = clamp(cAr + (cBr - cAr) * t);
          rg = clamp(cAg + (cBg - cAg) * t);
          rb = clamp(cAb + (cBb - cAb) * t);
        } else {
          rr = lr; rg = lg; rb = lb;
        }
      } else if (params.bgTransparent) {
        rr = data[i4]; rg = data[i4 + 1]; rb = data[i4 + 2];
      } else {
        rr = br; rg = bg; rb = bb;
      }

      if (blend > 0) {
        rr = clamp(rr * (1 - blend) + data[i4]     * blend);
        rg = clamp(rg * (1 - blend) + data[i4 + 1] * blend);
        rb = clamp(rb * (1 - blend) + data[i4 + 2] * blend);
      }

      out[i4] = rr; out[i4 + 1] = rg; out[i4 + 2] = rb; out[i4 + 3] = 255;
    }
  }
  return new ImageData(out, w, h);
}
