import type { BlockifyParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#ffffff').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function quantize(v: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(v / step) * step);
}

export function applyBlockify(src: ImageData, params: BlockifyParams): ImageData {
  const { width: w, height: h, data } = src;
  const bs = Math.max(4, Math.min(128, params.blockSize ?? 16));
  const out = new Uint8ClampedArray(data);
  const levels = Math.max(2, params.levels ?? 8);
  const blend = (params.blendOriginal ?? 0) / 100;

  const [er, eg, eb] = hexToRgb(params.edgeColor ?? '#000000');

  for (let by = 0; by < h; by += bs) {
    for (let bx = 0; bx < w; bx += bs) {
      const bw = Math.min(bs, w - bx);
      const bh = Math.min(bs, h - by);
      const cx = bx + Math.floor(bw / 2);
      const cy = by + Math.floor(bh / 2);

      let r = 0, g = 0, b = 0;
      if (params.samplingMode === 'center') {
        const ci = (cy * w + cx) * 4;
        r = data[ci]; g = data[ci + 1]; b = data[ci + 2];
      } else if (params.samplingMode === 'average') {
        let cnt = 0;
        for (let y2 = by; y2 < by + bh; y2++) {
          for (let x2 = bx; x2 < bx + bw; x2++) {
            const ci = (y2 * w + x2) * 4;
            r += data[ci]; g += data[ci + 1]; b += data[ci + 2]; cnt++;
          }
        }
        r /= cnt; g /= cnt; b /= cnt;
      } else { // random
        const rx2 = bx + Math.floor(Math.random() * bw);
        const ry2 = by + Math.floor(Math.random() * bh);
        const ci = (ry2 * w + rx2) * 4;
        r = data[ci]; g = data[ci + 1]; b = data[ci + 2];
      }

      if (params.colorMode === 'quantize') {
        r = quantize(r, levels); g = quantize(g, levels); b = quantize(b, levels);
      }

      const ew = Math.max(1, params.edgeWidth ?? 1);
      for (let y2 = by; y2 < by + bh; y2++) {
        for (let x2 = bx; x2 < bx + bw; x2++) {
          const pi = (y2 * w + x2) * 4;
          const isEdge = params.edgeHighlight && (
            x2 - bx < ew || bx + bw - 1 - x2 < ew ||
            y2 - by < ew || by + bh - 1 - y2 < ew
          );
          if (isEdge) {
            out[pi] = er; out[pi + 1] = eg; out[pi + 2] = eb;
          } else {
            out[pi] = r; out[pi + 1] = g; out[pi + 2] = b;
          }
          out[pi + 3] = 255;
        }
      }
    }
  }

  if (blend > 0) {
    for (let i = 0; i < out.length; i += 4) {
      out[i]     = out[i]     * (1 - blend) + data[i]     * blend;
      out[i + 1] = out[i + 1] * (1 - blend) + data[i + 1] * blend;
      out[i + 2] = out[i + 2] * (1 - blend) + data[i + 2] * blend;
    }
  }
  return new ImageData(out, w, h);
}
