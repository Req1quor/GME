import type { EdgeDetectionParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#ffffff').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const idxAt = (x: number, y: number, w: number, h: number) =>
  (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4;

export function applyEdgeDetection(src: ImageData, params: EdgeDetectionParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(w * h * 4);
  const thr = (params.threshold ?? 50) / 255;
  const [er, eg, eb] = hexToRgb(params.edgeColor ?? '#ffffff');
  const [br, bg, bb] = hexToRgb(params.bgColor ?? '#000000');
  const blend = (params.blendOriginal ?? 0) / 100;

  const getL = (x: number, y: number) =>
    params.luminanceOnly ? lum(data, idxAt(x, y, w, h)) / 255
    : (data[idxAt(x,y,w,h)] * 0.5 + data[idxAt(x,y,w,h)+1] * 0.3 + data[idxAt(x,y,w,h)+2] * 0.2) / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let mag = 0, ang = 0;

      const algo = params.algorithm ?? 'sobel';
      if (algo === 'laplacian') {
        const c = getL(x, y);
        mag = Math.abs(getL(x+1,y)+getL(x-1,y)+getL(x,y+1)+getL(x,y-1) - 4*c);
      } else if (algo === 'roberts') {
        const gx2 = getL(x,y) - getL(x+1,y+1);
        const gy2 = getL(x+1,y) - getL(x,y+1);
        mag = Math.sqrt(gx2*gx2 + gy2*gy2) * 1.4;
        ang = Math.atan2(gy2, gx2);
      } else { // sobel or prewitt
        let k = algo === 'prewitt' ? [1,1,1] : [1,2,1];
        const gx2 =
          -k[0]*getL(x-1,y-1) - k[1]*getL(x-1,y) - k[0]*getL(x-1,y+1) +
           k[0]*getL(x+1,y-1) + k[1]*getL(x+1,y) + k[0]*getL(x+1,y+1);
        const gy2 =
          -k[0]*getL(x-1,y-1) - k[1]*getL(x,y-1) - k[0]*getL(x+1,y-1) +
           k[0]*getL(x-1,y+1) + k[1]*getL(x,y+1) + k[0]*getL(x+1,y+1);
        const div = algo === 'prewitt' ? 3 : 4;
        mag = Math.sqrt(gx2*gx2 + gy2*gy2) / div;
        ang = Math.atan2(gy2, gx2);
      }

      if (params.invert) mag = 1 - mag;
      const isEdge = mag > thr;
      let r = 0, g = 0, b = 0;

      if (isEdge) {
        if (params.colorByAngle) {
          const hue = ((ang + Math.PI) / (2 * Math.PI));
          // HSV to RGB for angle-based coloring
          const h2 = hue * 6;
          const f = h2 - Math.floor(h2);
          const q = 1 - f;
          const sector = Math.floor(h2) % 6;
          const rv = [1,q,0,0,f,1][sector], gv = [f,1,1,q,0,0][sector], bv = [0,0,f,1,1,q][sector];
          r = Math.round(rv * 255); g = Math.round(gv * 255); b = Math.round(bv * 255);
        } else {
          r = er; g = eg; b = eb;
        }
      } else {
        if (params.mode === 'on-original') {
          r = data[i]; g = data[i + 1]; b = data[i + 2];
        } else if (params.mode === 'on-white') {
          r = g = b = 255;
        } else if (params.mode === 'colored') {
          r = data[i]; g = data[i + 1]; b = data[i + 2];
        } else { // on-black
          r = br; g = bg; b = bb;
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
