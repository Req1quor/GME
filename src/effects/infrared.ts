// ─── Infrared Film effect ─────────────────────────────────────────────────────
// 5 distinct photographic infrared simulations:
//   aerochrome   — Kodak Aerochrome EIR: vegetation pink/red, sky dark, warm
//   ektachrome   — Ektachrome IR: yellower, more saturated, different vegetation hue
//   kodak-hie    — Kodak High-Speed B&W IR: vegetation white, sky black, pure mono
//   digital      — Modern modified digital IR: channel-swap, less halation, neutral
//   false-color  — Scientific SWIR false-color: dramatic spectral mapping
//
// Channel mapping loosely follows: IR-reflectance proxy (G-channel dominance) → R

export interface InfraredParams {
  style: 'aerochrome' | 'ektachrome' | 'kodak-hie' | 'digital' | 'false-color';
  grassBoost: number;       // 0–2   push of high-reflectance (vegetation) signal
  skyDarken: number;        // 0–1   how aggressively blue skies go black
  saturation: number;       // 0–250
  contrast: number;         // -50 to 100
  filmGrain: number;        // 0–40  chunky IR film grain (4×4 block clusters)
  halation: number;         // 0–100 highlight bloom (characteristic of IR film)
  toneShift: number;        // -180–180 post-process hue rotation (creative color shift)
  channelMix: number;       // 0–1   how strongly channel-swap is applied (0 = none, 1 = full)
  blendOriginal: number;    // 0–100
}

function clamp(v: number): number { return Math.max(0, Math.min(255, v)); }

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
void hexToRgb; // reserved for future use

function applySat(r: number, g: number, b: number, sat: number): [number, number, number] {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const f = sat / 100;
  return [clamp(gray + (r - gray) * f), clamp(gray + (g - gray) * f), clamp(gray + (b - gray) * f)];
}

// HSL hue rotation
function hueRotate(r: number, g: number, b: number, deg: number): [number, number, number] {
  if (deg === 0) return [r, g, b];
  const nr = r / 255, ng = g / 255, nb = b / 255;
  const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;
  if (max === min) return [r, g, b];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === nr)      h = (ng - nb) / d + (ng < nb ? 6 : 0);
  else if (max === ng) h = (nb - nr) / d + 2;
  else                 h = (nr - ng) / d + 4;
  h = ((h / 6) + deg / 360) % 1;
  if (h < 0) h += 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q;
  const hue2rgb = (p: number, q2: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q2 - p) * 6 * t;
    if (t < 1/2) return q2;
    if (t < 2/3) return p + (q2 - p) * (2/3 - t) * 6;
    return p;
  };
  return [
    clamp(Math.round(hue2rgb(p2, q, h + 1/3) * 255)),
    clamp(Math.round(hue2rgb(p2, q, h)       * 255)),
    clamp(Math.round(hue2rgb(p2, q, h - 1/3) * 255)),
  ];
}

function pcgHash(v: number): number {
  let x = (v * 747796405 + 2891336453) >>> 0;
  x = (((x >>> 28) ^ x) * 277803737) >>> 0;
  return ((x >>> 22) ^ x) >>> 0;
}

