import type { CybersigilismParams } from '../types';

// ─── PRNG ─────────────────────────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Node generation ──────────────────────────────────────────────────────────
function buildNodes(w: number, h: number, count: number, rng: () => number): [number, number][] {
  const nodes: [number, number][] = [];
  const mx = w * 0.1, my = h * 0.1;
  for (let i = 0; i < count; i++) {
    nodes.push([mx + rng() * (w - mx * 2), my + rng() * (h - my * 2)]);
  }
  return nodes;
}

// ─── Angular path drawing (canvas2D) ─────────────────────────────────────────
function drawAngularPath(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  angularity: number, rng: () => number
) {
  const dx = bx - ax, dy = by - ay;
  const t = rng();
  ctx.moveTo(ax, ay);
  if (angularity > 0.7) {
    if (t < 0.25) {
      // Isometric diagonal: 45° then straight — looks most sigil-like
      const md = Math.min(Math.abs(dx), Math.abs(dy));
      ctx.lineTo(ax + Math.sign(dx) * md, ay + Math.sign(dy) * md);
      ctx.lineTo(bx, by);
    } else if (t < 0.5) {
      // Z-path through midpoint
      const mx = (ax + bx) / 2;
      ctx.lineTo(mx, ay); ctx.lineTo(mx, by); ctx.lineTo(bx, by);
    } else if (t < 0.75) {
      // Diagonal jog — sharp bend in the middle
      const px = ax + dx * (0.4 + rng() * 0.2) + (rng() - 0.5) * 30;
      const py = ay + dy * (0.4 + rng() * 0.2) + (rng() - 0.5) * 30;
      ctx.lineTo(px, py); ctx.lineTo(bx, by);
    } else {
      // L-path: horizontal then vertical
      ctx.lineTo(bx, ay); ctx.lineTo(bx, by);
    }
  } else if (angularity > 0.3) {
    const mid = 0.35 + rng() * 0.3;
    ctx.lineTo(ax + dx * mid, ay + dy * mid);
    ctx.lineTo(bx, by);
  } else {
    // Smooth curve
    const cpx = (ax + bx) / 2 + (rng() - 0.5) * Math.abs(dx) * 0.9;
    const cpy = (ay + by) / 2 + (rng() - 0.5) * Math.abs(dy) * 0.9;
    ctx.quadraticCurveTo(cpx, cpy, bx, by);
  }
}

// ─── Node decoration ──────────────────────────────────────────────────────────
function drawNodeRune(
  ctx: CanvasRenderingContext2D,
  nx: number, ny: number, r: number,
  rng: () => number
) {
  ctx.beginPath();
  switch (Math.floor(rng() * 5)) {
    case 0: // Small circle
      ctx.arc(nx, ny, r * 0.45, 0, Math.PI * 2);
      ctx.stroke(); break;
    case 1: // Cross
      ctx.moveTo(nx - r, ny); ctx.lineTo(nx + r, ny);
      ctx.moveTo(nx, ny - r); ctx.lineTo(nx, ny + r);
      ctx.stroke(); break;
    case 2: // Diamond
      ctx.moveTo(nx, ny - r); ctx.lineTo(nx + r * 0.65, ny);
      ctx.lineTo(nx, ny + r); ctx.lineTo(nx - r * 0.65, ny);
      ctx.closePath(); ctx.stroke(); break;
    case 3: // Serif tick
      ctx.moveTo(nx - r, ny); ctx.lineTo(nx + r, ny);
      ctx.moveTo(nx - r, ny - r * 0.3); ctx.lineTo(nx - r, ny + r * 0.3);
      ctx.moveTo(nx + r, ny - r * 0.3); ctx.lineTo(nx + r, ny + r * 0.3);
      ctx.stroke(); break;
    case 4: // Corner bracket
      ctx.moveTo(nx - r * 0.6, ny - r); ctx.lineTo(nx, ny - r); ctx.lineTo(nx, ny - r * 0.3);
      ctx.moveTo(nx + r * 0.6, ny + r); ctx.lineTo(nx, ny + r); ctx.lineTo(nx, ny + r * 0.3);
      ctx.stroke(); break;
  }
}

// ─── Draw one sigil pass (no transform applied here) ─────────────────────────
function drawSigil(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  params: CybersigilismParams
) {
  const { seed, complexity, color, strokeWidth, angularity, lineVariance } = params;
  const rng = mkRng(seed);

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const nodes = buildNodes(width, height, complexity, rng);
  const connections = Math.floor(complexity * 1.8);

  for (let i = 0; i < connections; i++) {
    const ai = Math.floor(rng() * nodes.length);
    const bi = Math.floor(rng() * nodes.length);
    if (ai === bi) continue;
    const [ax, ay] = nodes[ai];
    const [bx, by] = nodes[bi];
    ctx.lineWidth = lineVariance ? (rng() > 0.6 ? strokeWidth * 0.35 : strokeWidth) : strokeWidth;
    ctx.beginPath();
    drawAngularPath(ctx, ax, ay, bx, by, angularity, rng);
    ctx.stroke();
  }

  nodes.forEach(([nx, ny]) => {
    if (rng() > 0.4) {
      const r = 4 + rng() * 10;
      ctx.lineWidth = strokeWidth * (0.3 + rng() * 0.8);
      drawNodeRune(ctx, nx, ny, r, rng);
    }
  });
}

// Draw sigil centered and scaled, in current ctx transform space
function drawScaledSigil(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  params: CybersigilismParams
) {
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(params.scale, params.scale);
  ctx.translate(-width / 2, -height / 2);
  drawSigil(ctx, width, height, params);
  ctx.restore();
}

// Draw sigil + all symmetry mirrors
function drawWithSymmetry(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  params: CybersigilismParams
) {
  const { symmetry } = params;
  drawScaledSigil(ctx, width, height, params);

  if (symmetry === 'vertical' || symmetry === 'quad') {
    ctx.save();
    ctx.translate(width, 0); ctx.scale(-1, 1);
    drawScaledSigil(ctx, width, height, params);
    ctx.restore();
  }
  if (symmetry === 'horizontal' || symmetry === 'quad') {
    ctx.save();
    ctx.translate(0, height); ctx.scale(1, -1);
    drawScaledSigil(ctx, width, height, params);
    ctx.restore();
  }
  if (symmetry === 'quad') {
    ctx.save();
    ctx.translate(width, height); ctx.scale(-1, -1);
    drawScaledSigil(ctx, width, height, params);
    ctx.restore();
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function applyCybersigilismSync(imageData: ImageData, params: CybersigilismParams): ImageData {
  const { width, height } = imageData;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  ctx.putImageData(imageData, 0, 0);

  const blendMode = params.blendMode as GlobalCompositeOperation;

  // Glow pass (soft shadow drawn first, below main)
  if (params.glow) {
    ctx.save();
    ctx.globalCompositeOperation = blendMode;
    ctx.globalAlpha = params.opacity * 0.45;
    ctx.shadowColor = params.color;
    ctx.shadowBlur = params.glowSize ?? 12;
    drawWithSymmetry(ctx, width, height, params);
    ctx.restore();
  }

  // Main draw
  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  ctx.globalAlpha = params.opacity;
  drawWithSymmetry(ctx, width, height, params);
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  return ctx.getImageData(0, 0, width, height);
}

export const applyCybersigilism = applyCybersigilismSync;
