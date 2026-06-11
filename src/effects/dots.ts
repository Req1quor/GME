import type { DotsParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lum(r: number, g: number, b: number) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function drawDot(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, r: number, shape: DotsParams['dotShape']) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'square') {
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  } else if (shape === 'ring') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.stroke();
  } else if (shape === 'star') {
    const spikes = 5, outerR = r, innerR = r * 0.4;
    const rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    let sx = x + Math.cos(rot) * outerR, sy = y + Math.sin(rot) * outerR;
    ctx.moveTo(sx, sy);
    for (let i = 0; i < spikes; i++) {
      const a1 = rot + i * step * 2;
      const a2 = rot + i * step * 2 + step;
      ctx.lineTo(x + Math.cos(a1) * outerR, y + Math.sin(a1) * outerR);
      ctx.lineTo(x + Math.cos(a2) * innerR, y + Math.sin(a2) * innerR);
    }
    ctx.lineTo(sx, sy);
    ctx.closePath();
    ctx.fill();
  }
}

export function applyDots(src: ImageData, params: DotsParams): ImageData {
  const { width, height, data } = src;
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const [bgR, bgG, bgB] = hexToRgb(params.bgColor ?? '#ffffff');
  ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
  ctx.fillRect(0, 0, width, height);

  const spacing = Math.max(2, params.spacing);
  const [acR, acG, acB] = hexToRgb(params.accentColor ?? '#000000');
  const opacity = (params.opacity ?? 100) / 100;
  const jitter = (params.jitter ?? 0) * spacing * 0.4;
  const minS = Math.max(0.5, params.minSize ?? 1);
  const dotSize = Math.max(1, params.dotSize);
  const angle = ((params.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = width / 2, cy = height / 2;
  const diag = Math.sqrt(width * width + height * height);
  const steps = Math.ceil(diag / spacing) + 4;

  // Simple hash for jitter
  const hash = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let row = -steps; row <= steps; row++) {
    for (let col = -steps; col <= steps; col++) {
      // Hex offset
      let gx = col * spacing;
      let gy = row * spacing;
      if (params.gridType === 'hex' && Math.abs(row % 2) === 1) gx += spacing * 0.5;

      // Jitter
      if (jitter > 0) {
        gx += (hash(col, row) * 2 - 1) * jitter;
        gy += (hash(col + 100, row + 100) * 2 - 1) * jitter;
      }

      // Rotate
      const rx = gx * cos - gy * sin + cx;
      const ry = gx * sin + gy * cos + cy;

      if (rx < -dotSize || rx > width + dotSize || ry < -dotSize || ry > height + dotSize) continue;

      const px = Math.max(0, Math.min(width - 1, Math.round(rx)));
      const py = Math.max(0, Math.min(height - 1, Math.round(ry)));
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const l = lum(r, g, b);

      let radius: number;
      if (params.sizeByLum) {
        const lt = params.invert ? (255 - l) / 255 : l / 255;
        radius = minS + lt * (dotSize - minS);
      } else {
        radius = dotSize * 0.5;
      }
      if (radius < 0.4) continue;

      let dr = acR, dg = acG, db = acB;
      if (params.colorMode === 'original') { dr = r; dg = g; db = b; }
      else if (params.colorMode === 'mono') { const lv = Math.round(l); dr = lv; dg = lv; db = lv; }
      else if (params.colorMode === 'gradient') {
        const [gA] = hexToRgb(params.accentColor ?? '#000000');
        const [gB] = hexToRgb(params.bgColor ?? '#ffffff');
        const t = l / 255;
        dr = Math.round(gA * t + gB * (1 - t));
        dg = dr; db = dr;
      }

      ctx.fillStyle = `rgba(${dr},${dg},${db},${opacity})`;
      drawDot(ctx, rx, ry, radius, params.dotShape ?? 'circle');
    }
  }

  const result = ctx.getImageData(0, 0, width, height);
  return result;
}
