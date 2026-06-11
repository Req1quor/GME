import type { VoronoiParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function hash2(x: number, y: number, seed: number): [number, number] {
  const a = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
  const b = Math.sin(x * 269.5 + y * 183.3 + seed * 2) * 43758.5453;
  return [a - Math.floor(a), b - Math.floor(b)];
}

function dist(ax: number, ay: number, bx: number, by: number, metric: VoronoiParams['distanceMetric']): number {
  const dx = ax - bx, dy = ay - by;
  if (metric === 'manhattan') return Math.abs(dx) + Math.abs(dy);
  if (metric === 'chebyshev') return Math.max(Math.abs(dx), Math.abs(dy));
  return Math.sqrt(dx * dx + dy * dy);
}

export function applyVoronoi(src: ImageData, params: VoronoiParams): ImageData {
  const { width: w, height: h, data } = src;
  const cellCount = Math.max(4, Math.min(200, params.cellCount ?? 30));
  const seed = params.seed ?? 42;
  const jitter = params.jitter ?? 1;
  const blend = (params.blendOriginal ?? 0) / 100;
  const metric = params.distanceMetric ?? 'euclidean';
  const [er, eg, eb] = hexToRgb(params.edgeColor ?? '#ffffff');
  const [bgR, bgG, bgB] = hexToRgb(params.bgColor ?? '#000000');
  const [gAr, gAg, gAb] = hexToRgb(params.gradientA ?? '#ff0088');
  const [gBr, gBg, gBb] = hexToRgb(params.gradientB ?? '#00ccff');
  const ew = Math.max(1, params.edgeWidth ?? 2);
  const mode = params.mode ?? 'fill';
  const colorMode = params.colorMode ?? 'fromImage';

  // Place sites on a grid with jitter for even distribution
  const gridN = Math.ceil(Math.sqrt(cellCount));
  const sites: Array<[number, number, number, number, number]> = []; // x,y,r,g,b
  const rng = (x: number, y: number) => hash2(x, y, seed);

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      if (sites.length >= cellCount) break;
      const [jx, jy] = rng(gx, gy);
      const sx = ((gx + jx * jitter) / gridN) * w;
      const sy = ((gy + jy * jitter) / gridN) * h;
      const px = Math.max(0, Math.min(w - 1, Math.round(sx)));
      const py = Math.max(0, Math.min(h - 1, Math.round(sy)));
      const idx2 = (py * w + px) * 4;
      sites.push([sx, sy, data[idx2], data[idx2 + 1], data[idx2 + 2]]);
    }
    if (sites.length >= cellCount) break;
  }

  const out = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d1 = Infinity, d2 = Infinity;
      let nearest = 0;

      for (let k = 0; k < sites.length; k++) {
        const d = dist(x, y, sites[k][0], sites[k][1], metric);
        if (d < d1) { d2 = d1; d1 = d; nearest = k; }
        else if (d < d2) d2 = d;
      }

      const i = (y * w + x) * 4;
      const isEdge = mode === 'edges' || mode === 'edges-fill'
        ? (d2 - d1) < ew * 0.5
        : false;

      let r = 0, g = 0, b = 0;
      if (isEdge) {
        r = er; g = eg; b = eb;
      } else if (mode === 'edges') {
        r = data[i]; g = data[i + 1]; b = data[i + 2];
      } else if (mode === 'points') {
        const dx = x - sites[nearest][0], dy = y - sites[nearest][1];
        const isPoint = Math.sqrt(dx*dx + dy*dy) < ew;
        r = isPoint ? er : data[i]; g = isPoint ? eg : data[i+1]; b = isPoint ? eb : data[i+2];
      } else { // fill or edges-fill
        const t = nearest / (sites.length - 1);
        switch (colorMode) {
          case 'fromImage':
            r = sites[nearest][2]; g = sites[nearest][3]; b = sites[nearest][4]; break;
          case 'random': {
            const [h1, h2] = hash2(nearest, 0, seed * 3);
            r = Math.round(h1 * 255); g = Math.round(h2 * 255); b = Math.round((h1 + h2) * 127); break;
          }
          case 'gradient':
            r = Math.round(gAr + (gBr - gAr) * t);
            g = Math.round(gAg + (gBg - gAg) * t);
            b = Math.round(gAb + (gBb - gAb) * t); break;
          case 'mono':
            r = g = b = Math.round(t * 255); break;
          default:
            r = bgR; g = bgG; b = bgB;
        }
      }

      if (blend > 0) {
        r = Math.round(r * (1 - blend) + data[i]     * blend);
        g = Math.round(g * (1 - blend) + data[i + 1] * blend);
        b = Math.round(b * (1 - blend) + data[i + 2] * blend);
      }
      out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = 255;
    }
  }
  return new ImageData(out, w, h);
}
