import type { VhsParams } from '../types';

function clamp(v: number): number { return Math.max(0, Math.min(255, v)); }

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => { a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function applyVhs(src: ImageData, params: VhsParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(data);
  const rng = mulberry32(42);

  // 1. Chromatic color bleed (Y/C separation simulation)
  const bleed = Math.round(params.colorBleed ?? 5);
  if (bleed > 0) {
    const tmp = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const bx = Math.min(w - 1, x + bleed);
        const bi = (y * w + bx) * 4;
        // Bleed chrominance channels (R and B) to the right
        out[i]     = clamp(tmp[i] * 0.7 + tmp[bi] * 0.3);
        out[i + 2] = clamp(tmp[i + 2] * 0.7 + tmp[bi + 2] * 0.3);
      }
    }
  }

  // 2. RGB channel horizontal offset (ghosting)
  const ghost = Math.round(params.ghosting ?? 0);
  if (ghost > 0) {
    const tmp2 = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const gx = Math.min(w - 1, x + ghost);
        const gi = (y * w + gx) * 4;
        out[i]     = clamp(tmp2[i] * 0.6 + tmp2[gi] * 0.4);
      }
    }
  }

  // 3. RGB channel offset (chromatic aberration style)
  if (params.rgbOffset && (params.rgbOffsetAmount ?? 0) > 0) {
    const amt = Math.round(params.rgbOffsetAmount ?? 3);
    const tmp3 = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rx = Math.max(0, Math.min(w - 1, x - amt));
        const bx = Math.max(0, Math.min(w - 1, x + amt));
        out[i]     = tmp3[(y * w + rx) * 4];
        out[i + 2] = tmp3[(y * w + bx) * 4 + 2];
      }
    }
  }

  // 4. Luma clamp (washout)
  const luma = (params.luma ?? 0) / 100;
  if (luma > 0) {
    for (let i = 0; i < out.length; i += 4) {
      out[i]     = clamp(out[i]     + luma * 80);
      out[i + 1] = clamp(out[i + 1] + luma * 80);
      out[i + 2] = clamp(out[i + 2] + luma * 80);
    }
  }

  // 5. Saturation adjustment
  const sf = (params.saturation ?? 100) / 100;
  if (sf !== 1) {
    for (let i = 0; i < out.length; i += 4) {
      const gray = 0.2989 * out[i] + 0.5870 * out[i + 1] + 0.1140 * out[i + 2];
      out[i]     = clamp(gray + (out[i]     - gray) * sf);
      out[i + 1] = clamp(gray + (out[i + 1] - gray) * sf);
      out[i + 2] = clamp(gray + (out[i + 2] - gray) * sf);
    }
  }

  // 6. Horizontal sync distortion (hSync)
  const hSyncAmt = (params.hSync ?? 0) / 100;
  if (hSyncAmt > 0) {
    const tmp4 = new Uint8ClampedArray(out);
    const numLines = Math.floor(hSyncAmt * 8);
    for (let li = 0; li < numLines; li++) {
      const y2 = Math.floor(rng() * h);
      const shift = Math.round((rng() * 2 - 1) * hSyncAmt * 30);
      for (let x = 0; x < w; x++) {
        const sx = Math.max(0, Math.min(w - 1, x + shift));
        const dst = (y2 * w + x) * 4;
        const src2 = (y2 * w + sx) * 4;
        out[dst] = tmp4[src2]; out[dst+1] = tmp4[src2+1]; out[dst+2] = tmp4[src2+2];
      }
    }
  }

  // 7. Tracking artifacts
  const tracking = (params.tracking ?? 0) / 100;
  if (tracking > 0) {
    const numLines = Math.floor(tracking * 12);
    for (let li = 0; li < numLines; li++) {
      const y2 = Math.floor(rng() * h);
      const shift = Math.round((rng() - 0.5) * tracking * 40);
      const thickness = Math.floor(1 + rng() * 3);
      for (let dy = 0; dy < thickness; dy++) {
        const y3 = Math.min(h - 1, y2 + dy);
        for (let x = 0; x < w; x++) {
          const sx = Math.max(0, Math.min(w - 1, x + shift));
          const dst = (y3 * w + x) * 4;
          const src2 = (y3 * w + sx) * 4;
          out[dst] = out[src2]; out[dst+1] = out[src2+1]; out[dst+2] = out[src2+2];
        }
      }
    }
  }

  // 8. Scanlines
  const sl = params.scanlineIntensity ?? 0;
  if (sl > 0) {
    for (let y = 0; y < h; y++) {
      if (y % 2 === 0) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          out[i]     = clamp(out[i]     * (1 - sl * 0.4));
          out[i + 1] = clamp(out[i + 1] * (1 - sl * 0.4));
          out[i + 2] = clamp(out[i + 2] * (1 - sl * 0.4));
        }
      }
    }
  }

  // 9. Noise
  const noiseAmt = (params.noiseAmount ?? 0) / 100;
  if (noiseAmt > 0) {
    const rng2 = mulberry32(Date.now() & 0xffff);
    for (let i = 0; i < out.length; i += 4) {
      const n = (rng2() * 2 - 1) * noiseAmt * 80;
      out[i]     = clamp(out[i]     + n);
      out[i + 1] = clamp(out[i + 1] + n);
      out[i + 2] = clamp(out[i + 2] + n);
    }
  }

  // 10. Static overlay
  const stat = (params.static ?? 0) / 100;
  if (stat > 0) {
    const rng3 = mulberry32((Date.now() >> 2) & 0xffff);
    for (let i = 0; i < out.length; i += 4) {
      if (rng3() < stat * 0.15) {
        const v = Math.round(rng3() * 255);
        out[i] = v; out[i+1] = v; out[i+2] = v;
      }
    }
  }

  // 11. Blend with original
  const blend = (params.blendOriginal ?? 0) / 100;
  if (blend > 0) {
    for (let i = 0; i < out.length; i += 4) {
      out[i]     = clamp(out[i]     * (1 - blend) + data[i]     * blend);
      out[i + 1] = clamp(out[i + 1] * (1 - blend) + data[i + 1] * blend);
      out[i + 2] = clamp(out[i + 2] * (1 - blend) + data[i + 2] * blend);
    }
  }

  return new ImageData(out, w, h);
}
