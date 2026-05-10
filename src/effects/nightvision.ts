// ─── Night Vision effect ─────────────────────────────────────────────────────
// Simulates phosphor image-intensifier tubes across 3 generations.
// Gen 1 (1960-80): barrel distortion, high noise, warm green tint.
// Gen 2 (1980-90): microchannel plate, cleaner, cooler phosphor.
// Gen 3 (1990-now): GaAs photocathode — very clean, minimal artifacts, slight teal.

export interface NightVisionParams {
  gain: number;               // 1–12  light amplification
  noiseAmount: number;        // 0–60  sensor noise intensity
  noiseType: 'shot' | 'scintillation' | 'speckle';  // noise character
  scanlines: boolean;
  scanlineIntensity: number;  // 0–1
  vignetteStrength: number;   // 0–1
  phosphorColor: string;      // hex — '#1aff44' (P22 green), '#ffffff', '#b0ffb0', etc.
  bloom: number;              // 0–8   highlight glow spread
  haloStrength: number;       // 0–1   diffuse halo around bright objects
  tubeDistortion: number;     // 0–0.5 barrel distortion from tube optics
  generation: 'gen1' | 'gen2' | 'gen3';  // changes phosphor tint modifier + noise floor
  blendOriginal: number;      // 0–100
}

// Very fast LCG pseudo-random, seeded per pixel — no Math.random per pixel
function pcgHash(v: number): number {
  let x = (v * 747796405 + 2891336453) >>> 0;
  x = (((x >>> 28) ^ x) * 277803737) >>> 0;
  return ((x >>> 22) ^ x) >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#1aff44').replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

// Generation-specific modifier: [distortionMult, noiseFudge, tintWarmth]
// tintWarmth > 0 adds warm (yellow-green) to phosphor, < 0 adds cool (teal-blue)
const GEN_MODS: Record<NightVisionParams['generation'], [number, number, number]> = {
  gen1: [1.0, 1.8, 0.12],   // heavy barrel, very noisy, warm P20 phosphor
  gen2: [0.4, 1.0, 0.0],    // moderate distortion, balanced noise, neutral P22
  gen3: [0.1, 0.35, -0.08], // almost no distortion, clean, cool P24 teal tint
};

export function applyNightVision(src: ImageData, p: NightVisionParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od = out.data;
  const blend   = (p.blendOriginal ?? 0) / 100;
  const cx = w * 0.5, cy = h * 0.5;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const noiseF  = p.noiseAmount / 60;
  const [genDistMult, genNoiseFudge, genWarmth] = GEN_MODS[p.generation ?? 'gen2'];
  const distStrength = (p.tubeDistortion ?? 0) * genDistMult;

  // Parse phosphor color and apply generation warmth modifier
  let [pr, pg, pb] = hexToRgb(p.phosphorColor ?? '#1aff44');
  if (genWarmth > 0) {
    // Warm tint: boost red/green, reduce blue
    pr = Math.min(255, pr + Math.round(genWarmth * 40));
    pg = Math.min(255, pg + Math.round(genWarmth * 15));
    pb = Math.max(0, pb - Math.round(genWarmth * 30));
  } else if (genWarmth < 0) {
    // Cool tint: boost blue/green, reduce red
    const t = -genWarmth;
    pb = Math.min(255, pb + Math.round(t * 35));
    pg = Math.min(255, pg + Math.round(t * 8));
    pr = Math.max(0, pr - Math.round(t * 20));
  }

  // ── Pass 1: luminance with tube distortion ──
  const lums = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Barrel distortion: sample from undistorted source
      let sx = x, sy = y;
      if (distStrength > 0) {
        const ndx = (x - cx) / cx;
        const ndy = (y - cy) / cy;
        const r2  = ndx * ndx + ndy * ndy;
        const f   = 1 / (1 + distStrength * r2 * 3.5);
        sx = Math.round(cx + ndx * f * cx);
        sy = Math.round(cy + ndy * f * cy);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      }
      const pi  = (sy * w + sx) * 4;
      let lum = (0.2126 * data[pi] + 0.7152 * data[pi + 1] + 0.0722 * data[pi + 2]) / 255;
      lum = Math.min(1, lum * p.gain);
      lums[y * w + x] = lum;
    }
  }

  // ── Pass 2: bloom (overbright spread) ──
  if (p.bloom > 0) {
    const radius  = Math.round(p.bloom);
    const blurred = new Float32Array(lums);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = lums[y * w + x];
        if (l > 0.72) {
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const ny = Math.max(0, Math.min(h - 1, y + dy));
              const nx = Math.max(0, Math.min(w - 1, x + dx));
              const d  = Math.sqrt(dx * dx + dy * dy);
              blurred[ny * w + nx] = Math.min(1,
                blurred[ny * w + nx] + (l - 0.72) * (1 - d / (radius + 1)) * 0.28
              );
            }
          }
        }
      }
    }
    lums.set(blurred);
  }

  // ── Pass 3: halo (diffuse bright-object corona) ──
  if ((p.haloStrength ?? 0) > 0) {
    const hR = Math.max(3, Math.round(p.haloStrength * 18));
    const halo = new Float32Array(lums);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = lums[y * w + x];
        if (l > 0.6) {
          for (let dy = -hR; dy <= hR; dy++) {
            for (let dx = -hR; dx <= hR; dx++) {
              const ny = Math.max(0, Math.min(h - 1, y + dy));
              const nx = Math.max(0, Math.min(w - 1, x + dx));
              const d  = Math.sqrt(dx * dx + dy * dy);
              if (d > hR) continue;
              const contribution = (l - 0.6) * (1 - d / hR) * p.haloStrength * 0.15;
              halo[ny * w + nx] = Math.min(1, halo[ny * w + nx] + contribution);
            }
          }
        }
      }
    }
    lums.set(halo);
  }

  // ── Pass 4: render ──
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i   = (y * w + x) * 4;
      let   lum = lums[y * w + x];

      // Noise
      if (noiseF > 0) {
        const noiseSeed = x * 1973 + y * 9277;
        if (p.noiseType === 'scintillation') {
          // Sparse bright sparks (GaAs scintillation artefacts)
          const h1 = pcgHash(noiseSeed + 88881);
          if ((h1 & 0x1ff) < 8) { // ~1.5% of pixels
            lum = Math.min(1, lum + (h1 & 0xffff) / 0xffff * noiseF * 0.9);
          }
        } else if (p.noiseType === 'speckle') {
          // Chunky grain: share noise in 3×3 blocks (gen1 tube granularity)
          const bx = Math.floor(x / 3);
          const by = Math.floor(y / 3);
          const h2 = pcgHash(bx * 1973 + by * 9277);
          const n  = ((h2 & 0xffff) / 0xffff) * 2 - 1;
          lum = Math.max(0, Math.min(1, lum + n * noiseF * genNoiseFudge * 0.2));
        } else {
          // Shot noise (per-pixel photon counting noise)
          const h3  = pcgHash(noiseSeed);
          const n   = ((h3 & 0xffff) / 0xffff) * 2 - 1;
          lum = Math.max(0, Math.min(1, lum + n * noiseF * genNoiseFudge * 0.22));
        }
      }

      // Scanlines
      if (p.scanlines && y % 2 === 0) {
        lum *= (1 - p.scanlineIntensity * 0.55);
      }

      // Radial vignette
      const dx = x - cx, dy2 = y - cy;
      const d  = Math.sqrt(dx * dx + dy2 * dy2) / maxDist;
      lum *= Math.max(0, 1 - d * d * p.vignetteStrength * 2.2);

      const v = Math.min(255, Math.round(lum * 255));
      // Mix phosphor color with white for neutral (luminosity-proportional)
      const fR = Math.min(255, Math.round(pr * lum * 1.05));
      const fG = Math.min(255, Math.round(pg * lum * 1.05));
      const fB = Math.min(255, Math.round(pb * lum * 1.05));

      const sr = data[i], sg = data[i + 1], sb = data[i + 2];
      od[i]     = Math.round(fR + (sr - fR) * blend);
      od[i + 1] = Math.round(fG + (sg - fG) * blend);
      od[i + 2] = Math.round(fB + (sb - fB) * blend);
      od[i + 3] = data[i + 3];
      void v;
    }
  }
  return out;
}
