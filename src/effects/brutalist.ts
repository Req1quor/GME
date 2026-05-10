import type { BrutalistParams } from '../types';

function clamp(v: number) { return Math.max(0, Math.min(255, v)); }
function clampW(v: number, w: number) { return Math.max(0, Math.min(w - 1, v)); }
function clampH(v: number, h: number) { return Math.max(0, Math.min(h - 1, v)); }

export function applyBrutalist(imageData: ImageData, params: BrutalistParams): ImageData {
  let data = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);

  if (params.posterize)           data = posterize(data, params.posterizeLevels);
  if (params.threshold)           data = threshold(data, params.thresholdValue);
  if (params.noise)               data = applyNoise(data, params.noiseAmount ?? 25);
  if (params.edgeDetect)          data = sobelEdge(data, params.edgeThreshold, params.edgeColor);
  if (params.chromaticAberration) data = chromaticAberration(data, params.chromaticAmount);
  if (params.scanlines)           data = applyScanlines(data, params.scanlineIntensity);
  if (params.pixelSort)           data = pixelSort(data, params.pixelSortAxis, params.pixelSortThreshold);
  if (params.glitch)              data = glitch(data, params.glitchIntensity, params.glitchSeed ?? 42);
  return data;
}

function posterize(imageData: ImageData, levels: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = Math.round(Math.round(d[i]   / step) * step);
    d[i+1] = Math.round(Math.round(d[i+1] / step) * step);
    d[i+2] = Math.round(Math.round(d[i+2] / step) * step);
  }
  return out;
}

function threshold(imageData: ImageData, thresh: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    const v = lum >= thresh ? 255 : 0;
    d[i] = d[i+1] = d[i+2] = v;
  }
  return out;
}

function sobelEdge(imageData: ImageData, threshold: number, edgeColorHex: string): ImageData {
  const { width, height } = imageData;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  // Parse edge color
  const ec = parseInt(edgeColorHex.replace('#', ''), 16);
  const er = (ec >> 16) & 255, eg = (ec >> 8) & 255, eb = ec & 255;

  const lum = (i: number) => 0.299 * src[i] + 0.587 * src[i+1] + 0.114 * src[i+2];
  const idx = (x: number, y: number) => (clampH(y, height) * width + clampW(x, width)) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Sobel kernels
      const gx =
        -lum(idx(x-1,y-1)) + lum(idx(x+1,y-1))
        -2*lum(idx(x-1,y)) + 2*lum(idx(x+1,y))
        -lum(idx(x-1,y+1)) + lum(idx(x+1,y+1));
      const gy =
        -lum(idx(x-1,y-1)) - 2*lum(idx(x,y-1)) - lum(idx(x+1,y-1))
        +lum(idx(x-1,y+1)) + 2*lum(idx(x,y+1)) + lum(idx(x+1,y+1));
      const mag = Math.sqrt(gx*gx + gy*gy);

      if (mag > threshold) {
        out[i]   = er; out[i+1] = eg; out[i+2] = eb; out[i+3] = 255;
      } else {
        out[i]   = src[i]; out[i+1] = src[i+1]; out[i+2] = src[i+2]; out[i+3] = src[i+3];
      }
    }
  }
  return new ImageData(out, width, height);
}

function chromaticAberration(imageData: ImageData, amount: number): ImageData {
  const { width, height } = imageData;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  const shift = Math.round(amount);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // R shifted left, B shifted right, G stays
      const rx = clamp(x - shift), bx = clamp(x + shift);
      const ri = (y * width + rx) * 4;
      const bi = (y * width + bx) * 4;

      out[i]   = src[ri];         // R from left
      out[i+1] = src[i+1];        // G original
      out[i+2] = src[bi+2];       // B from right
      out[i+3] = src[i+3];
    }
  }
  return new ImageData(out, width, height);
}

function applyScanlines(imageData: ImageData, intensity: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  const { width, height } = out;
  for (let y = 0; y < height; y++) {
    if (y % 2 === 0) continue; // darken odd rows
    const factor = 1 - intensity;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      d[i]   = Math.round(d[i]   * factor);
      d[i+1] = Math.round(d[i+1] * factor);
      d[i+2] = Math.round(d[i+2] * factor);
    }
  }
  return out;
}

function pixelSort(imageData: ImageData, axis: 'horizontal' | 'vertical', threshold: number): ImageData {
  const { width, height } = imageData;
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;

  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];

  if (axis === 'horizontal') {
    for (let y = 0; y < height; y++) {
      let x = 0;
      while (x < width) {
        // Find start of segment above threshold
        if (lum((y * width + x) * 4) < threshold) { x++; continue; }
        const start = x;
        while (x < width && lum((y * width + x) * 4) >= threshold) x++;
        const end = x;
        // Sort segment by luminance
        const seg: { lum: number; r: number; g: number; b: number; a: number }[] = [];
        for (let k = start; k < end; k++) {
          const i = (y * width + k) * 4;
          seg.push({ lum: lum(i), r: d[i], g: d[i+1], b: d[i+2], a: d[i+3] });
        }
        seg.sort((a, b2) => a.lum - b2.lum);
        for (let k = 0; k < seg.length; k++) {
          const i = (y * width + (start + k)) * 4;
          d[i] = seg[k].r; d[i+1] = seg[k].g; d[i+2] = seg[k].b; d[i+3] = seg[k].a;
        }
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let y = 0;
      while (y < height) {
        if (lum((y * width + x) * 4) < threshold) { y++; continue; }
        const start = y;
        while (y < height && lum((y * width + x) * 4) >= threshold) y++;
        const end = y;
        const seg: { lum: number; r: number; g: number; b: number; a: number }[] = [];
        for (let k = start; k < end; k++) {
          const i = (k * width + x) * 4;
          seg.push({ lum: lum(i), r: d[i], g: d[i+1], b: d[i+2], a: d[i+3] });
        }
        seg.sort((a, b2) => a.lum - b2.lum);
        for (let k = 0; k < seg.length; k++) {
          const i = ((start + k) * width + x) * 4;
          d[i] = seg[k].r; d[i+1] = seg[k].g; d[i+2] = seg[k].b; d[i+3] = seg[k].a;
        }
      }
    }
  }
  return out;
}

function glitch(imageData: ImageData, intensity: number, seed: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const { width, height } = out;
  const d = out.data;
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  const numSlices = Math.max(1, Math.floor(intensity * height * 0.15));
  for (let i = 0; i < numSlices; i++) {
    const y = Math.floor(rand() * height);
    const sliceH = Math.floor(rand() * 4 + 1);
    const offset = Math.floor((rand() - 0.5) * 2 * width * (intensity / 10) * 0.5);
    for (let dy = 0; dy < sliceH; dy++) {
      const row = clampH(y + dy, height);
      for (let x = 0; x < width; x++) {
        const srcX = clampW(x - offset, width);
        const dst = (row * width + x) * 4;
        const src = (row * width + srcX) * 4;
        d[dst]   = imageData.data[src];
        d[dst+1] = imageData.data[src+1];
        d[dst+2] = imageData.data[src+2];
        d[dst+3] = imageData.data[src+3];
      }
    }
  }
  return out;
}

function applyNoise(imageData: ImageData, amount: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  const scale = amount * 2.55;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * scale;
    d[i]   = clamp(d[i]   + n);
    d[i+1] = clamp(d[i+1] + n);
    d[i+2] = clamp(d[i+2] + n);
  }
  return out;
}
