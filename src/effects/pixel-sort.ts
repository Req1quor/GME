import type { PixelSortParams } from '../types';

function getChannel(d: Uint8ClampedArray, i: number, mode: PixelSortParams['mode']): number {
  switch (mode) {
    case 'luminance':   return 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
    case 'red':         return d[i];
    case 'green':       return d[i + 1];
    case 'blue':        return d[i + 2];
    case 'hue': {
      const r = d[i]/255, g2 = d[i+1]/255, b = d[i+2]/255;
      const mx = Math.max(r,g2,b), mn = Math.min(r,g2,b);
      if (mx === mn) return 0;
      const d2 = mx - mn;
      let h = mx === r ? (g2 - b)/d2 + (g2 < b ? 6 : 0)
            : mx === g2 ? (b - r)/d2 + 2
            : (r - g2)/d2 + 4;
      return (h / 6) * 255;
    }
    case 'saturation': {
      const r = d[i]/255, g2 = d[i+1]/255, b = d[i+2]/255;
      const mx = Math.max(r,g2,b), mn = Math.min(r,g2,b);
      if (mx === 0) return 0;
      return ((mx - mn) / mx) * 255;
    }
    default: return 0;
  }
}

export function applyPixelSort(src: ImageData, params: PixelSortParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(data);
  const thr = params.threshold ?? 128;
  const asc = (params.direction ?? 'ascending') === 'ascending';
  const skip = params.skipChance ?? 0;
  const maxChunk = Math.max(10, params.chunkSize ?? 9999);

  function sortSegment(indices: number[]) {
    if (indices.length < 2) return;
    const vals = indices.map(i => getChannel(out, i, params.mode ?? 'luminance'));
    const combined = indices.map((ix, j) => ({ ix, v: vals[j] }));
    combined.sort((a, b) => asc ? a.v - b.v : b.v - a.v);
    const tmp = new Uint8ClampedArray(indices.length * 4);
    for (let k = 0; k < combined.length; k++) {
      const src2 = combined[k].ix;
      tmp[k * 4]     = out[src2]; tmp[k * 4 + 1] = out[src2 + 1];
      tmp[k * 4 + 2] = out[src2 + 2]; tmp[k * 4 + 3] = out[src2 + 3];
    }
    for (let k = 0; k < indices.length; k++) {
      out[indices[k]]     = tmp[k * 4]; out[indices[k] + 1] = tmp[k * 4 + 1];
      out[indices[k] + 2] = tmp[k * 4 + 2]; out[indices[k] + 3] = tmp[k * 4 + 3];
    }
  }

  const doH = params.axis === 'horizontal' || params.axis === 'both';
  const doV = params.axis === 'vertical'   || params.axis === 'both';

  if (doH) {
    for (let y = 0; y < h; y++) {
      let segment: number[] = [];
      for (let x = 0; x <= w; x++) {
        if (x < w) {
          const idx = (y * w + x) * 4;
          const v = getChannel(out, idx, params.mode ?? 'luminance');
          if (skip > 0 && Math.random() < skip) { sortSegment(segment); segment = []; continue; }
          if (params.segmented ? v > thr : true) {
            segment.push(idx);
            if (segment.length >= maxChunk) { sortSegment(segment); segment = []; }
          } else { sortSegment(segment); segment = []; }
        } else {
          sortSegment(segment); segment = [];
        }
      }
    }
  }

  if (doV) {
    for (let x = 0; x < w; x++) {
      let segment: number[] = [];
      for (let y = 0; y <= h; y++) {
        if (y < h) {
          const idx = (y * w + x) * 4;
          const v = getChannel(out, idx, params.mode ?? 'luminance');
          if (skip > 0 && Math.random() < skip) { sortSegment(segment); segment = []; continue; }
          if (params.segmented ? v > thr : true) {
            segment.push(idx);
            if (segment.length >= maxChunk) { sortSegment(segment); segment = []; }
          } else { sortSegment(segment); segment = []; }
        } else {
          sortSegment(segment); segment = [];
        }
      }
    }
  }

  const result = new ImageData(out, w, h);
  if ((params.blendOriginal ?? 0) > 0) {
    const t = params.blendOriginal / 100;
    for (let i = 0; i < out.length; i += 4) {
      result.data[i]     = out[i]     * (1 - t) + data[i]     * t;
      result.data[i + 1] = out[i + 1] * (1 - t) + data[i + 1] * t;
      result.data[i + 2] = out[i + 2] * (1 - t) + data[i + 2] * t;
    }
  }
  return result;
}
