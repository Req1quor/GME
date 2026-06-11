import type { HalftoneParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyHalftone(src: ImageData, params: HalftoneParams): ImageData {
  const { width, height, data } = src;
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const gs = Math.max(2, params.gridSize);
  const angleRad = ((params.angle ?? 15) * Math.PI) / 180;
  const [bgR, bgG, bgB] = hexToRgb(params.bgColor ?? '#ffffff');
  const [fgR, fgG, fgB] = hexToRgb(params.fgColor ?? '#000000');

  // Fill background
  ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
  ctx.fillRect(0, 0, width, height);

  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Step through rotated grid
  const diag = Math.sqrt(width * width + height * height);
  const steps = Math.ceil(diag / gs) + 2;
  const cx = width / 2;
  const cy = height / 2;

  for (let row = -steps; row <= steps; row++) {
    for (let col = -steps; col <= steps; col++) {
      const gx = col * gs;
      const gy = row * gs;
      // Rotate grid point
      const rx = gx * cos - gy * sin + cx;
      const ry = gx * sin + gy * cos + cy;

      const px = Math.round(rx);
      const py = Math.round(ry);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      let r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // Apply brightness/contrast
      const bf = (params.brightness ?? 0) / 100;
      const cf = (100 + (params.contrast ?? 0)) / 100;
      r = Math.max(0, Math.min(255, (r / 255 + bf) * cf * 255));
      g = Math.max(0, Math.min(255, (g / 255 + bf) * cf * 255));
      b = Math.max(0, Math.min(255, (b / 255 + bf) * cf * 255));

      let t = lum(r, g, b) / 255;
      if (params.invert) t = 1 - t;

      // Apply gamma
      t = Math.pow(Math.max(0, t), params.gamma ?? 1);

      const maxR = gs * 0.5;
      const radius = t * maxR;
      if (radius < 0.5) continue;

      // Choose color
      let dr = fgR, dg = fgG, db = fgB;

      ctx.fillStyle = `rgb(${Math.round(dr)},${Math.round(dg)},${Math.round(db)})`;
      ctx.beginPath();

      const shape = params.dotShape ?? 'circle';
      if (shape === 'circle') {
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'diamond') {
        ctx.moveTo(rx, ry - radius);
        ctx.lineTo(rx + radius, ry);
        ctx.lineTo(rx, ry + radius);
        ctx.lineTo(rx - radius, ry);
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'line') {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-radius * 0.35, -radius, radius * 0.7, radius * 2);
        ctx.restore();
      } else {
        // ellipse
        ctx.save();
        ctx.translate(rx, ry);
        ctx.scale(1, 0.6);
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.restore();
        ctx.fill();
      }
    }
  }

  const result = ctx.getImageData(0, 0, width, height);

  if ((params.blendOriginal ?? 0) > 0) {
    const t = params.blendOriginal / 100;
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i]     = result.data[i]     * (1 - t) + data[i]     * t;
      result.data[i + 1] = result.data[i + 1] * (1 - t) + data[i + 1] * t;
      result.data[i + 2] = result.data[i + 2] * (1 - t) + data[i + 2] * t;
    }
  }
  return result;
}
