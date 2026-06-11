import type { BrutalistParams } from '../types';

function clamp(v: number) { return Math.max(0, Math.min(255, v)); }

export function applyBrutalist(imageData: ImageData, params: BrutalistParams): ImageData {
  let data = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);

  if (params.posterize)           data = posterize(data, params.posterizeLevels);
  if (params.noise)               data = applyNoise(data, params.noiseAmount ?? 25);
  if (params.chromaticAberration) data = chromaticAberration(data, params.chromaticAmount);
  if (params.scanlines)           data = applyScanlines(data, params.scanlineIntensity);
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
      const row = Math.max(0, Math.min(height - 1, y + dy));
      for (let x = 0; x < width; x++) {
        const srcX = Math.max(0, Math.min(width - 1, x - offset));
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