export function applyInfrared(src: ImageData, p: InfraredParams): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od  = out.data;
  const blend     = (p.blendOriginal ?? 0) / 100;
  const contrastF = ((p.contrast ?? 0) + 100) / 100;
  const grassB    = p.grassBoost ?? 1;
  const skyD      = p.skyDarken  ?? 0.7;
  const mixF      = Math.max(0, Math.min(1, p.channelMix ?? 1));
  const grainF    = (p.filmGrain ?? 0) / 100;

  // ── Halation: blur bright highlights and add back ──
  // Simple approach: box-blur the highlight map, then overlay later
  const halF = (p.halation ?? 0) / 100;
  let highlightBlur: Float32Array | null = null;
  if (halF > 0) {
    const raw = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
      const lum = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]) / 255;
      raw[i >> 2] = lum > 0.65 ? (lum - 0.65) / 0.35 : 0;
    }
    // box blur r=8 (halation radius)
    const r = 8;
    const tmp = new Float32Array(raw.length);
    highlightBlur = new Float32Array(raw.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx; if (nx < 0 || nx >= w) continue;
          s += raw[y * w + nx]; c++;
        }
        tmp[y * w + x] = s / c;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0, c = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= h) continue;
          s += tmp[ny * w + x]; c++;
        }
        highlightBlur[y * w + x] = s / c;
      }
    }
  }

  for (let j = 0; j < w * h; j++) {
    const i  = j * 4;
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];

    // ── Channel mapping per style ──
    let nr: number, ng: number, nb: number;

    if (p.style === 'aerochrome') {
      // Kodak Aerochrome: IR→R, R→G, G→B
      // IR proxy = G channel dominance (vegetation reflects NIR strongly)
      const irProxy = Math.min(255, g0 * 1.0 + Math.max(0, g0 - r0) * grassB * 1.6);
      const mapped_r = irProxy;
      const mapped_g = r0;
      const mapped_b = g0 * 0.55 + b0 * 0.45;
      // Sky darkening: blue dominance
      const skyness = Math.max(0, (b0 - Math.max(r0, g0)) / 255);
      const darkF   = 1 - skyness * skyD * 1.5;
      nr = clamp(mapped_r * darkF);
      ng = clamp(mapped_g * darkF);
      nb = clamp(mapped_b * darkF);
      // channelMix: lerp between original and full IR swap
      nr = clamp(r0 + (nr - r0) * mixF);
      ng = clamp(g0 + (ng - g0) * mixF);
      nb = clamp(b0 + (nb - b0) * mixF);

    } else if (p.style === 'ektachrome') {
      // Ektachrome IR (EIR): IR→Red, Red→Yellow(R+G), Green→Green, Blue crushed
      // More yellow in vegetation, less magenta than Aerochrome
      const irProxy = Math.min(255, g0 + Math.max(0, g0 - r0) * grassB * 1.2);
      const mapped_r = clamp(irProxy * 0.9 + r0 * 0.1);
      const mapped_g = clamp(irProxy * 0.5 + r0 * 0.5);
      const mapped_b = clamp(b0 * 0.3 + g0 * 0.1);
      const skyness  = Math.max(0, (b0 - Math.max(r0, g0)) / 255);
      const darkF    = 1 - skyness * skyD * 1.2;
      nr = clamp(mapped_r * darkF);
      ng = clamp(mapped_g * darkF);
      nb = clamp(mapped_b * darkF);
      nr = clamp(r0 + (nr - r0) * mixF);
      ng = clamp(g0 + (ng - g0) * mixF);
      nb = clamp(b0 + (nb - b0) * mixF);

    } else if (p.style === 'kodak-hie') {
      // Kodak HIE Black & White IR: vegetation → near-white, sky → deep black
      // Pure monochrome with strong vegetation/sky differentiation
      const irProxy  = Math.max(0, g0 - (r0 + b0) * 0.35) * grassB;
      const skyProxy = Math.max(0, b0 - Math.max(r0, g0) * 0.8);
      const lum      = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0);
      const irLum    = Math.min(255, lum * 0.3 + irProxy * 1.8 - skyProxy * skyD * 2.2);
      const v        = clamp(irLum);
      nr = v; ng = v; nb = v;
      // channelMix: lerp toward mono
      const origLum = Math.round(0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0);
      nr = clamp(origLum + (nr - origLum) * mixF);
      ng = clamp(origLum + (ng - origLum) * mixF);
      nb = clamp(origLum + (nb - origLum) * mixF);

    } else if (p.style === 'digital') {
      // Modern Kolari/converted digital: simple channel swap, less dramatic
      // R→NIR proxy, natural look with subtle coloring
      const irProxy = Math.min(255, r0 * 0.2 + g0 * 1.1 + Math.max(0, g0 - b0) * grassB * 0.6);
      nr = clamp(irProxy);
      ng = clamp(r0 * 0.7 + g0 * 0.3);
      nb = clamp(b0 * 0.5 + g0 * 0.1);
      const skyness = Math.max(0, (b0 - Math.max(r0, g0)) / 255);
      const darkF   = 1 - skyness * skyD * 0.9;
      nr = clamp(nr * darkF);
      ng = clamp(ng * darkF);
      nb = clamp(nb * darkF);
      nr = clamp(r0 + (nr - r0) * mixF);
      ng = clamp(g0 + (ng - g0) * mixF);
      nb = clamp(b0 + (nb - b0) * mixF);

    } else {
      // false-color: scientific SWIR — dramatic spectral palette
      // Maps: IR-reflection → Yellow, Normal surfaces → Blue/Cyan, Sky → Deep purple
      const irProxy  = Math.max(0, g0 - r0 * 0.5) * grassB;
      const skyProxy = Math.max(0, b0 - (r0 + g0) * 0.4);
      const warmProxy = Math.max(0, r0 - g0 * 0.4);
      nr = clamp(warmProxy * 0.8 + irProxy * 1.2);
      ng = clamp(irProxy * 0.9 + (255 - skyProxy) * 0.3);
      nb = clamp(skyProxy * 2.0 + (255 - irProxy) * 0.25);
      nr = clamp(r0 + (nr - r0) * mixF);
      ng = clamp(g0 + (ng - g0) * mixF);
      nb = clamp(b0 + (nb - b0) * mixF);
    }

    // ── Contrast ──
    const applyContrast = (v: number) => clamp(Math.round((v / 255 - 0.5) * contrastF * 255 + 128));
    nr = applyContrast(nr);
    ng = applyContrast(ng);
    nb = applyContrast(nb);

    // ── Saturation ──
    let [fr, fg, fb] = applySat(nr, ng, nb, p.saturation ?? 130);

    // ── Film grain (chunky 4×4 block, characteristic of fast IR films) ──
    if (grainF > 0) {
      const bx = Math.floor((j % w) / 4);
      const by = Math.floor(Math.floor(j / w) / 4);
      const h1 = pcgHash(bx * 3571 + by * 7919 + 55555);
      const n  = ((h1 & 0xffff) / 0xffff) * 2 - 1;
      const g  = Math.round(n * grainF * 55);
      fr = clamp(fr + g); fg = clamp(fg + g); fb = clamp(fb + g);
    }

    // ── Halation (orange-pink highlight bloom) ──
    if (highlightBlur && halF > 0) {
      const hv = highlightBlur[j] * halF;
      // Halation color: typically orange-amber for IR film
      fr = clamp(Math.round(fr + hv * 120));
      fg = clamp(Math.round(fg + hv * 50));
      fb = clamp(Math.round(fb + hv * 20));
    }

    // ── Hue shift (creative post-process) ──
    if ((p.toneShift ?? 0) !== 0) {
      [fr, fg, fb] = hueRotate(fr, fg, fb, p.toneShift);
    }

    od[i]     = Math.round(fr + (r0 - fr) * blend);
    od[i + 1] = Math.round(fg + (g0 - fg) * blend);
    od[i + 2] = Math.round(fb + (b0 - fb) * blend);
    od[i + 3] = data[i + 3];
  }
  return out;
}
